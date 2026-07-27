from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    EvaluateAnswerRequest,
    EvaluateAnswerResponse,
    TutorChatRequest,
    TutorChatResponse,
)
from app.services.tutor import evaluate_answer
from app.services.tutor_chat import chat_turn

router = APIRouter()


@router.post("/evaluate", response_model=EvaluateAnswerResponse, response_model_by_alias=True)
def evaluate(req: EvaluateAnswerRequest):
    try:
        return evaluate_answer(req)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Evaluation failed: {e}") from e


@router.post("/chat", response_model=TutorChatResponse)
def chat(req: TutorChatRequest):
    try:
        return chat_turn(req)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Tutor chat failed: {e}") from e
