"""
Build a `types.GenerateContentConfig` from a STAGE_CONFIG entry.

Centralises the mapping from our string-based reasoning levels ("low",
"medium", "high", "off") to the SDK's `types.ThinkingLevel` enum, and
the optional `Tool(google_search=GoogleSearch())` attachment. Every
call site goes through `build_config(stage, ...)` so model swaps + per-
call overrides only ever touch one file plus config.STAGE_CONFIG.
"""

from __future__ import annotations

from typing import Any, Optional

from google.genai import types

from config import STAGE_CONFIG


_REASONING_MAP = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


def get_stage(stage: str) -> dict:
    """Resolve a STAGE_CONFIG entry. KeyError surfaces typos early."""
    return STAGE_CONFIG[stage]


def get_model(stage: str) -> str:
    """Shortcut for the model id of a stage."""
    return STAGE_CONFIG[stage]["model"]


def build_config(
    stage: str,
    *,
    response_mime_type: Optional[str] = None,
    system_instruction: Optional[str] = None,
    temperature_override: Optional[float] = None,
    **extra: Any,
) -> types.GenerateContentConfig:
    """
    Construct a GenerateContentConfig for `stage` from STAGE_CONFIG.

    Caller can override temperature per-request and pass extra fields
    (e.g. `max_output_tokens`) through `**extra`.
    """
    cfg = STAGE_CONFIG[stage]

    kwargs: dict[str, Any] = {
        "temperature": (
            temperature_override if temperature_override is not None else cfg["temperature"]
        ),
    }

    reasoning = cfg.get("reasoning", "off")
    if reasoning != "off":
        level = _REASONING_MAP.get(reasoning)
        if level is not None:
            kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=level)

    if cfg.get("use_search"):
        kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]

    if response_mime_type is not None:
        kwargs["response_mime_type"] = response_mime_type
    if system_instruction is not None:
        kwargs["system_instruction"] = system_instruction

    kwargs.update(extra)
    return types.GenerateContentConfig(**kwargs)
