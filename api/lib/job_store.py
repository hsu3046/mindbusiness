"""
Async job store backed by Upstash Redis (HTTP REST).

Why HTTP, not redis-py: Vercel serverless functions can't keep a TCP
connection open across invocations. Upstash's REST API is stateless and
spins up in single-digit ms per call.

Two job kinds use this module:

  - "generate": fire-and-poll. POST /api/v1/jobs/generate creates a job,
    spawns the LLM call as an asyncio task, and returns the job_id. The
    client polls GET /api/v1/jobs/{id} until status == "done" or "error".

  - "report": fire-and-resumable-SSE. POST /api/v1/jobs/report creates a
    job and starts streaming chunks into a Redis list keyed by the job_id.
    GET /api/v1/jobs/{id}/stream tails the list with a cursor and forwards
    new chunks to the client over SSE — survivable across reconnects.

Keys (all expire in JOB_TTL_SECONDS):
  job:{id}             HASH   status / kind / created_at / updated_at /
                              error / result (JSON-encoded for "generate")
  job:{id}:chunks      LIST   each element is a chunk of report text
  job:{id}:done        STRING "1" once the producer finishes (for the SSE
                              forwarder to know when to stop tailing)
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from typing import Any, Literal, Optional

logger = logging.getLogger(__name__)

JOB_TTL_SECONDS = 3600  # 1 hour — long enough to survive a refresh, short
                        # enough that abandoned jobs don't accumulate cost.

JobKind = Literal["generate", "report"]
JobStatus = Literal["queued", "running", "done", "error"]


# ── Upstash REST client (lazy) ───────────────────────────────────────────────

_redis_client = None  # cached after first call
_redis_init_failed = False


def _get_redis():
    """Resolve an Upstash Redis async client. Returns None if not configured."""
    global _redis_client, _redis_init_failed
    if _redis_client is not None:
        return _redis_client
    if _redis_init_failed:
        return None

    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if not (url and token):
        logger.warning(
            "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. "
            "/api/v1/jobs/* endpoints will return 503."
        )
        _redis_init_failed = True
        return None

    try:
        from upstash_redis.asyncio import Redis  # type: ignore
        _redis_client = Redis(url=url, token=token)
        return _redis_client
    except Exception as exc:  # pragma: no cover — env-dependent
        logger.exception("Failed to initialize Upstash Redis client: %s", exc)
        _redis_init_failed = True
        return None


def is_configured() -> bool:
    """Whether the job store has a live KV backend."""
    return _get_redis() is not None


# ── Job lifecycle ────────────────────────────────────────────────────────────


def new_job_id() -> str:
    return uuid.uuid4().hex


async def create_job(kind: JobKind) -> Optional[str]:
    """Create a new job record. Returns job_id, or None if KV unavailable."""
    redis = _get_redis()
    if redis is None:
        return None
    job_id = new_job_id()
    now = int(time.time())
    key = f"job:{job_id}"
    await redis.hset(key, values={
        "kind": kind,
        "status": "queued",
        "created_at": str(now),
        "updated_at": str(now),
    })
    await redis.expire(key, JOB_TTL_SECONDS)
    return job_id


async def mark_running(job_id: str) -> None:
    redis = _get_redis()
    if redis is None:
        return
    await redis.hset(f"job:{job_id}", values={
        "status": "running",
        "updated_at": str(int(time.time())),
    })


async def set_result(job_id: str, result: Any) -> None:
    """Mark job done and store the JSON-encoded result (used by 'generate')."""
    redis = _get_redis()
    if redis is None:
        return
    await redis.hset(f"job:{job_id}", values={
        "status": "done",
        "result": json.dumps(result, ensure_ascii=False),
        "updated_at": str(int(time.time())),
    })


async def set_error(job_id: str, message: str) -> None:
    redis = _get_redis()
    if redis is None:
        return
    # Truncate to keep the hash field small and avoid leaking long stack traces.
    safe = message[:500]
    await redis.hset(f"job:{job_id}", values={
        "status": "error",
        "error": safe,
        "updated_at": str(int(time.time())),
    })


async def get_job(job_id: str) -> Optional[dict]:
    """Fetch the job hash. Returns None if not found or KV unavailable."""
    redis = _get_redis()
    if redis is None:
        return None
    data = await redis.hgetall(f"job:{job_id}")
    if not data:
        return None
    # Decode the JSON result if present.
    if "result" in data and data["result"]:
        try:
            data["result"] = json.loads(data["result"])
        except json.JSONDecodeError:
            pass
    return data


# ── Streaming chunks (used by 'report' jobs) ─────────────────────────────────


async def append_chunk(job_id: str, chunk: str) -> None:
    """Append a chunk to the job's chunk list."""
    redis = _get_redis()
    if redis is None:
        return
    key = f"job:{job_id}:chunks"
    await redis.rpush(key, chunk)
    # Refresh TTL on every chunk so a slow stream doesn't get evicted mid-flight.
    await redis.expire(key, JOB_TTL_SECONDS)


async def get_chunks(job_id: str, start: int = 0) -> list[str]:
    """Return chunks from `start` index to the end of the list."""
    redis = _get_redis()
    if redis is None:
        return []
    return await redis.lrange(f"job:{job_id}:chunks", start, -1)


async def chunk_count(job_id: str) -> int:
    redis = _get_redis()
    if redis is None:
        return 0
    return await redis.llen(f"job:{job_id}:chunks")


async def mark_stream_done(job_id: str) -> None:
    redis = _get_redis()
    if redis is None:
        return
    await redis.set(f"job:{job_id}:done", "1", ex=JOB_TTL_SECONDS)
    # Also flip the hash status so /jobs/{id} reflects completion.
    await redis.hset(f"job:{job_id}", values={
        "status": "done",
        "updated_at": str(int(time.time())),
    })


async def is_stream_done(job_id: str) -> bool:
    redis = _get_redis()
    if redis is None:
        return False
    val = await redis.get(f"job:{job_id}:done")
    return val == "1"
