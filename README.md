# Medical Document Amount Detection Service

## 🌐 **PUBLIC API ACCESS**

**🚀 LIVE DEMO AVAILABLE**: [https://unilluminated-monic-sharilyn.ngrok-free.dev](https://unilluminated-monic-sharilyn.ngrok-free.dev)

**✅ PUBLICLY ACCESSIBLE** - Anyone can test this API right now! No setup required.

### Quick Test (Copy & Paste):
```bash
# Health Check
curl https://unilluminated-monic-sharilyn.ngrok-free.dev/health

# Process Medical Text
curl -X POST https://unilluminated-monic-sharilyn.ngrok-free.dev/api/v1/process/text \
  -H "Content-Type: application/json" \
  -d '{"text": "Medical Bill\nTotal: $450.75\nInsurance Paid: $300.50\nPatient Due: $150.25"}'
```

**Note**: First-time visitors will see an ngrok warning page - just click "Visit Site" to proceed.

---

## Project Description

This is a Node.js/TypeScript backend service that processes medical documents to extract and classify financial amounts. The service uses OCR (Optical Character Recognition) to read text from images and documents, then applies AI-powered classification to identify different types of amounts like total bills, payments, and outstanding balances.

## Key Features

- **OCR Processing**: Extracts text from medical bills, receipts, and invoices using Tesseract.js
- **Amount Classification**: Uses Google Gemini AI to classify amounts by type (total, paid, due, etc.)
- **Comprehensive Guardrails**: Multi-layered validation system for input, processing, and output
- **Error Handling**: Robust error handling with fallback mechanisms
- **Security**: Input validation, file security checks, and AI safety measures

## Technology Stack

- **Node.js & TypeScript**: Runtime and type safety
- **Express.js**: Web framework for API endpoints
- **Tesseract.js**: OCR engine for text extraction from images
- **Google Gemini API**: AI service for amount classification
- **Sharp**: Image processing library
- **Winston**: Logging framework
- **Jest**: Testing framework

## How It Works

The service follows a comprehensive pipeline with built-in guardrails:

1. **Input Validation**: Validates file types, sizes, and content security
2. **OCR Extraction**: If image is provided, extracts text using Tesseract
3. **Text Normalization**: Cleans and normalizes the extracted text
4. **Amount Detection**: Identifies numerical values in the text
5. **AI Classification**: Uses Google Gemini to classify amounts by type
6. **Output Validation**: Ensures business logic consistency and quality
7. **Response**: Returns structured JSON with classified amounts and validation results

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Input Guard    │───▶│   OCR Service   │───▶│ Normalization   │
│  ✓ File Valid   │    │  ✓ Tesseract    │    │ ✓ Error Fix     │
│  ✓ Security     │    │  ✓ Confidence   │    │ ✓ Validation    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ AI Safety Guard │    │ Processing      │    │ Classification  │
│ ✓ Prompt Inject │    │ Guard           │    │ (Gemini AI)     │
│ ✓ Hallucination │    │ ✓ Timeout       │    │ ✓ Context       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                           ┌─────────────────┐
                                           │ Output Guard    │
                                           │ ✓ Business Rule │
                                           │ ✓ Consistency   │
                                           │ ✓ Quality       │
                                           └─────────────────┘
```

## API Usage

### Main Endpoint
```
POST /api/v1/process
```

### Text Input Example (Local)
```bash
curl -X POST "http://localhost:3000/api/v1/process" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Total: $450.75 | Insurance Paid: $300.50 | Patient Due: $150.25"
  }'
```

### Text Input Example (Public API)
```bash
curl -X POST "https://unilluminated-monic-sharilyn.ngrok-free.dev/api/v1/process/text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Total: $450.75 | Insurance Paid: $300.50 | Patient Due: $150.25"
  }'
```

### Image Input Example (Local)
```bash
curl -X POST "http://localhost:3000/api/v1/process" \
  -F "file=@medical_bill.jpg"
```

### Image Input Example (Public API)
```bash
curl -X POST "https://unilluminated-monic-sharilyn.ngrok-free.dev/api/v1/process/image" \
  -F "file=@medical_bill.jpg"
```

### Sample Response
```json
{
  "currency": "USD",
  "amounts": [
    {
      "type": "total_bill",
      "value": 450.75,
      "source": "Total: $450.75",
      "confidence": 0.95
    },
    {
      "type": "paid", 
      "value": 300.50,
      "source": "Insurance Paid: $300.50",
      "confidence": 0.92
    },
    {
      "type": "due",
      "value": 150.25, 
      "source": "Patient Due: $150.25",
      "confidence": 0.90
    }
  ],
  "status": "success",
  "processingTimeMs": 1250,
  "guardrailsResult": {
    "passed": true,
    "riskLevel": "low",
    "violations": [],
    "confidence": 0.95
  }
}
```

## Setup Instructions

### Prerequisites
- Node.js 18 or higher
- Tesseract OCR installed on your system

### Installation

1. **Install Tesseract OCR:**
   ```bash
   # macOS
   brew install tesseract
   
   # Ubuntu/Debian
   sudo apt-get install tesseract-ocr
   
   # Windows (via Chocolatey)
   choco install tesseract
   ```

2. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd medical-amount-detection
   npm install
   ```

3. **Get Google AI API Key:**
   - Visit https://ai.google.dev/
   - Sign in with your Google account
   - Click "Get API Key" and copy your key

4. **Configure environment:**
   ```bash
   # Create .env file
   echo "GOOGLE_AI_API_KEY=your_api_key_here" > .env
   echo "PORT=3000" >> .env
   ```

5. **Start the server:**
   ```bash
   npm run dev
   ```

6. **Test the API:**
   ```bash
   # Health check (local)
   curl http://localhost:3000/health
   
   # Health check (public API)
   curl https://unilluminated-monic-sharilyn.ngrok-free.dev/health
   
   # Process text (local)
   curl -X POST "http://localhost:3000/api/v1/process" \
     -H "Content-Type: application/json" \
     -d '{"text": "Total: $450.75 | Paid: $300.50 | Due: $150.25"}'
   
   # Process text (public API)
   curl -X POST "https://unilluminated-monic-sharilyn.ngrok-free.dev/api/v1/process/text" \
     -H "Content-Type: application/json" \
     -d '{"text": "Total: $450.75 | Paid: $300.50 | Due: $150.25"}'
   ```

## Guardrails System

The service includes a comprehensive guardrails system with multiple validation layers:

- **Input Validation**: File type, size, and content security checks
- **Processing Validation**: OCR confidence thresholds and performance monitoring
- **AI Safety**: Prompt injection detection and response validation
- **Output Validation**: Business logic consistency and quality assurance
- **Security**: Malware pattern detection and data sanitization

## Testing

Run the test suite:
```bash
npm test
```

The tests cover:
- API endpoint functionality
- OCR text extraction
- Amount classification
- Guardrails validation
- Error handling scenarios

## Development Notes

This project was built as a learning exercise to understand:
- OCR processing with Tesseract.js
- AI integration with Google Gemini
- TypeScript development with Express
- Image processing and text extraction
- Comprehensive validation and guardrails systems

## Future Improvements

Some areas that could be enhanced:
- Better OCR accuracy with image preprocessing
- More sophisticated amount classification
- Database integration for storing results
- User authentication and rate limiting
- Docker containerization for deployment