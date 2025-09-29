import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number).pipe(z.number().positive()),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000').transform(str => str.split(',')),

  // Google AI
  GOOGLE_AI_API_KEY: z.string().min(1, 'Google AI API key is required'),
  GOOGLE_AI_MODEL: z.string().default('gemini-1.5-flash-latest'),
  AI_MAX_RETRIES: z.string().default('3').transform(Number).pipe(z.number().positive()),
  AI_TIMEOUT_MS: z.string().default('10000').transform(Number).pipe(z.number().positive()),

  // OCR
  TESSERACT_PATH: z.string().optional(),
  OCR_CONFIDENCE_THRESHOLD: z.string().default('0.7').transform(Number).pipe(z.number().min(0).max(1)),
  SUPPORTED_LANGUAGES: z.string().default('eng').transform(str => str.split(',')),
  OCR_TIMEOUT_MS: z.string().default('15000').transform(Number).pipe(z.number().positive()),

  // Processing
  MAX_FILE_SIZE_MB: z.string().default('50').transform(Number).pipe(z.number().positive()),
  SUPPORTED_IMAGE_FORMATS: z.string().default('jpg,jpeg,png,bmp,tiff,webp,pdf').transform(str => str.split(',')),
  PROCESSING_TIMEOUT_MS: z.string().default('30000').transform(Number).pipe(z.number().positive()),
  MAX_CONCURRENT_REQUESTS: z.string().default('10').transform(Number).pipe(z.number().positive()),

  // Security & Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number).pipe(z.number().positive()),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number).pipe(z.number().positive()),
  MAX_TEXT_LENGTH: z.string().default('50000').transform(Number).pipe(z.number().positive()),
  ENABLE_FILE_VALIDATION: z.string().default('true').transform(val => val === 'true'),
  ENABLE_SUSPICIOUS_PATTERN_DETECTION: z.string().default('true').transform(val => val === 'true'),

  // Guardrails
  INPUT_VALIDATION_ENABLED: z.string().default('true').transform(val => val === 'true'),
  OUTPUT_VALIDATION_ENABLED: z.string().default('true').transform(val => val === 'true'),
  AI_SAFETY_VALIDATION_ENABLED: z.string().default('true').transform(val => val === 'true'),
  BUSINESS_LOGIC_VALIDATION_ENABLED: z.string().default('true').transform(val => val === 'true'),

  // Confidence Thresholds
  MIN_OCR_CONFIDENCE: z.string().default('0.5').transform(Number).pipe(z.number().min(0).max(1)),
  MIN_NORMALIZATION_CONFIDENCE: z.string().default('0.8').transform(Number).pipe(z.number().min(0).max(1)),
  MIN_CLASSIFICATION_CONFIDENCE: z.string().default('0.75').transform(Number).pipe(z.number().min(0).max(1)),
  HIGH_RISK_AMOUNT_THRESHOLD: z.string().default('100000').transform(Number).pipe(z.number().positive()),

  // Error Handling
  ENABLE_FALLBACK_CLASSIFICATION: z.string().default('true').transform(val => val === 'true'),
  ENABLE_PARTIAL_RESULTS: z.string().default('true').transform(val => val === 'true'),
  AUTO_RETRY_ON_LOW_CONFIDENCE: z.string().default('true').transform(val => val === 'true'),
  MAX_PROCESSING_RETRIES: z.string().default('2').transform(Number).pipe(z.number().positive()),

  // Monitoring & Logging
  ENABLE_STRUCTURED_LOGGING: z.string().default('true').transform(val => val === 'true'),
  ENABLE_PERFORMANCE_METRICS: z.string().default('true').transform(val => val === 'true'),
  LOG_SENSITIVE_DATA: z.string().default('false').transform(val => val === 'true'),
  AUDIT_LOG_ENABLED: z.string().default('true').transform(val => val === 'true'),
});

const parseConfig = () => {
  try {
    return configSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment configuration:');
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
};

export const config = parseConfig();

export type Config = typeof config;