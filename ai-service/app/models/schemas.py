"""Pydantic request/response contracts shared across routers.

Kept in one module so the Next.js `lib/ai.ts` client and this service stay in
sync by inspection — the field names here are mirrored 1:1 on the TS side.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

AttemptResult = Literal["CORRECT", "PARTIAL", "INCORRECT"]

CardType = Literal["CLOZE", "SENTENCE_PRODUCTION", "GRAMMAR_QA", "ERROR_CORRECTION", "VOCAB"]


# ---------- /generate/cards ----------


class GenerateCardsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    raw_markdown: str = Field(..., alias="rawMarkdown")
    source_document_title: str = Field(..., alias="sourceDocumentTitle")


class GeneratedCard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: CardType
    topic_name: str = Field(..., alias="topicName")
    topic_pattern: Optional[str] = Field(None, alias="topicPattern")
    prompt: str
    answer: str
    explanation: Optional[str] = None
    hints: list[str] = []
    source_text: Optional[str] = Field(None, alias="sourceText")


class GenerateCardsResponse(BaseModel):
    cards: list[GeneratedCard]


# ---------- /tutor/evaluate ----------


class EvaluateAnswerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    card_prompt: str = Field(..., alias="cardPrompt")
    expected_answer: str = Field(..., alias="expectedAnswer")
    user_answer: str = Field(..., alias="userAnswer")
    grammar_pattern: Optional[str] = Field(None, alias="grammarPattern")
    explanation: Optional[str] = None


class EvaluateAnswerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    result: AttemptResult
    feedback: str
    # validation_alias accepts errorTags from the model's JSON; serialization_alias
    # makes FastAPI emit errorTags back to lib/ai.ts, which expects camelCase.
    error_tags: list[str] = Field(
        default_factory=list,
        validation_alias="errorTags",
        serialization_alias="errorTags",
    )
    difficulty: float  # 0..1, fed into the Leitner scheduler blend


# ---------- /tutor/chat ----------


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TutorChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    topic_name: str = Field(..., alias="topicName")
    topic_pattern: Optional[str] = Field(None, alias="topicPattern")
    history: list[ChatMessage] = []
    user_message: str = Field(..., alias="userMessage")


class TutorChatResponse(BaseModel):
    reply: str
    mastered: bool = False  # AI signals when it's confident the user has this pattern down
