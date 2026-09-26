"""Pydantic request/response contracts shared across routers.

Kept in one module so the Next.js `lib/ai.ts` client and this service stay in
sync by inspection — the field names here are mirrored 1:1 on the TS side.
"""

import math
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AttemptResult = Literal["CORRECT", "PARTIAL", "INCORRECT"]

CardType = Literal["CLOZE", "SENTENCE_PRODUCTION", "GRAMMAR_QA", "ERROR_CORRECTION", "VOCAB"]

# Upper bounds on caller-supplied text. The web tier enforces the same limits;
# these stop an oversized request from turning into an oversized model bill.
MAX_ANSWER_CHARS = 2_000
MAX_NOTES_CHARS = 60_000
MAX_HISTORY_MESSAGES = 40


# ---------- /generate/cards ----------


class GenerateCardsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    raw_markdown: str = Field(..., alias="rawMarkdown", max_length=MAX_NOTES_CHARS)
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
    user_answer: str = Field(..., alias="userAnswer", max_length=MAX_ANSWER_CHARS)
    grammar_pattern: Optional[str] = Field(None, alias="grammarPattern")
    explanation: Optional[str] = None
    # False while a retry is still possible: the feedback must not give the
    # answer away. Defaults to True for callers that predate the retry.
    reveal_answer: bool = Field(True, alias="revealAnswer")


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
    # True when the learner said they don't know or forgot. The app then
    # skips the retry and shows the answer; the feedback teaches the rule.
    gave_up: bool = Field(default=False, validation_alias="gaveUp", serialization_alias="gaveUp")

    @field_validator("difficulty", mode="after")
    @classmethod
    def _clamp_difficulty(cls, v: float) -> float:
        # The model occasionally strays outside 0..1 (or returns NaN). Clamp
        # rather than reject: the grade itself is still usable, and a NaN
        # reaching the scheduler would produce an invalid due date.
        if not math.isfinite(v):
            return 0.5
        return min(max(v, 0.0), 1.0)


# ---------- /tutor/chat ----------


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TutorFocus(BaseModel):
    """The flashcard a learner just missed, when they open the tutor from it."""

    model_config = ConfigDict(populate_by_name=True)

    card_prompt: str = Field(..., alias="cardPrompt", max_length=MAX_ANSWER_CHARS)
    expected_answer: str = Field(..., alias="expectedAnswer", max_length=MAX_ANSWER_CHARS)
    learner_answer: Optional[str] = Field(None, alias="learnerAnswer", max_length=MAX_ANSWER_CHARS)
    feedback: Optional[str] = Field(None, max_length=MAX_ANSWER_CHARS)


class TutorChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    topic_name: str = Field(..., alias="topicName")
    topic_pattern: Optional[str] = Field(None, alias="topicPattern")
    history: list[ChatMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    user_message: str = Field(..., alias="userMessage", max_length=MAX_ANSWER_CHARS)
    focus: Optional[TutorFocus] = None


class VocabItem(BaseModel):
    term: str = Field(..., max_length=80)
    meaning: str = Field(..., max_length=120)


class TutorChatResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reply: str
    mastered: bool = False  # AI signals when it's confident the user has this pattern down
    # Guided sentence building. All optional: a reply without them still works.
    lesson: Optional[str] = None  # the rule, when a new sentence starts
    vocab: list[VocabItem] = Field(default_factory=list)  # key words for this sentence
    step: Optional[int] = None  # which building step this reply asks for
    total_steps: Optional[int] = Field(
        None, validation_alias="totalSteps", serialization_alias="totalSteps"
    )

    @field_validator("vocab", mode="before")
    @classmethod
    def _cap_vocab(cls, v):
        # A word list longer than a handful stops being a help.
        return v[:6] if isinstance(v, list) else []

    @model_validator(mode="after")
    def _valid_step(self):
        # A step outside 1..totalSteps would draw a broken progress bar: drop both.
        ok = (
            isinstance(self.step, int)
            and isinstance(self.total_steps, int)
            and 1 <= self.step <= self.total_steps <= 6
        )
        if not ok:
            self.step = None
            self.total_steps = None
        return self
