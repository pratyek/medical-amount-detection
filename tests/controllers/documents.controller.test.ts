import request from 'supertest';
import express from 'express';
import { DocumentsController } from '@/controllers/documents.controller';

// Mock the document processor
jest.mock('@/services/document-processor.service', () => ({
  DocumentProcessor: jest.fn().mockImplementation(() => ({
    processText: jest.fn(),
    processImage: jest.fn()
  }))
}));

describe('DocumentsController', () => {
  let app: express.Application;
  let mockDocumentProcessor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mock document processor
    mockDocumentProcessor = {
      processText: jest.fn(),
      processImage: jest.fn()
    };

    // Mock the controller
    const documentsController = new DocumentsController();
    
    // Add routes
    app.post('/api/v1/process/text', (req, res) => documentsController.processText(req, res));
    app.post('/api/v1/process/image', (req, res) => documentsController.processImage(req, res));
    app.post('/api/v1/process', (req, res) => documentsController.processUniversal(req, res));
    app.get('/health', (req, res) => documentsController.healthCheck(req, res));
    app.get('/status', (req, res) => documentsController.getStatus(req, res));
  });

  describe('POST /api/v1/process/text', () => {
    it('should process text successfully', async () => {
      const textData = {
        text: 'Medical bill: Total $150.75 | Paid $100.50 | Due $50.25',
        options: {
          confidenceThreshold: 0.8,
          enableAiClassification: true
        }
      };

      const mockResponse = {
        currency: 'USD',
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 },
          { type: 'paid', value: 100.50, source: '$100.50', confidence: 0.92 },
          { type: 'due', value: 50.25, source: '$50.25', confidence: 0.90 }
        ],
        status: 'ok',
        processingDetails: {
          ocrConfidence: null,
          normalizationConfidence: 0.95,
          classificationConfidence: 0.92,
          processingTimeMs: 1000,
          tokensExtracted: 3,
          correctionsApplied: []
        },
        requestId: expect.any(String),
        guardrailsResult: {
          passed: true,
          riskLevel: 'low',
          violations: [],
          confidence: 0.95,
          recommendedAction: 'proceed'
        },
        warnings: []
      };

      mockDocumentProcessor.processText.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/process/text')
        .send(textData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.amounts).toHaveLength(3);
      expect(response.body.amounts[0].type).toBe('total_bill');
      expect(mockDocumentProcessor.processText).toHaveBeenCalledWith(
        textData.text,
        textData.options
      );
    });

    it('should handle validation errors', async () => {
      const invalidData = {
        // Missing required 'text' field
        options: {
          confidenceThreshold: 0.8
        }
      };

      const response = await request(app)
        .post('/api/v1/process/text')
        .send(invalidData)
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
    });

    it('should handle processing errors', async () => {
      const textData = {
        text: 'Invalid text',
        options: {
          confidenceThreshold: 0.8,
          enableAiClassification: true
        }
      };

      mockDocumentProcessor.processText.mockRejectedValue(new Error('Processing failed'));

      const response = await request(app)
        .post('/api/v1/process/text')
        .send(textData)
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/process/image', () => {
    it('should process image successfully', async () => {
      const mockResponse = {
        currency: 'USD',
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 }
        ],
        status: 'ok',
        processingDetails: {
          ocrConfidence: 0.85,
          normalizationConfidence: 0.95,
          classificationConfidence: 0.92,
          processingTimeMs: 2000,
          tokensExtracted: 1,
          correctionsApplied: []
        },
        requestId: expect.any(String),
        guardrailsResult: {
          passed: true,
          riskLevel: 'low',
          violations: [],
          confidence: 0.95,
          recommendedAction: 'proceed'
        },
        warnings: []
      };

      mockDocumentProcessor.processImage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/process/image')
        .attach('file', Buffer.from('fake-image-data'), 'medical-bill.jpg')
        .field('options', JSON.stringify({
          confidenceThreshold: 0.8,
          enableAiClassification: true
        }))
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.amounts).toHaveLength(1);
      expect(response.body.processingDetails.ocrConfidence).toBe(0.85);
    });

    it('should handle missing file', async () => {
      const response = await request(app)
        .post('/api/v1/process/image')
        .send({
          options: {
            confidenceThreshold: 0.8
          }
        })
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
    });

    it('should handle unsupported file types', async () => {
      const response = await request(app)
        .post('/api/v1/process/image')
        .attach('file', Buffer.from('fake-data'), 'document.exe')
        .field('options', JSON.stringify({
          confidenceThreshold: 0.8
        }))
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/process', () => {
    it('should process text via universal endpoint', async () => {
      const textData = {
        text: 'Medical bill: Total $150.75',
        options: {
          confidenceThreshold: 0.8,
          enableAiClassification: true
        }
      };

      const mockResponse = {
        currency: 'USD',
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 }
        ],
        status: 'ok',
        processingDetails: {
          ocrConfidence: null,
          normalizationConfidence: 0.95,
          classificationConfidence: 0.92,
          processingTimeMs: 1000,
          tokensExtracted: 1,
          correctionsApplied: []
        },
        requestId: expect.any(String),
        guardrailsResult: {
          passed: true,
          riskLevel: 'low',
          violations: [],
          confidence: 0.95,
          recommendedAction: 'proceed'
        },
        warnings: []
      };

      mockDocumentProcessor.processText.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/process')
        .send(textData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.amounts).toHaveLength(1);
    });

    it('should process image via universal endpoint', async () => {
      const mockResponse = {
        currency: 'USD',
        amounts: [
          { type: 'total_bill', value: 150.75, source: '$150.75', confidence: 0.95 }
        ],
        status: 'ok',
        processingDetails: {
          ocrConfidence: 0.85,
          normalizationConfidence: 0.95,
          classificationConfidence: 0.92,
          processingTimeMs: 2000,
          tokensExtracted: 1,
          correctionsApplied: []
        },
        requestId: expect.any(String),
        guardrailsResult: {
          passed: true,
          riskLevel: 'low',
          violations: [],
          confidence: 0.95,
          recommendedAction: 'proceed'
        },
        warnings: []
      };

      mockDocumentProcessor.processImage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/process')
        .attach('file', Buffer.from('fake-image-data'), 'medical-bill.jpg')
        .field('options', JSON.stringify({
          confidenceThreshold: 0.8,
          enableAiClassification: true
        }))
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.amounts).toHaveLength(1);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('GET /status', () => {
    it('should return system status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body.status).toBe('operational');
      expect(response.body.services).toBeDefined();
      expect(response.body.configuration).toBeDefined();
    });
  });
});
