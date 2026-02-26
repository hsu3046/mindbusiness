# MindBusiness AI Backend - Stage 1.1: Framework Classifier

Python Backend for AI-powered framework classification using Gemini Pro.

## 🚀 Quick Start

### 1. Setup Python Environment

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Mac/Linux
# or
venv\Scripts\activate  # Windows
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Edit `backend/.env` and add your Gemini API key:

```bash
GEMINI_API_KEY=your_actual_api_key_here
```

Get your API key from: https://aistudio.google.com/app/apikey

### 4. Run the Server

```bash
# From backend/ directory
uvicorn main:app --reload --port 8000
```

Or run directly:

```bash
python main.py
```

The server will start at `http://localhost:8000`

### 5. Test the API

Health check:
```bash
curl http://localhost:8000/health
```

Classification test (High Confidence):
```bash
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "성남시에서 카페 창업을 위한 마케팅 플랜",
    "user_language": "Korean"
  }'
```

Classification test (Low Confidence):
```bash
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "커피",
    "user_language": "Korean"
  }'
```

## 📁 Project Structure

```
backend/
├── .env                        # Environment variables (API keys)
├── .gitignore                  # Python gitignore
├── requirements.txt            # Python dependencies
├── config.py                   # Configuration & constants
├── main.py                     # FastAPI server
├── logic/
│   ├── __init__.py
│   └── classifier.py           # Framework classifier logic
├── schemas/
│   ├── __init__.py
│   ├── request.py              # Request schema
│   └── intent_schema.py        # Response schema
├── prompts/
│   └── system_classifier.txt   # System prompt for Gemini
└── tests/
    └── test_classifier.py      # Unit tests
```

## 🔧 Configuration

### Models
- **Reasoning Model**: `gemini-3-pro-preview` (for classification)
- **Generation Model**: `gemini-3-flash-preview` (for future stages)

### Supported Languages
- Korean
- English
- Japanese

### Confidence Threshold
- Score ≥ 80: Direct framework selection
- Score < 80: Clarification question with multiple choice options

## 📚 API Reference

### POST /api/v1/classify

Classify user input and determine appropriate business framework.

**Request Body:**
```json
{
  "user_input": "string",
  "user_language": "Korean" | "English" | "Japanese"
}
```

**Response (High Confidence):**
```json
{
  "reasoning_log": "Internal logic (English)",
  "selection_reason": "User-facing explanation (target language)",
  "confidence_score": 95,
  "selected_framework_id": "BMC",
  "root_node_title": "카페 창업 마케팅 플랜",
  "needs_clarification": false,
  "clarification_question": null,
  "clarification_options": null
}
```

**Response (Low Confidence):**
```json
{
  "reasoning_log": "Internal logic (English)",
  "selection_reason": null,
  "confidence_score": 30,
  "selected_framework_id": null,
  "root_node_title": null,
  "needs_clarification": true,
  "clarification_question": "커피와 관련하여 어떤 분석이 필요하신가요?",
  "clarification_options": [
    {"label": "커피 사업 시작", "framework_id": "LEAN"},
    {"label": "커피 시장 분석", "framework_id": "PESTEL"},
    {"label": "커피 고객 분석", "framework_id": "PERSONA"}
  ]
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "MindBusiness AI Backend",
  "version": "1.0.0"
}
```

## 🧪 Testing

Run unit tests:
```bash
pytest tests/
```

## 🔐 Security Notes

- Never commit `.env` files to version control
- Keep your `GEMINI_API_KEY` private
- Use environment variables for sensitive data

## 📝 Next Steps

This is **Stage 1.1** of the MindBusiness AI project. Next stages:
- Stage 1.2: Skeleton Generator (SoT)
- Stage 1.3: MECE Validator (ToT)
- Stage 1.4: Parallel Expansion
- Stage 1.5: Insight Linker (GoT)

See `docs/DEVELOPMENT_ROADMAP.md` for full development plan.
