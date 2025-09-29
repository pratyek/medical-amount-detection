import { z } from 'zod';
import { 
  AmountType, 
  Currency, 
  ProcessingStatus,
  RiskLevel,
  ViolationSeverity,
  GuardrailAction 
} from '@/types';

// Processing Options Schema
export const ProcessingOptionsSchema = z.object({
  confidenceThreshold: z.number()
    .min(0.1, 'Confidence threshold too low - security risk')
    .max(1.0, 'Invalid confidence threshold')
    .default(0.7),
  enableAiClassification: z.boolean().default(true),
  language: z.string()
    .min(2, 'Invalid language code')
    .max(5, 'Invalid language code')
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Invalid language format')
    .default('eng'),
  normalizeAmounts: z.boolean().default(true),
  maxFileSize: z.number()
    .positive('File size must be positive')
    .max(50, 'File size exceeds maximum allowed (50MB)')
    .optional()
    .default(50)
});

// Request Schemas
export const TextProcessRequestSchema = z.object({
  text: z.string()
    .min(1, 'Text cannot be empty')
    .max(50000, 'Text exceeds maximum length (50,000 characters)')
    .refine(
      (text: string) => !containsSuspiciousPatterns(text), 
      'Text contains suspicious patterns that may indicate injection attempts'
    ),
  options: ProcessingOptionsSchema.optional().default({})
}).refine(
  (data) => data.text.trim().length > 0, 
  'Text cannot be only whitespace'
);

export const ImageProcessRequestSchema = z.object({
  options: ProcessingOptionsSchema.optional().default({})
});

// Response Schemas
export const AmountDetailSchema = z.object({
  type: z.nativeEnum(AmountType),
  value: z.number()
    .positive('Amount must be positive')
    .max(10000000, 'Amount exceeds reasonable maximum ($10M)')
    .min(0.01, 'Amount too small (minimum $0.01)'),
  source: z.string().min(1, 'Source cannot be empty'),
  confidence: z.number()
    .min(0, 'Confidence must be between 0 and 1')
    .max(1, 'Confidence must be between 0 and 1')
});

export const ProcessingDetailsSchema = z.object({
  ocrConfidence: z.number().min(0).max(1).nullable(),
  normalizationConfidence: z.number()
    .min(0, 'Invalid normalization confidence')
    .max(1),
  classificationConfidence: z.number()
    .min(0, 'Invalid classification confidence')  
    .max(1),
  processingTimeMs: z.number()
    .positive()
    .max(60000, 'Processing time exceeds maximum allowed (60s)'),
  tokensExtracted: z.number().min(0).max(1000, 'Too many tokens extracted'),
  correctionsApplied: z.array(z.string()).max(50, 'Too many corrections applied')
});

export const GuardrailViolationSchema = z.object({
  rule: z.string().min(1, 'Rule name cannot be empty'),
  severity: z.nativeEnum(ViolationSeverity),
  message: z.string().min(1, 'Violation message cannot be empty'),
  context: z.record(z.any()),
  suggestedFix: z.string().optional()
});

export const GuardrailResultSchema = z.object({
  passed: z.boolean(),
  riskLevel: z.nativeEnum(RiskLevel),
  violations: z.array(GuardrailViolationSchema),
  confidence: z.number().min(0).max(1),
  recommendedAction: z.nativeEnum(GuardrailAction)
});

export const DocumentResponseSchema = z.object({
  currency: z.nativeEnum(Currency),
  amounts: z.array(AmountDetailSchema)
    .min(0)
    .max(100, 'Too many amounts detected - possible processing error'),
  status: z.nativeEnum(ProcessingStatus),
  processingDetails: ProcessingDetailsSchema,
  requestId: z.string().uuid('Invalid request ID format'),
  guardrailsResult: GuardrailResultSchema,
  warnings: z.array(GuardrailViolationSchema).optional()
});

// File validation schema
export const FileValidationSchema = z.object({
  filename: z.string()
    .min(1, 'Filename cannot be empty')
    .max(255, 'Filename too long')
    .refine(
      (filename: string) => /\.(jpg|jpeg|png|bmp|tiff|webp|pdf)$/i.test(filename),
      'Unsupported file format'
    )
    .refine(
      (filename: string) => !filename.includes('..'),
      'Filename contains invalid characters'
    ),
  mimetype: z.string()
    .refine(
      (mimetype: string) => [
        'image/jpeg',
        'image/png', 
        'image/bmp',
        'image/tiff',
        'image/webp',
        'application/pdf'
      ].includes(mimetype),
      'Unsupported MIME type'
    ),
  size: z.number()
    .positive('File size must be positive')
    .max(50 * 1024 * 1024, 'File size exceeds 50MB limit')
});

// Custom validation functions
function containsSuspiciousPatterns(text: string): boolean {
  const suspiciousPatterns = [
    // Prompt injection patterns
    /ignore\s+previous\s+instructions/gi,
    /system\s*:\s*you\s+are/gi,
    /\[\s*system\s*\]/gi,
    /<\s*prompt\s*>/gi,
    /jailbreak/gi,
    /pretend\s+you\s+are/gi,
    /override\s+your\s+programming/gi,
    
    // Code injection patterns
    /<script/gi,
    /javascript:/gi,
    /eval\s*\(/gi,
    /function\s*\(/gi,
    
    // SQL injection patterns (defensive)
    /union\s+select/gi,
    /drop\s+table/gi,
    /insert\s+into/gi,
    
    // Suspicious medical document patterns
    /\$\d{7,}/g, // Extremely high amounts (7+ digits)
    /free\s+money/gi,
    /click\s+here/gi,
    /congratulations/gi,
    /you\s+have\s+won/gi,
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(text));
}

// Export types inferred from schemas
export type ProcessingOptions = z.infer<typeof ProcessingOptionsSchema>;
export type TextProcessRequest = z.infer<typeof TextProcessRequestSchema>;
export type ImageProcessRequest = z.infer<typeof ImageProcessRequestSchema>;
export type AmountDetail = z.infer<typeof AmountDetailSchema>;
export type ProcessingDetails = z.infer<typeof ProcessingDetailsSchema>;
export type GuardrailViolation = z.infer<typeof GuardrailViolationSchema>;
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;