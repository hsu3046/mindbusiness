# MindBusiness AI 🧠

## Summary-ko

AI 기반 전략적 사고 도구입니다. 비즈니스 아이디어를 입력하면, AI가 3턴 대화를 통해 맥락을 파악하고 9가지 프레임워크(BMC, Lean Canvas, SWOT 등) 중 최적의 것을 선택합니다.
선택된 프레임워크로 구조화된 마인드맵을 자동 생성하며, 각 노드를 무한히 확장할 수 있습니다.
Next.js 프론트엔드와 FastAPI 백엔드로 구성되어 있으며, BYOK(Bring Your Own Key) 방식으로 자신의 Gemini API 키를 사용합니다.

## Summary-en

An AI-powered strategic thinking tool. Enter a business idea, and AI conducts a 3-turn conversation to understand context and automatically selects the optimal framework from 9 options (BMC, Lean Canvas, SWOT, etc.).
It generates a structured mindmap from the selected framework, with infinite node expansion capability.
Built with Next.js frontend and FastAPI backend, using a BYOK (Bring Your Own Key) model for Gemini API access.

## Summary-ja

AI搭載の戦略的思考ツールです。ビジネスアイデアを入力すると、AIが3ターンの対話でコンテキストを把握し、9つのフレームワーク（BMC、Lean Canvas、SWOTなど）から最適なものを自動選択します。
選択されたフレームワークで構造化されたマインドマップを自動生成し、各ノードを無限に展開できます。
Next.jsフロントエンドとFastAPIバックエンドで構成され、BYOK（Bring Your Own Key）方式で自分のGemini APIキーを使用します。

---

## ✨ Features

- **Smart 3-Turn Conversation**: AI analyzes user intent through contextual dialogue before generating
- **9 Business Frameworks**: BMC, Lean Canvas, SWOT, PESTEL, Persona, Process, 5 Whys, SCAMPER, 5W1H
- **Auto Framework Selection**: AI picks the best framework based on your context
- **Infinite Node Expansion**: Expand any node with hybrid engine (Framework Nesting + Logic Tree)
- **AI Report Generation**: Generate professional business reports from your mindmap (SSE streaming)
- **Multilingual**: Korean, English, Japanese support
- **BYOK**: Bring your own Gemini API key — no server-side key required

---

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- Google Gemini API Key ([Get one here](https://aistudio.google.com/app/apikey))

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Setting Your API Key

Open `http://localhost:3000` → Click the ⚙️ icon (bottom-right) → Enter your Gemini API key.

Alternatively, create `backend/.env`:
```
GEMINI_API_KEY=your_key_here
```

---

## 🏗 Architecture

```
MindBusiness/
├── backend/                  # FastAPI + Gemini AI
│   ├── logic/
│   │   ├── classifier.py     # Intent classification + smart 3-turn flow
│   │   ├── generator.py      # Mindmap skeleton generation
│   │   ├── expander.py       # Infinite node expansion
│   │   └── report_generator.py  # AI report (SSE streaming)
│   ├── prompts/              # System prompts & framework templates
│   ├── schemas/              # Pydantic request/response models
│   ├── config.py
│   └── main.py
├── frontend/                 # Next.js + TypeScript
│   ├── app/                  # Pages (landing, mindmap viewer)
│   ├── components/           # UI components (D3 mindmap, settings)
│   ├── lib/                  # API client, state management
│   └── types/                # TypeScript type definitions
└── README.md
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, TypeScript, Tailwind CSS v4, D3.js, Zustand, Framer Motion |
| **Backend** | FastAPI, Python 3.9+, Pydantic v2 |
| **AI** | Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`) |
| **Rate Limiting** | SlowAPI |

---

## 🎨 Supported Frameworks

| ID | Name | Best For |
|----|------|----------|
| **BMC** | Business Model Canvas | Established business planning |
| **LEAN** | Lean Canvas | Startup ideas, problem-solving |
| **SWOT** | SWOT Analysis | Strengths, Weaknesses, Opportunities, Threats |
| **PESTEL** | PESTEL Analysis | Macro-environmental factors |
| **PERSONA** | User Persona | Customer understanding |
| **PROCESS** | Step-by-Step Process | Roadmaps, workflows |
| **WHYS** | 5 Whys | Root cause analysis |
| **SCAMPER** | SCAMPER | Creative problem-solving |
| **LOGIC** | 5W1H | Structured logical analysis |

---

## 🔑 API Key Management (BYOK)

MindBusiness uses a **Bring Your Own Key** model:

1. **Browser UI**: Click ⚙️ icon → enter your key → stored in `localStorage` only
2. **Server fallback**: Set `GEMINI_API_KEY` in `backend/.env` for shared deployments
3. **Priority**: User key (header) > Server key (.env)

Your API key is **never stored on the server** — it travels only as an `X-API-Key` HTTP header per request.

---

## 📄 License

MIT License

---

## 👨‍💻 Author

**YuHitomi** — [GitHub](https://github.com/hsu3046)
