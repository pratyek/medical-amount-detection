import { ClassificationService } from "@/services/classification.service";
import { NormalizedAmount, ProcessingOptions } from "@/types";

// Mock Google Generative AI
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn()
    })
  }))
}));

describe('ClassificationService', () => {
  let classificationService: ClassificationService;
  let mockModel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock model
    mockModel = {
      generateContent: jest.fn()
    };

    // Mock the GoogleGenerativeAI constructor
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    }));

    classificationService = new ClassificationService();
  });

  describe('classifyAmounts', () => {
    const mockAmounts: NormalizedAmount[] = [
      { original: '$150.75', normalized: 150.75, confidence: 1.0, correctionsApplied: [] },
      { original: '$100.50', normalized: 100.50, confidence: 1.0, correctionsApplied: [] },
      { original: '$50.25', normalized: 50.25, confidence: 1.0, correctionsApplied: [] }
    ];

    const mockOptions: ProcessingOptions = {
      confidenceThreshold: 0.8,
      enableAiClassification: true,
      language: 'en',
      normalizeAmounts: true
    };

    it('should classify amounts using AI successfully', async () => {
      const mockAIResponse = {
        response: {
          text: () => JSON.stringify({
            classifications: [
              { amount: 150.75, type: 'total_bill', confidence: 0.95, reasoning: 'Total bill amount' },
              { amount: 100.50, type: 'paid', confidence: 0.92, reasoning: 'Amount paid' },
              { amount: 50.25, type: 'due', confidence: 0.90, reasoning: 'Amount due' }
            ],
            overall_confidence: 0.92
          })
        }
      };

      mockModel.generateContent.mockResolvedValue(mockAIResponse);

      const result = await classificationService.classifyAmounts(
        'Medical bill text',
        mockAmounts,
        mockOptions
      );

      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].type).toBe('total_bill');
      expect(result.amounts[1].type).toBe('paid');
      expect(result.amounts[2].type).toBe('due');
      expect(result.fallbackUsed).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should fallback to rule-based classification when AI fails', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('AI service unavailable'));

      const result = await classificationService.classifyAmounts(
        'Medical bill text',
        mockAmounts,
        mockOptions
      );

      expect(result.fallbackUsed).toBe(true);
      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].type).toBeDefined();
    });

    it('should handle AI timeout gracefully', async () => {
      mockModel.generateContent.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const result = await classificationService.classifyAmounts(
        'Medical bill text',
        mockAmounts,
        mockOptions
      );

      expect(result.fallbackUsed).toBe(true);
    });

    it('should work with AI disabled', async () => {
      const optionsWithAIDisabled = { ...mockOptions, enableAiClassification: false };

      const result = await classificationService.classifyAmounts(
        'Medical bill text',
        mockAmounts,
        optionsWithAIDisabled
      );

      expect(result.fallbackUsed).toBe(true);
      expect(result.amounts).toHaveLength(3);
    });

    it('should handle empty amounts array', async () => {
      const result = await classificationService.classifyAmounts(
        'No amounts in text',
        [],
        mockOptions
      );

      expect(result.amounts).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe('performRuleBasedClassification', () => {
    it('should classify amounts using rules', async () => {
      const amounts: NormalizedAmount[] = [
        { original: 'Total: $150.75', normalized: 150.75, confidence: 1.0, correctionsApplied: [], context: 'Total: $150.75' },
        { original: 'Paid: $100.50', normalized: 100.50, confidence: 1.0, correctionsApplied: [], context: 'Paid: $100.50' },
        { original: 'Due: $50.25', normalized: 50.25, confidence: 1.0, correctionsApplied: [], context: 'Due: $50.25' }
      ];

      const result = await classificationService.classifyAmounts(
        'Medical bill with total, paid, and due amounts',
        amounts,
        { confidenceThreshold: 0.8, enableAiClassification: false, language: 'en', normalizeAmounts: true }
      );

      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].type).toBe('total_bill');
      expect(result.amounts[1].type).toBe('paid');
      expect(result.amounts[2].type).toBe('due');
    });

    it('should handle insurance-related amounts', async () => {
      const amounts: NormalizedAmount[] = [
        { original: 'Insurance: $200.00', normalized: 200.00, confidence: 1.0, correctionsApplied: [], context: 'Insurance: $200.00' }
      ];

      const result = await classificationService.classifyAmounts(
        'Insurance payment of $200.00',
        amounts,
        { confidenceThreshold: 0.8, enableAiClassification: false, language: 'en', normalizeAmounts: true }
      );

      expect(result.amounts[0].type).toBe('insurance_coverage');
    });
  });

  describe('buildClassificationPrompt', () => {
    it('should build proper prompt for AI', () => {
      const amounts: NormalizedAmount[] = [
        { original: '$150.75', normalized: 150.75, confidence: 1.0, correctionsApplied: [] }
      ];

      // Access the private method through type assertion for testing
      const prompt = (classificationService as any).buildClassificationPrompt(
        'Medical bill text',
        amounts
      );

      expect(prompt).toContain('Medical bill text');
      expect(prompt).toContain('150.75');
      expect(prompt).toContain('classify');
    });
  });
});
