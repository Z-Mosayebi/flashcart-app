"""
Flashcart AI service.

FastAPI microservice that does the actual "AI engineering" work for the app:

  1. /generate/cards   — parse raw Notion grammar notes into structured flashcards
  2. /tutor/evaluate    — grade a free-text German answer against a target pattern,
                          give natural-language feedback, and estimate difficulty
                          for the Leitner scheduler
  3. /tutor/chat        — a conversational tutoring loop (ask -> answer -> follow-up)

Kept as a separate Python service (rather than doing this in Next.js API routes)
specifically to demonstrate a real polyglot AI engineering setup: TypeScript for
the product surface, Python for the model-facing logic, talking over a small
typed HTTP contract.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import generate, tutor

app = FastAPI(title="Flashcart AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed web app origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/generate", tags=["generate"])
app.include_router(tutor.router, prefix="/tutor", tags=["tutor"])


@app.get("/health")
def health():
    return {"status": "ok"}
