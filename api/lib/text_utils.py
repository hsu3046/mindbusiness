"""
Text utility functions for cleaning AI-generated content.
"""

import re


def strip_markdown(text: str) -> str:
    """
    Remove markdown formatting from text.
    
    Handles:
    - **bold** → bold
    - *italic* → italic
    - `code` → code
    - # headings → headings
    """
    if not text:
        return text
    
    # **bold** → bold
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    
    # *italic* → italic (but not if part of list)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', text)
    
    # `code` → code
    text = re.sub(r'`([^`]+)`', r'\1', text)
    
    # # heading → heading (remove heading markers)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    
    return text.strip()


def clean_ai_response(text: str) -> str:
    """
    Clean AI-generated response for user display.
    Applies strip_markdown and additional cleaning.
    """
    if not text:
        return text
    
    text = strip_markdown(text)
    
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    
    return text.strip()
