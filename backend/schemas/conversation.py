"""
Conversation Schema for Smart Question Flow.
Manages multi-turn conversation state for DNA collection.
"""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from schemas.context_vector import ContextVector


class ConversationMessage(BaseModel):
    """Single message in conversation history."""
    role: Literal["user", "assistant"]
    content: str
    question_type: Optional[str] = None  # "target", "edge", "objective", "identity"


class SmartClassifyRequest(BaseModel):
    """Request for smart classification with conversation context."""
    user_input: str = Field(..., description="Current user input", max_length=1000)
    user_language: str = Field(default="Korean", description="Target language")
    turn_number: int = Field(default=1, ge=1, le=3, description="Current turn (1-3)")
    intent_mode: str = Field(
        default="creation", 
        description="User's intent mode: creation, diagnosis, choice, strategy"
    )
    conversation_history: List[ConversationMessage] = Field(
        default_factory=list,
        description="Previous conversation messages"
    )


class SmartClassifyResponse(BaseModel):
    """Response from smart classification."""
    
    # DNA 상태
    dna_quality_score: int = Field(..., ge=0, le=100, description="DNA completeness score")
    context_vector: Optional[ContextVector] = Field(None, description="Extracted/accumulated DNA")
    
    # 다음 액션
    action: Literal["ask_question", "generate", "fill_and_generate"] = Field(
        ..., 
        description="Next action: ask another question, generate directly, or fill missing and generate"
    )
    
    # 질문 (action == "ask_question")
    question: Optional[str] = Field(None, description="Next question to ask user")
    question_type: Optional[str] = Field(None, description="Type of info being asked")
    question_persona: Optional[str] = Field(None, description="AI persona used for question")
    question_examples: Optional[str] = Field(None, description="Example answers to guide user")
    
    # 생성 준비 (action == "generate" or "fill_and_generate")
    selected_framework_id: Optional[str] = Field(None, description="Auto-selected framework")
    fill_in_message: Optional[str] = Field(
        None, 
        description="Message shown when auto-filling missing info"
    )
    
    # L1 템플릿 (Intent별 맞춤형 L1 노드 - Skeleton 대체)
    l1_labels: Optional[List[dict]] = Field(
        None,
        description="L1 node labels from Intent-specific template: [{label, display}, ...]"
    )
    
    # 디버깅
    reasoning_log: Optional[str] = Field(None, description="Internal reasoning for debugging")

