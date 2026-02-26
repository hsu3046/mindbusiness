"""
Node Expander using Gemini Flash.
Dynamically expands nodes based on context and employs hybrid expansion strategy.
Enhanced with Layer Definition, Sibling Context, and Smart Count Control.
"""

import json
import random
from uuid import uuid4
from pathlib import Path
from typing import Optional, Tuple
from google import genai
from google.genai import types

import config
from config import GEMINI_API_KEY, MODEL_GENERATION
from schemas.expand_schema import ExpandRequest, ExpandResponse
from lib.json_utils import safe_json_parse


# Hard depth limit (L4 is maximum)
MAX_DEPTH = 4

# Framework nesting limit
MAX_FRAMEWORK_NESTING = 2

# Maximum retry for insufficient children
MAX_RETRY = 1


class NodeExpander:
    """
    Expands individual nodes using Hybrid Expansion Engine.
    Features:
    - Layer Definition (Classification/Diagnosis/Action)
    - Sibling Context (MECE)
    - Parent Sibling Context (broader context)
    - Smart Count Control (random within range, add mode)
    """
    
    def __init__(self):
        """Initialize expander with Gemini client and load prompts."""
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
        
        # Load system prompt
        prompt_path = Path(__file__).parent.parent / "prompts" / "system_expander.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()
        
        # Load layer definitions
        layer_def_path = Path(__file__).parent.parent / "prompts" / "layer_definitions.json"
        with open(layer_def_path, "r", encoding="utf-8") as f:
            self.layer_definitions = json.load(f)
        
        # Load framework templates (for framework expansion)
        template_path = Path(__file__).parent.parent / "prompts" / "framework_templates.json"
        with open(template_path, "r", encoding="utf-8") as f:
            self.templates = json.load(f)
    
    def _get_client(self, api_key: Optional[str] = None):
        """Get genai client, with optional API key override."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self.client:
            return self.client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")
    
    async def expand_node(self, request: ExpandRequest, api_key: Optional[str] = None) -> dict:
        """
        Expand a single node based on context.
        
        Args:
            request: ExpandRequest containing context_path, target_node, sibling info, etc.
        
        Returns:
            Dictionary containing expansion results
        """
        try:
            # Override client if api_key provided
            original_client = self.client
            if api_key:
                self.client = self._get_client(api_key)
            elif not self.client:
                self.client = self._get_client()
            
            # 1. Check depth limit (L4 is max)
            if request.current_depth >= MAX_DEPTH:
                raise ValueError(f"Maximum depth (L{MAX_DEPTH}) reached. Cannot expand further.")
            
            # 2. Calculate how many children to generate
            generate_count = self._calculate_generate_count(
                request.current_depth,
                len(request.existing_children)
            )
            
            if generate_count <= 0:
                raise ValueError("Maximum children for this node reached.")
            
            # 3. Check framework nesting limit
            force_logic_tree = self._check_nesting_limit(request.used_frameworks)
            
            # 4. Build full prompt with all context
            full_prompt = self._build_full_prompt(request, generate_count, force_logic_tree)
            
            # 5. Call Gemini Flash
            response = await self.client.aio.models.generate_content(
                model=MODEL_GENERATION,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.6,
                )
            )
            
            # 6. Parse and validate
            json_str = response.text
            data = safe_json_parse(json_str)
            children = data.get("children", [])
            
            # 7. Post-process: adjust count
            children = self._adjust_children_count(
                children, 
                generate_count, 
                request, 
                force_logic_tree
            )
            data["children"] = children
            
            # 8. Regenerate unique IDs
            parent_prefix = request.target_node_label.replace(" ", "_")[:15]
            for i, child in enumerate(children):
                child["id"] = f"{parent_prefix}_{uuid4().hex[:8]}"
            
            # Validate with Pydantic
            validated_result = ExpandResponse.model_validate(data)
            
            return validated_result.model_dump()
        
        except json.JSONDecodeError as e:
            print(f"JSON parsing error: {e}")
            print(f"Raw response: {response.text if 'response' in locals() else 'N/A'}")
            return self._error_response(str(e))
        
        except ValueError as e:
            # Depth limit or capacity errors
            print(f"Validation error: {e}")
            return self._error_response(str(e))
        
        except Exception as e:
            print(f"Error in Expander: {e}")
            return self._error_response(str(e))
        finally:
            if api_key and original_client is not None:
                self.client = original_client
    
    def _calculate_generate_count(self, current_depth: int, existing_count: int) -> int:
        """
        Calculate how many children to generate.
        
        First expansion: use count_range
        Add expansion: 1 to remaining capacity
        """
        layer_key = f"L{current_depth}_to_L{current_depth + 1}"
        definition = self.layer_definitions.get(layer_key)
        
        if not definition:
            # Fallback for unexpected depth
            return 3
        
        max_children = definition.get("max_children", 5)
        remaining = max_children - existing_count
        
        if remaining <= 0:
            return 0
        
        if existing_count == 0:
            # First expansion: use count_range
            min_count, max_count = definition.get("count_range", [3, 5])
            return random.randint(min_count, min(max_count, remaining))
        else:
            # Add expansion: 1 to remaining
            min_per_request = definition.get("min_per_request", 1)
            return random.randint(min_per_request, remaining)
    
    def _get_layer_definition(self, current_depth: int) -> dict:
        """Get layer definition for current depth transition."""
        layer_key = f"L{current_depth}_to_L{current_depth + 1}"
        return self.layer_definitions.get(layer_key, {})
    
    def _build_full_prompt(
        self, 
        request: ExpandRequest, 
        generate_count: int,
        force_logic_tree: bool
    ) -> str:
        """Build complete prompt with all context."""
        
        path_str = " > ".join(request.context_path)
        layer_def = self._get_layer_definition(request.current_depth)
        
        # Build sibling context
        sibling_section = ""
        if request.sibling_labels:
            sibling_list = "\n".join([f"- {s}" for s in request.sibling_labels])
            sibling_section = f"""
[SIBLING CONTEXT]
Other nodes at the same level (MUST avoid overlap with their children):
{sibling_list}
"""
        
        # Build parent sibling context
        parent_sibling_section = ""
        if request.parent_sibling_labels:
            parent_sibling_list = "\n".join([f"- {s}" for s in request.parent_sibling_labels])
            sibling_section = f"""
[PARENT SIBLING CONTEXT]
The parent node's siblings (for broader context):
{parent_sibling_list}
Focus: This expansion is specifically about "{request.target_node_label}", not about the above siblings.
"""
        
        # Build existing children context (for add mode)
        existing_section = ""
        if request.existing_children:
            existing_list = "\n".join([f"- {c}" for c in request.existing_children])
            existing_section = f"""
[EXISTING CHILDREN - DO NOT DUPLICATE]
The following children already exist:
{existing_list}
Generate NEW children that are DIFFERENT from the above.
"""
        
        # Build layer definition section
        layer_section = ""
        if layer_def:
            layer_section = f"""
[LAYER DEFINITION]
Role: {layer_def.get('role', 'Analysis')}
Rule: {layer_def.get('rule', 'Generate relevant sub-items.')}
Format: {layer_def.get('format', 'Short phrases')}
"""
        
        # Build force instruction
        force_instruction = self._build_force_instruction(
            request.force_framework, 
            force_logic_tree
        )
        
        return f"""{self.system_prompt}

[TARGET LANGUAGE]
{request.language}

[CONTEXT INFO]
- Root Topic: {request.topic}
- Current Path: {path_str}
- Target Node: {request.target_node_label}
- Current Depth: L{request.current_depth} → L{request.current_depth + 1}
{sibling_section}
{parent_sibling_section}
{existing_section}
{layer_section}
[CONSTRAINTS]
- Generate exactly {generate_count} children (no more, no less)
- Current Framework: {request.current_framework_id}
- Used Frameworks in Path: {', '.join(request.used_frameworks) if request.used_frameworks else 'None'}
{force_instruction}

Expand the target node "{request.target_node_label}" now.
"""
    
    def _adjust_children_count(
        self, 
        children: list, 
        target_count: int,
        request: ExpandRequest,
        force_logic_tree: bool
    ) -> list:
        """
        Adjust children count to match target.
        - Too many: truncate
        - Too few: retry once
        """
        if len(children) >= target_count:
            return children[:target_count]
        
        # Too few - retry once (sync call for simplicity)
        # In production, this could be async
        print(f"Insufficient children ({len(children)}/{target_count}), keeping as-is after retry limit")
        return children
    
    def _check_nesting_limit(self, used_frameworks: list) -> bool:
        """
        Check if framework nesting limit is reached.
        
        Returns:
            bool: True if should force Logic Tree mode
        """
        non_cause_frameworks = [fw for fw in used_frameworks if fw != "CAUSE"]
        
        if len(non_cause_frameworks) >= MAX_FRAMEWORK_NESTING:
            return True
        
        return False
    
    def _build_force_instruction(self, force_framework: Optional[str], force_logic: bool) -> str:
        """Build instruction for forced expansion mode."""
        if force_logic:
            return """
[FORCED MODE]
You MUST use Logic Tree expansion only.
DO NOT apply any framework structure (PERSONA, SWOT, etc.)
"""
        
        if force_framework:
            return f"""
[USER REQUESTED FRAMEWORK]
User explicitly requested: {force_framework}
Try your best to apply it. If truly impossible, suggest alternative in response.
"""
        
        return ""
    
    def _error_response(self, error_detail: str) -> dict:
        """Generate error response."""
        return {
            "children": [],
            "applied_framework_id": None,
            "expansion_mode": "error",
            "confidence_score": 0.0,
            "alternative_framework": None,
            "error": error_detail
        }
