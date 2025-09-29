import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '@/config';
import logger from '@/utils/logger';
import documentsController from '@/controllers/documents.controller';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGINS,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });
  });

  next();
});

// Health check endpoint (basic)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/v1/process', documentsController);

// Root endpoint with API documentation
app.get('/', (_req, res) => {
  res.json({
    name: 'Medical Amount Detection API',
    version: '1.0.0',
    description: 'AI-powered service for extracting and classifying financial amounts from medical documents',
    endpoints: {
      health: 'GET /health',
      processText: 'POST /api/v1/process/text',
      processImage: 'POST /api/v1/process/image',
      processUniversal: 'POST /api/v1/process',
      statistics: 'GET /api/v1/process/stats'
    },
    documentation: {
      swagger: '/docs',
      examples: {
        textProcessing: {
          method: 'POST',
          url: '/api/v1/process/text',
          body: {
            text: 'Total: INR 1200 | Paid: 1000 | Due: 200',
            options: {
              confidenceThreshold: 0.7,
              enableAiClassification: true,
              language: 'eng'
            }
          }
        },
        imageProcessing: {
          method: 'POST',
          url: '/api/v1/process/image',
          contentType: 'multipart/form-data',
          fields: {
            file: '<image_file>',
            options: '{"confidenceThreshold": 0.8}'
          }
        }
      }
    },
    features: [
      'Multi-modal input (text and images)',
      'Advanced OCR with Tesseract',
      'AI-powered classification with Google Gemini',
      'Comprehensive guardrails system',
      'Error correction and normalization',
      'Medical document context awareness',
      'Provenance tracking',
      'Production-ready security'
    ],
    guardrails: {
      inputValidation: 'File type, size, and content validation',
      outputValidation: 'Business logic and consistency checks',
      aiSafety: 'Prompt injection and hallucination detection',
      processingLimits: 'Timeout and resource usage controls'
    }
  });
});

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: 'The requested endpoint does not exist',
      availableEndpoints: [
        'GET /',
        'GET /health',
        'POST /api/v1/process/text',
        'POST /api/v1/process/image',
        'POST /api/v1/process',
        'GET /api/v1/process/health',
        'GET /api/v1/process/stats'
      ]
    }
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  // Don't expose internal error details in production
  const isDevelopment = config.NODE_ENV === 'development';

  res.status(error.status || 500).json({
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An internal server error occurred',
      ...(isDevelopment && {
        stack: error.stack,
        details: error
      })
    }
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise
  });
});

// Uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

export default app;