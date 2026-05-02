"""
Few-shot exemplar loader (Phase 2.3).

Inject 1-2 curated example expansions into the prompt so the model has a
concrete reference for the target STYLE + SPECIFICITY level. Avoids generic
boilerplate like "효율성", "최적화" by showing what good looks like.

Lookup priority (first hit wins):
    1. {framework}|{intent}|{layer}     — most specific
    2. {framework}|*|{layer}             — framework + layer
    3. {framework}|*|*                   — framework only
    4. default|*|{layer}                 — layer fallback
    5. default|*|*                       — global fallback (last resort)

Each exemplar is a dict { topic, target, children: [{label, description}] }.
The renderer formats them as a `[EXAMPLE EXPANSIONS]` prompt section.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Default location relative to this file: ../prompts/exemplars/expand_examples.json
_DEFAULT_PATH = (
    Path(__file__).parent.parent / "prompts" / "exemplars" / "expand_examples.json"
)


class ExemplarLoader:
    """Loads and looks up curated few-shot exemplars."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or _DEFAULT_PATH
        self._db: dict = {}
        self._load()

    def _load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                self._db = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Exemplar load failed at %s: %s", self.path, e)
            self._db = {}

    def lookup(
        self,
        *,
        framework: Optional[str],
        intent: Optional[str],
        target_layer: int,
        k: int = 2,
    ) -> list[dict]:
        """
        Return up to `k` exemplars matching (framework, intent, target_layer).

        Falls back through the priority list defined above. Empty list when
        no exemplars are available — caller renders nothing in that case.
        """
        fw = (framework or "default").upper()
        # framework key in JSON is uppercase or "default" — normalize defensively
        fw_key = fw if fw != "DEFAULT" else "default"
        intent_key = intent or "*"
        layer_key = str(target_layer)

        candidates_keys = [
            f"{fw_key}|{intent_key}|{layer_key}",
            f"{fw_key}|*|{layer_key}",
            f"{fw_key}|*|*",
            f"default|*|{layer_key}",
            f"default|*|*",
        ]

        for key in candidates_keys:
            entry = self._db.get(key)
            if entry:
                return list(entry)[:k]
        return []

    def render(self, exemplars: list[dict]) -> str:
        """
        Render exemplars as a prompt section. Empty input → empty string
        so the caller can interpolate without conditional logic.
        """
        if not exemplars:
            return ""

        lines: list[str] = [
            "\n[EXAMPLE EXPANSIONS — reference quality + specificity]",
            "Below are example expansions (style reference only — do NOT copy content).",
            "Your output must match this level of CONCRETENESS (real numbers, named",
            "tools, specific verbs) and AVOID generic words like '효율성', '최적화', '관리'.",
            "",
        ]

        for idx, ex in enumerate(exemplars, start=1):
            topic = ex.get("topic", "")
            target = ex.get("target", "")
            children = ex.get("children", [])

            lines.append(f"Example {idx}:")
            lines.append(f"  Topic: {topic}")
            lines.append(f"  Target: {target}")
            lines.append(f"  Good children:")
            for child in children:
                label = child.get("label", "")
                desc = child.get("description", "")
                lines.append(f"    - {label}")
                if desc:
                    lines.append(f"      ({desc})")
            lines.append("")

        return "\n".join(lines)


# Process-wide singleton
exemplar_loader = ExemplarLoader()
