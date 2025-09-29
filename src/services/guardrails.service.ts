import {
  GuardrailResult,
  GuardrailViolation,
  RiskLevel,
  ViolationSeverity,
  GuardrailAction,
  DocumentResponse,
  ProcessingOptions,
  AmountDetail,
  AmountType,
  IGuardrailsService,
  IInputValidator,
  IOutputValidator,
  IAISafetyValidator
} from '@/types';

/**
 * Comprehensive Guardrails Service
 * 
 * This is a critical component for interview discussions - demonstrates:
 * 1. Input validation and security
 * 2. Processing safety checks
 * 3. Output quality assurance
 * 4. AI safety measures
 * 5. Business logic validation
 */
export class GuardrailsService implements IGuardrailsService {
  private inputValidator: IInputValidator;
  private outputValidator: IOutputValidator;
  private aiSafetyValidator: IAISafetyValidator;

  constructor(
    inputValidator: IInputValidator,
    outputValidator: IOutputValidator,
    aiSafetyValidator: IAISafetyValidator
  ) {
    this.inputValidator = inputValidator;
    this.outputValidator = outputValidator;
    this.aiSafetyValidator = aiSafetyValidator;
  }

  /**
   * Helper function to determine the higher risk level between two risk levels
   */
  private getHigherRiskLevel(level1: RiskLevel, level2: RiskLevel): RiskLevel {
    const riskOrder = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 1,
      [RiskLevel.HIGH]: 2,
      [RiskLevel.CRITICAL]: 3
    };
    
    return riskOrder[level1] >= riskOrder[level2] ? level1 : level2;
  }

  async validateInput(input: any, fileBuffer?: Buffer): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // File validation
    if (fileBuffer) {
      const fileResult = await this.inputValidator.validateFile(fileBuffer, input.filename || 'unknown');
      violations.push(...fileResult.violations);
      riskLevel = this.getHigherRiskLevel(riskLevel, fileResult.riskLevel);
    }

    // Text validation
    if (input.text) {
      const textResult = await this.inputValidator.validateText(input.text);
      violations.push(...textResult.violations);
      riskLevel = this.getHigherRiskLevel(riskLevel, textResult.riskLevel);
    }

    // Options validation
    if (input.options) {
      const optionsResult = await this.inputValidator.validateRequestOptions(input.options);
      violations.push(...optionsResult.violations);
      riskLevel = this.getHigherRiskLevel(riskLevel, optionsResult.riskLevel);
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: this.calculateConfidence(violations),
      recommendedAction: this.determineAction(riskLevel, violations)
    };
  }

  async validateProcessing(processingData: any): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Processing time validation
    if (processingData.processingTimeMs > 30000) {
      violations.push({
        rule: 'processing_timeout',
        severity: ViolationSeverity.ERROR,
        message: 'Processing time exceeded maximum allowed duration',
        context: { processingTimeMs: processingData.processingTimeMs }
      });
      riskLevel = RiskLevel.HIGH;
    }

    // OCR confidence validation
    if (processingData.ocrConfidence !== null && processingData.ocrConfidence < 0.5) {
      violations.push({
        rule: 'low_ocr_confidence',
        severity: ViolationSeverity.WARNING,
        message: 'OCR confidence below recommended threshold',
        context: { ocrConfidence: processingData.ocrConfidence },
        suggestedFix: 'Consider image preprocessing or manual review'
      });
      riskLevel = this.getHigherRiskLevel(riskLevel, RiskLevel.MEDIUM);
    }

    // Memory usage validation (if available)
    if (processingData.memoryUsageMB && processingData.memoryUsageMB > 1000) {
      violations.push({
        rule: 'high_memory_usage',
        severity: ViolationSeverity.WARNING,
        message: 'High memory usage detected during processing',
        context: { memoryUsageMB: processingData.memoryUsageMB }
      });
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: this.calculateConfidence(violations),
      recommendedAction: this.determineAction(riskLevel, violations)
    };
  }

  async validateOutput(output: DocumentResponse): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Amount validation
    const amountResult = await this.outputValidator.validateAmounts(output.amounts);
    violations.push(...amountResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, amountResult.riskLevel);

    // Currency validation
    const currencyResult = await this.outputValidator.validateCurrency(output.currency);
    violations.push(...currencyResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, currencyResult.riskLevel);

    // Consistency validation
    const consistencyResult = await this.outputValidator.validateConsistency(output);
    violations.push(...consistencyResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, consistencyResult.riskLevel);

    // Business logic validation
    const businessLogicViolations = this.validateBusinessLogic(output);
    violations.push(...businessLogicViolations);
    
    if (businessLogicViolations.length > 0) {
      riskLevel = this.getHigherRiskLevel(riskLevel, RiskLevel.MEDIUM);
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: this.calculateConfidence(violations),
      recommendedAction: this.determineAction(riskLevel, violations)
    };
  }

  async validateAISafety(prompt: string, response: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Prompt injection detection
    const promptResult = await this.aiSafetyValidator.detectPromptInjection(prompt);
    violations.push(...promptResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, promptResult.riskLevel);

    // Response validation
    const responseResult = await this.aiSafetyValidator.validateAIResponse(response);
    violations.push(...responseResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, responseResult.riskLevel);

    // Hallucination detection
    const hallucinationResult = await this.aiSafetyValidator.detectHallucination(prompt, response);
    violations.push(...hallucinationResult.violations);
    riskLevel = this.getHigherRiskLevel(riskLevel, hallucinationResult.riskLevel);

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: this.calculateConfidence(violations),
      recommendedAction: this.determineAction(riskLevel, violations)
    };
  }

  private validateBusinessLogic(output: DocumentResponse): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    // Check for reasonable amount ranges for medical documents
    const unreasonableAmounts = output.amounts.filter(amount => 
      amount.value > 1000000 || amount.value < 0.01
    );

    if (unreasonableAmounts.length > 0) {
      violations.push({
        rule: 'unreasonable_amounts',
        severity: ViolationSeverity.WARNING,
        message: 'Detected amounts outside reasonable range for medical documents',
        context: { unreasonableAmounts: unreasonableAmounts.map(a => ({ type: a.type, value: a.value })) },
        suggestedFix: 'Review OCR accuracy and normalization logic'
      });
    }

    // Check for duplicate amount types (except OTHER)
    const typeCounts: Record<string, number> = {};
    output.amounts.forEach(amount => {
      if (amount.type !== AmountType.OTHER) {
        typeCounts[amount.type] = (typeCounts[amount.type] || 0) + 1;
      }
    });

    const duplicateTypes = Object.entries(typeCounts).filter(([_, count]) => count > 1);
    if (duplicateTypes.length > 0) {
      violations.push({
        rule: 'duplicate_amount_types',
        severity: ViolationSeverity.ERROR,
        message: 'Multiple amounts detected for the same category',
        context: { duplicateTypes },
        suggestedFix: 'Review classification logic or merge duplicate entries'
      });
    }

    // Mathematical consistency checks
    const total = output.amounts.find(a => a.type === AmountType.TOTAL_BILL)?.value;
    const paid = output.amounts.find(a => a.type === AmountType.PAID)?.value;
    const due = output.amounts.find(a => a.type === AmountType.DUE)?.value;

    if (total && paid && due) {
      const calculatedDue = total - paid;
      const tolerance = 0.02; // 2 cents tolerance

      if (Math.abs(calculatedDue - due) > tolerance) {
        violations.push({
          rule: 'amount_arithmetic_mismatch',
          severity: ViolationSeverity.WARNING,
          message: 'Total, paid, and due amounts do not add up correctly',
          context: { 
            total, 
            paid, 
            due, 
            calculatedDue, 
            difference: Math.abs(calculatedDue - due) 
          },
          suggestedFix: 'Verify amount extraction accuracy'
        });
      }
    }

    // Low confidence warnings
    const lowConfidenceAmounts = output.amounts.filter(amount => amount.confidence < 0.7);
    if (lowConfidenceAmounts.length > 0) {
      violations.push({
        rule: 'low_confidence_amounts',
        severity: ViolationSeverity.WARNING,
        message: 'Some amounts have low confidence scores',
        context: { 
          lowConfidenceCount: lowConfidenceAmounts.length,
          amounts: lowConfidenceAmounts.map(a => ({ type: a.type, confidence: a.confidence }))
        },
        suggestedFix: 'Consider manual review for low confidence amounts'
      });
    }

    return violations;
  }

  private calculateConfidence(violations: GuardrailViolation[]): number {
    let confidence = 1.0;
    
    violations.forEach(violation => {
      switch (violation.severity) {
        case ViolationSeverity.CRITICAL:
          confidence -= 0.5;
          break;
        case ViolationSeverity.ERROR:
          confidence -= 0.3;
          break;
        case ViolationSeverity.WARNING:
          confidence -= 0.1;
          break;
      }
    });

    return Math.max(0, confidence);
  }

  private determineAction(riskLevel: RiskLevel, violations: GuardrailViolation[]): GuardrailAction {
    const hasCritical = violations.some(v => v.severity === ViolationSeverity.CRITICAL);
    const hasErrors = violations.some(v => v.severity === ViolationSeverity.ERROR);

    if (hasCritical) {
      return GuardrailAction.REJECT;
    }

    if (hasErrors && riskLevel === RiskLevel.HIGH) {
      return GuardrailAction.MANUAL_REVIEW;
    }

    if (riskLevel === RiskLevel.HIGH || (hasErrors && riskLevel === RiskLevel.MEDIUM)) {
      return GuardrailAction.PROCEED_WITH_CAUTION;
    }

    return GuardrailAction.PROCEED;
  }
}

/**
 * Input Validator Implementation
 */
export class InputValidator implements IInputValidator {
  async validateFile(fileBuffer: Buffer, filename: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // File size validation
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (fileBuffer.length > maxSize) {
      violations.push({
        rule: 'file_size_exceeded',
        severity: ViolationSeverity.ERROR,
        message: `File size ${Math.round(fileBuffer.length / 1024 / 1024)}MB exceeds maximum allowed ${maxSize / 1024 / 1024}MB`,
        context: { fileSizeBytes: fileBuffer.length, maxSizeBytes: maxSize }
      });
      riskLevel = RiskLevel.HIGH;
    }

    // File type validation
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.pdf'];
    const hasValidExtension = supportedExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      violations.push({
        rule: 'unsupported_file_type',
        severity: ViolationSeverity.ERROR,
        message: 'Unsupported file format',
        context: { filename, supportedExtensions }
      });
      riskLevel = RiskLevel.HIGH;
    }

    // Magic number validation (basic file signature check)
    const magicNumbers = this.detectFileType(fileBuffer);
    if (magicNumbers && !this.isValidFileType(magicNumbers)) {
      violations.push({
        rule: 'invalid_file_signature',
        severity: ViolationSeverity.CRITICAL,
        message: 'File signature does not match extension',
        context: { detectedType: magicNumbers }
      });
      riskLevel = RiskLevel.CRITICAL;
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.8,
      recommendedAction: riskLevel === RiskLevel.CRITICAL ? GuardrailAction.REJECT : GuardrailAction.PROCEED
    };
  }

  async validateText(text: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Length validation
    if (text.length > 50000) {
      violations.push({
        rule: 'text_too_long',
        severity: ViolationSeverity.ERROR,
        message: 'Text exceeds maximum allowed length',
        context: { textLength: text.length, maxLength: 50000 }
      });
      riskLevel = RiskLevel.HIGH;
    }

    // Suspicious pattern detection
    const suspiciousPatterns = this.detectSuspiciousPatterns(text);
    if (suspiciousPatterns.length > 0) {
      violations.push({
        rule: 'suspicious_patterns_detected',
        severity: ViolationSeverity.CRITICAL,
        message: 'Text contains patterns that may indicate injection attempts',
        context: { patterns: suspiciousPatterns },
        suggestedFix: 'Review input for potential security threats'
      });
      riskLevel = RiskLevel.CRITICAL;
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.5,
      recommendedAction: riskLevel === RiskLevel.CRITICAL ? GuardrailAction.REJECT : GuardrailAction.PROCEED
    };
  }

  async validateRequestOptions(options: ProcessingOptions): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Confidence threshold validation
    if (options.confidenceThreshold < 0.3) {
      violations.push({
        rule: 'confidence_threshold_too_low',
        severity: ViolationSeverity.WARNING,
        message: 'Very low confidence threshold may result in unreliable results',
        context: { confidenceThreshold: options.confidenceThreshold },
        suggestedFix: 'Consider increasing confidence threshold to at least 0.5'
      });
      riskLevel = RiskLevel.MEDIUM;
    }

    return {
      passed: true,
      riskLevel,
      violations,
      confidence: 1.0,
      recommendedAction: GuardrailAction.PROCEED
    };
  }

  private detectFileType(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    const header = buffer.slice(0, 4);
    
    // JPEG
    if (header[0] === 0xFF && header[1] === 0xD8) return 'jpeg';
    
    // PNG
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return 'png';
    
    // PDF
    if (header.toString('ascii', 0, 4) === '%PDF') return 'pdf';
    
    return null;
  }

  private isValidFileType(detectedType: string): boolean {
    return ['jpeg', 'png', 'pdf'].includes(detectedType);
  }

  private detectSuspiciousPatterns(text: string): string[] {
    const patterns: Array<{ name: string; regex: RegExp }> = [
      { name: 'prompt_injection', regex: /ignore\s+previous\s+instructions/gi },
      { name: 'system_prompt', regex: /system\s*:\s*you\s+are/gi },
      { name: 'script_tag', regex: /<script/gi },
      { name: 'javascript_protocol', regex: /javascript:/gi },
      { name: 'eval_function', regex: /eval\s*\(/gi }
    ];

    return patterns
      .filter(pattern => pattern.regex.test(text))
      .map(pattern => pattern.name);
  }
}

/**
 * Output Validator Implementation
 */
export class OutputValidator implements IOutputValidator {
  /**
   * Helper function to determine the higher risk level between two risk levels
   */
  private getHigherRiskLevel(level1: RiskLevel, level2: RiskLevel): RiskLevel {
    const riskOrder = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 1,
      [RiskLevel.HIGH]: 2,
      [RiskLevel.CRITICAL]: 3
    };
    
    return riskOrder[level1] >= riskOrder[level2] ? level1 : level2;
  }

  async validateAmounts(amounts: AmountDetail[]): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Check for too many amounts
    if (amounts.length > 50) {
      violations.push({
        rule: 'too_many_amounts',
        severity: ViolationSeverity.ERROR,
        message: 'Detected unusually high number of amounts',
        context: { amountCount: amounts.length, maxExpected: 50 }
      });
      riskLevel = RiskLevel.HIGH;
    }

    // Validate individual amounts
    amounts.forEach((amount, index) => {
      if (amount.value > 1000000) {
        violations.push({
          rule: 'unreasonably_high_amount',
          severity: ViolationSeverity.WARNING,
          message: `Amount #${index + 1} seems unreasonably high for a medical document`,
          context: { amount: amount.value, type: amount.type }
        });
        riskLevel = this.getHigherRiskLevel(riskLevel, RiskLevel.MEDIUM);
      }
    });

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.8,
      recommendedAction: GuardrailAction.PROCEED
    };
  }

  async validateCurrency(currency: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    const supportedCurrencies = ['USD', 'INR', 'EUR', 'GBP', 'CAD'];

    if (!supportedCurrencies.includes(currency)) {
      violations.push({
        rule: 'unsupported_currency',
        severity: ViolationSeverity.WARNING,
        message: 'Detected currency is not in the list of commonly supported currencies',
        context: { currency, supportedCurrencies }
      });
    }

    return {
      passed: true,
      riskLevel: RiskLevel.LOW,
      violations,
      confidence: 1.0,
      recommendedAction: GuardrailAction.PROCEED
    };
  }

  async validateConsistency(response: DocumentResponse): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    let riskLevel = RiskLevel.LOW;

    // Status consistency check
    if (response.status === 'ok' && response.amounts.length === 0) {
      violations.push({
        rule: 'status_amount_inconsistency',
        severity: ViolationSeverity.ERROR,
        message: 'Status indicates success but no amounts were found',
        context: { status: response.status, amountCount: response.amounts.length }
      });
      riskLevel = RiskLevel.HIGH;
    }

    return {
      passed: violations.filter(v => v.severity === ViolationSeverity.CRITICAL || v.severity === ViolationSeverity.ERROR).length === 0,
      riskLevel,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.7,
      recommendedAction: GuardrailAction.PROCEED
    };
  }
}

/**
 * AI Safety Validator Implementation
 */
export class AISafetyValidator implements IAISafetyValidator {
  async detectPromptInjection(input: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];
    const injectionPatterns = [
      'ignore previous instructions',
      'system: you are',
      'pretend you are',
      'jailbreak',
      'override your programming'
    ];

    const detectedPatterns = injectionPatterns.filter(pattern => 
      input.toLowerCase().includes(pattern.toLowerCase())
    );

    if (detectedPatterns.length > 0) {
      violations.push({
        rule: 'prompt_injection_detected',
        severity: ViolationSeverity.CRITICAL,
        message: 'Potential prompt injection attempt detected',
        context: { detectedPatterns }
      });
    }

    return {
      passed: violations.length === 0,
      riskLevel: violations.length > 0 ? RiskLevel.CRITICAL : RiskLevel.LOW,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.3,
      recommendedAction: violations.length > 0 ? GuardrailAction.REJECT : GuardrailAction.PROCEED
    };
  }

  async validateAIResponse(response: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];

    // Check for non-medical content
    const suspiciousKeywords = ['free money', 'click here', 'congratulations', 'winner'];
    const foundSuspicious = suspiciousKeywords.filter(keyword => 
      response.toLowerCase().includes(keyword.toLowerCase())
    );

    if (foundSuspicious.length > 0) {
      violations.push({
        rule: 'suspicious_ai_response',
        severity: ViolationSeverity.WARNING,
        message: 'AI response contains suspicious keywords not typical for medical documents',
        context: { suspiciousKeywords: foundSuspicious }
      });
    }

    return {
      passed: true,
      riskLevel: violations.length > 0 ? RiskLevel.MEDIUM : RiskLevel.LOW,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.8,
      recommendedAction: GuardrailAction.PROCEED
    };
  }

  async detectHallucination(input: string, output: string): Promise<GuardrailResult> {
    const violations: GuardrailViolation[] = [];

    // Simple hallucination detection: check if output contains information not in input
    const inputNumbers = this.extractNumbers(input);
    const outputNumbers = this.extractNumbers(output);
    
    const hallucinatedNumbers = outputNumbers.filter(num => !inputNumbers.includes(num));
    
    if (hallucinatedNumbers.length > 0 && hallucinatedNumbers.length > outputNumbers.length * 0.3) {
      violations.push({
        rule: 'potential_hallucination',
        severity: ViolationSeverity.WARNING,
        message: 'AI may have hallucinated numbers not present in the input',
        context: { 
          hallucinatedNumbers: hallucinatedNumbers.slice(0, 5), // Show first 5
          percentage: Math.round((hallucinatedNumbers.length / outputNumbers.length) * 100)
        },
        suggestedFix: 'Verify extracted numbers against source document'
      });
    }

    return {
      passed: true,
      riskLevel: violations.length > 0 ? RiskLevel.MEDIUM : RiskLevel.LOW,
      violations,
      confidence: violations.length === 0 ? 1.0 : 0.7,
      recommendedAction: GuardrailAction.PROCEED
    };
  }

  private extractNumbers(text: string): number[] {
    const numberRegex = /\d+\.?\d*/g;
    const matches = text.match(numberRegex) || [];
    return matches.map(match => parseFloat(match)).filter(num => !isNaN(num));
  }
}