import { OCRService } from '@/services/ocr.service';
import { createWorker } from 'tesseract.js';

// Mock tesseract.js
jest.mock('tesseract.js');
const mockCreateWorker = createWorker as jest.MockedFunction<typeof createWorker>;

describe('OCRService', () => {
  let ocrService: OCRService;
  let mockWorker: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock worker
    mockWorker = {
      load: jest.fn().mockResolvedValue(undefined),
      loadLanguage: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      recognize: jest.fn().mockResolvedValue({
        data: {
          text: 'Sample medical text with amounts: $150.75',
          confidence: 0.85
        }
      }),
      terminate: jest.fn().mockResolvedValue(undefined)
    };

    mockCreateWorker.mockResolvedValue(mockWorker);
    ocrService = new OCRService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractText', () => {
    it('should extract text from image buffer successfully', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const expectedResult = {
        text: 'Sample medical text with amounts: $150.75',
        confidence: 0.85,
        processingTimeMs: expect.any(Number)
      };

      const result = await ocrService.extractText(imageBuffer);

      expect(mockCreateWorker).toHaveBeenCalled();
      expect(mockWorker.load).toHaveBeenCalled();
      expect(mockWorker.loadLanguage).toHaveBeenCalledWith('eng');
      expect(mockWorker.initialize).toHaveBeenCalled();
      expect(mockWorker.recognize).toHaveBeenCalledWith(imageBuffer);
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should handle OCR errors gracefully', async () => {
      const imageBuffer = Buffer.from('invalid-image-data');
      const error = new Error('OCR processing failed');
      
      mockWorker.recognize.mockRejectedValue(error);

      await expect(ocrService.extractText(imageBuffer)).rejects.toThrow('OCR processing failed');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should handle low confidence results', async () => {
      const imageBuffer = Buffer.from('low-quality-image');
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Unclear text',
          confidence: 0.3
        }
      });

      const result = await ocrService.extractText(imageBuffer);
      
      expect(result.confidence).toBe(0.3);
      expect(result.text).toBe('Unclear text');
    });

    it('should process with custom options', async () => {
      const imageBuffer = Buffer.from('test-image');
      const options = {
        confidenceThreshold: 0.8,
        languages: ['eng', 'spa']
      };

      await ocrService.extractText(imageBuffer, options);

      expect(mockWorker.loadLanguage).toHaveBeenCalledWith('eng+spa');
    });
  });

  describe('preprocessImage', () => {
    it('should preprocess image buffer', async () => {
      const imageBuffer = Buffer.from('test-image-data');
      
      const result = await ocrService.preprocessImage(imageBuffer);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle preprocessing errors', async () => {
      const invalidBuffer = Buffer.from('invalid');
      
      // This should not throw an error, but return the original buffer
      const result = await ocrService.preprocessImage(invalidBuffer);
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
