"""
MindBusiness AI Backend - FastAPI Server
Provides framework classification API for mindmap generation.
"""

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
# Set ALLOWED_ORIGINS env var for production (comma-separated)
# Example: ALLOWED_ORIGINS=https://your-app.vercel.app,https://custom-domain.com
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
USE_WILDCARD = ALLOWED_ORIGINS == ["*"]

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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "MindBusiness AI Backend",
        "version": "1.0.0",
        "has_server_key": bool(GEMINI_API_KEY)
    }


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
        # Lightweight test: list models
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents="Say 'ok' in one word.",
        )
        return {"valid": True, "message": "API key is valid."}
    except Exception as e:
        logger.warning(f"API key validation failed: {e}")
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
        print(f"⏱️ SmartClassify 완료: {elapsed:.2f}초")
        return result
    
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"⚠️ SmartClassify 타임아웃: {elapsed:.2f}초")
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
        print(f"⏱️ Generate 완료: {elapsed:.2f}초")
        return result
    
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"⚠️ Generate 타임아웃: {elapsed:.2f}초")
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
        print(f"⏱️ Expand 완료: {elapsed:.2f}초")
        return result
    
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"⚠️ Expand 타임아웃: {elapsed:.2f}초")
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
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
