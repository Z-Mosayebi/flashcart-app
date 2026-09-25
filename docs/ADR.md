# Architecture Decision Record — Flashcard

**Status:** Living document · **Last updated:** 2026-07-28

This record captures the significant architectural decisions behind Flashcard: what
was decided, the situation that forced the decision, what else was considered, and
what the choice costs us. It is written for someone joining the project who needs to
know *why* the system looks the way it does before changing it.

For how the running system fits together, see [ARCHITECTURE.md](ARCHITECTURE.md).
For what the product is meant to do, see [PRD.md](PRD.md).

Each decision uses the same shape: **Context → Decision → Alternatives → Consequences**.

---

## Index

| # | Decision | Status |
| --- | --- | --- |
| [ADR-001](#adr-001-split-the-system-into-a-nextjs-web-tier-and-a-python-ai-service) | Split into a Next.js web tier and a Python AI service | Accepted |
| [ADR-002](#adr-002-put-the-model-behind-a-provider-interface-and-default-to-a-free-tier) | Model behind a provider interface, defaulting to a free tier | Accepted |
| [ADR-003](#adr-003-grade-free-text-answers-with-a-model-instead-of-matching-strings) | Grade free-text answers with a model, not string matching | Accepted |
| [ADR-004](#adr-004-blend-ai-difficulty-into-leitner-scheduling-with-a-clamp) | Blend AI difficulty into Leitner scheduling, with a clamp | Accepted |
| [ADR-005](#adr-005-generate-cards-from-source-notes-rather-than-authoring-them) | Generate cards from source notes rather than authoring them | Accepted |
| [ADR-006](#adr-006-make-every-deck-private-and-seed-new-accounts-by-copying-a-template) | Private decks, seeded by copying a template | Accepted |
| [ADR-007](#adr-007-derive-the-user-from-the-session-never-from-the-request) | Derive the user from the session, never from the request | Accepted |
| [ADR-008](#adr-008-encrypt-drive-refresh-tokens-at-rest-and-hash-password-reset-tokens) | Encrypt Drive refresh tokens; hash reset tokens | Accepted |
| [ADR-009](#adr-009-use-on-device-browser-speech-behind-a-provider-interface) | On-device browser speech behind a provider interface | Accepted |
| [ADR-010](#adr-010-tolerate-non-strict-json-from-the-model) | Tolerate non-strict JSON from the model | Accepted |
| [ADR-011](#adr-011-import-incrementally-by-drive-revision-id) | Import incrementally by Drive revision id | Accepted |
| [ADR-012](#adr-012-source-notes-from-google-drive-and-fold-the-connect-step-into-sign-in) | Source notes from Google Drive, folding connect into sign-in | Accepted |
| [ADR-013](#adr-013-split-documents-on-the-learners-own-headings-before-generating) | Split documents on the learner’s own headings | Accepted |
| [ADR-014](#adr-014-map-structured-spreadsheets-to-cards-without-a-model) | Map structured spreadsheets to cards without a model | Accepted |

---

## ADR-001: Split the system into a Next.js web tier and a Python AI service

**Status:** Accepted

### Context

Flashcard has two very different kinds of work. One is a conventional web product:
pages, sessions, API routes, relational data. The other is model-facing work: prompt
design, JSON-mode coaxing, grading heuristics, multi-turn tutoring state. These evolve
on different rhythms. Prompt work changes daily during tuning and needs fast, isolated
iteration; the product surface changes on feature cadence and needs type safety against
the database.

They also have different ecosystems. The web tier wants TypeScript, Next.js and Prisma.
The model tooling — SDKs, evaluation tooling, the general gravity of the field — is
Python.

### Decision

Two deployable services with a small typed HTTP contract between them.

- **`web/`** — Next.js 14 App Router, TypeScript, Prisma, Postgres. Owns pages, auth,
  all database access, and scheduling.
- **`ai-service/`** — FastAPI, Python. Owns every prompt and every model call, exposed
  as three endpoints: `/generate/cards`, `/tutor/evaluate`, `/tutor/chat`.

The AI service is stateless and touches no database. It receives what it needs, returns
structured JSON, and forgets. All persistence stays in the web tier.

The wire format is camelCase in both directions. Pydantic models in
`ai-service/app/models/schemas.py` carry explicit `validation_alias` /
`serialization_alias` so Python's snake_case convention never leaks onto the wire and
break what `web/lib/ai.ts` expects.

### Alternatives considered

- **One Next.js app, model calls from API routes.** Simplest to deploy and one less
  network hop. Rejected because it puts prompt engineering inside request handlers that
  also do auth and database work, making prompts awkward to test in isolation, and it
  gives up the Python ecosystem.
- **One Python app serving the UI too.** Rejected: the product surface is a modern
  reactive web app, and Next.js is the better tool for it by a wide margin.
- **Model calls from the browser.** Rejected outright — it exposes API keys and makes
  cost and abuse uncontrollable.

### Consequences

- Prompts are independently testable. `ai-service/tests/` runs with mocked model calls,
  so the entire grading and generation surface is covered in CI without an API key or
  a cent of spend.
- The two tiers scale and deploy independently — the AI service can sit on hosting
  suited to bursty model calls while the web app sits on Vercel.
- **Cost:** a network hop on every graded answer, and a contract that can drift. The
  drift is the real risk: a silent snake_case regression would make error tags quietly
  vanish from the review UI with no visible error. `tests/test_tutor.py` therefore
  asserts the contract at the HTTP layer, not at the function layer.
- **Cost:** two runtimes to install, configure and deploy. Accepted deliberately; the
  README treats it as two setup steps rather than hiding it.

---

## ADR-002: Put the model behind a provider interface and default to a free tier

**Status:** Accepted

### Context

Model choice is the most volatile decision in the system. Pricing changes, free tiers
appear and vanish, quality rankings shift, and specific model IDs get gated or retired.
Meanwhile the project needs to be runnable by someone with no budget — a learner
cloning it should not need a credit card to see it work.

Quality matters unevenly: German grammar feedback is where a stronger model earns its
cost; card generation and routine grading are more forgiving.

### Decision

All model access goes through `ai-service/app/services/llm_client.py`, which exposes
exactly two functions — `ask_json()` and `ask_text()`. Service modules import only
those. `LLM_PROVIDER` selects the backend:

- **`gemini`** (default) — Google's free tier. No credit card, roughly 15 requests/minute
  and 1,500/day, far above one learner's usage.
- **`anthropic`** — Claude. Paid, strongest German quality.

Model IDs default per provider and are overridable with `LLM_MODEL`. The Gemini default
is the `-latest` alias rather than a pinned version, because pinned versioned models are
increasingly gated behind paid tiers and return `429 limit: 0` on free keys — the alias
tracks whatever the free tier currently serves.

### Alternatives considered

- **Hard-code one vendor's SDK.** Simpler, and it was the original shape (the vestigial
  `claude_client.py` name survives in history). Rejected once free-tier access became a
  requirement: a single-vendor system either costs money to run or is not the best
  quality, and could not be both.
- **A general-purpose LLM abstraction library.** Rejected as disproportionate. Two
  providers and two call shapes do not justify a dependency with its own upgrade
  cadence and leaky abstractions.

### Consequences

- Switching vendors is an environment-variable change. Adding a third means writing one
  `_complete()` function and registering it; nothing else in the codebase moves.
- The project runs end-to-end for free, which materially lowers the barrier to trying it.
- **Cost:** the interface is the lowest common denominator — text in, text out. Genuinely
  vendor-specific features (native structured-output modes, prompt caching, tool use)
  are not exposed. If one of those becomes important, this ADR gets revisited rather
  than worked around.
- **Cost:** a floating model alias can change behaviour without a code change. Accepted
  as the lesser evil against hard failure on gated pinned models; the mocked tests catch
  contract breaks, not quality drift.

---

## ADR-003: Grade free-text answers with a model instead of matching strings

**Status:** Accepted

### Context

The product's premise is *production*, not recognition: the learner should type German
themselves. But German permits real variation — word order alternatives, synonyms,
different-but-valid constructions. Any exact-match or fuzzy-match grader would reject
correct answers constantly, and worse, it could never explain *why* something was wrong.
"Wrong" alone teaches nothing; "your verb belongs at the end of a subordinate clause"
teaches the pattern.

### Decision

`POST /api/review/submit` sends the card prompt, the expected answer, the topic's
grammar pattern and the learner's free text to `/tutor/evaluate`. The model returns four
things:

1. a verdict — `CORRECT` / `PARTIAL` / `INCORRECT`,
2. natural-language feedback,
3. **error tags** (`word-order`, `case-declension`, …),
4. a **difficulty estimate**, 0–1, for this learner on this card.

All four are persisted on the `Attempt` row. Grading temperature is set to 0.3 —
grading should be consistent, not creative.

`PARTIAL` exists specifically because binary grading misrepresents language learning:
a sentence with the right structure and one wrong article is not the same failure as a
blank stare, and the scheduler treats it differently (ADR-004).

### Alternatives considered

- **Exact or normalised string match.** Free, instant, deterministic. Rejected: it
  produces false negatives on valid German and cannot explain anything.
- **Self-grading ("did you get it right?").** Common in flashcard apps, zero cost.
  Rejected: it makes recognition indistinguishable from production, which is precisely
  the failure mode this product exists to fix.
- **Rule-based grammar checking.** Rejected as a large, brittle project that still would
  not produce useful pedagogical feedback.

### Consequences

- Feedback is specific and actionable, and the error tags accumulate into the
  dashboard's recent-mistakes panel — the thing that tells a learner what to drill next.
  The `Attempt` table is also exactly the dataset a future learned difficulty model
  would train on.
- **Cost:** every answer costs a model call and its latency. Bounded by the free tier
  in practice.
- **Cost:** grading is non-deterministic. Two identical answers can be graded slightly
  differently. Accepted — the alternative is deterministic and wrong.
- **Cost:** a hard dependency on the AI service during review. Handled explicitly:
  the route returns `503 ai_unavailable` rather than letting an upstream outage surface
  as a client-side bug, and `web/lib/ai.ts` retries once to absorb cold starts.

---

## ADR-004: Blend AI difficulty into Leitner scheduling, with a clamp

**Status:** Accepted

### Context

Classic Leitner moves a card up on a correct answer and back to box 1 on a wrong one.
It only sees a binary outcome, so it cannot distinguish an instant confident answer
from one the learner scraped through after visible struggle. Both get the same interval.
Meanwhile ADR-003 already produces a difficulty signal that captures exactly that
difference — but a raw model score driving intervals directly is dangerous: one bad
estimate could push a card to a near-zero interval (annoying) or an absurdly long one
(the learner silently loses material).

### Decision

Five-box Leitner with base intervals of 4h / 1d / 3d / 1w / 3w, in `web/lib/leitner.ts`.

- `CORRECT` → promote one box (capped at 5)
- `PARTIAL` → **hold** the current box
- `INCORRECT` → demote to box 1

The interval is then scaled by the AI difficulty score, clamped so difficulty can only
shorten an interval to **40%** of its base, never below and never beyond it:

```
multiplier      = 1 - clamp(difficulty, 0, 1) * 0.6   // 0.4 .. 1.0
effectiveHours  = max(baseHours * multiplier, 0.5)
```

A hard floor of 30 minutes guards the bottom regardless.

### Alternatives considered

- **Pure Leitner, no AI signal.** Simple and predictable. Rejected: it discards a signal
  that is already being computed and is genuinely informative.
- **SM-2 / Anki-style SuperMemo.** More sophisticated, well-proven. Rejected for now —
  its ease-factor model assumes a self-reported quality grade, which conflicts with
  ADR-003's model-graded verdicts, and Leitner's transparency (five visible boxes) is
  something the dashboard uses directly.
- **Let the model choose the next interval outright.** Rejected: unbounded, unexplainable,
  and unpredictable across model versions. Scheduling should stay legible.

### Consequences

- Scheduling adapts to struggle, not just correctness — the product claim that reviews
  are "timed for you" is literally true.
- The clamp bounds the blast radius of a bad estimate to a 2.5× interval difference. A
  misjudgment shifts a card's timing; it can never lose it or spam it.
- Boxes stay human-explainable, so the dashboard can show "cards per box" and it means
  something.
- **Cost:** intervals are no longer purely deterministic from the answer history — the
  same sequence of correct answers can produce slightly different due dates. Acceptable,
  and invisible in practice.

---

## ADR-005: Generate cards from source notes rather than authoring them

**Status:** Accepted

### Context

Hand-authoring flashcards is the reason most decks die. It is slow, and it happens at
exactly the moment the learner wants to be studying. But learners of German usually
already have notes — grammar rules, example sentences, vocabulary lists, a log of
mistakes their teacher corrected. That material is the ideal card source and it is
already personal, already at the right level, and it grows on its own.

### Decision

The learner's own documents are the source of truth for content. `/generate/cards`
takes a section of raw notes and returns a structured, typed set of cards, clustering
related content under shared grammar **topics**.

The source is Google Drive (ADR-012), and a document is split into sections before
anything reaches the model (ADR-013).

Five card types cover the material found in real notes:

| Type | Purpose |
| --- | --- |
| `CLOZE` | fill-in-the-blank, vocabulary in context |
| `SENTENCE_PRODUCTION` | "build a sentence using this pattern" |
| `GRAMMAR_QA` | question/answer from rule notes |
| `ERROR_CORRECTION` | "fix the mistake", sourced from a learner's error log |
| `VOCAB` | term ↔ meaning |

Cards keep `sourceText` — the snippet they came from — so a card is always traceable
back to the learner's own note.

### Alternatives considered

- **Manual card authoring UI.** Full control, no model cost. Rejected as the primary
  path for the reason above: it is the step where decks stall. (Editing generated cards
  remains available.)
- **Import from Anki / CSV.** Rejected as a starting point: it presupposes the learner
  already has a deck, which is the problem being solved.
- **Rule-based note parsing.** Rejected: real notes are unstructured prose and vary per
  learner. The variability is precisely what a model handles well.

### Consequences

- The deck grows as the notes grow. Adding notes on Tuesday means new cards on Tuesday,
  with no authoring session.
- Topic clustering gives the tutor (`/tutor`) and the dashboard a meaningful unit to
  work in — a grammar pattern rather than a loose pile of cards.
- **Cost:** generated cards can be imperfect. Mitigated by `sourceText` traceability and
  by cards being editable and deletable.
- **Cost:** a dependency on one document vendor for the primary content path. Softened
  by the starter deck (ADR-006), which means a new account is useful before importing
  anything.

---

## ADR-006: Make every deck private, and seed new accounts by copying a template

**Status:** Accepted

### Context

Two requirements pull against each other. Content is personal — a learner's notes are
theirs, and cards generated from them must not be visible to anyone else. But an empty
account on first sign-in is a dead end; a new user should land on real content, not a
"import your notes to begin" wall.

### Decision

`Topic` and `Card` are owned: both carry `ownerId`, and every route filters by it.

The single exception is the **starter template** — seeded rows with `isTemplate = true`
and `ownerId = null`. It is never reviewed directly. On first sign-in,
`provisionStarterDeck()` **copies** it into the account, and `User.deckProvisionedAt`
makes that a one-time operation.

The copy is deliberate rather than a shared reference: once the cards belong to the
user, they can edit or delete them without affecting anyone else.

Provisioning is hooked into NextAuth's `signIn` event rather than the register route,
because Google sign-up never calls register — hooking the route would have silently
left every OAuth user with an empty deck. Failures are logged but never block sign-in;
an empty deck is a bad first impression, a failed login is worse.

Uniqueness constraints follow ownership rather than global identity:
`Topic` is unique on `(ownerId, name)` and `SourceDocument` on
`(ownerId, provider, externalId)`, so two learners importing the same document get two
independent records instead of colliding.

### Alternatives considered

- **A shared global deck.** Simple and cheap. Rejected: incompatible with personal notes,
  and one user's edit would rewrite everyone's cards.
- **Reference the template instead of copying.** Saves rows. Rejected: the first edit
  either fails or leaks to every other user, and copy-on-write is more complexity than
  the row count saves.
- **Empty deck on signup.** Rejected — it is the worst possible first screen.

### Consequences

- Privacy is a schema property, not a convention. Ownership is enforced at the data
  layer and re-checked at grading time (ADR-007).
- New users can review within seconds of signing up, on any sign-in path.
- Cascade deletes on user-owned rows mean deleting an account genuinely removes its
  progress, attempts and tutor history rather than orphaning them.
- **Cost:** row duplication per user. Negligible at this scale, and it buys real
  edit isolation.

---

## ADR-007: Derive the user from the session, never from the request

**Status:** Accepted

### Context

Every meaningful route in Flashcard is user-scoped: due cards, progress, attempts, tutor
sessions, the Drive connection. The tempting shape — accept a `userId` parameter — is
also the vulnerability: anyone could read or overwrite another learner's data by editing
one query parameter.

### Decision

Authentication is NextAuth with a Prisma adapter and JWT sessions, offering credentials
(email + bcrypt hash) and Google OAuth. The Google provider is registered **only** when
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are present, so a deployment without them
still boots.

Every API route obtains the user through `requireUserId()` in `web/lib/auth.ts`. **No
route accepts a `userId` from the request body, query string or header.**

Ownership is re-checked at the point of use, not merely at fetch time. `/api/review/submit`
looks up the card with `where: { id: cardId, ownerId: userId }` before grading — without
that scoping, a caller could submit answers against another user's card and write
progress rows referencing it.

### Alternatives considered

- **Trust a client-supplied user id.** Rejected; this is the vulnerability itself.
- **Check ownership only when listing cards.** Rejected: mutation routes receive ids
  directly and must verify independently. Fetch-time checks do not protect
  submit-time writes.
- **Database row-level security.** A stronger guarantee, but it would push authorization
  into Postgres policies that Prisma does not model naturally. Revisit if the surface
  grows.

### Consequences

- The horizontal-privilege-escalation class of bug is structurally absent: there is no
  code path where a request can name a different user.
- Deployments can run with email/password only — no forced Google dependency.
- **Cost:** ownership filters must be repeated in each route, and a new route that omits
  one reintroduces the risk. The convention is uniform and documented here precisely so
  it survives contact with new contributors.

---

## ADR-008: Encrypt Drive refresh tokens at rest, and hash password reset tokens

**Status:** Accepted
**Supersedes:** the Notion-token form of this decision

### Context

Flashcard holds two kinds of sensitive secret, and they need opposite treatments.

A **Google refresh token** mints access tokens for a user's Drive. An import needs the
original value back, so it cannot be hashed.

A **password reset token** authorises taking over an account. Nothing needs the original
after the email is sent — the raw value lives only in the emailed link.

### Decision

Different mechanisms, chosen by what the system actually needs to recover:

- **Google refresh tokens → AES-256-GCM encryption at rest** (`web/lib/crypto.ts`),
  keyed by `ENCRYPTION_KEY`, which is required to be a *different* value from
  `NEXTAUTH_SECRET`. GCM is authenticated, so a tampered ciphertext fails loudly at
  decrypt time instead of silently yielding garbage.
- **Access tokens → not stored at all.** They are short-lived and derived from the
  refresh token on demand, server-side, and never sent to the browser.
- **Password reset tokens → SHA-256 hash only.** The row stores `tokenHash`; the raw
  token exists solely in the link. Tokens expire after one hour and are single-use, with
  `usedAt` stamped the moment one is spent so a link cannot be replayed even before
  expiry.
- **Passwords → bcrypt**, per `User.passwordHash` (null for OAuth-only accounts).

Granted scopes are recorded alongside the token, because a consent screen lets a user
sign in while declining Drive. Without that record the app cannot distinguish "never
granted" from "granted then revoked" — different situations needing different wording.

CSRF protection on the OAuth flow is NextAuth's, since Drive access is granted through
sign-in rather than a separate connect flow (ADR-012). Removing that flow removed the
bespoke `state` cookie it needed.

Reset emails are throttled, and OAuth-only accounts are told plainly that there is no
password to reset rather than being sent nothing.

### Alternatives considered

- **Plaintext refresh tokens.** Rejected: it turns a database leak into a Drive breach
  across every user at once.
- **Hash the refresh token.** Impossible — importing needs the original.
- **Store access tokens too, to skip a refresh round-trip.** Rejected: it makes a leaked
  row immediately usable, to save a call that is cheap and infrequent.
- **AES-CBC instead of GCM.** Rejected: unauthenticated, so tampering is undetectable.
- **Store reset tokens in plaintext.** Rejected: a database leak would become account
  takeover for every outstanding link.

### Consequences

- A database leak alone does not grant access to anyone's Drive.
- Rotating `ENCRYPTION_KEY` invalidates stored Drive access; users sign in with Google
  again, and their cards are untouched.
- Revoked access is detected on the next refresh, and the dead row is deleted so the UI
  can offer the fix rather than failing repeatedly.
- **Cost:** one extra round-trip per import batch to mint an access token.

---

## ADR-009: Use on-device browser speech behind a provider interface

**Status:** Accepted

### Context

Hearing German is central to the product — every card is meant to be spoken. But
neural TTS vendors charge per character, which would put a running cost on the single
most-repeated action in the app, and would require an API key before anyone could hear
anything.

Browser speech synthesis is free, works offline, needs no key — but its quality varies
sharply by platform, and it is a browser API, not a service that can be swapped.

### Decision

`web/lib/speech.ts` defines a `SpeechProvider` interface with one implementation today,
`BrowserSpeechProvider`, using the Web Speech API. Components call `speech.speak()` and
never touch the browser API directly.

Voice selection is **ranked, not first-match**. Browsers commonly list a low-quality
compact German voice ahead of a much better neural one, so the provider scores
candidates against a preference list, falls back through enhanced-sounding names to
`de-DE`, and only then accepts any German voice.

Auto-play is off by default and toggleable in Settings.

### Alternatives considered

- **A neural TTS vendor (ElevenLabs, Azure, Google) from day one.** Better and more
  consistent audio. Rejected for v1: per-character cost on the most-repeated action,
  plus another mandatory API key.
- **Pre-generated audio files.** Rejected: cards are generated dynamically from user
  notes (ADR-005), so their text is not known ahead of time.
- **Call the Web Speech API directly from components.** Rejected: it scatters
  voice-selection logic across the UI and makes a future vendor swap a refactor of every
  component that speaks.

### Consequences

- Audio is free, offline-capable, and requires no key. It works the moment the app loads.
- Upgrading to neural TTS is one new class implementing `SpeechProvider` — no component
  changes.
- **Cost:** quality is device-dependent — excellent on iOS/macOS/Edge, noticeably
  synthetic on some Android and Linux setups. Documented honestly in the README rather
  than hidden, since it is the most likely source of user disappointment.

---

## ADR-010: Tolerate non-strict JSON from the model

**Status:** Accepted

### Context

Every prompt in the AI service asks for strict JSON so Pydantic can parse the reply
directly. Models regularly ignore this anyway — wrapping the object in prose ("Here's
the evaluation:"), fencing it in markdown, or both — despite explicit instructions.
This is not an edge case; it is routine behaviour, and it varies by provider and model
version.

Without a fallback, this failure mode is total: every grade and every generated card
fails simultaneously.

### Decision

All model replies pass through `_extract_json()` in `llm_client.py`, which tolerates
JSON wrapped in prose or fenced in markdown before handing it to the schema layer.

This is covered by dedicated tests (`tests/test_llm_client.py`) rather than left to
chance, because the failure mode is catastrophic and provider-dependent — exactly the
combination that must not rely on model goodwill.

### Alternatives considered

- **Trust the instruction and parse strictly.** Rejected: it fails in production
  regularly and fails completely when it does.
- **Provider-native structured-output modes.** Genuinely better where available, but
  vendor-specific — it would push provider details back through the interface that
  ADR-002 exists to keep clean. Reconsider if the abstraction is revisited.
- **Retry on parse failure.** Additional latency and cost for a problem that extraction
  solves deterministically. Retries do not help when the model reliably formats the
  same way.

### Consequences

- Provider and model swaps do not break parsing, which is what makes ADR-002's
  env-var switch actually safe in practice.
- **Cost:** malformed output is masked rather than surfaced, so a genuinely degraded
  model looks healthy at the parse layer. Accepted: schema validation still rejects
  wrong-shaped data, and the alternative is total failure.

---

## ADR-011: Import incrementally by Drive revision id

**Status:** Accepted
**Supersedes:** the Notion `last_edited_time` form of this decision

### Context

Notes grow continuously — that is the premise of ADR-005. But regenerating every card
from every document on each import would waste model calls linearly with deck size, get
slower every week, and risk producing near-duplicate cards for content that had not
changed.

### Decision

Import diffs on Drive's `headRevisionId`, stored per `SourceDocument`. Documents whose
revision matches the last successful import are **skipped entirely** — no export of body
content, no model call.

The revision id is used rather than `modifiedTime` because Drive moves the timestamp for
reasons that are not content changes — opening a file, re-sharing it. Diffing on the
timestamp would regenerate untouched decks on every scheduled run, which is exactly the
cost this decision exists to avoid.

On a failed import the revision is deliberately **not** written, so the next attempt
sees the document as changed and retries rather than treating a half-finished import as
current.

De-duplication is enforced at the data layer as well: topics are unique per
`(ownerId, name)` and cards are de-duplicated on prompt, so re-importing an edited
document extends the existing deck rather than piling up near-copies.

### Alternatives considered

- **Full regeneration every import.** Simple and always consistent. Rejected: cost and
  latency grow with deck size forever, and it churns cards the learner already has
  progress on.
- **`modifiedTime` instead of the revision id.** Rejected for the reason above: it
  reports changes that did not happen.
- **Content hashing.** Precise, and catches anything the revision id misses. Rejected as
  unnecessary: it still requires exporting every document in full, which is most of the
  cost the skip was meant to avoid.
- **Drive push notifications.** Lower latency. Rejected for now: it requires a public
  webhook endpoint and more moving parts than daily freshness justifies.

### Consequences

- Import cost is proportional to what changed, not to deck size.
- Re-importing is safe and idempotent, so users can press it freely.
- Per-section progress (ADR-013) means a document interrupted partway is resumable
  rather than restarted.
- **Cost:** an edit that somehow leaves the revision unchanged is missed until the next
  real change. Acceptable for a notes-driven learning deck.

---

## ADR-012: Source notes from Google Drive, and fold the connect step into sign-in

**Status:** Accepted
**Supersedes:** ADR-005's choice of Notion as the note source

### Context

ADR-005 established that cards come from the learner's existing notes. Notion was the
source, and connecting it was a flow of its own: register an integration or complete a
second OAuth, share pages with it, select them, then sync.

Every one of those steps sat *between* a learner having notes and having a deck, and
every one happened before they had seen any value from their own material. That is the
worst possible place to put friction. Notion also excluded formats learners actually
keep notes in — Word documents and vocabulary spreadsheets — and presupposed a Notion
user, which is a narrower audience than "someone studying German".

### Decision

Google Drive is the note source, and **the connect step is removed rather than
shortened**. Google sign-in was already the primary auth path, so the `drive.readonly`
scope is requested in the same consent the learner passes to sign in. By the time they
reach the document picker, the app can already read their Drive.

Each learner authorises **their own** Google account; the app reads their Drive with
their token. No learner's files pass through the deployer's Drive or account.

`drive.readonly` is chosen over the narrower `drive.file`, which would only expose files
opened through a Google-hosted picker widget — trading the in-app picker for a hosted
one, at exactly the step this decision exists to make effortless.

Notion is removed entirely rather than kept alongside. Keeping it would retain the
multi-step connect flow next to the flow designed to replace it, and would double the
surface — extraction, change detection, token handling, failure modes — in the part of
the product that is not its differentiator.

Documents already imported from Notion keep their cards: `SourceDocument` becomes
provider-agnostic, and the migration relabels rows in place instead of dropping them.
Only the connection table is dropped, since stored credentials nothing can use are a
liability rather than a fallback.

### Alternatives considered

- **Keep both sources.** Rejected above: it preserves the problem and doubles the
  maintenance.
- **Ask for Drive access separately, at first import.** Fewer permissions at signup, and
  a lighter consent screen. Rejected as the default because it reinstates the step being
  removed — but it is the documented fallback if bundling suppresses sign-up conversion.
- **Direct file upload, no OAuth.** Simplest possible, and no verification process.
  Rejected as the primary path: re-importing an updated document would mean re-uploading
  it every time, which breaks the "deck grows as notes grow" premise. Retained as a
  roadmap item for learners whose notes are not in Drive.
- **`drive.file` scope.** Narrower, and avoids Google's verification requirement.
  Rejected for the picker reason above.

### Consequences

- The path from having notes to having a deck is: pick a document, press import.
- Word documents and spreadsheets become usable sources, widening the audience beyond
  Notion users.
- Sign-in and import share one credential, so there is one thing to revoke and one
  failure mode to explain.
- **Cost:** `drive.readonly` is a restricted scope, so Google requires app verification
  before serving the public. This is a one-time step for whoever deploys — never
  something a learner does — and up to 100 test users work fully without it, so it gates
  launch rather than development. It is an external dependency with a timeline outside
  the project's control.
- **Cost:** a heavier consent screen at signup than identity alone. This is the main risk
  of the decision, and the fallback above is the response if it proves real.
- **Cost:** the product is now tied to one document vendor, as it was to Notion before.
  The extraction interface makes adding a second source an implementation rather than a
  redesign.

---

## ADR-013: Split documents on the learner's own headings before generating

**Status:** Accepted

### Context

A real learner's notes document runs to roughly 100,000 characters. That is far past
what one model call can handle inside an HTTP request timeout, and even where it fits,
a model given fifty pages writes shallow, scattered cards. Card generation had assumed
a single page-sized input, which Notion's per-page model happened to provide and a Drive
document does not.

### Decision

Documents are split into sections before generation, on **the learner's own headings**.
Each section becomes one generation call and one grammar topic.

Splitting on their headings rather than a character count is the substance of the
decision: those headings are how the learner already organises their study, so the
resulting topics match how they think about the material instead of falling on
arbitrary boundaries.

Three properties of real notes shape the rules, all observed in an actual learner's
document rather than imagined:

- An **A–Z vocabulary index** is reference material that restates the lessons it points
  at; generating from it duplicates cards. Skipped.
- Sections range from 200 to 14,000 characters. Oversized ones are split again **on
  paragraph boundaries**, so example sentences stay with the explanation that makes them
  teachable and cited snippets are never cut mid-sentence.
- Copy-pasted sections repeat verbatim. Duplicates are generated once.

Skips are **reported, not dropped**, so an import can tell a learner what it did with
every part of their document rather than silently processing some of it.

Progress is persisted per section (`sectionsDone`/`sectionsTotal`), and cards are written
as each section finishes. A long import is therefore useful before it completes, survives
the learner closing the app, and resumes after a web tier restart. One failed section is
skipped rather than discarding the document; every section failing is treated as systemic
and surfaced as an error rather than reported as a successful import of nothing.

The logic is implemented twice — `web/lib/sectioner.ts` and
`ai-service/app/services/sectioner.py` — because the two tiers need it at different
moments: the web tier splits to dispatch and track per-section calls, the service keeps
its copy for the batch path.

### Alternatives considered

- **One call per document.** What the code did before. Rejected: it does not fit, times
  out, and produces worse cards where it does fit.
- **Fixed-size chunks.** Simple and predictable. Rejected: it cuts through the middle of
  explanations, and produces topics that correspond to nothing the learner recognises.
- **Ask the model to segment the document first.** Better boundaries in principle.
  Rejected: it needs the whole document in a call, which is the constraint being worked
  around.
- **Share one implementation across tiers over HTTP.** Rejected: it would make counting
  sections a network round-trip between two services for a pure text operation.

### Consequences

- Documents of any realistic size import successfully.
- Generated topics follow the learner's own structure.
- Progress is specific — "12 of 40 sections" rather than a spinner — and interruption is
  survivable.
- **Cost:** many model calls per document, making import the largest quota consumer in
  the product. Skipping reference, short and duplicate sections is what keeps that bill
  from being larger.
- **Cost:** two implementations of one rule set that must stay aligned. Mitigated by
  mirrored test suites on both sides.
- **Cost:** a document with no headings degrades to size-based splitting, losing the
  topic-quality benefit.

---

## ADR-014: Map structured spreadsheets to cards without a model

**Status:** Accepted

### Context

Drive brought spreadsheets in as a source. A vocabulary sheet is a genuinely different
kind of input from prose notes: the learner has *already* done the work the model would
be asked to do, pairing a German term with its meaning.

### Decision

Spreadsheets with a recognisable layout are mapped **directly to cards, with no model
call**. Column roles — term, meaning, example, topic — are detected from the header row,
in English, German or Persian, the languages this product's learners actually label
columns in.

The detected mapping is **surfaced for confirmation rather than applied silently**,
because a wrong guess about which column holds the answer produces an entire deck of
backwards cards, and the learner is the only one who can catch that beforehand.

Each row yields cards in **both directions** — recognising a term and producing it are
different skills, and production is the one this product exists to train (ADR-003). An
example sentence additionally yields a cloze card, matched on the term's stem rather than
an exact string, because notes list infinitives while examples use conjugated forms; the
answer is then the inflected form the sentence actually needs.

A sheet with no recognisable layout **falls back to model generation**, so detection
failing never means the import fails. Detection is deliberately conservative: a headerless
sheet is only assumed to be term/meaning at exactly two columns, since a wider unlabelled
sheet is more likely to be notes than a vocabulary list.

### Alternatives considered

- **Send spreadsheets to the model like everything else.** Uniform, one code path.
  Rejected: slower, consumes quota to reproduce what the learner already typed, and risks
  paraphrasing wording they chose deliberately.
- **Apply the detected mapping without confirming.** One less step. Rejected: the failure
  mode is a whole deck of reversed cards, which is worse than a confirmation.
- **Require a fixed column layout.** Predictable. Rejected: it makes the learner
  restructure their sheet for the app's benefit, against the principle that the product
  meets notes where they are.

### Consequences

- Vocabulary sheets import instantly and cost nothing.
- Cards preserve exactly the wording the learner wrote.
- **Cost:** header detection is keyword-based and will miss unusual labels. The fallback
  to generation bounds the damage to "slower than it could have been".
- **Cost:** stem matching for cloze cards is a heuristic over German morphology, not a
  real analyser, and will occasionally blank the wrong word.

---

## Decisions deliberately deferred

Recorded so they are not mistaken for oversights:

| Deferred | Why, and what would force it |
| --- | --- |
| **Billing / subscription tiers** | No paid tier yet. Forced by real users plus a paid model provider. |
| **Neural TTS** | ADR-009's interface exists for exactly this. Forced by users on platforms with poor built-in voices. |
| **SM-2 / FSRS scheduling** | ADR-004 is deliberately simpler and legible. Forced by evidence that Leitner intervals underperform, which the `Attempt` table can supply. |
| **Shareable public decks** | ADR-006 made everything private by design. Sharing needs a genuine permission model, not a loosened filter. |
| **Row-level security in Postgres** | ADR-007's convention holds at the current route count. Forced by surface growth or a second writing client. |
| **Listening-comprehension cards** | Audio prompt → typed answer. Needs no new architecture; it is a card type plus a prompt. |
