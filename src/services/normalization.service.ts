import { 
  INormalizationService, 
  RawToken, 
  NormalizedAmount, 
  Currency 
} from '@/types';
import { config } from '@/config';
import logger from '@/utils/logger';

export class NormalizationService implements INormalizationService {
  private readonly confidenceThreshold: number;
  
  // Common OCR digit errors and their corrections
  private readonly digitCorrections: Map<string, string> = new Map([
    // Common OCR misreads
    ['O', '0'], ['o', '0'],
    ['I', '1'], ['l', '1'], ['|', '1'],
    ['S', '5'], ['s', '5'],
    ['G', '6'], ['g', '6'],
    ['T', '7'], ['t', '7'],
    ['B', '8'], ['b', '8'],
    ['g', '9'], ['q', '9'],
    ['Z', '2'], ['z', '2'],
    // Letter-number combinations
    ['1O', '10'], ['1o', '10'],
    ['2O', '20'], ['2o', '20'],
    ['5O', '50'], ['5o', '50'],
    // Common currency OCR errors
    ['$1OO', '$100'], ['$1oo', '$100'],
    ['$5O', '$50'], ['$5o', '$50'],
    ['INR1OOO', 'INR1000'], ['INR1ooo', 'INR1000']
  ]);

  // Currency detection patterns
  private readonly currencyPatterns: Array<{ currency: Currency; patterns: RegExp[] }> = [
    {
      currency: Currency.USD,
      patterns: [/\$\d+/, /USD\s*\d+/, /dollars?\s*\d+/i]
    },
    {
      currency: Currency.INR,
      patterns: [/₹\d+/, /INR\s*\d+/, /rupees?\s*\d+/i, /Rs\.?\s*\d+/i]
    },
    {
      currency: Currency.EUR,
      patterns: [/€\d+/, /EUR\s*\d+/, /euros?\s*\d+/i]
    },
    {
      currency: Currency.GBP,
      patterns: [/£\d+/, /GBP\s*\d+/, /pounds?\s*\d+/i]
    },
    {
      currency: Currency.CAD,
      patterns: [/CAD\s*\d+/, /C\$\d+/]
    }
  ];

  constructor() {
    this.confidenceThreshold = config.MIN_NORMALIZATION_CONFIDENCE;
  }

  async normalizeAmounts(tokens: RawToken[]): Promise<NormalizedAmount[]> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    logger.info('Starting amount normalization', {
      requestId,
      tokenCount: tokens.length,
      confidenceThreshold: this.confidenceThreshold
    });

    const normalizedAmounts: NormalizedAmount[] = [];

    for (const token of tokens) {
      try {
        const normalized = await this.normalizeToken(token, requestId);
        if (normalized) {
          normalizedAmounts.push(normalized);
        }
      } catch (error) {
        logger.warn('Token normalization failed', {
          requestId,
          token: token.value,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    logger.info('Amount normalization completed', {
      requestId,
      processingTimeMs,
      originalTokens: tokens.length,
      normalizedAmounts: normalizedAmounts.length
    });

    return normalizedAmounts;
  }

  private async normalizeToken(token: RawToken, requestId: string): Promise<NormalizedAmount | null> {
    const original = token.value.trim();
    let corrected = original;
    const correctionsApplied: string[] = [];

    // Step 1: Apply character-level corrections
    corrected = this.applyCharacterCorrections(corrected, correctionsApplied);

    // Step 2: Clean and extract numeric value
    const { cleanedText, extractedNumber } = this.extractAndCleanNumber(corrected);

    if (extractedNumber === null) {
      logger.debug('No valid number found in token', {
        requestId,
        original,
        corrected: cleanedText
      });
      return null;
    }

    // Step 3: Validate the normalized number
    if (!this.isValidAmount(extractedNumber)) {
      logger.debug('Invalid amount detected', {
        requestId,
        original,
        extractedNumber,
        reason: 'outside valid range'
      });
      return null;
    }

    // Step 4: Calculate confidence based on corrections and context
    const confidence = this.calculateNormalizationConfidence(
      token,
      original,
      cleanedText,
      correctionsApplied
    );

    logger.debug('Token normalized successfully', {
      requestId,
      original,
      normalized: extractedNumber,
      confidence,
      correctionsApplied
    });

    return {
      original,
      normalized: extractedNumber,
      confidence,
      correctionsApplied,
      context: token.context // Pass through the context from token
    };
  }

  private applyCharacterCorrections(text: string, correctionsApplied: string[]): string {
    let corrected = text;

    // Apply direct character substitutions
    for (const [wrong, right] of this.digitCorrections.entries()) {
      if (corrected.includes(wrong)) {
        corrected = corrected.replace(new RegExp(wrong, 'g'), right);
        correctionsApplied.push(`${wrong}->${right}`);
      }
    }

    // Apply pattern-based corrections
    corrected = this.applyPatternCorrections(corrected, correctionsApplied);

    return corrected;
  }

  private applyPatternCorrections(text: string, correctionsApplied: string[]): string {
    let corrected = text;

    // Fix common decimal point issues
    corrected = corrected.replace(/(\d),(\d{2})$/, '$1.$2'); // 1,50 -> 1.50
    if (corrected !== text) {
      correctionsApplied.push('comma_to_decimal');
    }

    // Fix space in numbers (1 000 -> 1000)
    const spaceFixed = corrected.replace(/(\d)\s+(\d)/g, '$1$2');
    if (spaceFixed !== corrected) {
      correctionsApplied.push('remove_spaces');
      corrected = spaceFixed;
    }

    // Fix leading/trailing non-numeric characters in pure numbers
    const trimmed = corrected.replace(/^[^\d$£€¥₹]*(\d.*\d|\d)[^\d]*$/, '$1');
    if (trimmed !== corrected && /^\d+\.?\d*$/.test(trimmed)) {
      correctionsApplied.push('trim_non_numeric');
      corrected = trimmed;
    }

    return corrected;
  }

  private extractAndCleanNumber(text: string): { cleanedText: string; extractedNumber: number | null } {
    // Remove currency symbols but keep the text for context
    let cleaned = text;
    
    // Extract numbers with optional decimal places
    const numberPattern = /\d+(?:[.,]\d{1,2})?/g;
    const matches = cleaned.match(numberPattern);

    if (!matches || matches.length === 0) {
      return { cleanedText: cleaned, extractedNumber: null };
    }

    // If multiple numbers found, try to identify the main amount
    let bestMatch = matches[0];
    
    if (matches.length > 1) {
      // Prefer longer numbers (more likely to be the main amount)
      bestMatch = matches.reduce((prev, curr) => 
        curr.length > prev.length ? curr : prev
      );
    }

    // Convert to number, handling decimal separators
    const normalizedNumber = bestMatch.replace(',', '.');
    const extractedNumber = parseFloat(normalizedNumber);

    return {
      cleanedText: cleaned,
      extractedNumber: isNaN(extractedNumber) ? null : extractedNumber
    };
  }

  private isValidAmount(amount: number): boolean {
    // Basic validation for reasonable amounts in medical context
    const MIN_AMOUNT = 0.01; // 1 cent
    const MAX_AMOUNT = 10000000; // 10 million (very high but possible for complex procedures)

    return amount >= MIN_AMOUNT && 
           amount <= MAX_AMOUNT && 
           Number.isFinite(amount) &&
           amount > 0;
  }

  private calculateNormalizationConfidence(
    token: RawToken,
    original: string,
    normalized: string,
    correctionsApplied: string[]
  ): number {
    let confidence = token.confidence; // Start with OCR confidence

    // Reduce confidence based on corrections applied
    const correctionPenalty = correctionsApplied.length * 0.05; // 5% penalty per correction
    confidence -= correctionPenalty;

    // Boost confidence if the text looks like a clear amount
    if (this.hasStrongAmountIndicators(original)) {
      confidence += 0.1;
    }

    // Boost confidence if context suggests this is an amount
    if (this.hasAmountContext(token.context)) {
      confidence += 0.1;
    }

    // Penalty for very short numbers (might be page numbers, dates, etc.)
    if (normalized.length <= 2 && !original.includes('$') && !original.includes('₹')) {
      confidence -= 0.2;
    }

    // Ensure confidence stays within bounds
    return Math.max(0, Math.min(1, confidence));
  }

  private hasStrongAmountIndicators(text: string): boolean {
    const strongIndicators = [
      /\$\d+/, /₹\d+/, /€\d+/, /£\d+/, // Currency symbols
      /\d+\.\d{2}/, // Decimal amounts
      /\d{3,}/, // Larger numbers (3+ digits)
    ];

    return strongIndicators.some(pattern => pattern.test(text));
  }

  private hasAmountContext(context: string): boolean {
    const amountKeywords = [
      'total', 'paid', 'due', 'amount', 'bill', 'balance', 
      'cost', 'fee', 'charge', 'price', 'sum', 'owe', 'owing',
      'discount', 'tax', 'copay', 'deductible', 'insurance'
    ];

    const contextLower = context.toLowerCase();
    return amountKeywords.some(keyword => contextLower.includes(keyword));
  }

  public detectCurrency(tokens: RawToken[]): Currency {
    const allText = tokens.map(t => `${t.value} ${t.context}`).join(' ');

    // Check for currency patterns in order of specificity
    for (const { currency, patterns } of this.currencyPatterns) {
      if (patterns.some(pattern => pattern.test(allText))) {
        return currency;
      }
    }

    // Default currency based on common patterns or configuration
    return Currency.USD; // Default fallback
  }

  private generateRequestId(): string {
    return `norm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}