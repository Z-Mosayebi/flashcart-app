# Architecture

```
Notion (source notes, grow over time)
   │  scheduled sync (GitHub Actions, daily)
   ▼
scripts/sync_notion.py ──────► ai-service (FastAPI) ──────► Postgres
   │ pulls page markdown           │ /generate/cards            │ SourceDocument
   │ diffs lastEditedTime          │ Claude parses raw notes     │ Topic
   └── skips unchanged pages       │ into structured cards       │ Card
                                   └──────────────────────────────┘

Next.js app (Vercel)
   │
   ├── /                → Landing (marketing, live audio demo)
   ├── /signin          → NextAuth (credentials + optional Google)
   │
   ├── /review          → ReviewSession
   │                      GET  /api/cards/due        (Leitner-ordered queue)
   │                      POST /api/review/submit    → ai-service /tutor/evaluate
   │                                                 → lib/leitner.ts scheduler
   │                                                 → upsert CardProgress + Attempt
   │
   ├── /tutor           → TutorChat
   │                      GET  /api/topics           (topics + per-user mastery)
   │                      POST /api/tutor/chat       → ai-service /tutor/chat
   │                                                 → persists TutorSession/Message
   │
   ├── /dashboard       → GET /api/dashboard         (boxes, mastery, accuracy,
   │                                                  streak, recent mistakes)
   │
   └── /settings        → interface language, theme, audio auto-play
```

## Model provider

`ai-service/app/services/llm_client.py` exposes `ask_json()` / `ask_text()` and hides
which vendor is behind them. `LLM_PROVIDER` selects **gemini** (default — free tier,
no card required) or **anthropic** (paid, strongest German). Service modules import
only those two functions, so switching vendors is an env-var change and adding a third
means implementing one `_complete()` function.

Model replies are run through `_extract_json()`, which tolerates JSON wrapped in prose
or markdown fences. Models do this regularly despite explicit instructions, and without
the fallback every grade and every generated card would fail at once — so it's covered
by tests rather than left to chance.

## Why two services (Next.js + Python)

The product surface — pages, API routes, DB access via Prisma — is TypeScript/Next.js.
All model-facing logic (prompt design, JSON-mode parsing, grading, conversational
tutoring) lives in a separate FastAPI service in Python. This keeps prompt engineering
in one focused place that is independently testable (`ai-service/tests/`) and
independently deployable and scalable from the web tier.

The two sides talk over a small typed HTTP contract. Field names are camelCase on the
wire; the Pydantic models in `ai-service/app/models/schemas.py` carry explicit
`validation_alias`/`serialization_alias` so both directions match what `web/lib/ai.ts`
expects. `tests/test_tutor.py` asserts this at the HTTP layer, because a silent
snake_case regression would make error tags vanish from the review UI without any
visible error.

## Authentication

NextAuth with a Prisma adapter and JWT sessions. Two providers: credentials
(email + bcrypt password hash) and Google OAuth, the latter registered only when
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present so a deployment without them
still boots.

Every API route derives the user from the session via `requireUserId()` in
`web/lib/auth.ts` — no route accepts a `userId` from the request. That distinction
matters: taking a caller-supplied id would let anyone read or overwrite another
learner's progress by changing one query parameter.

## The four AI capabilities

1. **Card generation** (`ai-service/app/services/card_generator.py`) — reads a whole
   raw Notion page (grammar rules, example sentences, vocab drills, error
   annotations) and produces a structured, typed set of flashcards, clustering
   related content under shared grammar topics. This is what lets the deck grow as
   notes are added, instead of hand-authoring every card.

2. **Tutoring evaluation** (`ai-service/app/services/tutor.py`) — grades free-text
   answers holistically rather than by string match (German allows real variation),
   gives specific feedback, tags the *kind* of mistake (word order, case, …), and
   estimates a per-answer difficulty score.

3. **Adaptive scheduling** (`web/lib/leitner.ts` + the difficulty score from #2) —
   classic 5-box Leitner, with intervals scaled by the AI's difficulty estimate, so a
   card you technically got right but visibly struggled with returns sooner than a
   trivially-correct one in the same box. Difficulty influence is clamped to a
   0.4–1.0 multiplier so one bad estimate can't push a card to a near-zero or
   absurdly long interval.

4. **Conversational tutoring** (`ai-service/app/services/tutor_chat.py`) — a true
   multi-turn loop: ask, grade, ask again with adjusted difficulty, and declare
   "mastered" only after several unprompted correct productions. Surfaced at `/tutor`,
   with each turn persisted to `TutorSession`/`TutorMessage` and a 20-message window
   replayed to the model to bound prompt size on long sessions.

## Speech

`web/lib/speech.ts` defines a `SpeechProvider` interface with one implementation
today, `BrowserSpeechProvider`, using the Web Speech API. Voice selection is ranked
rather than first-match: browsers commonly list a low-quality compact German voice
ahead of a much better neural one, so the provider scores against a preference list
and falls back through enhanced-sounding names to `de-DE` before accepting any German
voice. Components call `speech.speak()` and never touch the API directly, so a neural
TTS backend is a drop-in replacement.

## Data model

See `web/prisma/schema.prisma`. Key relationships:

- `SourceDocument` (one per synced Notion page) → `Topic` (grammar pattern) → `Card`
- `User` → `Account`/`Session` (NextAuth), plus `locale` for interface language
- `CardProgress` — one row per (user, card): Leitner box, due date, AI difficulty
- `Attempt` — every answer, with AI feedback and error tags (powers the dashboard's
  recent-mistakes panel, and is the training data a real difficulty model would use)
- `TutorSession` → `TutorMessage` — conversational tutoring history and mastery flag

User-owned rows cascade on delete, so removing an account cleans up its progress,
attempts and tutor history rather than leaving orphans.

## Deck ownership

Cards and topics are **private to each user** via `ownerId`. Nobody can see, review or
start a tutor session on anyone else's material: every route filters by owner, and
`/api/review/submit` re-checks ownership before grading rather than trusting the card
id it was handed.

The one exception is the **starter template** — the seeded deck, stored with
`isTemplate = true` and `ownerId = null`. It is never reviewed directly. On first
sign-in, `provisionStarterDeck()` copies it into the account so new users land on real
content instead of an empty screen, and `User.deckProvisionedAt` makes that a one-time
operation. The copy is deliberate rather than a shared reference: once the cards are
theirs, users can edit or delete them without affecting anyone else.

Provisioning is hooked into NextAuth's `signIn` event rather than the register route,
so it covers Google sign-up too, where no register call happens. Failures are logged
but never block sign-in.

## Notion connections

Users connect their own Notion workspace in Settings, via one of two paths:

1. **OAuth (default)** — `/api/me/notion/oauth/start` redirects to Notion's consent
   screen, where the user selects which pages to share; the callback exchanges the code
   for an access token. This is the path regular users get: one click, no token
   handling. It requires a public integration registered with Notion
   (`NOTION_OAUTH_CLIENT_ID`/`_SECRET`); when those are unset the UI hides it.
2. **Manual integration token** — kept as a fallback and a power-user option, and the
   only path when OAuth isn't configured.

The `state` parameter is a random value stored in an httpOnly cookie and compared on
callback, so a forged redirect can't attach someone else's Notion workspace to the
signed-in account.

After connecting, `/api/me/notion/pages` lists what the token can actually see (via
Notion's search endpoint) and the user ticks pages from a list — no URL pasting, and no
way to select a page the integration can't read.

Either way the token is stored encrypted at rest with AES-256-GCM
(`web/lib/crypto.ts`) — it grants read access to that user's pages, so plaintext
storage would turn a database leak into a workspace breach. Hashing isn't an option
here, unlike passwords, because the sync job needs the original value back. GCM is
authenticated, so a tampered ciphertext fails loudly at decrypt time instead of
silently yielding garbage.

`POST /api/me/notion/sync` fetches the user's pages, skips any whose Notion
`last_edited_time` matches the previous sync, and generates cards owned by that user.
Topics are unique per `(ownerId, name)` and cards are de-duplicated on prompt, so
re-syncing an edited page extends the existing deck rather than piling up near-copies.

`scripts/sync_notion.py` remains for scheduled batch syncing into a single nominated
account, identified by `SYNC_USER_EMAIL`. It exits with an error if no such account
exists, rather than creating a deck nobody can sign in to.
