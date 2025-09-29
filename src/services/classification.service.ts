import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  IClassificationService, 
  ClassificationResult, 
  NormalizedAmount, 
  AmountDetail, 
  AmountType, 
  ProcessingOptions 
} from '@/types';
import { config } from '@/config';
import logger from '@/utils/logger';

export class ClassificationService implements IClassificationService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: any;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: config.GOOGLE_AI_MODEL });
    this.maxRetries = config.AI_MAX_RETRIES;
    this.timeoutMs = config.AI_TIMEOUT_MS;
  }

  async classifyAmounts(
    text: string, 
    amounts: NormalizedAmount[], 
    options: ProcessingOptions
  ): Promise<ClassificationResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    logger.info('Starting AI classification', {
      requestId,
      amountCount: amounts.length,
      textLength: text.length,
      aiEnabled: options.enableAiClassification
    });

    try {
      let classificationResult: ClassificationResult;

      if (options.enableAiClassification && config.ENABLE_FALLBACK_CLASSIFICATION) {
        // Try AI classification first
        try {
          classificationResult = await this.performAIClassification(text, amounts, requestId);
        } catch (aiError) {
          logger.warn('AI classification failed, falling back to rule-based', {
            requestId,
            error: aiError instanceof Error ? aiError.message : 'Unknown AI error'
          });
          
          classificationResult = await this.performRuleBasedClassification(text, amounts, requestId);
          classificationResult.fallbackUsed = true;
        }
      } else {
        // Use rule-based classification directly
        classificationResult = await this.performRuleBasedClassification(text, amounts, requestId);
        classificationResult.fallbackUsed = true;
      }

      const processingTimeMs = Date.now() - startTime;

      logger.info('Classification completed', {
        requestId,
        processingTimeMs,
        classifiedAmounts: classificationResult.amounts.length,
        confidence: classificationResult.confidence,
        fallbackUsed: classificationResult.fallbackUsed
      });

      return classificationResult;

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Classification failed completely', {
        requestId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async performAIClassification(
    text: string, 
    amounts: NormalizedAmount[], 
    requestId: string
  ): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(text, amounts);
    
    logger.debug('Sending prompt to Gemini AI', {
      requestId,
      promptLength: prompt.length
    });

    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        const result = await Promise.race([
          this.model.generateContent(prompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('AI request timeout')), this.timeoutMs)
          )
        ]) as any;

        const response = result.response;
        const responseText = response.text();

        logger.debug('Gemini AI response received', {
          requestId,
          responseLength: responseText.length,
          attempt: attempt + 1
        });

        // Parse AI response
        const classifiedAmounts = this.parseAIResponse(responseText, amounts, requestId);
        const confidence = this.calculateAIConfidence(classifiedAmounts, amounts);

        return {
          amounts: classifiedAmounts,
          confidence,
          reasoning: responseText,
          fallbackUsed: false
        };

      } catch (error) {
        attempt++;
        logger.warn(`AI classification attempt ${attempt} failed`, {
          requestId,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        if (attempt >= this.maxRetries) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('All AI classification attempts failed');
  }

  private buildClassificationPrompt(text: string, amounts: NormalizedAmount[]): string {
    const amountsList = amounts.map((amt, idx) => 
      `${idx + 1}. ${amt.normalized} (original: "${amt.original}")`
    ).join('\n');

    return `You are an expert medical billing analyst. Analyze this medical document text and classify each detected amount by its type.

DOCUMENT TEXT:
"${text}"

DETECTED AMOUNTS:
${amountsList}

For each amount, determine its type from these categories:
- total_bill: The total amount due for the entire bill
- paid: Amount already paid or received
- due: Outstanding balance or amount still owed
- discount: Discount or reduction applied
- tax: Tax amount added to the bill
- copay: Insurance copayment amount
- deductible: Insurance deductible amount
- insurance_coverage: Amount covered by insurance
- other: Any other type of amount

RESPONSE FORMAT (JSON only, no explanation):
{
  "classifications": [
    {
      "amount": <number>,
      "type": "<type>",
      "confidence": <0.0-1.0>,
      "reasoning": "<brief explanation>"
    }
  ],
  "overall_confidence": <0.0-1.0>
}

Requirements:
1. Only classify amounts that clearly belong to a category
2. Prefer specific types over "other"
3. Use context clues from surrounding text
4. Ensure total = paid + due when all three are present
5. Be conservative with confidence scores`;
  }

  private parseAIResponse(
    responseText: string, 
    originalAmounts: NormalizedAmount[], 
    requestId: string
  ): AmountDetail[] {
    try {
      // Extract JSON from response (AI might include additional text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const classifications = parsed.classifications || [];

      const classifiedAmounts: AmountDetail[] = [];

      for (const classification of classifications) {
        // Find matching original amount
        const matchingAmount = originalAmounts.find(amt => 
          Math.abs(amt.normalized - classification.amount) < 0.01
        );

        if (matchingAmount) {
          classifiedAmounts.push({
            type: this.validateAmountType(classification.type),
            value: matchingAmount.normalized,
            source: `${matchingAmount.original} (AI classified)`,
            confidence: Math.max(0, Math.min(1, classification.confidence || 0.5))
          });
        }
      }

      logger.debug('AI response parsed successfully', {
        requestId,
        originalAmounts: originalAmounts.length,
        classifiedAmounts: classifiedAmounts.length
      });

      return classifiedAmounts;

    } catch (error) {
      logger.error('Failed to parse AI response', {
        requestId,
        error: error instanceof Error ? error.message : 'Parse error',
        responsePreview: responseText.substring(0, 200)
      });

      throw new Error('Invalid AI response format');
    }
  }

  private async performRuleBasedClassification(
    text: string, 
    amounts: NormalizedAmount[], 
    requestId: string
  ): Promise<ClassificationResult> {
    logger.debug('Starting rule-based classification', {
      requestId,
      amountCount: amounts.length
    });

    const classifiedAmounts: AmountDetail[] = [];
    const textLower = text.toLowerCase();

    for (const amount of amounts) {
      const classification = this.classifyAmountByRules(amount, textLower);
      classifiedAmounts.push(classification);
    }

    // Post-process to ensure logical consistency
    const consistentAmounts = this.ensureLogicalConsistency(classifiedAmounts);
    const confidence = this.calculateRuleBasedConfidence(consistentAmounts);

    return {
      amounts: consistentAmounts,
      confidence,
      reasoning: 'Rule-based classification using keyword matching and context analysis',
      fallbackUsed: true
    };
  }

  private classifyAmountByRules(amount: NormalizedAmount, textLower: string): AmountDetail {
    const original = amount.original.toLowerCase();
    
    // Get the context from the token (this now contains the actual label)
    const contextFromToken = amount.context || '';
    const contextLower = contextFromToken.toLowerCase();
    
    // Also get surrounding text context as fallback
    const sourcePos = textLower.indexOf(original);
    const contextStart = Math.max(0, sourcePos - 50);
    const contextEnd = Math.min(textLower.length, sourcePos + original.length + 50);
    const surroundingContext = textLower.substring(contextStart, contextEnd);
    
    // Combined context for matching
    const fullContext = `${contextLower} ${surroundingContext}`.toLowerCase();

    // Enhanced keyword patterns with more specific matching
    const patterns: Array<{ type: AmountType; keywords: string[]; priority: number }> = [
      { 
        type: AmountType.TOTAL_BILL, 
        keywords: ['total bill', 'total charges', 'total amount', 'grand total', 'bill total', 'total', 'amount due'], 
        priority: 10 
      },
      { 
        type: AmountType.PAID, 
        keywords: ['paid amount', 'payment', 'paid', 'amount paid', 'received', 'remitted', 'settled'], 
        priority: 9 
      },
      { 
        type: AmountType.DUE, 
        keywords: ['balance due', 'amount due', 'due', 'outstanding', 'owe', 'owing', 'patient balance', 'remaining', 'balance'], 
        priority: 8 
      },
      { 
        type: AmountType.INSURANCE_COVERAGE, 
        keywords: ['insurance coverage', 'insurance payment', 'insurance', 'covered', 'coverage', 'benefit'], 
        priority: 9 
      },
      { 
        type: AmountType.COPAY, 
        keywords: ['copay', 'co-pay', 'copayment', 'co-payment', 'patient copay', 'patient responsibility'], 
        priority: 8 
      },
      { 
        type: AmountType.DEDUCTIBLE, 
        keywords: ['deductible', 'deduct'], 
        priority: 7 
      },
      { 
        type: AmountType.DISCOUNT, 
        keywords: ['discount', 'reduction', 'off', 'deduction', 'savings'], 
        priority: 7 
      },
      { 
        type: AmountType.TAX, 
        keywords: ['tax', 'gst', 'vat', 'sales tax', 'service tax'], 
        priority: 6 
      },
      { 
        type: AmountType.OTHER, 
        keywords: ['consultation fee', 'lab tests', 'medication', 'fee', 'charge', 'cost'], 
        priority: 5 
      }
    ];

    // Find best matching pattern with enhanced scoring
    let bestMatch = { type: AmountType.OTHER, confidence: 0.3 };

    for (const pattern of patterns) {
      let matchScore = 0;
      
      // Check for exact phrase matches in the direct context (label)
      for (const keyword of pattern.keywords) {
        if (contextLower.includes(keyword)) {
          matchScore += 0.9; // Very high score for direct label match
        } else if (fullContext.includes(keyword)) {
          matchScore += 0.5; // Medium score for surrounding context
        }
      }

      // Apply priority weighting
      const adjustedScore = Math.min(0.9, matchScore * (pattern.priority / 10));

      if (adjustedScore > bestMatch.confidence) {
        bestMatch = {
          type: pattern.type,
          confidence: adjustedScore
        };
      }
    }

    // Use the original context as the source for better traceability
    const sourceText = contextFromToken ? `${contextFromToken}: ${amount.original}` : amount.original;

    return {
      type: bestMatch.type,
      value: amount.normalized,
      source: `${sourceText} (rule-based)`,
      confidence: bestMatch.confidence
    };
  }

  private calculateKeywordMatchScore(text: string, keywords: string[]): number {
    let score = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // Exact match gets full points
        score += 0.3;
        
        // Bonus for keyword proximity to numbers
        const keywordIndex = text.indexOf(keyword);
        const nearbyText = text.substring(Math.max(0, keywordIndex - 50), keywordIndex + 50);
        if (/\d/.test(nearbyText)) {
          score += 0.2;
        }
      }
    }

    return Math.min(1, score);
  }

  private ensureLogicalConsistency(amounts: AmountDetail[]): AmountDetail[] {
    // Find total, paid, and due amounts
    const total = amounts.find(a => a.type === AmountType.TOTAL_BILL);
    const paid = amounts.find(a => a.type === AmountType.PAID);
    const due = amounts.find(a => a.type === AmountType.DUE);

    // If we have all three, check arithmetic consistency
    if (total && paid && due) {
      const calculatedDue = total.value - paid.value;
      const tolerance = 0.02; // 2 cents tolerance

      if (Math.abs(calculatedDue - due.value) > tolerance) {
        // Try to fix the inconsistency by adjusting confidence
        due.confidence *= 0.7; // Reduce confidence in due amount
        logger.debug('Arithmetic inconsistency detected', {
          total: total.value,
          paid: paid.value,
          due: due.value,
          calculatedDue
        });
      }
    }

    return amounts;
  }

  private calculateAIConfidence(classified: AmountDetail[], original: NormalizedAmount[]): number {
    if (classified.length === 0) return 0;

    const avgConfidence = classified.reduce((sum, amt) => sum + amt.confidence, 0) / classified.length;
    const coverageRatio = classified.length / original.length;

    return avgConfidence * coverageRatio;
  }

  private calculateRuleBasedConfidence(amounts: AmountDetail[]): number {
    if (amounts.length === 0) return 0;

    return amounts.reduce((sum, amt) => sum + amt.confidence, 0) / amounts.length;
  }

  private validateAmountType(type: string): AmountType {
    const validTypes = Object.values(AmountType);
    return validTypes.includes(type as AmountType) ? type as AmountType : AmountType.OTHER;
  }

  private generateRequestId(): string {
    return `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}