"""
Strategy registry for the branch-generation system (Phase 3).

A `GenerationStrategy` is a recipe for one expansion: 1+ `GenerationVariant`s
(each = a full Gemini call configuration), an `aggregator` policy for
merging their outputs, and flags for the optional MECE / quality-rubric
secondary passes.

This file is the single edit point when adding/tuning a strategy. The
expander imports `STRATEGIES` and dispatches by name; users select via
`ExpandRequest.expansion_mode`.

Phase 3 ships 4 strategies (matching the Phase 2 modes):

    default   — 1 variant, balanced. Cheapest, current behavior.
    diverse   — 3 parallel variants (cool/balanced/hot) → fuse_dedupe
                aggregator. Cost ~3x, value: angle diversity.
    deep      — 1 variant on Pro + HIGH reasoning. Cost ~15x — opt-in.
    mece      — 1 variant + MECE validator pass + 2 retries on overlap.

Future strategies (research, devils_advocate) plug in here without
expander.py changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from config import MODEL_FLASH, MODEL_LITE, MODEL_PRO


AggregatorMode = Literal["best_of_n", "fuse_dedupe", "weighted_blend"]


@dataclass(frozen=True)
class GenerationVariant:
    """
    One Gemini call configuration. Composes ON TOP of the per-depth
    STAGE_CONFIG so most fields are optional overrides; specify only
    what diverges from the stage default.

    Notes on fields:
    - `model`: full model id (`gemini-3-flash-preview`, etc.). When None,
      use the depth-resolved stage's model.
    - `temperature_delta`: applied to the stage's base temp; clamped to
      [0.05, 0.95] before the call. Lets diverse cool/hot variants coexist
      with the depth-temp curve without hardcoding absolute values.
    - `reasoning`: when set, overrides STAGE_CONFIG[stage].reasoning. Use
      "high" for deep variants on Pro.
    - `count_factor`: multiplier on the layer's count_range result. Diverse
      asks for 1.5x children so the dedupe survivor pool hits the floor.
    - `prompt_addon_key`: which `_MODE_PROMPT_ADDON` block (in expander.py)
      to inject. Mirrors Phase 2's mode → prompt mapping.
    - `weight`: relative aggregation weight when this variant is in a
      multi-variant strategy. Higher = more children of this variant
      survive the dedupe phase.
    """

    label: str
    model: Optional[str] = None
    temperature_delta: float = 0.0
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    reasoning: Optional[str] = None
    candidate_count: int = 1
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    count_factor: float = 1.0
    prompt_addon_key: Optional[str] = None
    weight: float = 1.0


@dataclass(frozen=True)
class GenerationStrategy:
    """
    A named recipe: one or more variants + post-processing policy.
    """

    name: str
    description: str
    variants: tuple[GenerationVariant, ...]
    aggregator: AggregatorMode = "best_of_n"
    enable_mece_check: bool = False
    max_mece_retries: int = 0
    # Phase 3.2 hook — not used yet, reserved.
    enable_quality_rubric: bool = False


# ─── Registered strategies ──────────────────────────────────────────────────

STRATEGIES: dict[str, GenerationStrategy] = {
    "default": GenerationStrategy(
        name="default",
        description="Balanced single Flash call — Phase 0/1/2 baseline.",
        variants=(
            GenerationVariant(label="balanced"),
        ),
    ),

    "diverse": GenerationStrategy(
        name="diverse",
        description="3 parallel variants (cool/balanced/hot) → fuse_dedupe.",
        variants=(
            GenerationVariant(
                label="cool",
                temperature_delta=-0.15,
                top_p=0.85,
                # presence/frequency_penalty 제거: Gemini 3 Flash가 미지원
                # ("Penalty is not enabled for this model" 400). 다양성은
                # temperature/top_p + 프롬프트로 확보.
                prompt_addon_key="diverse",
                weight=1.0,
            ),
            GenerationVariant(
                label="balanced",
                temperature_delta=+0.10,
                top_p=0.92,
                count_factor=1.3,
                prompt_addon_key="diverse",
                weight=1.2,  # the workhorse variant
            ),
            GenerationVariant(
                label="hot",
                temperature_delta=+0.30,
                top_p=0.97,
                count_factor=1.5,
                # presence/frequency_penalty 제거: 동일 사유.
                prompt_addon_key="diverse",
                weight=0.9,
            ),
        ),
        aggregator="fuse_dedupe",
    ),

    "deep": GenerationStrategy(
        name="deep",
        description="Pro + HIGH reasoning, single thoughtful call.",
        variants=(
            GenerationVariant(
                label="pro_reasoning",
                model=MODEL_PRO,
                temperature_delta=-0.20,
                reasoning="high",
                prompt_addon_key="deep",
            ),
        ),
    ),

    "mece": GenerationStrategy(
        name="mece",
        description="Strict non-overlap with secondary verifier pass.",
        variants=(
            GenerationVariant(
                label="structured",
                temperature_delta=-0.20,
                top_p=0.85,
                prompt_addon_key="mece",
            ),
        ),
        enable_mece_check=True,
        max_mece_retries=1,
    ),
}


# Keep referenced so static analysis doesn't drop them (they appear in
# strategy variants above; this is just to silence "unused import" hints
# if a future variant pulls model_lite / model_flash explicitly).
_REFERENCED_MODELS = (MODEL_FLASH, MODEL_LITE, MODEL_PRO)


def get_strategy(mode: Optional[str]) -> GenerationStrategy:
    """Resolve `expansion_mode` → strategy. Unknown / None → default."""
    if mode and mode in STRATEGIES:
        return STRATEGIES[mode]
    return STRATEGIES["default"]


# Avoid `_REFERENCED_MODELS` flagged as unused
_ = field, _REFERENCED_MODELS
