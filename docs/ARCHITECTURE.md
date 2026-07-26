# Architecture

```
Notion ("DW" page, grows over time)
   │  scheduled sync (GitHub Actions, daily)
   ▼
scripts/sync_notion.py ──────► ai-service (FastAPI) ──────► Postgres
   │ pulls page markdown           │ /generate/cards            │ SourceDocument
   │ diffs lastEditedTime          │ Claude parses raw notes     │ Topic
   └── skips unchanged pages       │ into structured cards       │ Card
                                   └──────────────────────────────┘

Next.js app (Vercel)
   │
   ├── /review        → ReviewSession component
   │                     GET /api/cards/due        (Leitner-ordered queue)
   │                     POST /api/review/submit    → ai-service /tutor/evaluate
   │                                                  → lib/leitner.ts scheduler
   │                                                  → upsert CardProgress + Attempt
   │
   └── /dashboard      → GET /api/dashboard          (box distribution, mastery %,
                                                       accuracy, recent mistakes)
```

## Why two services (Next.js + Python)

The product surface (pages, API routes, DB access via Prisma) is TypeScript/Next.js.
All AI-facing logic — prompt design, JSON-mode parsing, grading, conversational
tutoring — lives in a separate FastAPI service in Python. This isn't just a stylistic
choice: it keeps prompt engineering and model-facing code in one focused place,
independently testable (see `ai-service/tests/`) and independently deployable/scalable
from the web tier.

## The three AI capabilities

1. **Card generation** (`ai-service/app/services/card_generator.py`) — reads a whole
   raw Notion page (grammar rules, example sentences, vocab drills, even the
   Persian-language error annotations) and produces a structured, typed set of
   flashcards, clustering related content under shared grammar "topics." This is what
   lets the deck grow automatically as you add more to Notion, instead of hand-authoring
   every card.

2. **Tutoring evaluation** (`ai-service/app/services/tutor.py`) — grades free-text
   answers holistically (not exact string match — German allows real answer variation),
   gives specific feedback, tags the *kind* of mistake (word order, case, etc.), and
   estimates a per-answer difficulty score.

3. **Adaptive scheduling** (`web/lib/leitner.ts` + the difficulty score from #2) —
   classic 5-box Leitner spaced repetition, with review intervals scaled by the AI's
   difficulty estimate, so a card you technically got "correct" but visibly struggled
   with still comes back sooner than a trivially-correct one in the same box.

A fourth capability, `ai-service/app/services/tutor_chat.py` (`/tutor/chat`), runs a
true conversational loop — ask, grade, ask again with adjusted difficulty, declare
"mastered" only after several unprompted correct productions — for the "ask question,
give feedback until sure the user has learned it" requirement. It's wired at the API
level but not yet hooked into a chat UI (see README "Next steps").

## Data model

See `web/prisma/schema.prisma`. Key relationships:

- `SourceDocument` (one per synced Notion page) → `Topic` (grammar pattern) → `Card`
- `CardProgress` — one row per (user, card), holds Leitner box + due date + AI difficulty
- `Attempt` — full history of every answer, with AI feedback and error tags (powers the
  dashboard's "recent mistakes" panel and could later train a real difficulty model)
