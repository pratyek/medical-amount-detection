import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { 
  IOCRService, 
  OCRResult, 
  RawToken, 
  ProcessingOptions,
  ImagePreprocessingResult 
} from '@/types';
import { config } from '@/config';
import logger from '@/utils/logger';

export class OCRService implements IOCRService {
  private readonly confidenceThreshold: number;
  private readonly supportedLanguages: string[];
  private readonly timeoutMs: number;

  constructor() {
    this.confidenceThreshold = config.MIN_OCR_CONFIDENCE;
    this.supportedLanguages = config.SUPPORTED_LANGUAGES;
    this.timeoutMs = config.OCR_TIMEOUT_MS;
  }

  async extractText(imageBuffer: Buffer, options: ProcessingOptions): Promise<OCRResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    logger.info('Starting OCR processing', {
      requestId,
      imageSize: imageBuffer.length,
      language: options.language,
      confidenceThreshold: options.confidenceThreshold
    });

    try {
      // Preprocess image for better OCR accuracy
      const preprocessingResult = await this.preprocessImage(imageBuffer);
      
      logger.debug('Image preprocessing completed', {
        requestId,
        operations: preprocessingResult.operations,
        improvementScore: preprocessingResult.improvementScore
      });

      // Perform OCR with Tesseract
      const ocrResult = await this.performOCR(
        preprocessingResult.processedImageBuffer,
        options.language,
        requestId
      );

      // Extract tokens with position information
      const tokens = this.extractTokensFromOCRResult(ocrResult, options.confidenceThreshold);

      const processingTimeMs = Date.now() - startTime;

      logger.info('OCR processing completed', {
        requestId,
        processingTimeMs,
        tokensExtracted: tokens.length,
        overallConfidence: ocrResult.data.confidence
      });

      return {
        text: ocrResult.data.text,
        confidence: ocrResult.data.confidence / 100, // Tesseract returns 0-100, we need 0-1
        tokens,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('OCR processing failed', {
        requestId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<ImagePreprocessingResult> {
    const operations: string[] = [];
    let processedBuffer = imageBuffer;

    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      logger.debug('Original image metadata', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        density: metadata.density
      });

      let sharpImage = image;

      // Convert to grayscale for better OCR
      sharpImage = sharpImage.grayscale();
      operations.push('grayscale');

      // Increase contrast and brightness
      sharpImage = sharpImage.normalize();
      operations.push('normalize');

      // Enhance contrast
      sharpImage = sharpImage.linear(1.2, -(128 * 1.2) + 128);
      operations.push('contrast_enhance');

      // Resize if image is too small (OCR works better with larger images)
      if (metadata.width && metadata.width < 1000) {
        const scaleFactor = 1000 / metadata.width;
        sharpImage = sharpImage.resize(Math.round(metadata.width * scaleFactor));
        operations.push(`upscale_${scaleFactor.toFixed(1)}x`);
      }

      // Apply slight sharpening
      sharpImage = sharpImage.sharpen();
      operations.push('sharpen');

      // Set metadata for better OCR (replace density with metadata)
      sharpImage = sharpImage.png();
      operations.push('set_png_format');

      processedBuffer = await sharpImage.toBuffer();

      // Calculate improvement score (simple heuristic)
      const improvementScore = operations.length * 0.1;

      return {
        processedImageBuffer: processedBuffer,
        operations,
        improvementScore
      };

    } catch (error) {
      logger.warn('Image preprocessing failed, using original image', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        processedImageBuffer: imageBuffer,
        operations: ['preprocessing_failed'],
        improvementScore: 0
      };
    }
  }

  private async performOCR(
    imageBuffer: Buffer, 
    language: string, 
    requestId: string
  ): Promise<Tesseract.RecognizeResult> {
    
    // Map our language codes to Tesseract language codes
    const tesseractLanguage = this.mapToTesseractLanguage(language);
    
    logger.debug('Starting Tesseract OCR', {
      requestId,
      language: tesseractLanguage,
      imageSize: imageBuffer.length
    });

    const worker = await Tesseract.createWorker([tesseractLanguage]);
    
    try {
      // Configure Tesseract for medical document processing
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,()-$£€¥₹ :',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });

      const result = await worker.recognize(imageBuffer);
      
      logger.debug('Tesseract OCR completed', {
        requestId,
        confidence: result.data.confidence,
        textLength: result.data.text.length,
        wordsFound: result.data.words.length
      });

      return result;

    } finally {
      await worker.terminate();
    }
  }

  private extractTokensFromOCRResult(
    ocrResult: Tesseract.RecognizeResult, 
    confidenceThreshold: number
  ): RawToken[] {
    const tokens: RawToken[] = [];
    
    // Process each word from OCR result
    ocrResult.data.words.forEach((word) => {
      const confidence = word.confidence / 100; // Convert to 0-1 scale
      
      // Skip words below confidence threshold
      if (confidence < confidenceThreshold) {
        return;
      }

      // Extract numeric values and currency-related text
      const text = word.text.trim();
      if (this.isRelevantToken(text)) {
        // Get surrounding context (previous and next words)
        const context = this.getWordContext(word, ocrResult.data.words);
        
        tokens.push({
          value: text,
          confidence,
          position: {
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0
          },
          context
        });
      }
    });

    // Sort tokens by position (top to bottom, left to right)
    tokens.sort((a, b) => {
      if (!a.position || !b.position) return 0;
      if (Math.abs(a.position.y - b.position.y) > 20) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    return tokens;
  }

  private isRelevantToken(text: string): boolean {
    // Check if token contains numbers or currency-related keywords
    const hasNumbers = /\d/.test(text);
    const currencyKeywords = /^(total|paid|due|amount|bill|balance|discount|tax|copay|deductible|insurance|cost|fee|charge|price|sum|owe|owing)$/i;
    const currencySymbols = /[$£€¥₹]/.test(text);
    
    return hasNumbers || currencyKeywords.test(text) || currencySymbols;
  }

  private getWordContext(
    currentWord: Tesseract.Word, 
    allWords: Tesseract.Word[]
  ): string {
    const currentIndex = allWords.indexOf(currentWord);
    const contextWords: string[] = [];
    
    // Get 2 words before and after for context
    const contextRange = 2;
    const startIndex = Math.max(0, currentIndex - contextRange);
    const endIndex = Math.min(allWords.length - 1, currentIndex + contextRange);
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (i !== currentIndex) {
        contextWords.push(allWords[i].text);
      }
    }
    
    return contextWords.join(' ').trim();
  }

  private mapToTesseractLanguage(language: string): string {
    const languageMap: Record<string, string> = {
      'en': 'eng',
      'eng': 'eng',
      'hi': 'hin',
      'hin': 'hin',
      'es': 'spa',
      'spa': 'spa',
      'fr': 'fra',
      'fra': 'fra',
      'de': 'deu',
      'deu': 'deu'
    };
    
    return languageMap[language.toLowerCase()] || 'eng';
  }

  private generateRequestId(): string {
    return `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}