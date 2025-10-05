import { NormalizationService } from '@/services/normalization.service';
import { NormalizedAmount } from '@/types';

describe('NormalizationService', () => {
  let normalizationService: NormalizationService;

  beforeEach(() => {
    normalizationService = new NormalizationService();
  });

  describe('normalizeAmounts', () => {
    it('should normalize amounts from text successfully', async () => {
      const text = 'Total: $150.75 | Paid: $100.50 | Due: $50.25';
      const expectedAmounts: NormalizedAmount[] = [
        { value: 150.75, source: '$150.75', confidence: 1.0 },
        { value: 100.50, source: '$100.50', confidence: 1.0 },
        { value: 50.25, source: '$50.25', confidence: 1.0 }
      ];

      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].value).toBe(150.75);
      expect(result.amounts[1].value).toBe(100.50);
      expect(result.amounts[2].value).toBe(50.25);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle OCR errors and fix them', async () => {
      const text = 'Total: $15O.75 | Paid: $1OO.5O | Due: $5O.25';
      
      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].value).toBe(150.75);
      expect(result.amounts[1].value).toBe(100.50);
      expect(result.amounts[2].value).toBe(50.25);
      expect(result.correctionsApplied).toContain('O->0');
    });

    it('should handle different currency formats', async () => {
      const text = 'Total: INR 1200 | Paid: 1000 | Due: 200';
      
      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(3);
      expect(result.amounts[0].value).toBe(1200);
      expect(result.amounts[1].value).toBe(1000);
      expect(result.amounts[2].value).toBe(200);
    });

    it('should handle empty text', async () => {
      const text = '';
      
      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(0);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle text with no amounts', async () => {
      const text = 'This is just regular text with no numbers';
      
      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(0);
      expect(result.confidence).toBe(1.0);
    });

    it('should apply corrections for common OCR mistakes', async () => {
      const text = 'Amount: $1I5.75 (should be $115.75)';
      
      const result = await normalizationService.normalizeAmounts(text);

      expect(result.amounts).toHaveLength(1);
      expect(result.amounts[0].value).toBe(115.75);
      expect(result.correctionsApplied).toContain('I->1');
    });
  });

  describe('validateAmount', () => {
    it('should validate reasonable amounts', () => {
      expect(normalizationService.validateAmount(150.75)).toBe(true);
      expect(normalizationService.validateAmount(0.01)).toBe(true);
      expect(normalizationService.validateAmount(10000)).toBe(true);
    });

    it('should reject unreasonable amounts', () => {
      expect(normalizationService.validateAmount(-100)).toBe(false);
      expect(normalizationService.validateAmount(10000000)).toBe(false);
      expect(normalizationService.validateAmount(NaN)).toBe(false);
    });
  });

  describe('extractCurrency', () => {
    it('should extract USD currency', () => {
      const text = 'Total: $150.75';
      expect(normalizationService.extractCurrency(text)).toBe('USD');
    });

    it('should extract INR currency', () => {
      const text = 'Total: INR 1200';
      expect(normalizationService.extractCurrency(text)).toBe('INR');
    });

    it('should default to USD when no currency found', () => {
      const text = 'Total: 150.75';
      expect(normalizationService.extractCurrency(text)).toBe('USD');
    });
  });
});
