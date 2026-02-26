"""
Mindmap Generator using Gemini Flash.
Generates structured mindmaps based on business frameworks.
Supports parallel L1 generation using Context Vector (DNA).
"""

import json
import asyncio
import random
from pathlib import Path
from typing import Optional, List, Dict
from google import genai
from google.genai import types

import config
from config import GEMINI_API_KEY, MODEL_GENERATION
from schemas.mindmap_schema import MindmapResponse, MindmapNode
from schemas.context_vector import ContextVector
from lib.json_utils import safe_json_parse


class MindmapGenerator:
    """
    Generates mindmap skeleton using Gemini Flash model.
    Supports two modes:
    1. Legacy: Single API call for entire mindmap
    2. Parallel: DNA-based parallel L1 generation
    """
    
    def __init__(self):
        """Initialize generator with Gemini client and load templates."""
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
        
        # Load framework templates
        template_path = Path(__file__).parent.parent / "prompts" / "framework_templates.json"
        with open(template_path, "r", encoding="utf-8") as f:
            self.templates = json.load(f)
        
        # Load system prompts
        prompt_path = Path(__file__).parent.parent / "prompts" / "system_generator.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()
        
        # Load L1-specific prompt for parallel mode
        l1_prompt_path = Path(__file__).parent.parent / "prompts" / "system_generator_l1.txt"
        with open(l1_prompt_path, "r", encoding="utf-8") as f:
            self.l1_prompt_template = f.read()
    
    def _get_client(self, api_key: Optional[str] = None):
        """Get genai client, with optional API key override."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self.client:
            return self.client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")
    
    async def generate_map(
        self,
        topic: str,
        framework_id: str,
        language: str = "Korean",
        context_vector: Optional[ContextVector] = None,
        intent_mode: str = "creation",
        api_key: Optional[str] = None
    ) -> dict:
        """
        Generate a complete mindmap structure.
        
        If context_vector is provided, uses parallel generation mode.
        Otherwise, falls back to legacy single-call mode.
        
        Args:
            topic: Central topic (e.g., "성남시 카페 창업")
            framework_id: Framework to use (e.g., "BMC", "LEAN")
            language: Target language ("Korean", "English", "Japanese")
            context_vector: Business DNA for parallel generation (optional)
            intent_mode: User's intent (creation, diagnosis, choice, strategy)
        
        Returns:
            Dictionary containing validated mindmap data
        """
        try:
            # Override client if api_key provided
            original_client = self.client
            if api_key:
                self.client = self._get_client(api_key)
            elif not self.client:
                self.client = self._get_client()
            
            # Build template key: {FRAMEWORK}_{INTENT} (e.g., LEAN_CREATION)
            intent_suffix = intent_mode.upper()
            template_key = f"{framework_id}_{intent_suffix}"
            
            # Get framework structure from templates
            framework_data = self.templates.get(template_key)
            
            # Fallback: try creation intent if specific intent not found
            if not framework_data and intent_mode != "creation":
                template_key = f"{framework_id}_CREATION"
                framework_data = self.templates.get(template_key)
                print(f"⚠️ Template fallback: {framework_id}_{intent_suffix} → {template_key}")
            
            if not framework_data:
                raise ValueError(
                    f"Unknown Template Key: {template_key}. "
                    f"Available: {', '.join(self.templates.keys())}"
                )
            
            # Get language-specific labels
            raw_labels = framework_data.get(language, framework_data.get("Korean"))
            if not raw_labels:
                raise ValueError(
                    f"No template found for language: {language} in framework: {framework_id}"
                )
            
            # Handle new label/display structure (Korean) vs simple string (other languages)
            if isinstance(raw_labels[0], dict):
                # New structure: [{"label": ..., "display": ...}, ...]
                l1_labels = [item["label"] for item in raw_labels]  # AI 프롬프트용
                l1_displays = [item["display"] for item in raw_labels]  # 유저 표시용
            else:
                # Legacy structure: ["label1", "label2", ...]
                l1_labels = raw_labels
                l1_displays = raw_labels
            
            # Route to appropriate generation mode
            if context_vector:
                return await self._generate_parallel(
                    topic, framework_id, l1_labels, l1_displays, language, context_vector
                )
            else:
                return await self._generate_legacy(
                    topic, framework_id, l1_labels, l1_displays, language
                )
        
        except Exception as e:
            print(f"Error in Generator: {e}")
            return self._error_response(framework_id, str(e))
        finally:
            if api_key and original_client is not None:
                self.client = original_client
    
    async def _generate_parallel(
        self,
        topic: str,
        framework_id: str,
        l1_labels: List[str],
        l1_displays: List[str],
        language: str,
        context_vector: ContextVector
    ) -> dict:
        """
        Parallel generation mode using Context Vector (DNA).
        Spawns N parallel tasks for N L1 categories.
        
        l1_labels: AI 프롬프트에 사용되는 정식 명칭
        l1_displays: 유저에게 표시되는 쉬운 말
        """
        # Pre-determine L2 counts for each L1 (3~5 random)
        expected_l2_counts: Dict[str, int] = {}
        l2_counts: List[int] = []
        for i in range(len(l1_labels)):
            count = random.randint(3, 5)
            l2_counts.append(count)
            expected_l2_counts[f"node_{i+1}"] = count
        
        # Create tasks for parallel execution (AI에게는 label 전달 + L2 개수)
        tasks = [
            self._generate_l1_branch(
                l1_label, l1_displays[i], i, language, context_vector, l2_counts[i]
            )
            for i, l1_label in enumerate(l1_labels)
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Assemble L1 nodes (handle failures gracefully)
        l1_nodes = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Create placeholder for failed L1 (display 사용)
                l1_nodes.append({
                    "id": f"node_{i+1}",
                    "label": l1_displays[i],
                    "type": "main_branch",
                    "description": f"생성 중 오류 발생: {str(result)}",
                    "importance": 2,
                    "children": []
                })
            else:
                l1_nodes.append(result)
        
        # Build root node
        root_node = {
            "id": "root",
            "label": topic,
            "type": "root",
            "description": context_vector.summary,
            "importance": 5,
            "children": l1_nodes
        }
        
        # Count total nodes
        total_nodes = 1 + sum(
            1 + len(node.get("children", [])) 
            for node in l1_nodes
        )
        
        return {
            "root_node": root_node,
            "framework_id": framework_id,
            "total_nodes": total_nodes,
            "expected_l2_counts": expected_l2_counts
        }
    
    async def _generate_l1_branch(
        self,
        l1_label: str,
        l1_display: str,
        index: int,
        language: str,
        context_vector: ContextVector,
        l2_count: int = 4
    ) -> dict:
        """
        Generate single L1 node with its L2 children.
        Called in parallel for each L1 category.
        
        l1_label: AI 프롬프트에 사용되는 정식 명칭
        l1_display: 유저에게 표시되는 쉬운 말
        l2_count: 생성할 L2 노드 개수 (미리 결정됨)
        """
        # Format L1 prompt with context (AI에게는 label 전달 + L2 개수 지정)
        formatted_prompt = self.l1_prompt_template.replace(
            "{summary}", context_vector.summary
        ).replace(
            "{target}", context_vector.target
        ).replace(
            "{edge}", context_vector.edge
        ).replace(
            "{objective}", context_vector.objective
        ).replace(
            "{l1_label}", l1_label  # AI 프롬프트에는 정식 명칭
        ).replace(
            "{target_language}", language
        )
        
        # Add L2 count instruction
        formatted_prompt += f"\n\n[IMPORTANT] Generate exactly {l2_count} children nodes. No more, no less."
        
        # Call Gemini Flash
        response = await self.client.aio.models.generate_content(
            model=MODEL_GENERATION,
            contents=formatted_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4,
            )
        )
        
        # Parse response
        data = safe_json_parse(response.text)
        children = data.get("children", [])
        
        # Ensure exactly l2_count children (trim or pad)
        if len(children) > l2_count:
            children = children[:l2_count]
        elif len(children) < l2_count:
            # Pad with placeholder children if AI returned fewer
            for k in range(len(children), l2_count):
                children.append({
                    "label": f"항목 {k+1}",
                    "type": "sub_branch",
                    "description": "세부 항목",
                    "importance": 2
                })
        
        # Build L1 node (유저에게는 display 표시)
        return {
            "id": f"node_{index+1}",
            "label": l1_display,  # 유저에게는 쉬운 말
            "type": "main_branch",
            "description": f"{l1_display} 관련 전략 및 세부 항목",
            "importance": 3,
            "children": [
                {
                    **child,
                    "id": f"node_{index+1}_{j+1}"
                }
                for j, child in enumerate(children)
            ]
        }
    
    async def _generate_legacy(
        self,
        topic: str,
        framework_id: str,
        l1_labels: List[str],
        l1_displays: List[str],
        language: str
    ) -> dict:
        """
        Legacy single-call generation mode.
        Used when context_vector is not provided.
        
        Note: Legacy mode에서는 AI가 label로 생성하고, 
        후처리로 label → display 매핑이 필요할 수 있음.
        현재는 display를 직접 사용 (AI가 display로 생성하도록)
        """
        # Legacy 모드에서는 display를 AI에게 직접 전달
        structure_str = ", ".join(l1_displays)
        
        full_prompt = f"""{self.system_prompt}

[TARGET LANGUAGE]
{language}

[INPUT TOPIC]
{topic}

[FRAMEWORK STRUCTURE RULE]
The mindmap MUST strictly follow the '{framework_id}' framework structure.
You must use the exact labels below as Level 1 Nodes (main_branch).

**Level 1 Nodes List:**
{structure_str}

Generate the complete JSON mindmap now.
"""
        
        response = await self.client.aio.models.generate_content(
            model=MODEL_GENERATION,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4,
            )
        )
        
        data = safe_json_parse(response.text)
        validated_result = MindmapResponse.model_validate(data)
        
        return validated_result.model_dump()
    
    def _error_response(self, framework_id: str, error_detail: str) -> dict:
        """Generate error response matching MindmapResponse schema."""
        return {
            "root_node": {
                "id": "root",
                "label": "Error occurred",
                "type": "root",
                "description": f"Failed to generate mindmap: {error_detail}",
                "children": []
            },
            "framework_id": framework_id,
            "total_nodes": 1
        }
    
    def count_nodes(self, node: MindmapNode) -> int:
        """Recursively count total nodes in the tree."""
        count = 1
        for child in node.children:
            count += self.count_nodes(child)
        return count
