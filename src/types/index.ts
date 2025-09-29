// Core types for the medical amount detection system

export interface RawToken {
  value: string;
  confidence: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  context: string; // Surrounding text for context
}

export interface NormalizedAmount {
  original: string;
  normalized: number;
  confidence: number;
  correctionsApplied: string[];
  context?: string; // Added context for better classification
}

export interface AmountDetail {
  type: AmountType;
  value: number;
  source: string; // Original text snippet
  confidence: number;
}

export interface ProcessingDetails {
  ocrConfidence: number | null;
  normalizationConfidence: number;
  classificationConfidence: number;
  processingTimeMs: number;
  tokensExtracted: number;
  correctionsApplied: string[];
}

export interface DocumentResponse {
  currency: string;
  amounts: AmountDetail[];
  status: ProcessingStatus;
  processingDetails: ProcessingDetails;
  requestId: string;
  guardrailsResult: GuardrailResult;
  warnings?: GuardrailViolation[];
}

export interface ProcessingOptions {
  confidenceThreshold: number;
  enableAiClassification: boolean;
  language: string;
  normalizeAmounts: boolean;
  maxFileSize?: number; // in MB
}

// Enums
export enum AmountType {
  TOTAL_BILL = 'total_bill',
  PAID = 'paid',
  DUE = 'due',
  DISCOUNT = 'discount',
  TAX = 'tax',
  COPAY = 'copay',
  DEDUCTIBLE = 'deductible',
  INSURANCE_COVERAGE = 'insurance_coverage',
  OTHER = 'other'
}

export enum ProcessingStatus {
  SUCCESS = 'ok',
  PARTIAL = 'partial',
  ERROR = 'error',
  NO_AMOUNTS_FOUND = 'no_amounts_found'
}

export enum Currency {
  USD = 'USD',
  INR = 'INR',
  EUR = 'EUR',
  GBP = 'GBP',
  CAD = 'CAD'
}

// OCR specific types
export interface OCRResult {
  text: string;
  confidence: number;
  tokens: RawToken[];
  processingTimeMs: number;
}

export interface ImagePreprocessingResult {
  processedImageBuffer: Buffer;
  operations: string[];
  improvementScore: number;
}

// AI Classification types
export interface ClassificationResult {
  amounts: AmountDetail[];
  confidence: number;
  reasoning?: string;
  fallbackUsed: boolean;
}

// Error types
export interface ProcessingError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Request/Response types for Express
export interface TextProcessRequest {
  text: string;
  options?: Partial<ProcessingOptions>;
}

export interface ImageProcessRequest {
  options?: Partial<ProcessingOptions>;
  // File will be handled by multer middleware
}

export interface BatchProcessRequest {
  documents: Array<{ text?: string; fileData?: Buffer }>;
  options?: Partial<ProcessingOptions>;
}

// Service interfaces for dependency injection
export interface IOCRService {
  extractText(imageBuffer: Buffer, options: ProcessingOptions): Promise<OCRResult>;
}

export interface INormalizationService {
  normalizeAmounts(tokens: RawToken[]): Promise<NormalizedAmount[]>;
}

export interface IClassificationService {
  classifyAmounts(
    text: string, 
    amounts: NormalizedAmount[], 
    options: ProcessingOptions
  ): Promise<ClassificationResult>;
}

export interface IImageProcessingService {
  preprocessImage(imageBuffer: Buffer): Promise<ImagePreprocessingResult>;
}

export interface IValidationService {
  validateOutput(response: DocumentResponse): Promise<ProcessingError[]>;
}

// Guardrails service interfaces
export interface IGuardrailsService {
  validateInput(input: any, fileBuffer?: Buffer): Promise<GuardrailResult>;
  validateProcessing(processingData: any): Promise<GuardrailResult>;
  validateOutput(output: DocumentResponse): Promise<GuardrailResult>;
  validateAISafety(prompt: string, response: string): Promise<GuardrailResult>;
}

export interface IInputValidator {
  validateFile(fileBuffer: Buffer, filename: string): Promise<GuardrailResult>;
  validateText(text: string): Promise<GuardrailResult>;
  validateRequestOptions(options: ProcessingOptions): Promise<GuardrailResult>;
}

export interface IOutputValidator {
  validateAmounts(amounts: AmountDetail[]): Promise<GuardrailResult>;
  validateCurrency(currency: string): Promise<GuardrailResult>;
  validateConsistency(response: DocumentResponse): Promise<GuardrailResult>;
}

export interface IAISafetyValidator {
  detectPromptInjection(input: string): Promise<GuardrailResult>;
  validateAIResponse(response: string): Promise<GuardrailResult>;
  detectHallucination(input: string, output: string): Promise<GuardrailResult>;
}

// Guardrails types
export interface GuardrailResult {
  passed: boolean;
  riskLevel: RiskLevel;
  violations: GuardrailViolation[];
  confidence: number;
  recommendedAction: GuardrailAction;
}

export interface GuardrailViolation {
  rule: string;
  severity: ViolationSeverity;
  message: string;
  context: Record<string, any>;
  suggestedFix?: string;
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ViolationSeverity {
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum GuardrailAction {
  PROCEED = 'proceed',
  PROCEED_WITH_CAUTION = 'proceed_with_caution',
  REJECT = 'reject',
  MANUAL_REVIEW = 'manual_review'
}

// Input Guardrails
export interface InputGuardrails {
  fileSizeLimitMB: number;
  allowedFileTypes: string[];
  maxTextLength: number;
  suspiciousContentPatterns: string[];
  rateLimitPerMinute: number;
  maxConcurrentRequests: number;
}

// Processing Guardrails
export interface ProcessingGuardrails {
  minOCRConfidence: number;
  maxProcessingTimeMs: number;
  reasonableAmountRange: { min: number; max: number };
  suspiciousAmountPatterns: string[];
  contextValidationRules: string[];
}

// Output Guardrails
export interface OutputGuardrails {
  minClassificationConfidence: number;
  maxAmountsPerDocument: number;
  totalAmountConsistencyCheck: boolean;
  crossValidationRequired: boolean;
  humanReviewThresholds: {
    highRiskAmount: number;
    lowConfidenceThreshold: number;
  };
}

// AI Safety Guardrails
export interface AIGuardrails {
  promptInjectionDetection: boolean;
  outputSanitization: boolean;
  hallucinationDetection: boolean;
  maxTokensPerRequest: number;
  contentPolicyViolations: string[];
  biasDetectionRules: string[];
}

// Configuration types
export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface AIConfig {
  geminiApiKey: string;
  geminiModel: string;
  maxRetries: number;
  timeoutMs: number;
  guardrails: AIGuardrails;
}

export interface OCRConfig {
  tesseractOptions: Record<string, any>;
  confidenceThreshold: number;
  supportedLanguages: string[];
  guardrails: ProcessingGuardrails;
}

export interface ProcessingConfig {
  maxFileSizeMB: number;
  supportedImageFormats: string[];
  defaultOptions: ProcessingOptions;
  timeoutMs: number;
  inputGuardrails: InputGuardrails;
  processingGuardrails: ProcessingGuardrails;
  outputGuardrails: OutputGuardrails;
}