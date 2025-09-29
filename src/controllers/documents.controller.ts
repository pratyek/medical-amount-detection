import express from 'express';
import multer from 'multer';
import { DocumentProcessor } from '@/services/document-processor.service';
import { 
  TextProcessRequestSchema, 
  ProcessingOptionsSchema,
  FileValidationSchema 
} from '@/models/schemas';
import { config } from '@/config';
import logger from '@/utils/logger';

const router = express.Router();
const documentProcessor = new DocumentProcessor();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024, // Convert MB to bytes
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    try {
      // Basic file validation - only check filename and mimetype during filter
      // Size will be validated after upload
      const supportedMimeTypes = [
        'image/jpeg',
        'image/png', 
        'image/bmp',
        'image/tiff',
        'image/webp',
        'application/pdf'
      ];

      const supportedExtensions = /\.(jpg|jpeg|png|bmp|tiff|webp|pdf)$/i;

      // Check MIME type
      if (!supportedMimeTypes.includes(file.mimetype)) {
        logger.warn('File upload rejected - unsupported MIME type', {
          filename: file.originalname,
          mimetype: file.mimetype
        });
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
        return;
      }

      // Check file extension
      if (!supportedExtensions.test(file.originalname)) {
        logger.warn('File upload rejected - unsupported extension', {
          filename: file.originalname,
          mimetype: file.mimetype
        });
        cb(new Error(`Unsupported file format`));
        return;
      }

      // Check for suspicious filename patterns
      if (file.originalname.includes('..')) {
        cb(new Error('Invalid filename'));
        return;
      }

      cb(null, true);
    } catch (error) {
      cb(new Error('File validation failed'));
    }
  }
});

/**
 * Process text input
 * POST /api/v1/process/text
 */
router.post('/text', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Validate request body
    const validationResult = TextProcessRequestSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      logger.warn('Text processing request validation failed', {
        requestId,
        errors: validationResult.error.errors,
        body: req.body
      });

      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request validation failed',
          details: validationResult.error.errors
        }
      });
    }

    const { text, options } = validationResult.data;

    logger.info('Processing text request', {
      requestId,
      textLength: text.length,
      options
    });

    // Process the text with properly typed options
    const result = await documentProcessor.processText(text, options as any);
    
    logger.info('Text processing completed', {
      requestId,
      status: result.status,
      amountsFound: result.amounts.length,
      processingTimeMs: result.processingDetails.processingTimeMs
    });

    res.json(result);
    return;

  } catch (error) {
    logger.error('Text processing failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({
      error: {
        code: 'PROCESSING_FAILED',
        message: 'Text processing failed',
        details: {
          requestId,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    });
  }
});

/**
 * Process image input
 * POST /api/v1/process/image
 */
router.post('/image', upload.single('file'), async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE_UPLOADED',
          message: 'No image file was uploaded'
        }
      });
    }

    // Validate file size (multer already checked format and basic size)
    const fileSizeValidation = FileValidationSchema.safeParse({
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    if (!fileSizeValidation.success) {
      logger.warn('Image file validation failed', {
        requestId,
        filename: req.file.originalname,
        size: req.file.size,
        errors: fileSizeValidation.error.errors
      });

      return res.status(400).json({
        error: {
          code: 'INVALID_FILE',
          message: 'File validation failed',
          details: fileSizeValidation.error.errors
        }
      });
    }

    // Parse processing options
    let options = ProcessingOptionsSchema.parse({}); // Default options
    
    if (req.body.options) {
      try {
        const parsedOptions = typeof req.body.options === 'string' 
          ? JSON.parse(req.body.options) 
          : req.body.options;
        
        const optionsValidation = ProcessingOptionsSchema.safeParse(parsedOptions);
        if (optionsValidation.success) {
          options = optionsValidation.data;
        } else {
          logger.warn('Invalid processing options, using defaults', {
            requestId,
            errors: optionsValidation.error.errors
          });
        }
      } catch (parseError) {
        logger.warn('Failed to parse processing options, using defaults', {
          requestId,
          error: parseError instanceof Error ? parseError.message : 'Parse error'
        });
      }
    }

    logger.info('Processing image request', {
      requestId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      options
    });

    // Process the image
    const result = await documentProcessor.processImage(
      req.file.buffer,
      req.file.originalname,
      options as any
    );
    
    logger.info('Image processing completed', {
      requestId,
      status: result.status,
      amountsFound: result.amounts.length,
      processingTimeMs: result.processingDetails.processingTimeMs,
      ocrConfidence: result.processingDetails.ocrConfidence
    });

    res.json(result);
    return;

  } catch (error) {
    logger.error('Image processing failed', {
      requestId,
      filename: req.file?.originalname,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({
      error: {
        code: 'PROCESSING_FAILED',
        message: 'Image processing failed',
        details: {
          requestId,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    });
  }
});

/**
 * Universal processing endpoint (handles both text and image)
 * POST /api/v1/process
 */
router.post('/', upload.single('file'), async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Parse processing options first
    let options = ProcessingOptionsSchema.parse({}); // Default options
    
    if (req.body.options) {
      try {
        const parsedOptions = typeof req.body.options === 'string' 
          ? JSON.parse(req.body.options) 
          : req.body.options;
        
        const optionsValidation = ProcessingOptionsSchema.safeParse(parsedOptions);
        if (optionsValidation.success) {
          options = optionsValidation.data;
        }
      } catch (parseError) {
        logger.warn('Failed to parse processing options, using defaults', { requestId });
      }
    }

    // Determine processing mode
    if (req.file) {
      // Image processing
      logger.info('Universal endpoint: processing image', {
        requestId,
        filename: req.file.originalname,
        fileSize: req.file.size
      });

      const result = await documentProcessor.processImage(
        req.file.buffer,
        req.file.originalname,
        options as any
      );
      
      return res.json(result);
      
    } else if (req.body.text) {
      // Text processing
      const textValidation = TextProcessRequestSchema.safeParse(req.body);
      
      if (!textValidation.success) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TEXT_REQUEST',
            message: 'Text validation failed',
            details: textValidation.error.errors
          }
        });
      }

      logger.info('Universal endpoint: processing text', {
        requestId,
        textLength: req.body.text.length
      });

      const result = await documentProcessor.processText(textValidation.data.text, options as any);
      
      return res.json(result);
      
    } else {
      // No valid input provided
      return res.status(400).json({
        error: {
          code: 'NO_INPUT_PROVIDED',
          message: 'Either text or file must be provided',
          details: {
            supportedInputs: ['text', 'file'],
            examples: {
              text: { text: 'Total: $100 | Paid: $50 | Due: $50' },
              file: 'multipart/form-data with file field'
            }
          }
        }
      });
    }

  } catch (error) {
    logger.error('Universal processing failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({
      error: {
        code: 'PROCESSING_FAILED',
        message: 'Processing failed',
        details: {
          requestId,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    });
  }
});

/**
 * Health check endpoint
 * GET /api/v1/process/health
 */
router.get('/health', (_req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      ocr: 'operational',
      ai_classification: 'operational',
      normalization: 'operational',
      guardrails: 'operational'
    },
    configuration: {
      maxFileSizeMB: config.MAX_FILE_SIZE_MB,
      supportedFormats: config.SUPPORTED_IMAGE_FORMATS,
      aiEnabled: true,
      guardrailsEnabled: config.INPUT_VALIDATION_ENABLED
    }
  };

  res.json(healthStatus);
});

/**
 * Get processing statistics
 * GET /api/v1/process/stats
 */
router.get('/stats', (_req, res) => {
  // In a real application, you would track these metrics
  const stats = {
    totalProcessed: 0,
    successRate: 0,
    averageProcessingTime: 0,
    amountTypes: {
      total_bill: 0,
      paid: 0,
      due: 0,
      other: 0
    },
    guardrailsMetrics: {
      inputViolations: 0,
      outputViolations: 0,
      aiSafetyViolations: 0
    }
  };

  res.json(stats);
});

export default router;