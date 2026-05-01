"""
Async job endpoints — Fire-and-Poll for /generate and resumable SSE for /report.

The synchronous /api/v1/generate and /api/v1/generate-report endpoints in
index.py stay for backward compatibility, but new clients should use these
job-queue endpoints because they:

- survive the client tab being closed, reloaded, or backgrounded
- isolate the long-running LLM call from the HTTP request lifecycle
- let any device with the job_id retrieve / resume the result

Endpoints:
  POST /api/v1/jobs/generate         → 202 + {job_id}
  GET  /api/v1/jobs/{id}             → status / result / error
  POST /api/v1/jobs/report           → 202 + {job_id}
  GET  /api/v1/jobs/{id}/stream      → SSE forwarder, replays from cursor
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import GEMINI_API_KEY
from lib import job_store
from logic.generator import MindmapGenerator
from logic.report_generator import ReportGenerator
from schemas.mindmap_schema import GenerateRequest
from schemas.report_schema import ReportRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

# Reuse the singleton generators from index.py via lazy import to avoid a
# circular import. These instances are stateless w.r.t. per-request keys.
_generator: Optional[MindmapGenerator] = None
_report_generator: Optional[ReportGenerator] = None


def _get_generator() -> MindmapGenerator:
    global _generator
    if _generator is None:
        _generator = MindmapGenerator()
    return _generator


def _get_report_generator() -> ReportGenerator:
    global _report_generator
    if _report_generator is None:
        _report_generator = ReportGenerator()
    return _report_generator


def _api_key(request: Request) -> Optional[str]:
    return request.headers.get("x-api-key") or GEMINI_API_KEY or None


def _require_kv() -> None:
    if not job_store.is_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "job_store_unavailable",
                "message": (
                    "Job queue backend (Upstash Redis) is not configured. "
                    "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
                ),
                "retry": False,
            },
        )


# ── /generate (fire-and-poll) ────────────────────────────────────────────────


async def _run_generate_job(
    job_id: str,
    body: GenerateRequest,
    api_key: Optional[str],
) -> None:
    """Background task: run the LLM and write the result to KV."""
    try:
        await job_store.mark_running(job_id)
        result = await _get_generator().generate_map(
            topic=body.topic,
            framework_id=body.framework_id,
            language=body.language,
            intent_mode=body.intent_mode,
            api_key=api_key,
        )
        await job_store.set_result(job_id, result)
    except Exception as exc:
        logger.exception("Generate job %s failed", job_id)
        await job_store.set_error(job_id, str(exc))


@router.post("/generate", status_code=202)
async def create_generate_job(request: Request, body: GenerateRequest):
    """Kick off a mindmap generation job. Returns 202 + {job_id} immediately."""
    _require_kv()
    job_id = await job_store.create_job("generate")
    if not job_id:
        raise HTTPException(status_code=503, detail="Could not create job.")

    api_key = _api_key(request)
    # Spawn the LLM call as a background task. asyncio.create_task is the
    # FastAPI-idiomatic equivalent of Vercel's waitUntil() — the response
    # is sent immediately and the task continues until completion.
    asyncio.create_task(_run_generate_job(job_id, body, api_key))
    return {"job_id": job_id, "kind": "generate", "status": "queued"}


# ── /report (resumable SSE) ──────────────────────────────────────────────────


async def _run_report_job(
    job_id: str,
    body: ReportRequest,
    api_key: Optional[str],
) -> None:
    """Background task: stream Gemini chunks into a Redis list."""
    try:
        await job_store.mark_running(job_id)
        async for chunk in _get_report_generator().generate_report_stream(
            topic=body.topic,
            framework_id=body.framework_id,
            mindmap_tree=body.mindmap_tree,
            language=body.language,
            api_key=api_key,
        ):
            if chunk:
                await job_store.append_chunk(job_id, chunk)
        # Success: set terminal status BEFORE flipping the stream-done flag,
        # so a forwarder that wakes between the two calls still sees a
        # consistent "running" state instead of a status-less "done".
        await job_store.set_done(job_id)
        await job_store.mark_stream_done(job_id)
    except Exception as exc:
        logger.exception("Report job %s failed", job_id)
        # set_error must run BEFORE mark_stream_done — set_done would skip
        # the overwrite once 'error' is set, but mark_stream_done no longer
        # touches the status field at all, so order here is purely about the
        # forwarder seeing the error payload before it sees [DONE].
        await job_store.set_error(job_id, str(exc))
        await job_store.mark_stream_done(job_id)


@router.post("/report", status_code=202)
async def create_report_job(request: Request, body: ReportRequest):
    """Kick off a streaming report job. Client then opens GET /{id}/stream."""
    _require_kv()
    job_id = await job_store.create_job("report")
    if not job_id:
        raise HTTPException(status_code=503, detail="Could not create job.")

    api_key = _api_key(request)
    asyncio.create_task(_run_report_job(job_id, body, api_key))
    return {"job_id": job_id, "kind": "report", "status": "queued"}


# ── Polling / streaming endpoints ────────────────────────────────────────────


@router.get("/{job_id}")
async def get_job_status(job_id: str):
    """Return the current job state. Used by the polling client."""
    _require_kv()
    job = await job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return job


@router.get("/{job_id}/stream")
async def stream_job(job_id: str, request: Request):
    """
    Resumable SSE forwarder for report jobs.

    Replays from the `cursor` query parameter (chunk index) so a reconnecting
    client can resume from where it left off. Polls the chunk list every
    POLL_INTERVAL_SECONDS until the producer marks the stream done OR the
    client disconnects.
    """
    _require_kv()
    job = await job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    # Cursor lets the client resume from a specific chunk index after a reconnect.
    try:
        cursor = max(0, int(request.query_params.get("cursor", "0")))
    except ValueError:
        cursor = 0

    POLL_INTERVAL_SECONDS = 0.5
    MAX_IDLE_SECONDS = 60.0  # bail out if no new chunks arrive for this long

    async def event_stream():
        nonlocal cursor
        idle = 0.0
        try:
            while True:
                if await request.is_disconnected():
                    return

                chunks = await job_store.get_chunks(job_id, start=cursor)
                if chunks:
                    idle = 0.0
                    for chunk in chunks:
                        cursor += 1
                        payload = json.dumps(
                            {"text": chunk, "cursor": cursor},
                            ensure_ascii=False,
                        )
                        yield f"data: {payload}\n\n"

                # Check terminal state AFTER draining chunks so we don't
                # truncate the last batch.
                done = await job_store.is_stream_done(job_id)
                if done:
                    # Surface error if any.
                    final = await job_store.get_job(job_id)
                    if final and final.get("status") == "error":
                        err = json.dumps(
                            {"error": final.get("error", "Report generation failed.")},
                            ensure_ascii=False,
                        )
                        yield f"data: {err}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                idle += POLL_INTERVAL_SECONDS
                if idle >= MAX_IDLE_SECONDS:
                    err = json.dumps(
                        {"error": "Report stream idle timeout."},
                        ensure_ascii=False,
                    )
                    yield f"data: {err}\n\n"
                    return
        except asyncio.CancelledError:
            # Client disconnected — surface up so the runtime can release.
            raise
        except Exception:
            logger.exception("Stream forwarder for %s failed", job_id)
            err = json.dumps({"error": "Stream forwarder error."}, ensure_ascii=False)
            yield f"data: {err}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
