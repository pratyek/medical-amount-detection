import { DocumentProcessor } from '@/services/document-processor.service';
import { ProcessingOptions } from '@/types';

// Mock all dependencies
jest.mock('@/services/ocr.service');
jest.mock('@/services/normalization.service');
jest.mock('@/services/classification.service');
jest.mock('@/services/guardrails.service');
jest.mock('@/utils/logger');

describe('DocumentProcessor', () => {
  let documentProcessor: DocumentProcessor;
  let mockOCRService: any;
  let mockNormalizationService: any;
  let mockClassificationService: any;
  let mockGuardrailsService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock OCR Service
    mockOCRService = {
      extractText: jest.fn(),
      preprocessImage: jest.fn()
    };

    // Mock Normalization Service
    mockNormalizationService = {
      normalizeAmounts: jest.fn()
    };

    // Mock Classification Service
    mockClassificationService = {
      classifyAmounts: jest.fn()
    };

    // Mock Guardrails Service
    mockGuardrailsService = {
      validateInput: jest.fn(),
      validateOutput: jest.fn(),
      validateAISafety: jest.fn()
    };

    // Mock the services in the constructor
    jest.doMock('@/services/ocr.service', () => ({
      OCRService: jest.fn().mockImplementation(() => mockOCRService)
    }));

    jest.doMock('@/services/normalization.service', () => ({
      NormalizationService: jest.fn().mockImplementation(() => mockNormalizationService)
    }));

    jest.doMock('@/services/classification.service', () => ({
      ClassificationService: jest.fn().mockImplementation(() => mockClassificationService)
    }));

    jest.doMock('@/services/guardrails.service', () => ({
      GuardrailsService: jest.fn().mockImplementation(() => mockGuardrailsService),
      InputValidator: jest.fn().mockImplementation(() => ({})),
      OutputValidator: jest.fn().mockImplementation(() => ({})),
      AISafetyValidator: jest.fn().mockImplementation(() => ({}))
    }));

    documentProcessor = new DocumentProcessor();
  });

  describe('processText', () => {
    const mockOptions: ProcessingOptions = {
      confidenceThreshold: 0.8,
      enableAiClassification: true
    };

    it('should process text successfully', async () => {
      const text = 'Medical bill: Total $150.75 | Paid $100.50 | Due $50.25';
      
      // Mock guardrails validation
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      // Mock normalization
      mockNormalizationService.normalizeAmounts.mockResolvedValue({
        amounts: [
          { value: 150.75, source: '$150.75', confidence: 1.0 },
          { value: 100.50, source: '$100.50', confidence: 1.0 },
          { value: 50.25, source: '$50.25', confidence: 1.0 }
        ],
        confidence: 0.95,
        correctionsApplied: []
      });

      // Mock classification
      mockClassificationService.classifyAmounts.mockResolvedValue({
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 },
          { type: 'paid', value: 100.50, source: '$100.50', confidence: 0.92 },
          { type: 'due', value: 50.25, source: '$50.25', confidence: 0.90 }
        ],
        confidence: 0.92,
        fallbackUsed: false
      });

      // Mock output validation
      mockGuardrailsService.validateOutput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 0.95,
        recommendedAction: 'proceed'
      });

      const result = await documentProcessor.processText(text, mockOptions);

      expect(result.status).toBe('ok');
      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].type).toBe('total_bill');
      expect(result.amounts[1].type).toBe('paid');
      expect(result.amounts[2].type).toBe('due');
      expect(result.guardrailsResult.passed).toBe(true);
    });

    it('should handle input validation failures', async () => {
      const text = 'Suspicious content';
      
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: false,
        riskLevel: 'high',
        violations: [{
          rule: 'suspicious_content',
          severity: 'error',
          message: 'Suspicious content detected'
        }],
        confidence: 0.3,
        recommendedAction: 'reject'
      });

      const result = await documentProcessor.processText(text, mockOptions);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.guardrailsResult.passed).toBe(false);
    });

    it('should handle normalization failures', async () => {
      const text = 'Invalid text with no amounts';
      
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      mockNormalizationService.normalizeAmounts.mockResolvedValue({
        amounts: [],
        confidence: 0.0,
        correctionsApplied: []
      });

      const result = await documentProcessor.processText(text, mockOptions);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should handle classification failures with fallback', async () => {
      const text = 'Medical bill: Total $150.75';
      
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      mockNormalizationService.normalizeAmounts.mockResolvedValue({
        amounts: [
          { value: 150.75, source: '$150.75', confidence: 1.0 }
        ],
        confidence: 0.95,
        correctionsApplied: []
      });

      mockClassificationService.classifyAmounts.mockResolvedValue({
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.85 }
        ],
        confidence: 0.85,
        fallbackUsed: true
      });

      mockGuardrailsService.validateOutput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 0.85,
        recommendedAction: 'proceed'
      });

      const result = await documentProcessor.processText(text, mockOptions);

      expect(result.status).toBe('ok');
      expect(result.amounts).toHaveLength(1);
      expect(result.amounts[0].type).toBe('total_bill');
    });
  });

  describe('processImage', () => {
    const mockOptions: ProcessingOptions = {
      confidenceThreshold: 0.8,
      enableAiClassification: true
    };

    it('should process image successfully', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const filename = 'medical-bill.jpg';
      
      // Mock guardrails validation
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      // Mock OCR
      mockOCRService.extractText.mockResolvedValue({
        text: 'Medical bill: Total $150.75 | Paid $100.50 | Due $50.25',
        confidence: 0.85,
        processingTimeMs: 1000
      });

      // Mock normalization
      mockNormalizationService.normalizeAmounts.mockResolvedValue({
        amounts: [
          { value: 150.75, source: '$150.75', confidence: 1.0 },
          { value: 100.50, source: '$100.50', confidence: 1.0 },
          { value: 50.25, source: '$50.25', confidence: 1.0 }
        ],
        confidence: 0.95,
        correctionsApplied: []
      });

      // Mock classification
      mockClassificationService.classifyAmounts.mockResolvedValue({
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 },
          { type: 'paid', value: 100.50, source: '$100.50', confidence: 0.92 },
          { type: 'due', value: 50.25, source: '$50.25', confidence: 0.90 }
        ],
        confidence: 0.92,
        fallbackUsed: false
      });

      // Mock AI safety validation
      mockGuardrailsService.validateAISafety.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 0.95,
        recommendedAction: 'proceed'
      });

      // Mock output validation
      mockGuardrailsService.validateOutput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 0.95,
        recommendedAction: 'proceed'
      });

      const result = await documentProcessor.processImage(imageBuffer, filename, mockOptions);

      expect(result.status).toBe('ok');
      expect(result.amounts).toHaveLength(3);
      expect(result.processingDetails.ocrConfidence).toBe(0.85);
      expect(result.guardrailsResult.passed).toBe(true);
    });

    it('should handle OCR failures', async () => {
      const imageBuffer = Buffer.from('invalid-image-data');
      const filename = 'corrupted.jpg';
      
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      mockOCRService.extractText.mockRejectedValue(new Error('OCR processing failed'));

      const result = await documentProcessor.processImage(imageBuffer, filename, mockOptions);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should handle low OCR confidence', async () => {
      const imageBuffer = Buffer.from('low-quality-image');
      const filename = 'blurry.jpg';
      
      mockGuardrailsService.validateInput.mockResolvedValue({
        passed: true,
        riskLevel: 'low',
        violations: [],
        confidence: 1.0,
        recommendedAction: 'proceed'
      });

      mockOCRService.extractText.mockResolvedValue({
        text: 'Unclear text',
        confidence: 0.3,
        processingTimeMs: 1000
      });

      const result = await documentProcessor.processImage(imageBuffer, filename, mockOptions);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });
  });
});
