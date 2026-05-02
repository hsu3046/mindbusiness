# 🧠 MindBusiness

> Live at **[aib.vote](https://aib.vote)** · Built by **aib**

## Tagline-en

"I asked ChatGPT, but I still ended up doing all the thinking myself."
If you have a business idea but don't know where to start, just have 3 conversations with AI.
We'll turn your scattered thoughts into a clear, structured strategy — tailored to your situation.

## Tagline-ko

"챗GPT한테 물어봤는데 결국 내가 다 정리해야 했어요."
사업 아이디어는 있는데 정리가 안 된다면, AI와 3번만 대화하세요.
내 상황에 맞는 방식으로 아이디어를 한눈에 정리해드립니다.

## Tagline-ja

「ChatGPTに聞いてみたけど、結局自分で全部まとめることになった。」
ビジネスアイデアはあるのに、整理できずにいるなら、AIと3回話すだけで大丈夫です。
あなたの状況に合わせて、アイデアをわかりやすく整理します。

---

## Summary-en

You have a business idea — but no idea where to begin?
MindBusiness is more than just a mind mapping tool.
Start with a conversation. In just 3 exchanges, the AI understands your situation and organizes your ideas in the way that makes the most sense right now.
When you get stuck, you're not on your own. The AI reads the context and suggests your next idea, right when you need it.
Once everything comes together, the AI compiles it all into a draft business plan. The idea that lived only in your head — finally becomes a document.

## Summary-ko

사업 아이디어는 있는데, 어디서부터 정리해야 할지 막막하신가요?
MindBusiness는 단순한 마인드맵 도구가 아닙니다.
처음엔 그냥 대화하세요. 3번의 질문만으로 AI가 상황을 파악하고, 지금 가장 필요한 방식으로 아이디어를 구조화합니다.
막히는 순간도 혼자가 아닙니다. AI가 맥락을 읽고, 다음 아이디어를 바로 제안합니다.
아이디어가 정리되면, AI가 모든 내용을 모아 사업계획서 초안으로 만들어드립니다. 머릿속에 있던 아이디어가, 처음으로 문서가 되는 순간입니다.

## Summary-ja

ビジネスのアイデアはあるのに、どこから手をつければいいかわからない。そんな経験はありませんか？
MindBusiness は、単なるマインドマップツールではありません。
まずは、気軽に話しかけてみてください。3回の会話だけで、AIがあなたの状況を把握し、今一番必要な形でアイデアを整理していきます。
行き詰まっても、一人で悩まなくて大丈夫です。AIが文脈を読み取り、次のアイデアをすぐに提案してくれます。
アイデアがまとまったら、AIがすべての内容をまとめて事業計画書の初稿を作成します。頭の中にあったアイデアが、はじめて「形」になる瞬間です。

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

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui, Lucide Icons, HugeIcons |
| Visualization | React Flow (XYFlow), D3 Hierarchy, Dagre |
| Animation | Framer Motion |
| State | Zustand 5 |
| Backend | FastAPI, Python 3.9+, Pydantic v2 |
| AI | Google Gemini (`gemini-3-flash-preview`, `gemini-3-pro-preview`) — see `backend/config.py` |
| Rate Limiting | SlowAPI |

> **Language scope (current):** the AI prompts support Korean, English, and Japanese,
> but the **UI is Korean-only** today. Trilingual UI (i18n routing) is on the roadmap.

---

## 📦 Installation

This is a Vercel-only monorepo: the Next.js frontend lives at the repo root,
and the FastAPI backend is mounted as a Python serverless function under `api/`.
A single `vercel deploy` ships both.

```bash
git clone https://github.com/hsu3046/MindBusiness.git
cd MindBusiness
cp .env.example .env.local   # fill in any keys you want to set locally
```

### Local dev (two terminals)

```bash
# Terminal 1 — Python serverless function (run from repo root)
python3 -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python api/index.py               # serves on http://localhost:8000

# Terminal 2 — Next.js
npm install
npm run dev                       # serves on http://localhost:3000
```

For local dev with the frontend talking to a separate backend, set
`NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`. In a unified Vercel
deployment this is unnecessary — the frontend calls `/api/...` on the same origin.

Open [http://localhost:3000](http://localhost:3000) → click ⚙️ → enter your Gemini API key.

### Vercel deployment

1. Import the repo into Vercel. Framework auto-detects as **Next.js** (root) and **Python** (from `requirements.txt`).
2. Add an [Upstash Redis](https://console.upstash.com) integration (or set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` manually) to enable the async job endpoints.
3. Optionally set `GEMINI_API_KEY` for a server-side fallback. Without it, every user must bring their own key via the Settings dialog.

`vercel.json` already sets `maxDuration: 300` (Fluid Compute default) on the Python function — no Pro plan required for typical workloads.

### Environment variables

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | backend | optional | Server-side BYOK fallback. Leave empty to require user keys. |
| `UPSTASH_REDIS_REST_URL` | backend | for `/api/v1/jobs/*` | Upstash REST endpoint. Free tier is enough. |
| `UPSTASH_REDIS_REST_TOKEN` | backend | for `/api/v1/jobs/*` | Upstash REST token. |
| `ENVIRONMENT` | backend | optional | Set to `production` to disable `/docs` / `/redoc`. |
| `ALLOWED_ORIGINS` | backend | only for split deploys | Same-origin Vercel deploys don't need this. |
| `NEXT_PUBLIC_API_URL` | frontend | only for split deploys | Leave empty for same-origin (default Vercel). |

---

## 📁 Project Structure

```
MindBusiness/
├── app/                        # Next.js App Router pages
├── components/                 # UI components (mindmap, settings, etc.)
├── lib/                        # API client + helpers
│   ├── api.ts                  # Sync + async job clients
│   ├── api-config.ts           # API base URL (same-origin by default)
│   ├── tree-cache.ts           # localStorage tree persistence
│   └── ...
├── stores/                     # Zustand state management
├── hooks/                      # Custom React hooks
├── types/                      # TypeScript type definitions
├── public/                     # Static assets
│
├── api/                        # Python serverless functions (FastAPI ASGI)
│   ├── index.py                # FastAPI app entry — mounted at /api/*
│   ├── jobs.py                 # Async job endpoints (/api/v1/jobs/*)
│   ├── config.py               # Model + environment configuration
│   ├── logic/
│   │   ├── classifier.py       # Intent classification & 3-turn conversation
│   │   ├── generator.py        # Mindmap skeleton generation
│   │   ├── expander.py         # Infinite node expansion
│   │   └── report_generator.py # AI report streaming
│   ├── prompts/                # System prompts & framework templates
│   ├── schemas/                # Pydantic request/response models
│   ├── lib/                    # Backend-only helpers (job_store, json_utils, …)
│   └── tests/                  # Backend integration tests
│
├── vercel.json                 # Function config (maxDuration, rewrites)
├── requirements.txt            # Python deps (root — Vercel reads this)
├── package.json
├── LICENSE                     # GNU GPL v3
└── README.md
```

---

## 🔁 Async Job Endpoints (Fire-and-Poll + Resumable SSE)

Long-running LLM calls are decoupled from the HTTP request lifecycle so a
client can close the tab, lose its network, or switch devices without losing
the result. The job state lives in Upstash Redis.

| Endpoint | Pattern | When to use |
|---|---|---|
| `POST /api/v1/jobs/generate` | Fire-and-Poll | Full mindmap generation (~30-55s) |
| `GET  /api/v1/jobs/{id}` | Polling | Read job status / result |
| `POST /api/v1/jobs/report` | Fire-and-stream | Start a report job |
| `GET  /api/v1/jobs/{id}/stream?cursor=N` | Resumable SSE | Tail a report job; reconnect-safe |

The synchronous `/api/v1/generate` and `/api/v1/generate-report` are kept for
backward compatibility but new clients should prefer the job-based endpoints.

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

*Built by [aib](https://aib.vote) · © 2026 aib*
