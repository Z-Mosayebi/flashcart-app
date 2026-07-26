# Flashcart

AI-generated, Leitner-method German flashcards, sourced from a live Notion page and
graded by a conversational AI tutor until you can actually produce the grammar
yourself — not just recognize it.

Built as an AI engineering portfolio project: Next.js + Postgres for the product,
a separate FastAPI/Claude service for all model-facing logic, a scheduled Notion
sync, and an adaptive spaced-repetition scheduler that blends classic Leitner boxes
with an AI-estimated difficulty score.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system diagram and
design rationale.

## Stack

- **Web**: Next.js 14 (App Router, TypeScript), Tailwind, Prisma, Postgres
- **AI service**: FastAPI (Python), Anthropic Claude (Sonnet)
- **Sync**: Notion API → GitHub Actions (scheduled daily) → AI service → Postgres
- **Deploy target**: Vercel (web) + any Python host (Render/Fly.io) for the AI service
  + Neon/Supabase for Postgres

## Project layout

```
web/            Next.js app — pages, API routes, Prisma schema
ai-service/     FastAPI service — card generation, grading, tutoring (Python)
scripts/        Notion sync job (run manually or via GitHub Actions)
docs/           Architecture notes
.github/workflows/notion-sync.yml   Scheduled sync job
```

## Setup

### 1. Database

Create a free Postgres instance (e.g. [Neon](https://neon.tech) or
[Supabase](https://supabase.com)) and copy the connection string.

### 2. AI service

```bash
cd ai-service
cp .env.example .env        # add your ANTHROPIC_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok"}`

Tests (no API key needed, uses a mocked model response):
```bash
python -m pytest tests/ -v
```

### 3. Web app

```bash
cd web
cp .env.example .env        # set DATABASE_URL, AI_SERVICE_URL
npm install                 # also runs `prisma generate` via postinstall
npm run prisma:migrate      # creates tables from prisma/schema.prisma
npm run seed                # loads real flashcards from your DW Notion page
npm run dev
```

Visit `http://localhost:3000` → Review to start a session, Dashboard to see progress.

### 4. Notion sync (optional, for adding new content over time)

```bash
cd scripts
cp .env.example .env        # NOTION_API_KEY, NOTION_PAGE_IDS, DATABASE_URL, AI_SERVICE_URL
pip install -r requirements.txt
python sync_notion.py
```

Create a Notion integration at notion.so/my-integrations, share your page(s) with it,
and put the page ID(s) in `NOTION_PAGE_IDS`. The script diffs against Notion's
`last_edited_time` so unchanged pages are skipped, and only new/changed content is
sent through AI card generation — this is what makes "add more to Notion over time"
actually work without regenerating everything from scratch.

The included `.github/workflows/notion-sync.yml` runs this daily via GitHub Actions —
add the same env vars as repo secrets to enable it.

## A note on how this was verified

The Python AI service's logic (JSON parsing, schema validation, prompt structure) is
covered by `ai-service/tests/` and passes in this environment. The Next.js/Prisma side
was hand-reviewed for consistency between the schema, API routes, and seed data, but
**could not be fully build-verified in the sandbox this project was assembled in** —
its network egress blocks `binaries.prisma.sh`, which `prisma generate`/`migrate`
need to download the query engine. This is specific to that sandbox, not your machine
or Vercel (both have normal internet access). Run `npm install && npm run prisma:migrate`
locally as your first step — that's the real verification.

## Next steps / not yet built

- **Conversational tutor UI**: the `/tutor/chat` endpoint (multi-turn practice session,
  auto-detects mastery) is implemented and testable, but not yet wired into a chat
  component on the frontend — currently only the single-card review loop is.
- **Auth**: single demo user (`DEMO_USER_ID`) for now; swap in NextAuth/Clerk for real
  multi-user accounts.
- **Deploy**: connect this repo to Vercel for the `web/` app; deploy `ai-service/` to
  Render or Fly.io and point `AI_SERVICE_URL` at it.
