"""
JSON parsing utilities with error recovery.
Handles malformed AI-generated JSON responses.
"""

import json
import re
from typing import Any, Dict


def safe_json_parse(json_str: str) -> Dict[str, Any]:
    """
    Parse JSON with automatic error recovery.
    
    Handles common AI-generated JSON errors:
    - Comments (// ... or /* ... */)
    - Trailing commas
    - Unquoted keys
    - Extra text before/after JSON
    
    Args:
        json_str: JSON string (possibly malformed)
    
    Returns:
        Parsed dictionary
    
    Raises:
        ValueError: If all recovery attempts fail
    
    Examples:
        >>> safe_json_parse('{"label": "Test",}')  # trailing comma
        {'label': 'Test'}
        
        >>> safe_json_parse('// comment\\n{"label": "Test"}')  # comment
        {'label': 'Test'}
    """
    # Step 1: Standard parsing
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass
    
    # Step 2: Remove comments
    try:
        # Single-line comments: // ...
        cleaned = re.sub(r'//.*?$', '', json_str, flags=re.MULTILINE)
        # Multi-line comments: /* ... */
        cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # Step 3: Remove trailing commas
    try:
        # Before closing bracket/brace: , }  or  , ]
        cleaned = re.sub(r',(\s*[}\]])', r'\1', json_str)
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # Step 4: Extract JSON from text
    try:
        # Find first { or [ and last } or ]
        start = min(
            (json_str.find('{') if '{' in json_str else len(json_str)),
            (json_str.find('[') if '[' in json_str else len(json_str))
        )
        end = max(
            (json_str.rfind('}') if '}' in json_str else -1),
            (json_str.rfind(']') if ']' in json_str else -1)
        )
        
        if start < len(json_str) and end > 0:
            extracted = json_str[start:end+1]
            return json.loads(extracted)
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Step 5: Try dirty-json as last resort (optional dependency)
    try:
        import dirty_json
        return dirty_json.loads(json_str)
    except (ImportError, Exception):
        pass
    
    # All attempts failed
    raise ValueError(
        f"Failed to parse JSON after all recovery attempts. "
        f"First 200 chars: {json_str[:200]}"
    )


def extract_number_from_text(text: str) -> int:
    """
    Extract integer from Korean/Japanese/English text with units.
    
    Examples:
        >>> extract_number_from_text("5천만원")
        50000000
        >>> extract_number_from_text("50,000,000원")
        50000000
        >>> extract_number_from_text("3億円")
        300000000
    """
    if isinstance(text, (int, float)):
        return int(text)
    
    text = str(text)
    
    # Korean units
    text = text.replace('조', '0000000000')  # 1조 = 10^12
    text = text.replace('억', '00000000')    # 1억 = 10^8
    text = text.replace('만', '0000')        # 1만 = 10^4
    text = text.replace('천', '000')         # 1천 = 10^3
    
    # Japanese units
    text = text.replace('兆', '0000000000')  # 1兆 = 10^12
    text = text.replace('億', '00000000')    # 1億 = 10^8
    text = text.replace('万', '0000')        # 1万 = 10^4
    text = text.replace('千', '000')         # 1千 = 10^3
    
    # English units (M, K)
    if 'M' in text or 'm' in text:
        text = text.replace('M', '000000').replace('m', '000000')
    if 'K' in text or 'k' in text:
        text = text.replace('K', '000').replace('k', '000')
    
    # Extract digits only
    cleaned = re.sub(r'[^\d]', '', text)
    
    if not cleaned:
        raise ValueError(f"No valid number found in: {text}")
    
    return int(cleaned)
