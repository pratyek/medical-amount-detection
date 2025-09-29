import app from './app';
import { config } from '@/config';
import logger from '@/utils/logger';

const PORT = config.PORT;

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Start server
const server = app.listen(PORT, () => {
  logger.info('🚀 Medical Amount Detection API Server Started', {
    port: PORT,
    nodeEnv: config.NODE_ENV,
    pid: process.pid,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      ocr: 'Tesseract.js',
      ai: 'Google Gemini',
      guardrails: 'Comprehensive validation',
      imageProcessing: 'Sharp + OpenCV preprocessing'
    }
  });

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🏥 Medical Amount Detection API                             ║
║                                                              ║
║  📍 Server: http://localhost:${PORT}                           ║
║  📋 Health: http://localhost:${PORT}/health                    ║
║  📖 Docs:   http://localhost:${PORT}/                          ║
║                                                              ║
║  🔧 Features:                                                ║
║    • Multi-modal processing (text + images)                 ║
║    • AI-powered classification                               ║
║    • Comprehensive guardrails                                ║
║    • Production-ready security                               ║
║                                                              ║
║  📊 Endpoints:                                               ║
║    POST /api/v1/process/text     - Process text             ║
║    POST /api/v1/process/image    - Process images           ║
║    POST /api/v1/process          - Universal endpoint       ║
║                                                              ║
║  🛡️  Guardrails Active:                                      ║
║    ✓ Input validation & security                            ║
║    ✓ Output quality assurance                               ║
║    ✓ AI safety & hallucination detection                    ║
║    ✓ Business logic validation                              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Additional startup information
  logger.info('Server configuration', {
    maxFileSizeMB: config.MAX_FILE_SIZE_MB,
    supportedFormats: config.SUPPORTED_IMAGE_FORMATS,
    rateLimitPerMinute: config.RATE_LIMIT_MAX_REQUESTS,
    aiEnabled: !!config.GOOGLE_AI_API_KEY,
    guardrails: {
      input: config.INPUT_VALIDATION_ENABLED,
      output: config.OUTPUT_VALIDATION_ENABLED,
      aiSafety: config.AI_SAFETY_VALIDATION_ENABLED
    }
  });
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

export { server, app };