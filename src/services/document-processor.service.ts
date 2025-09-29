import { v4 as uuidv4 } from 'uuid';
import { 
  DocumentResponse, 
  ProcessingOptions, 
  ProcessingStatus,
  Currency,
  ProcessingDetails,
  GuardrailResult
} from '@/types';
import { OCRService } from './ocr.service';
import { NormalizationService } from './normalization.service';
import { ClassificationService } from './classification.service';
import { GuardrailsService, InputValidator, OutputValidator, AISafetyValidator } from './guardrails.service';
import logger from '@/utils/logger';

export class DocumentProcessor {
  private readonly ocrService: OCRService;
  private readonly normalizationService: NormalizationService;
  private readonly classificationService: ClassificationService;
  private readonly guardrailsService: GuardrailsService;

  constructor() {
    this.ocrService = new OCRService();
    this.normalizationService = new NormalizationService();
    this.classificationService = new ClassificationService();
    
    // Initialize guardrails services
    const inputValidator = new InputValidator();
    const outputValidator = new OutputValidator();
    const aiSafetyValidator = new AISafetyValidator();
    
    this.guardrailsService = new GuardrailsService(
      inputValidator,
      outputValidator,
      aiSafetyValidator
    );
  }

  async processText(text: string, options: ProcessingOptions): Promise<DocumentResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    logger.info('Starting text processing', {
      requestId,
      textLength: text.length,
      options
    });

    try {
      // Step 1: Input Guardrails Validation
      const inputValidation = await this.guardrailsService.validateInput({ text, options });
      
      if (!inputValidation.passed) {
        logger.warn('Input validation failed', {
          requestId,
          violations: inputValidation.violations
        });

        if (inputValidation.recommendedAction === 'reject') {
          return this.createErrorResponse(
            requestId, 
            'Input validation failed', 
            inputValidation,
            Date.now() - startTime
          );
        }
      }

      // Step 2: Extract tokens from text (simulate OCR for text input)
      const tokens = this.extractTokensFromText(text);
      
      // Step 3: Normalize amounts
      const normalizedAmounts = await this.normalizationService.normalizeAmounts(tokens);
      
      if (normalizedAmounts.length === 0) {
        logger.info('No amounts found in text', { requestId });
        
        return {
          currency: Currency.USD, // Default
          amounts: [],
          status: ProcessingStatus.NO_AMOUNTS_FOUND,
          processingDetails: {
            ocrConfidence: null,
            normalizationConfidence: 0,
            classificationConfidence: 0,
            processingTimeMs: Date.now() - startTime,
            tokensExtracted: tokens.length,
            correctionsApplied: []
          },
          requestId,
          guardrailsResult: inputValidation
        };
      }

      // Step 4: Detect currency
      const currency = this.normalizationService.detectCurrency(tokens);

      // Step 5: Classify amounts using AI
      const classificationResult = await this.classificationService.classifyAmounts(
        text, 
        normalizedAmounts, 
        options
      );

      // Step 6: Build processing details
      const processingDetails: ProcessingDetails = {
        ocrConfidence: null, // No OCR for text input
        normalizationConfidence: this.calculateAverageConfidence(normalizedAmounts.map(a => a.confidence)),
        classificationConfidence: classificationResult.confidence,
        processingTimeMs: Date.now() - startTime,
        tokensExtracted: tokens.length,
        correctionsApplied: normalizedAmounts.flatMap(a => a.correctionsApplied)
      };

      // Step 7: Create response
      const response: DocumentResponse = {
        currency,
        amounts: classificationResult.amounts,
        status: ProcessingStatus.SUCCESS,
        processingDetails,
        requestId,
        guardrailsResult: inputValidation,
        warnings: inputValidation.violations.filter(v => v.severity === 'warning')
      };

      // Step 8: Output Guardrails Validation
      const outputValidation = await this.guardrailsService.validateOutput(response);
      response.guardrailsResult = outputValidation;

      if (outputValidation.violations.length > 0) {
        response.warnings = (response.warnings || []).concat(
          outputValidation.violations.filter(v => v.severity === 'warning')
        );
      }

      logger.info('Text processing completed successfully', {
        requestId,
        amountsFound: response.amounts.length,
        processingTimeMs: processingDetails.processingTimeMs,
        guardrailsPassed: outputValidation.passed
      });

      return response;

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Text processing failed', {
        requestId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processImage(imageBuffer: Buffer, filename: string, options: ProcessingOptions): Promise<DocumentResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    logger.info('Starting image processing', {
      requestId,
      imageSize: imageBuffer.length,
      filename,
      options
    });

    try {
      // Step 1: Input Guardrails Validation
      const inputValidation = await this.guardrailsService.validateInput(
        { filename, options }, 
        imageBuffer
      );
      
      if (!inputValidation.passed) {
        logger.warn('Input validation failed for image', {
          requestId,
          violations: inputValidation.violations
        });

        if (inputValidation.recommendedAction === 'reject') {
          return this.createErrorResponse(
            requestId, 
            'Input validation failed', 
            inputValidation,
            Date.now() - startTime
          );
        }
      }

      // Step 2: OCR Processing
      const ocrResult = await this.ocrService.extractText(imageBuffer, options);
      
      if (ocrResult.tokens.length === 0) {
        logger.info('No tokens extracted from image', { requestId });
        
        return {
          currency: Currency.USD, // Default
          amounts: [],
          status: ProcessingStatus.NO_AMOUNTS_FOUND,
          processingDetails: {
            ocrConfidence: ocrResult.confidence,
            normalizationConfidence: 0,
            classificationConfidence: 0,
            processingTimeMs: Date.now() - startTime,
            tokensExtracted: 0,
            correctionsApplied: []
          },
          requestId,
          guardrailsResult: inputValidation
        };
      }

      // Step 3: Normalize amounts
      const normalizedAmounts = await this.normalizationService.normalizeAmounts(ocrResult.tokens);
      
      if (normalizedAmounts.length === 0) {
        logger.info('No valid amounts after normalization', { requestId });
        
        return {
          currency: Currency.USD, // Default
          amounts: [],
          status: ProcessingStatus.NO_AMOUNTS_FOUND,
          processingDetails: {
            ocrConfidence: ocrResult.confidence,
            normalizationConfidence: 0,
            classificationConfidence: 0,
            processingTimeMs: Date.now() - startTime,
            tokensExtracted: ocrResult.tokens.length,
            correctionsApplied: normalizedAmounts.flatMap(a => a.correctionsApplied)
          },
          requestId,
          guardrailsResult: inputValidation
        };
      }

      // Step 4: Detect currency
      const currency = this.normalizationService.detectCurrency(ocrResult.tokens);

      // Step 5: Classify amounts using AI
      const classificationResult = await this.classificationService.classifyAmounts(
        ocrResult.text, 
        normalizedAmounts, 
        options
      );

      // Step 6: AI Safety Validation (if AI was used)
      let aiSafetyValidation: GuardrailResult | null = null;
      if (options.enableAiClassification && !classificationResult.fallbackUsed) {
        aiSafetyValidation = await this.guardrailsService.validateAISafety(
          ocrResult.text, 
          classificationResult.reasoning || ''
        );
      }

      // Step 7: Build processing details
      const processingDetails: ProcessingDetails = {
        ocrConfidence: ocrResult.confidence,
        normalizationConfidence: this.calculateAverageConfidence(normalizedAmounts.map(a => a.confidence)),
        classificationConfidence: classificationResult.confidence,
        processingTimeMs: Date.now() - startTime,
        tokensExtracted: ocrResult.tokens.length,
        correctionsApplied: normalizedAmounts.flatMap(a => a.correctionsApplied)
      };

      // Step 8: Create response
      const response: DocumentResponse = {
        currency,
        amounts: classificationResult.amounts,
        status: ProcessingStatus.SUCCESS,
        processingDetails,
        requestId,
        guardrailsResult: inputValidation,
        warnings: inputValidation.violations.filter(v => v.severity === 'warning')
      };

      // Add AI safety warnings if applicable
      if (aiSafetyValidation && aiSafetyValidation.violations.length > 0) {
        response.warnings = (response.warnings || []).concat(
          aiSafetyValidation.violations.filter(v => v.severity === 'warning')
        );
      }

      // Step 9: Output Guardrails Validation
      const outputValidation = await this.guardrailsService.validateOutput(response);
      
      if (outputValidation.violations.length > 0) {
        response.warnings = (response.warnings || []).concat(
          outputValidation.violations.filter(v => v.severity === 'warning')
        );
      }

      // Update guardrails result with most restrictive validation
      response.guardrailsResult = this.combineGuardrailResults([
        inputValidation,
        outputValidation,
        ...(aiSafetyValidation ? [aiSafetyValidation] : [])
      ]);

      logger.info('Image processing completed successfully', {
        requestId,
        amountsFound: response.amounts.length,
        processingTimeMs: processingDetails.processingTimeMs,
        ocrConfidence: ocrResult.confidence,
        guardrailsPassed: response.guardrailsResult.passed
      });

      return response;

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Image processing failed', {
        requestId,
        processingTimeMs,
        filename,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractTokensFromText(text: string) {
    // Enhanced token extraction that preserves key-value relationships
    const tokens: Array<{ value: string; confidence: number; context: string }> = [];
    
    // First, try to find key-value pairs (Label: Amount)
    const keyValuePattern = /([a-zA-Z\s]+):\s*([£€¥₹$]?\d+(?:[.,]\d{2})?)/g;
    let match;
    
    while ((match = keyValuePattern.exec(text)) !== null) {
      const label = match[1].trim();
      const amount = match[2];
      
      tokens.push({
        value: amount,
        confidence: 0.95,
        context: label // Use the actual label as context
      });
    }
    
    // Also look for pipe-separated values (Label | Amount)
    const pipePattern = /([a-zA-Z\s]+)\s*\|\s*([£€¥₹$]?\d+(?:[.,]\d{2})?)/g;
    while ((match = pipePattern.exec(text)) !== null) {
      const label = match[1].trim();
      const amount = match[2];
      
      tokens.push({
        value: amount,
        confidence: 0.95,
        context: label
      });
    }
    
    // Fallback: look for standalone amounts with surrounding context
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (/^[£€¥₹$]?\d+(?:[.,]\d{2})?$/.test(word)) {
        // Skip if already captured by key-value patterns
        const alreadyCaptured = tokens.some(token => token.value === word);
        if (!alreadyCaptured) {
          const context = this.getTextContext(words, i);
          tokens.push({
            value: word,
            confidence: 0.85, // Lower confidence for standalone amounts
            context
          });
        }
      }
    }
    
    return tokens;
  }

  private isAmountKeyword(word: string): boolean {
    const keywords = [
      'total', 'paid', 'due', 'amount', 'bill', 'balance', 
      'cost', 'fee', 'charge', 'price', 'sum', 'owe', 'owing',
      'discount', 'tax', 'copay', 'deductible', 'insurance'
    ];
    
    return keywords.includes(word.toLowerCase());
  }

  private getTextContext(words: string[], index: number): string {
    const contextRange = 3;
    const start = Math.max(0, index - contextRange);
    const end = Math.min(words.length, index + contextRange + 1);
    
    return words.slice(start, end)
      .filter((_, i) => i !== index - start) // Exclude the current word
      .join(' ');
  }

  private calculateAverageConfidence(confidences: number[]): number {
    if (confidences.length === 0) return 0;
    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  }

  private createErrorResponse(
    requestId: string, 
    _message: string, 
    guardrailsResult: GuardrailResult, 
    processingTimeMs: number
  ): DocumentResponse {
    return {
      currency: Currency.USD,
      amounts: [],
      status: ProcessingStatus.ERROR,
      processingDetails: {
        ocrConfidence: null,
        normalizationConfidence: 0,
        classificationConfidence: 0,
        processingTimeMs,
        tokensExtracted: 0,
        correctionsApplied: []
      },
      requestId,
      guardrailsResult,
      warnings: guardrailsResult.violations.filter(v => v.severity === 'warning')
    };
  }

  private combineGuardrailResults(results: GuardrailResult[]): GuardrailResult {
    if (results.length === 0) {
      return {
        passed: true,
        riskLevel: 'low' as any,
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed' as any
      };
    }

    if (results.length === 1) {
      return results[0];
    }

    // Combine multiple guardrail results
    const allViolations = results.flatMap(r => r.violations);
    const worstRiskLevel = results.reduce((worst, current) => {
      const riskLevels = ['low', 'medium', 'high', 'critical'];
      return riskLevels.indexOf(current.riskLevel) > riskLevels.indexOf(worst) ? current.riskLevel : worst;
    }, 'low' as any);
    
    const overallPassed = results.every(r => r.passed);
    const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    // Most restrictive action
    const actions = ['proceed', 'proceed_with_caution', 'manual_review', 'reject'];
    const mostRestrictiveAction = results.reduce((worst, current) => {
      return actions.indexOf(current.recommendedAction) > actions.indexOf(worst) ? current.recommendedAction : worst;
    }, 'proceed' as any);

    return {
      passed: overallPassed,
      riskLevel: worstRiskLevel,
      violations: allViolations,
      confidence: averageConfidence,
      recommendedAction: mostRestrictiveAction
    };
  }
}