"""
Turns raw grammar notes (one section of a learner's own document, including
Persian-language error annotations, vocab gap-fills, etc.) into structured
Leitner-ready flashcards.

Input is one section rather than a whole document: see sectioner.py, which
splits on the learner's own headings before anything reaches this module.

This is the "generate cards from raw notes" capability: instead of hand-authoring
cards, the model reads a whole page of loosely structured study notes and produces
a set of typed, gradeable cards — clustering related sentences under one grammar
topic, writing cloze deletions for vocab, and turning the "Grammatik & Fehler"
error log into ERROR_CORRECTION cards.
"""

import logging

from pydantic import ValidationError

from app.models.schemas import GeneratedCard, GenerateCardsResponse
from app.services.llm_client import ask_json

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a German-language curriculum designer building spaced-repetition \
flashcards from a language learner's raw study notes. The notes mix German \
grammar explanations, example sentences, vocabulary gap-fill drills, and a running log of the \
learner's own mistakes (sometimes annotated in Persian/Farsi since the learner is a Persian \
speaker learning German).

Your job: read the notes and produce a JSON array of flashcards that will genuinely test \
whether the learner has internalized each grammar pattern and vocabulary item — not just \
recognize it, but produce it correctly.

Card types to use:
- "SENTENCE_PRODUCTION": prompt gives a scenario or partial pattern (e.g. the formula for a \
  construction like "der Grund, weswegen ..."), the learner must write a full correct sentence. \
  Use this especially for grammar patterns/formulas found in the notes.
- "CLOZE": fill-in-the-blank using real vocabulary-in-context sentences from the notes.
- "GRAMMAR_QA": a direct question about a grammar rule stated in the notes (e.g. word order, \
  case usage), answerable in a sentence or two.
- "ERROR_CORRECTION": based on a documented mistake in the notes' error log — prompt gives the \
  INCORRECT form and asks the learner to produce the CORRECT form, explanation covers why.
- "VOCAB": term <-> meaning, only for vocabulary explicitly called out in the notes.

For every card:
- "topicName" should group related cards under a short human-readable grammar topic \
  (e.g. "weswegen relative clause", "aus + Dativ ... werden", "Anbindung an + Akkusativ").
- "topicPattern" is the abstract formula/structure if one exists in the notes (leave null if none).
- "answer" must be a single unambiguous correct answer (or the clearest canonical one if multiple \
  are valid) — this is used for later AI grading, so be precise.
- "explanation" is a short (1-3 sentence) grammar explanation, in English, that will be shown to \
  the learner AFTER they answer.
- "hints" is 0-2 short hint strings (not the answer itself).
- "sourceText" should quote the original sentence/snippet from the notes this card is based on, \
  if applicable.

Do not invent grammar rules not present in the notes. Do not translate the notes; use the German \
sentences and rules as given. Return ONLY a JSON array of card objects, no prose, no markdown fences.

Each object shape:
{
  "type": "SENTENCE_PRODUCTION" | "CLOZE" | "GRAMMAR_QA" | "ERROR_CORRECTION" | "VOCAB",
  "topicName": string,
  "topicPattern": string | null,
  "prompt": string,
  "answer": string,
  "explanation": string | null,
  "hints": string[],
  "sourceText": string | null
}
"""


def generate_cards_from_notes(raw_markdown: str, source_document_title: str) -> GenerateCardsResponse:
    user_prompt = f"""Source document: "{source_document_title}"

--- NOTES START ---
{raw_markdown}
--- NOTES END ---

Generate the flashcard set now. Aim for thorough coverage: every grammar rule, every documented \
mistake, every vocabulary item, and every example sentence in the notes should map to at least \
one card. Return the JSON array only."""

    # A 6k-character section asked for "thorough coverage" routinely needs more
    # than 4k output tokens; a truncated array used to lose the whole section.
    raw = ask_json(SYSTEM_PROMPT, user_prompt, max_tokens=8192)

    if isinstance(raw, dict) and "cards" in raw:
        raw = raw["cards"]
    if not isinstance(raw, list):
        raise ValueError("Model did not return a list of cards")

    # Validate card by card: one malformed card (an unknown type, a missing
    # answer) should cost that card, not every good card in the section.
    cards: list[GeneratedCard] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            cards.append(GeneratedCard(**item))
        except ValidationError as e:
            logger.warning("Skipping malformed generated card: %s", e.errors()[:1])

    if raw and not cards:
        raise ValueError("Model returned no valid cards")

    return GenerateCardsResponse(cards=cards)
