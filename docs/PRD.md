# Product Requirements Document — Flashcard

**Product:** Flashcard — AI-tutored German flashcards from your own notes
**Status:** v2 specified · **Last updated:** 2026-09-02
**Related:** [ADR.md](ADR.md) (why the system is built this way) · [ARCHITECTURE.md](ARCHITECTURE.md) (how it runs)

> **What changed in v2.** The note source moved from Notion to **Google Drive**, and the
> connection step disappeared into sign-in. A learner signs in with Google, picks a
> document, and has a deck — there is no second authorisation, no integration to create,
> no token to paste. Drive also brings formats Notion never covered: Google Docs, Word
> (`.docx`), Google Sheets and Excel (`.xlsx`). Notion support is removed entirely
> (§13). Everything about the review loop, grading, scheduling and the tutor is
> unchanged.

---

## 1. Summary

Flashcard turns a learner's own German notes into spoken flashcards and drills them with
an AI tutor that keeps asking until the grammar sticks — until they can *produce* the
answer, not merely recognise it.

**One sentence:** *Sign in with Google, pick the document you already keep your German
notes in, and get a deck that speaks, grades what you actually wrote, and comes back
exactly when you are about to forget it.*

---

## 2. Problem

Intermediate learners of German get stuck at a specific, well-known plateau: they can
read and understand far more than they can produce. They recognise the dative case; they
cannot reliably produce it while speaking. Existing tools reinforce that gap rather than
closing it.

| Problem | Why existing tools do not solve it |
| --- | --- |
| **Recognition ≠ production** | Flashcard apps ask "did you get it right?" and let the learner self-grade. Recognising the back of a card feels like knowing it. Multiple choice is worse. |
| **Card authoring kills decks** | Building a good deck is hours of work *before* any studying happens. Most decks are abandoned at this step. |
| **Feedback is binary** | "Wrong" teaches nothing. A learner needs to know it was the *word order*, or the *case*, and why. |
| **Notes and study are separate** | Learners already have notes — grammar rules, corrected mistakes, example sentences. That material sits in a document, unused, while they study someone else's generic deck. |
| **Connecting the notes is its own chore** | *(v2)* Every extra step between "I have notes" and "I have a deck" loses users. An integration to register, a page to share, a token to paste — each one is a place to give up. |
| **Reading without hearing** | Studying German silently trains the eye and leaves the ear and mouth behind. |
| **Scheduling ignores struggle** | Standard spaced repetition sees a binary outcome. Barely scraping through and answering instantly are treated identically. |

---

## 3. Target user

**Primary: the self-directed intermediate learner (A2–B2).**

They are studying German seriously — a course, a move, a job — and keep notes. They can
read reasonably well and freeze when speaking. They are motivated but time-poor, study in
short sessions on a phone, and have already abandoned at least one flashcard app because
building the deck was more work than using it.

They keep those notes in a Google Doc, a Word file, or a vocabulary spreadsheet — the
tools people already have, not a tool they adopted for this. **They are not necessarily
technical at all.** This is a deliberate widening from v1, which assumed a Notion user.

**Secondary: the learner with a teacher.** Someone whose tutor corrects their writing and
who keeps a log of those corrections. That error log is the highest-value card source in
the product (`ERROR_CORRECTION` cards drill exactly the mistakes they personally make).

**Secondary: the vocabulary-list keeper.** Someone maintaining a spreadsheet of German ↔
native-language pairs. New in v2: their material needs no AI interpretation at all (§6.3),
so their deck is instant and free to build.

**Explicitly not the target for v1/v2:** absolute beginners (no notes to import, and no
basis for free-text production yet), classroom/teacher-managed cohorts, and learners of
languages other than German.

---

## 4. Goals and non-goals

### Goals

| # | Goal | Why it matters |
| --- | --- | --- |
| G1 | The learner **produces** German, in free text, every review | The plateau this product exists to break |
| G2 | Getting a usable deck takes **minutes, not hours** | Authoring is where decks die |
| G3 | **Zero setup steps between signing in and importing** | *(v2)* Every step in the connect flow is a place learners quit |
| G4 | Feedback names the **specific grammatical error** | Binary feedback does not teach |
| G5 | Scheduling responds to **struggle, not just correctness** | Reviews should land when they are needed |
| G6 | **Every card is hearable** in German | Trains ear and pronunciation with reading |
| G7 | The learner's material stays **private and theirs** | It is personal, and often includes their own mistakes |
| G8 | Runs **free, end-to-end** | No credit card between a learner and trying it |

### Non-goals for v2

Stated so their absence is understood as a decision, not an omission:

- **Not a course.** Flashcard drills material the learner brings; it does not teach a
  syllabus from zero.
- **Not multi-language.** German only. The grammar prompts, error taxonomy and voice
  selection are all German-specific.
- **Not social.** No shared decks, leaderboards, or friends. Decks are private by design.
- **Not a speech recogniser.** Cards are *spoken to* the learner; the learner answers by
  typing. Pronunciation scoring is out of scope.
- **Not an authoring tool.** Card creation is generation-first.
- **Not a document editor.** Flashcard reads Drive; it never writes to a learner's files.
  Read-only scope is a promise, and is enforced by the scope requested (§8).
- **Not a general file browser.** The picker shows documents Flashcard can learn from,
  not the learner's whole Drive.
- **Not monetised.** No billing, tiers, or usage limits in v2.

---

## 5. Product principles

1. **Production over recognition.** Whenever a design choice could make the app easier by
   asking less of the learner, choose the harder one. Free text over multiple choice; AI
   grading over self-grading.
2. **The learner's own material is the best material.** Generic decks are a fallback, not
   the destination.
3. **Meet the notes where they already live.** *(v2)* The product adapts to the learner's
   existing document, in its existing format. The learner never restructures notes for
   Flashcard's benefit.
4. **Never show an empty screen.** A new account has cards before it has notes, and an
   import in progress shows progress rather than a spinner.
5. **Explain, don't just judge.** Every wrong answer earns a reason.
6. **Don't pay a model to do what parsing can do.** *(v2)* Structured input (a
   spreadsheet) becomes cards directly. The model is for prose.
7. **Honest about limits.** Where quality is device-dependent or hosting is slow, say so
   in the interface and the docs rather than letting the learner discover it as a bug.
8. **Free to run.** Every default in the stack is a free tier.

---

## 6. Functional requirements

Priority: **P0** = required for v2 · **P1** = important · **P2** = deferred.

### 6.1 Accounts and access

| ID | Requirement | Priority |
| --- | --- | --- |
| A1 | Register and sign in with email + password | P0 |
| A2 | Sign in with Google | P0 |
| A3 | The Google sign-in consent requests **read-only Drive access in the same step**, so no separate connect authorisation exists | P0 |
| A4 | Email + password accounts can still import: they are offered Google authorisation at the moment they first choose a document, not at signup | P0 |
| A5 | The app boots and runs without Google credentials configured; import is then unavailable and says so plainly | P1 |
| A6 | Self-serve password reset by email; links valid one hour, single use | P1 |
| A7 | OAuth-only accounts are told there is no password to reset, rather than silently receiving nothing | P1 |
| A8 | Reset emails are throttled against abuse | P1 |
| A9 | All learner data is scoped to the signed-in session; no route accepts a user id from the caller | P0 |
| A10 | Drive authorisation is revocable from Settings, and revoking removes stored tokens while keeping generated cards | P0 |

> **A3 is the central change of v2.** In v1 a learner signed in, then separately
> discovered, understood and completed a Notion connection. In v2 the authorisation the
> import needs is already granted by the time they reach the picker.

### 6.2 Choosing a document

| ID | Requirement | Priority |
| --- | --- | --- |
| B1 | Pick source documents from an in-app Drive picker; no URL or id is ever pasted | P0 |
| B2 | The picker lists only supported types, most-recently-modified first | P0 |
| B3 | Search Drive by filename from within the picker | P0 |
| B4 | Select multiple documents in one pass | P1 |
| B5 | Pasting a Drive URL is accepted as a fallback, for a document shared by a teacher | P1 |
| B6 | A document the app cannot read produces a specific reason (unsupported type, no access, empty), never a generic failure | P0 |
| B7 | Selected documents are listed in Settings with their last import time and outcome | P0 |
| B8 | A document can be removed from the selection; its cards are kept unless the learner asks otherwise | P1 |

### 6.3 Supported sources and extraction

| ID | Requirement | Priority |
| --- | --- | --- |
| C1 | **Google Docs** — imported as text via Drive export | P0 |
| C2 | **Microsoft Word (`.docx`)** — imported as text | P0 |
| C3 | **Google Sheets** — imported as rows | P0 |
| C4 | **Microsoft Excel (`.xlsx`)** — imported as rows | P1 |
| C5 | **Plain text and Markdown** | P1 |
| C6 | PDF is explicitly unsupported in v2, and the picker says so rather than hiding the file | P1 |
| C7 | Prose documents are **split by heading** into sections before generation, so a long document is processed in parts | P0 |
| C8 | Each section maps to one grammar topic, preserving the learner's own organisation | P0 |
| C9 | Spreadsheets are mapped to cards **directly, with no model call**, when a recognisable column layout is present | P0 |
| C10 | Spreadsheet column roles (term / meaning / example / topic) are detected from the header row, and are confirmable and correctable by the learner before import | P0 |
| C11 | A spreadsheet without a recognisable layout falls back to model generation rather than failing | P1 |
| C12 | Non-Latin and right-to-left content in notes (e.g. Persian glosses) is preserved intact through extraction | P0 |

> **C9 matters more than its priority suggests.** A vocabulary spreadsheet is *already* a
> deck. Sending it to a model would be slower, less accurate, and would consume quota to
> reproduce what the learner already typed. Direct mapping makes that import instant and
> free.

### 6.4 Import and generation

| ID | Requirement | Priority |
| --- | --- | --- |
| D1 | A new account receives a starter German deck on first sign-in, on **any** sign-in path | P0 |
| D2 | The starter deck is copied, not shared — editing or deleting affects nobody else | P0 |
| D3 | Import runs **in the background**; the learner may navigate away or close the app | P0 |
| D4 | Import progress is visible and specific — sections completed out of total, not an indefinite spinner | P0 |
| D5 | Cards appear **as they are generated**, so review can begin before the import finishes | P1 |
| D6 | A failed section is reported and retryable on its own; it never discards completed sections | P0 |
| D7 | Documents are turned into structured flashcards, clustered under grammar topics | P0 |
| D8 | Five card types are supported: cloze, sentence production, grammar Q&A, error correction, vocabulary | P0 |
| D9 | Cards retain the source snippet they came from | P1 |
| D10 | Re-importing skips unchanged documents and de-duplicates, so the deck extends rather than bloats | P0 |
| D11 | Change detection uses Drive's own revision metadata, not content hashing | P0 |
| D12 | Re-import of a *changed* document reprocesses only changed sections where possible | P1 |
| D13 | Cards and topics are private to one account | P0 |
| D14 | Optional automatic daily re-import of selected documents, off by default | P1 |
| D15 | Import cost is bounded per document, and a document too large to process says so before starting | P1 |

> **D3–D6 exist because of a concrete constraint.** A real learner's notes document runs
> to ~100k characters — far beyond what one model call can handle inside an HTTP request
> timeout. Sectioned background processing is what makes a document of that size work at
> all, and it improves card quality as a side effect: a model given one focused section
> writes sharper cards than one given fifty pages.

### 6.5 Review — the core loop

*Unchanged from v1.*

| ID | Requirement | Priority |
| --- | --- | --- |
| R1 | Present due cards in scheduled order | P0 |
| R2 | The learner answers in **free text**, never multiple choice or self-grading | P0 |
| R3 | Answers are graded on meaning and grammar, accepting valid German variation | P0 |
| R4 | Three verdicts: correct / partial / incorrect — partial credit is required, not optional | P0 |
| R5 | Feedback explains what was wrong in natural language | P0 |
| R6 | Mistakes are tagged by type (word order, case, article, …) and stored | P0 |
| R7 | Every card can be played aloud in German on demand | P0 |
| R8 | Auto-play is available and **off by default** | P1 |
| R9 | Each answer produces a difficulty estimate that feeds scheduling | P0 |
| R10 | An AI-service outage surfaces as an explicit service error, never as a client-side bug | P0 |
| R11 | A cold-start delay is retried transparently rather than shown as a failure | P1 |
| R12 | When nothing is due, the session ends — no filler | P0 |
| R13 | A card links back to the document and section it came from | P1 |

### 6.6 Scheduling

*Unchanged from v1.*

| ID | Requirement | Priority |
| --- | --- | --- |
| S1 | Five-box Leitner: promote on correct, hold on partial, reset to box 1 on incorrect | P0 |
| S2 | Base intervals: 4 hours → 1 day → 3 days → 1 week → 3 weeks | P0 |
| S3 | Intervals shorten with estimated difficulty | P0 |
| S4 | Difficulty influence is **bounded**, so a single bad estimate cannot lose or spam a card | P0 |
| S5 | Box position is visible to the learner and meaningful | P1 |

### 6.7 Conversational tutor

*Unchanged from v1.*

| ID | Requirement | Priority |
| --- | --- | --- |
| T1 | Start a focused session on a single grammar topic | P0 |
| T2 | Multi-turn loop: ask → grade → ask again with adjusted difficulty | P0 |
| T3 | "Mastered" requires several *unprompted* correct productions, not one right answer | P0 |
| T4 | Sessions and messages persist, so a session can be resumed | P1 |
| T5 | Prompt size is bounded on long sessions | P1 |
| T6 | Topics are listed with the learner's current mastery | P1 |

### 6.8 Progress

*Unchanged from v1.*

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | Show card distribution across Leitner boxes | P0 |
| P2 | Show overall mastery percentage and accuracy | P0 |
| P3 | Show review streak | P1 |
| P4 | Show **recent mistakes grouped by error type** — the "what to drill next" signal | P0 |
| P5 | Show which documents the deck came from, and how much each contributed | P2 |

### 6.9 Preferences

| ID | Requirement | Priority |
| --- | --- | --- |
| E1 | Interface language switchable between English and German; **card content stays German** | P1 |
| E2 | Light and dark theme | P1 |
| E3 | Audio auto-play toggle | P1 |
| E4 | Manage documents: add, remove, re-import, and revoke Drive access | P0 |
| E5 | Responsive on phones — the primary study device | P0 |

---

## 7. Key user journeys

### J1 — First five minutes (new user)

1. Sign in with Google. The consent screen asks for identity **and** read-only Drive
   access, once.
2. **A starter deck is already there.** Go straight to Review.
3. Hear a card in German, type an answer, get graded feedback naming the actual error.
4. Continue until due cards are exhausted.

**Success:** the learner reviews real cards without configuring anything.
**Requirements:** A2, A3, D1, D2, R1–R7, R12.

### J2 — Bringing in your own notes *(the journey v2 exists to shorten)*

1. Settings → Your notes → **Choose from Drive**. No connect step: authorisation already
   happened at sign-in.
2. The picker lists their recent Docs, Word files and Sheets. Pick the German notes
   document.
3. Import starts in the background, showing "12 of 40 sections". Review is usable
   immediately; new cards join the deck as sections finish.
4. Review now draws on personal material.

**Success:** two clicks from Settings to an importing document, with no card authoring
and no setup.
**Requirements:** B1–B4, C1–C3, C7, C8, D3–D9, D13, E4.

**Contrast with v1:** the same journey required creating a Notion integration or
completing a second OAuth flow, sharing pages with it, then selecting them — four steps
before the import that v2 does not have.

### J3 — The vocabulary spreadsheet

1. Choose a Sheet of German ↔ Persian vocabulary from the picker.
2. Flashcard reads the header row, proposes "German = term, Persian = meaning, Beispiel =
   example", and asks for confirmation.
3. Confirm. Cards exist immediately — no model call, no waiting, no quota consumed.

**Success:** a structured source becomes a deck in seconds, and costs nothing to import.
**Requirements:** C3, C4, C9, C10.

### J4 — Daily review

1. Open the app; due cards are waiting.
2. Answer in free text; struggled cards return sooner than solid ones.
3. Finish when the queue empties.

**Success:** short sessions, correctly timed, no busywork.
**Requirements:** R1–R12, S1–S4.

### J5 — Drilling a weakness

1. Dashboard shows "case declension" dominating recent mistakes.
2. Open Tutor, pick that topic.
3. Work through a multi-turn drill until the tutor declares mastery.

**Success:** the dashboard produces an action, and the tutor closes the gap.
**Requirements:** P4, T1–T4, T6.

### J6 — Notes grow

1. Add a week of notes to the same Google Doc — the learner's normal habit, unchanged.
2. Re-import from Settings, or let the daily import handle it.
3. Drive's revision metadata shows what changed; only new sections are processed. New
   cards join the existing deck, with no duplicates.

**Success:** the deck grows with the learner, with no rebuild and no duplicates.
**Requirements:** D10–D12, D14.

### J7 — Locked out

1. Forgot password → enter email.
2. Receive a one-hour, single-use link (OAuth accounts are told to sign in with Google
   instead).
3. Set a new password, sign in.

**Success:** self-service recovery with no support contact.
**Requirements:** A6, A7, A8.

### J8 — Withdrawing access

1. Settings → Your notes → Revoke Drive access.
2. Stored Google tokens are deleted; documents are unlinked.
3. **Cards already generated remain** — they are the learner's, not Drive's.

**Success:** withdrawing access costs the learner no study progress.
**Requirements:** A10, E4.

---

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Privacy** | Learner content is private to one account, enforced in the schema and re-checked on mutation. Deleting an account removes its progress, attempts, tutor history and stored Drive tokens. |
| **Least privilege** | Drive access is **read-only** and requested at the narrowest scope that supports the picker. Flashcard never creates, edits or deletes a file. The scope is stated in the UI in plain language before the learner consents. |
| **Data retention** | Only the extracted text of selected documents is stored, as the source for generation and re-import diffing. No other Drive content is read or retained. Removing a document removes its stored text. |
| **Security** | Google refresh tokens encrypted at rest with authenticated encryption; reset tokens stored only as hashes; passwords bcrypt-hashed; OAuth flow CSRF-protected; access tokens refreshed server-side and never exposed to the browser. |
| **Cost** | The default configuration runs on free tiers end to end, with no credit card. Structured sources (§6.3 C9) consume no model quota at all. |
| **Availability** | Free hosting sleeps when idle; a cold start must degrade to *slow*, never to *broken*. A background import survives the web tier restarting. |
| **Performance** | Review is a typing-paced loop; grading latency is dominated by the model call and is acceptable at conversational speed. Import is explicitly asynchronous and is never held to interactive latency. |
| **Scale of input** | A single document of ~100k characters (roughly 40 sections) must import successfully. This is the observed size of a real learner's notes, not a theoretical ceiling. |
| **Portability** | Model vendor is swappable by environment variable. Speech backend is swappable by implementing one interface. The document source is behind an extraction interface, so adding a source is adding an implementation. |
| **Compatibility** | Modern browsers; responsive down to phone widths; dark mode. Speech quality is device-dependent and must be disclosed rather than hidden. |
| **Quality gates** | CI runs on every push and PR: Python tests with mocked model calls, web unit tests for the pure logic modules, plus lint and a full type-checked build. Red CI means main is not deployable. |
| **Testability** | The entire model-facing surface is testable without an API key or spend. Sectioning and spreadsheet mapping are pure functions, tested without a database, a network or a model. |

---

## 9. Success metrics

No analytics are instrumented; these define what success *means* and what to measure when
instrumentation lands.

**Activation** *(the metric v2 is designed to move)*
- Share of new accounts that complete a first review within 5 minutes of signup.
- **Share that import a document within their first session.** In v1 this was gated behind
  a multi-step Notion connection; v2's central bet is that removing those steps moves this
  number materially. If it does not, the connect flow was not the obstacle and the
  assumption in §11 is wrong.
- Drop-off between opening the document picker and a completed import.

**The core bet — production over recognition**
- Free-text answers submitted per active learner per week.
- Ratio of `PARTIAL` to `INCORRECT` verdicts over time. Partials rising relative to
  incorrects means learners are getting closer rather than merely being right or wrong.
- Cards reaching box 5 and *staying* there — mastery that survives the 3-week interval.

**Retention**
- Day-7 and day-30 return rates.
- Review streak length distribution.
- Decks that keep growing: share of importing users who re-import after their first pass.

**Feedback quality**
- Error-tag distribution per learner narrowing over time — the tell that specific feedback
  is closing specific gaps.
- Tutor sessions that reach `mastered`.

**Import health** *(new in v2)*
- Import success rate per document type, and the failure reasons behind it.
- Median time from document selection to first card available.
- Share of imports served by direct mapping rather than model generation — the share that
  costs nothing.

**Health**
- Grading failure rate (`ai_unavailable` responses per thousand submits).
- Model-call cost per active learner — must stay at zero on the default free tier.

---

## 10. Constraints and assumptions

**Constraints**
- Free-tier model quotas set the ceiling on generation and grading volume. A 40-section
  document is 40 model calls; this is the largest single consumer in the product.
- Free hosting sleeps when idle, making the first request after a quiet period slow, and
  bounding how long a background import may run in one pass.
- Google's OAuth consent for Drive scopes is subject to Google's verification process
  before an app may serve users outside a test list. **This is a launch dependency with an
  external timeline, and is the main scheduling risk in v2.**
- Browser speech quality is outside the product's control.
- Google Drive is the only supported note source in v2.

**Assumptions**
- The learner keeps German notes in Drive in a supported format. *(Broader than v1's
  Notion assumption, but still an assumption — the fallback remains the starter deck.)*
- Asking for Drive access at sign-in does not measurably suppress sign-ups. *(The risk of
  bundling: a read-only Drive scope is a heavier consent than identity alone. If sign-in
  conversion drops, the fallback is to move the Drive scope to an incremental
  authorisation at first import — A4's path, applied to everyone.)*
- Heading structure is a good enough proxy for topic boundaries in real notes.
  *(Supported by the observed structure of a real learner's document; documents without
  headings degrade to size-based splitting.)*
- Model grading of German is good enough to be trusted with feedback and scheduling.
- Typing German is an acceptable proxy for producing it.

---

## 11. The v2 bet, stated plainly

**Claim:** the largest single point of loss in v1 was not the review loop, the grading, or
the scheduling. It was the distance between *having notes* and *having a deck*.

Notion made that distance long: register an integration or complete a second OAuth,
share pages with it, select them, then import. Each step was a place to stop, and every
step happened before the learner had seen any value from their own material.

**v2 removes the distance rather than shortening it.** Because Google sign-in is already
the primary auth path, the authorisation an import needs can be granted in the sign-in
consent the learner passes anyway. The connect step does not get faster — it stops
existing.

**This is falsifiable.** If import rates in the first session do not rise materially
against v1, the connect flow was not the obstacle, and the next place to look is whether
learners have importable notes at all.

---

## 12. Open questions

| Question | Why it matters | How to resolve |
| --- | --- | --- |
| Does bundling the Drive scope into sign-in suppress sign-up conversion? | It is the core mechanism of v2; if consent scares people off at the door, v2 trades a late loss for an earlier, worse one | Compare sign-in completion against v1's baseline; be ready to fall back to incremental authorisation |
| How long does Google OAuth verification take for these scopes? | It gates public launch entirely | Submit early; run on the test-user allowance meanwhile |
| Is heading-based sectioning right for real notes? | It determines both topic quality and cost per import | Import a corpus of real learner documents; inspect topic coherence |
| What is the right cost ceiling per document? | A 40-section import is the product's largest quota consumer, and one user can exhaust a free tier | Measure quota per import; decide whether to cap, queue, or degrade |
| Is model grading of German reliable enough to drive scheduling unsupervised? | Bad grades corrupt intervals as well as feedback | Sample graded attempts against a native speaker's judgement |
| Does the difficulty clamp (40–100%) hit the right balance? | Too tight wastes the signal; too loose amplifies bad estimates | Compare box-5 retention across clamp settings |
| Is typed German a sufficient proxy for spoken production? | Determines whether speech input is a nice-to-have or the next required step | Learner interviews |
| Should PDF be supported? | It is the most likely "my notes are in X" gap left after Docs, Word and Sheets | Count requests; PDF extraction quality is the deciding factor |

---

## 13. Removed in v2: Notion

Notion support is **removed entirely**, not deprecated or kept as an alternative source.

**Why removal rather than coexistence:**

- **The connect step is the thing being fixed.** Keeping Notion keeps the multi-step
  connect flow in the product, alongside the flow designed to replace it. The comparison
  in §9 would then measure a choice between two paths rather than the removal of one.
- **Two sources double the surface that matters least.** Extraction, change detection,
  token handling and their failure modes would each need two implementations, in the part
  of the product that is not its differentiator.
- **Drive strictly covers Notion's role here.** Prose notes work in both; Word and
  spreadsheets work only in Drive.

**What removal covers:** the Notion OAuth flow and manual token path, the page picker and
sync endpoints, the stored connection and its encrypted token, the standalone sync script
and its scheduled job, and all Notion-specific interface copy and configuration.

**What is kept, generalised:** documents imported under Notion remain a source document
record and keep their generated cards. Existing decks are not lost by the migration —
`SourceDocument` becomes provider-agnostic rather than Notion-shaped, so previously
imported content survives as ordinary owned cards.

**What the learner sees:** anyone with a Notion connection is told the source is no longer
supported, keeps every card already generated, and is pointed at the Drive picker to
continue.

---

## 14. Roadmap

**v2 scope** — everything in §6 marked P0/P1.

**Next**

| Item | Rationale | Depends on |
| --- | --- | --- |
| **Neural TTS** | Removes the biggest quality complaint; audio is central and device variance is the weak point | Speech provider interface already exists |
| **Listening-comprehension cards** | Audio prompt → typed answer; trains the ear directly. A card type plus a prompt, no new architecture | Card generation |
| **PDF import** | The most likely remaining format gap | Extraction interface; quality assessment |
| **Direct file upload** | Serves learners whose notes are not in Drive at all, with no OAuth involved | Extraction interface |
| **Billing and tiers** | Required before a paid model provider can be the default | A paid provider path |
| **Shareable public decks** | Requested, but needs a real permission model — not a loosened ownership filter | Deliberate work against the private-by-default decision |

**Under consideration**

- **Speech input** — answer aloud instead of typing. The most direct extension of the core
  bet, and the largest scope increase.
- **Learned difficulty model** — replace the per-answer estimate with a model trained on
  the accumulated `Attempt` history.
- **Additional sources** — Obsidian, Dropbox, OneDrive. Each is an extraction
  implementation once the interface is in place.
- **SM-2 / FSRS scheduling** — only if evidence shows Leitner intervals underperform.
