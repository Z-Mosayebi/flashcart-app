"""
Flashcart AI service.

FastAPI microservice holding all model-facing logic for the app:

  1. /generate/cards   — parse raw Notion grammar notes into structured flashcards
  2. /tutor/evaluate    — grade a free-text German answer against a target pattern,
                          give natural-language feedback, and estimate difficulty
                          for the Leitner scheduler
  3. /tutor/chat        — a conversational tutoring loop (ask -> answer -> follow-up)

Kept as a separate Python service rather than living in Next.js API routes so
prompt engineering stays in one focused, independently testable and separately
deployable place, talking to the web tier over a small typed HTTP contract.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load ai-service/.env before anything reads os.environ. Without this the API
# key in .env is silently ignored and every model call fails as "not set".
load_dotenv()

from app.routers import generate, tutor  # noqa: E402  (must follow load_dotenv)

app = FastAPI(title="Flashcart AI Service", version="1.0.0")

# Only the web app should be able to call this service. ALLOWED_ORIGINS is a
# comma-separated list; it falls back to localhost for development.
_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/generate", tags=["generate"])
app.include_router(tutor.router, prefix="/tutor", tags=["tutor"])


@app.get("/health")
def health():
    return {"status": "ok"}
