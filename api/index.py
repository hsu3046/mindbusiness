"""
MindBusiness AI Backend - FastAPI Server
Provides framework classification API for mindmap generation.
"""

# ── Vercel sys.path shim ─────────────────────────────────────────────────────
# Vercel's Python runtime imports this file from /var/task with /var/task on
# sys.path, so `from logic.classifier import ...` would look for
# /var/task/logic/ and fail (it lives at /var/task/api/logic/).
# Inserting this file's directory makes every sibling-style import
# (logic/, schemas/, lib/, jobs, config) resolve without rewriting all of them
# to use an `api.` prefix.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import StreamingResponse
from logic.classifier import IntentClassifier, SmartClassifier
from logic.generator import MindmapGenerator
from logic.expander import NodeExpander
from logic.report_generator import ReportGenerator
from schemas.request import AnalyzeRequest
from schemas.mindmap_schema import GenerateRequest
from schemas.expand_schema import ExpandRequest
from schemas.conversation import SmartClassifyRequest
from schemas.report_schema import ReportRequest
from config import VERCEL_SAFE_TIMEOUT, GEMINI_API_KEY
from jobs import router as jobs_router
from typing import Optional


def _get_api_key(request: Request) -> Optional[str]:
    """Extract API key from X-API-Key header, fallback to server .env key."""
    return request.headers.get("x-api-key") or GEMINI_API_KEY or None

# Logging setup
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Environment-based configuration
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

# Initialize FastAPI app
app = FastAPI(
    title="MindBusiness AI Backend",
    description="AI-powered framework classifier for mindmap generation",
    version="1.0.0",
    # Disable API docs in production
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
)

# Register rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS for Next.js frontend
# Set ALLOWED_ORIGINS env var (comma-separated)
# Example: ALLOWED_ORIGINS=https://your-app.vercel.app,https://custom-domain.com
# Default: localhost dev origins only. Production MUST set ALLOWED_ORIGINS explicitly.
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]
USE_WILDCARD = ALLOWED_ORIGINS == ["*"]
if IS_PRODUCTION and (USE_WILDCARD or ALLOWED_ORIGINS == _default_origins.split(",")):
    logger.warning(
        "ALLOWED_ORIGINS is wildcard or default in production. "
        "Set ALLOWED_ORIGINS env var to your frontend domain(s)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=not USE_WILDCARD,  # allow_origins=["*"]일 때는 False여야 함
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize classifier, generator, expander, and smart classifier
classifier = IntentClassifier()
smartClassifier = SmartClassifier()
generator = MindmapGenerator()
expander = NodeExpander()
reportGenerator = ReportGenerator()

# Mount async job endpoints (Fire-and-Poll for /generate, resumable SSE for
# /report). These live under /api/v1/jobs/* and are decoupled from this
# file's request lifecycle — see api/jobs.py.
app.include_router(jobs_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "MindBusiness AI Backend",
        "version": "1.0.0",
    }


@app.get("/api/v1/byok-status")
async def byok_status():
    """
    Returns whether this deployment has a server-side fallback key.
    Used by the frontend to decide if BYOK is mandatory.
    Does not expose the key itself — only the boolean.
    """
    return {"has_server_key": bool(GEMINI_API_KEY)}


@app.post("/api/v1/validate-key")
@limiter.limit("5/minute")
async def validate_api_key(request: Request):
    """
    Validate a Gemini API key by making a lightweight test call.
    Used by the frontend Settings dialog to verify user's API key.
    """
    api_key = request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=400, detail="X-API-Key header required.")

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        # 키 자체의 유효성만 검증 — generate_content는 모델 접근 권한까지
        # 요구해서 preview 모델 권한이 없는 키는 유효해도 401로 떨어짐.
        # models.list()는 인증만 필요해서 키 진단 목적엔 더 정확. 인증 실패 시
        # await 시점에 예외가 발생하므로 결과를 소비할 필요 없음.
        await client.aio.models.list(config={"page_size": 1})
        return {"valid": True, "message": "API key is valid."}
    except Exception as e:
        # Never echo the api_key or raw error message back to the client.
        logger.warning("API key validation failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid API key.")


@app.post("/api/v1/classify")
@limiter.limit("10/minute")
async def classify_intent(request: Request, body: AnalyzeRequest):
    """
    Classify user input and determine appropriate business framework.
    
    Args:
        request: AnalyzeRequest containing user_input and user_language
    
    Returns:
        FrameworkDecision with selected framework or clarification request
    """
    try:
        api_key = _get_api_key(request)
        result = await classifier.analyze_intent(
            user_input=body.user_input,
            user_language=body.user_language,
            api_key=api_key
        )
        return result
    
    except Exception as e:
        logger.error(f"Classification failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Classification failed. Please try again."
        )


@app.post("/api/v1/smart-classify")
@limiter.limit("10/minute")
async def smart_classify(request: Request, body: SmartClassifyRequest):
    """
    Smart 3-turn classification with persona-based questions.
    Collects DNA through contextual conversation before generation.
    """
    start_time = time.time()
    
    try:
        api_key = _get_api_key(request)
        result = await asyncio.wait_for(
            smartClassifier.smart_classify(body, api_key=api_key),
            timeout=VERCEL_SAFE_TIMEOUT
        )
        elapsed = time.time() - start_time
        logger.info("SmartClassify completed in %.2fs", elapsed)
        return result

    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        logger.warning("SmartClassify timeout after %.2fs", elapsed)
        raise HTTPException(
            status_code=408,
            detail={
                "error": "classification_timeout",
                "message": "분석에 시간이 너무 오래 걸립니다. 입력을 간단히 해주세요.",
                "retry": True
            }
        )
    
    except Exception as e:
        logger.error(f"Smart classification failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "classification_error",
                "message": "Smart classification failed. Please try again.",
                "retry": False
            }
        )


@app.post("/api/v1/generate")
@limiter.limit("5/minute")
async def generate_mindmap(request: Request, body: GenerateRequest):
    """
    Generate a complete mindmap based on topic and framework.
    """
    start_time = time.time()
    
    try:
        api_key = _get_api_key(request)
        result = await asyncio.wait_for(
            generator.generate_map(
                topic=body.topic,
                framework_id=body.framework_id,
                language=body.language,
                intent_mode=body.intent_mode,
                api_key=api_key
            ),
            timeout=VERCEL_SAFE_TIMEOUT
        )
        elapsed = time.time() - start_time
        logger.info("Generate completed in %.2fs", elapsed)
        return result

    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        logger.warning("Generate timeout after %.2fs", elapsed)
        raise HTTPException(
            status_code=408,
            detail={
                "error": "generation_timeout",
                "message": "마인드맵 생성에 시간이 너무 오래 걸립니다. 입력을 간단히 해주세요.",
                "retry": True
            }
        )
    
    except Exception as e:
        logger.error(f"Mindmap generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "generation_error",
                "message": "Mindmap generation failed. Please try again.",
                "retry": False
            }
        )


@app.post("/api/v1/generate-markdown")
@limiter.limit("5/minute")
async def generate_mindmap_markdown(request: Request, body: GenerateRequest):
    """
    Generate a mindmap and return it as Markdown format.
    
    Args:
        request: GenerateRequest containing topic, framework_id, and language
    
    Returns:
        Markdown formatted mindmap as plain text
    """
    try:
        from logic.utils import mindmap_to_markdown
        from schemas.mindmap_schema import MindmapNode
        
        # Generate mindmap
        api_key = _get_api_key(request)
        result = await generator.generate_map(
            topic=body.topic,
            framework_id=body.framework_id,
            language=body.language,
            intent_mode=body.intent_mode,
            api_key=api_key
        )
        
        # Convert to MindmapNode object
        root_node = MindmapNode(**result["root_node"])
        
        # Convert to markdown
        markdown_text = mindmap_to_markdown(root_node)
        
        # Return as plain text
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=markdown_text)
    
    except Exception as e:
        logger.error(f"Markdown generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Markdown generation failed. Please try again."
        )


@app.post("/api/v1/expand")
@limiter.limit("15/minute")
async def expand_node(request: Request, body: ExpandRequest):
    """
    Expand a specific node dynamically based on context.
    """
    start_time = time.time()
    
    try:
        api_key = _get_api_key(request)
        result = await asyncio.wait_for(
            expander.expand_node(body, api_key=api_key),
            timeout=VERCEL_SAFE_TIMEOUT
        )
        elapsed = time.time() - start_time
        logger.info("Expand completed in %.2fs", elapsed)
        return result

    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        logger.warning("Expand timeout after %.2fs", elapsed)
        raise HTTPException(
            status_code=408,
            detail={
                "error": "expansion_timeout",
                "message": "노드 확장에 시간이 너무 오래 걸립니다.",
                "retry": True
            }
        )
    
    except ValueError as e:
        # Depth limit or other validation errors
        logger.warning(f"Expansion validation error: {e}")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "validation_error",
                "message": str(e),
                "retry": False
            }
        )
    
    except Exception as e:
        logger.error(f"Node expansion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "expansion_error",
                "message": "Node expansion failed. Please try again.",
                "retry": False
            }
        )


@app.post("/api/v1/expand-markdown")
@limiter.limit("15/minute")
async def expand_node_markdown(request: Request, body: ExpandRequest):
    """
    Expand a node and return the result as Markdown.
    
    Args:
        request: ExpandRequest
    
    Returns:
        Markdown formatted expansion result
    """
    try:
        from fastapi.responses import PlainTextResponse
        
        # Expand node
        api_key = _get_api_key(request)
        result = await expander.expand_node(body, api_key=api_key)
        
        # Convert to markdown
        markdown_lines = []
        markdown_lines.append(f"# {body.target_node_label}")
        markdown_lines.append("")
        
        # Add metadata
        markdown_lines.append(f"**Mode**: {result.get('expansion_mode', 'N/A')}")
        markdown_lines.append(f"**Framework**: {result.get('applied_framework_id', 'None')}")
        markdown_lines.append(f"**Confidence**: {result.get('confidence_score', 0):.2f}")
        if result.get('alternative_framework'):
            markdown_lines.append(f"**Alternative**: {result['alternative_framework']}")
        markdown_lines.append("")
        markdown_lines.append("---")
        markdown_lines.append("")
        
        # Add children
        children = result.get('children', [])
        for i, child in enumerate(children, 1):
            label = child.get('label', 'Unknown')
            desc = child.get('description', '')
            child_type = child.get('type', 'unknown')
            
            markdown_lines.append(f"## {i}. {label}")
            markdown_lines.append("")
            if desc:
                markdown_lines.append(desc)
                markdown_lines.append("")
            markdown_lines.append(f"*Type: {child_type}*")
            markdown_lines.append("")
        
        markdown_text = "\n".join(markdown_lines)
        return PlainTextResponse(content=markdown_text)
    
    except ValueError as e:
        logger.warning(f"Markdown expansion validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Markdown expansion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Markdown expansion failed. Please try again."
        )


@app.post("/api/v1/generate-report")
@limiter.limit("3/minute")
async def generate_report(request: Request, body: ReportRequest):
    """
    Generate a professional business report from mindmap data.
    Returns Server-Sent Events (SSE) stream for real-time rendering.
    """
    async def event_stream():
        try:
            async for chunk in reportGenerator.generate_report_stream(
                topic=body.topic,
                framework_id=body.framework_id,
                mindmap_tree=body.mindmap_tree,
                language=body.language,
                api_key=_get_api_key(request)
            ):
                yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Report generation stream error: {e}", exc_info=True)
            error_msg = json.dumps({"error": "Report generation failed. Please try again."}, ensure_ascii=False)
            yield f"data: {error_msg}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


if __name__ == "__main__":
    # Local dev only. Run from repo root: `python api/index.py`
    import uvicorn
    uvicorn.run(
        "index:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
