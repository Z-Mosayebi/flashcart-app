# Architecture

```
Google Drive (source notes, grow over time)
   │  read-only, authorised during Google sign-in
   ▼
web/lib/import.ts ───────────► ai-service (FastAPI) ──────► Postgres
   │ exports document text         │ /generate/cards            │ SourceDocument
   │ splits on the learner's       │ parses one section         │ Topic
   │   own headings                │ into structured cards      │ Card
   │ diffs Drive revisionId        └──────────────────────────────┘
   └── skips unchanged documents
       (spreadsheets skip the model entirely — see below)

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

1. **Card generation** (`ai-service/app/services/card_generator.py`) — reads one
   section of a learner's notes (grammar rules, example sentences, vocab drills,
   error annotations) and produces a structured, typed set of flashcards, clustering
   related content under shared grammar topics. This is what lets the deck grow as
   notes are added, instead of hand-authoring every card.

   It takes a *section*, not a document. A real notes document runs to ~100k
   characters, which no single call can handle inside a request timeout, and which
   produces shallow cards even when it fits. `web/lib/sectioner.ts` (mirrored by
   `ai-service/app/services/sectioner.py`) splits on the learner's own headings
   first, so generated topics follow how they already organise their study.

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

- `SourceDocument` (one per imported document) → `Topic` (grammar pattern) → `Card`
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

## Drive access and importing

There is no "connect" step. `GoogleProvider` in `web/lib/auth.ts` requests
`drive.readonly` alongside the identity scopes, so the consent a user passes to sign
in is the same one that authorises importing. Removing that step is the point of the
Drive migration: under the previous Notion flow, four separate actions stood between
having notes and having a deck, and each was a place to give up.

Only the **refresh token** is stored, encrypted at rest with AES-256-GCM
(`web/lib/crypto.ts`). Access tokens are minted from it server-side on demand and
never persisted or exposed to the browser, so a leaked row does not hand over a
credential that works immediately. `access_type=offline` and `prompt=consent` are both
required: without them Google issues no refresh token on a repeat sign-in, and access
would silently expire after an hour with no way to renew it.

Granted scopes are recorded rather than assumed, because a consent screen lets a user
sign in while declining Drive. That distinction lets the UI tell "never granted" from
"granted then revoked" — different situations with the same remedy but different
wording.

`drive.readonly` is a **restricted scope**: Google requires app verification before
serving the general public, done once by whoever runs the deployment. Up to 100 test
users work fully without it, so verification gates launch, not development.

### The import pipeline

`POST /api/me/drive/import` runs `importDocument()` per selected file:

1. **Diff.** Drive's `headRevisionId` is compared against the stored one. It changes
   only when content does, unlike `modifiedTime`, which moves when a file is merely
   opened or re-shared — using the timestamp would regenerate untouched decks daily.
2. **Extract.** Prose is exported as text; spreadsheets are read as rows.
3. **Split.** Prose is sectioned on headings. Reference material (an A–Z vocabulary
   index), too-short fragments and duplicate sections are skipped *and reported*,
   so an import can say what it did with every part of a document.
4. **Generate.** One model call per section, with cards written as each finishes.
5. **Track.** `sectionsDone`/`sectionsTotal` are persisted per section, so progress is
   specific, survives a restart, and the learner can close the app mid-import.

A single failed section is recorded and skipped rather than discarding a long
document; every section failing is treated as systemic (an outage or exhausted quota)
and surfaced as an error rather than reported as a successful import of nothing.

On failure the revision id is deliberately left unwritten, so the next attempt sees
the document as changed and retries instead of treating a half-import as current.

Topics are unique per `(ownerId, name)` and cards are de-duplicated on prompt, so
re-importing an edited document extends the existing deck rather than piling up
near-copies.

### Spreadsheets skip the model

A vocabulary sheet is already a deck: the learner has done the work of pairing a term
with its meaning. `web/lib/spreadsheet-cards.ts` detects column roles from the header
row (in English, German or Persian) and maps rows directly to cards — instant, free,
and faithful to the wording the learner chose. Detection is surfaced for confirmation
because a wrong guess about which column holds the answer produces a deck of backwards
cards. A sheet with no recognisable layout falls back to model generation, so
detection failing never means the import fails.

### Documents imported before the migration

`SourceDocument.provider` retains a `NOTION` value so pre-migration documents keep
their cards and their provenance. They are listed as read-only: reviewable, but not
re-importable, since the connection that fetched them no longer exists.

