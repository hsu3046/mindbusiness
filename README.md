# 🧠 MindBusiness AI

## Tagline-en

Your ideas deserve a strategy, not just a sticky note.
In just 3 conversations, AI reads your context, picks the perfect framework from 9 business models like a seasoned consultant, and draws the mindmap for you.
Built for the dreamers who are full of ideas but stuck on where to start.

## Tagline-ko

머릿속 아이디어, AI가 전략 지도로 펼쳐드립니다.
대화 3번이면 충분해요. AI가 맥락을 파악하고, 전문 컨설턴트처럼 9가지 비즈니스 프레임워크 중 딱 맞는 걸 골라 마인드맵으로 그려줍니다.
아이디어는 넘치는데, 구체적인 계획이 막막하셨던 분들을 위해서 만듭니다.

## Tagline-ja

頭の中のアイデア、AIが戦略マップに広げます。
3回の対話だけで十分。AIがコンテキストを把握し、プロのコンサルタントのように9つのビジネスフレームワークからぴったりのものを選んでマインドマップを描きます。
アイデアは溢れているのに、具体的な計画が立てられなかった方のために作りました。

---

## Summary-en

You have a business idea buzzing in your head, but turning it into a structured plan feels overwhelming. 
MindBusiness AI acts as your thinking partner — not just a chart maker. Tell it what you're working on, and through a natural 3-turn conversation, it figures out the best strategic framework for your situation. Whether it's a Lean Canvas for your startup pitch or a SWOT for competitive analysis, the AI picks the right lens automatically. Then it generates a fully interactive mindmap you can expand infinitely, drilling deeper into any branch with context-aware intelligence. When you're ready, export everything as a polished business report.

## Summary-ko

사업 아이디어는 있는데, 어디서부터 정리해야 할지 막막하신가요?
MindBusiness AI는 단순한 마인드맵 도구가 아닙니다. 여러분의 생각을 AI와 3번의 대화만으로 맥락을 파악하고, 9가지 비즈니스 프레임워크 중 딱 맞는 걸 골라줍니다. Lean Canvas든 SWOT이든, 상황에 맞는 렌즈를 AI가 알아서 선택하거든요.
생성된 마인드맵은 무한 확장 가능하고, 각 노드를 클릭하면 맥락을 이해한 AI가 더 깊은 인사이트를 채워넣습니다. 정리가 끝나면, 비즈니스 리포트로 한 번에 내보낼 수도 있어요.

## Summary-ja

ビジネスアイデアはあるのに、どう整理すればいいかわからない。
MindBusiness AIは単なるマインドマップツールではありません。あなたのAI思考パートナーです。3ターンの対話であなたの意図を読み取り、BMC・Lean Canvas・SWOTなど9つのフレームワークから最適なものを自動選択。
生成されたマインドマップは無限に展開でき、クリック一つでコンテキストを理解したAIがさらに深いインサイトを追加します。完成したら、ビジネスレポートとしてエクスポートも可能です。

---

## ✨ What It Does

- **Understands your intent through conversation** — A smart 3-turn dialogue figures out exactly what kind of analysis you need before generating anything.
- **Picks the right framework automatically** — AI selects the best fit from 9 business frameworks (BMC, Lean Canvas, SWOT, PESTEL, and more) based on your context.
- **Generates structured mindmaps instantly** — Get a fully interactive, hierarchical map built on the selected framework in seconds.
- **Expands nodes infinitely with context-aware AI** — Click any node and the Hybrid Expansion Engine drills deeper using Logic Trees or nested frameworks, depending on what makes sense.
- **Streams professional business reports** — Generate polished reports from your mindmap via real-time SSE streaming.
- **Speaks your language** — Full trilingual support in Korean, English, and Japanese.
- **Keeps your keys safe** — BYOK (Bring Your Own Key) model means your Gemini API key never touches our servers.

---

## � Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui, Lucide Icons, HugeIcons |
| Visualization | React Flow (XYFlow), D3 Hierarchy, Dagre |
| Animation | Framer Motion |
| State | Zustand 5 |
| Backend | FastAPI, Python 3.9+, Pydantic v2 |
| AI | Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`) |
| Rate Limiting | SlowAPI |

---

## 📦 Installation

```bash
git clone https://github.com/hsu3046/MindBusiness.git
cd MindBusiness
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Fill in your GEMINI_API_KEY
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Click ⚙️ → Enter your Gemini API key.

---

## 📁 Project Structure

```
MindBusiness/
├── backend/                    # FastAPI + Gemini AI Engine
│   ├── logic/                  # Core AI logic modules
│   │   ├── classifier.py       # Intent classification & 3-turn conversation
│   │   ├── generator.py        # Mindmap skeleton generation (SoT)
│   │   ├── expander.py         # Infinite node expansion (Hybrid Engine)
│   │   └── report_generator.py # AI report generation (SSE streaming)
│   ├── prompts/                # System prompts & framework templates
│   ├── schemas/                # Pydantic request/response models
│   ├── lib/                    # Shared utilities
│   ├── tests/                  # Backend tests
│   ├── config.py               # Model & environment configuration
│   └── main.py                 # FastAPI application entry
├── frontend/                   # Next.js + TypeScript
│   ├── app/                    # App Router pages
│   ├── components/             # UI components (mindmap, settings, etc.)
│   ├── lib/                    # API client, utilities
│   ├── stores/                 # Zustand state management
│   ├── hooks/                  # Custom React hooks
│   └── types/                  # TypeScript type definitions
├── docs/                       # Project documentation
├── LICENSE                     # GNU GPL v3
└── README.md
```

---

## � Supported Frameworks

| ID | Name | Best For |
|----|------|----------|
| **BMC** | Business Model Canvas | Established business planning |
| **LEAN** | Lean Canvas | Startup ideas, problem-solving |
| **SWOT** | SWOT Analysis | Competitive strengths & weaknesses |
| **PESTEL** | PESTEL Analysis | Macro-environmental factors |
| **PERSONA** | User Persona | Deep customer understanding |
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

## � Roadmap

- [ ] GoT (Graph-of-Thoughts) insight discovery across branches
- [ ] PNG/PDF mindmap export
- [ ] Share links with expiration
- [ ] Database persistence (PostgreSQL)
- [ ] User authentication & saved sessions
- [ ] Prompt caching for cost optimization

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat(scope): add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

---

*Built by [KnowAI](https://knowai.space) · © 2026 KnowAI*
