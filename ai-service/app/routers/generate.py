from fastapi import APIRouter, HTTPException

from app.models.schemas import GenerateCardsRequest, GenerateCardsResponse
from app.services.card_generator import generate_cards_from_notes

router = APIRouter()


@router.post("/cards", response_model=GenerateCardsResponse)
def generate_cards(req: GenerateCardsRequest):
    try:
        return generate_cards_from_notes(req.raw_markdown, req.source_document_title)
    except Exception as e:  # noqa: BLE001 - surface model/parsing errors to caller
        raise HTTPException(status_code=502, detail=f"Card generation failed: {e}") from e
