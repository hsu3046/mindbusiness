"""
Report Generator using Gemini Flash with streaming.
Generates professional business proposals based on mindmap data.
"""

import json
from pathlib import Path
from typing import AsyncGenerator, Optional
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, MODEL_REPORT, FRAMEWORK_DB


class ReportGenerator:
    """
    Generates professional business reports from mindmap data.
    Uses Gemini streaming for real-time output via SSE.
    """

    def __init__(self):
        """Initialize with Gemini client and load system prompt."""
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

        prompt_path = Path(__file__).parent.parent / "prompts" / "system_report.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()

    def _flatten_tree(self, node: dict, depth: int = 0) -> str:
        """
        Convert mindmap tree to readable text for the prompt.
        Uses indentation to show hierarchy.
        """
        indent = "  " * depth
        label = node.get("label", "")
        desc = node.get("description", "")

        line = f"{indent}- {label}"
        if desc:
            line += f" ({desc})"

        lines = [line]
        for child in node.get("children", []):
            lines.append(self._flatten_tree(child, depth + 1))

        return "\n".join(lines)

    def _build_prompt(
        self,
        topic: str,
        framework_id: str,
        mindmap_tree: dict,
        language: str
    ) -> str:
        """Build the full prompt with system prompt + user context."""
        # Get framework display name
        framework_info = FRAMEWORK_DB.get(framework_id, {})
        framework_name = framework_info.get("name", framework_id)

        # Flatten mindmap tree to readable text
        tree_text = self._flatten_tree(mindmap_tree)

        # Also include raw JSON for precise reference
        tree_json = json.dumps(mindmap_tree, ensure_ascii=False, indent=2)

        return f"""{self.system_prompt}

---

[TOPIC]
{topic}

[FRAMEWORK]
{framework_id}

[FRAMEWORK_NAME]
{framework_name}

[LANGUAGE]
{language}

[MINDMAP_TREE - Readable Format]
{tree_text}

[MINDMAP_TREE - JSON]
{tree_json}

---

Now generate the professional business proposal in Markdown format.
"""

    def _get_client(self, api_key: Optional[str] = None):
        """Get genai client, with optional API key override."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self.client:
            return self.client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")
    
    async def generate_report_stream(
        self,
        topic: str,
        framework_id: str,
        mindmap_tree: dict,
        language: str = "Korean",
        api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream report generation using Gemini.
        Yields text chunks as they arrive.

        Args:
            topic: Business topic
            framework_id: Framework used (e.g., "LEAN", "BMC")
            mindmap_tree: Complete mindmap tree as dict
            language: Target language

        Yields:
            Text chunks of the generated report
        """
        prompt = self._build_prompt(topic, framework_id, mindmap_tree, language)

        client = self._get_client(api_key)
        async for chunk in await client.aio.models.generate_content_stream(
            model=MODEL_REPORT,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,  # Slightly creative for proposal writing
            )
        ):
            if chunk.text:
                yield chunk.text
