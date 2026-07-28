# Product Requirements Document — Flashcart

**Product:** Flashcart — AI-tutored German flashcards from your own notes
**Status:** v1 implemented · **Last updated:** 2026-07-28
**Related:** [ADR.md](ADR.md) (why the system is built this way) · [ARCHITECTURE.md](ARCHITECTURE.md) (how it runs)

---

## 1. Summary

Flashcart turns a learner's own German notes into spoken flashcards and drills them
with an AI tutor that keeps asking until the grammar sticks — until they can *produce*
the answer, not merely recognise it.

**One sentence:** *Connect your German notes, and get a deck that speaks, grades what
you actually wrote, and comes back exactly when you are about to forget it.*

---

## 2. Problem

Intermediate learners of German get stuck at a specific, well-known plateau: they can
read and understand far more than they can produce. They recognise the dative case;
they cannot reliably produce it while speaking. Existing tools reinforce that gap
rather than closing it.

| Problem | Why existing tools do not solve it |
| --- | --- |
| **Recognition ≠ production** | Flashcard apps ask "did you get it right?" and let the learner self-grade. Recognising the back of a card feels like knowing it. Multiple choice is worse. |
| **Card authoring kills decks** | Building a good deck is hours of work *before* any studying happens. Most decks are abandoned at this step. |
| **Feedback is binary** | "Wrong" teaches nothing. A learner needs to know it was the *word order*, or the *case*, and why. |
| **Notes and study are separate** | Learners already have notes — grammar rules, corrected mistakes, example sentences. That material sits in a document, unused, while they study someone else's generic deck. |
| **Reading without hearing** | Studying German silently trains the eye and leaves the ear and mouth behind. |
| **Scheduling ignores struggle** | Standard spaced repetition sees a binary outcome. Barely scraping through and answering instantly are treated identically. |

---

## 3. Target user

**Primary: the self-directed intermediate learner (A2–B2).**

They are studying German seriously — a course, a move, a job — and keep notes. They can
read reasonably well and freeze when speaking. They are motivated but time-poor, study
in short sessions on a phone, and have already abandoned at least one flashcard app
because building the deck was more work than using it.

They are technically comfortable enough to keep notes in Notion. They are not
necessarily developers.

**Secondary: the learner with a teacher.** Someone whose tutor corrects their writing
and who keeps a log of those corrections. That error log is the highest-value card
source in the product (`ERROR_CORRECTION` cards drill exactly the mistakes they
personally make).

**Explicitly not the target for v1:** absolute beginners (no notes to import, and no
basis for free-text production yet), classroom/teacher-managed cohorts, and learners of
languages other than German.

---

## 4. Goals and non-goals

### Goals

| # | Goal | Why it matters |
| --- | --- | --- |
| G1 | The learner **produces** German, in free text, every review | The plateau this product exists to break |
| G2 | Getting a usable deck takes **minutes, not hours** | Authoring is where decks die |
| G3 | Feedback names the **specific grammatical error** | Binary feedback does not teach |
| G4 | Scheduling responds to **struggle, not just correctness** | Reviews should land when they are needed |
| G5 | **Every card is hearable** in German | Trains ear and pronunciation with reading |
| G6 | The learner's material stays **private and theirs** | It is personal, and often includes their own mistakes |
| G7 | Runs **free, end-to-end** | No credit card between a learner and trying it |

### Non-goals for v1

Stated so their absence is understood as a decision, not an omission:

- **Not a course.** Flashcart drills material the learner brings; it does not teach a
  syllabus from zero.
- **Not multi-language.** German only. The grammar prompts, error taxonomy and voice
  selection are all German-specific.
- **Not social.** No shared decks, leaderboards, or friends. Decks are private by design
  ([ADR-006](ADR.md#adr-006-make-every-deck-private-and-seed-new-accounts-by-copying-a-template)).
- **Not a speech recogniser.** Cards are *spoken to* the learner; the learner answers by
  typing. Pronunciation scoring is out of scope.
- **Not an authoring tool.** Card creation is generation-first
  ([ADR-005](ADR.md#adr-005-generate-cards-from-source-notes-rather-than-authoring-them)).
- **Not monetised.** No billing, tiers, or usage limits in v1.

---

## 5. Product principles

1. **Production over recognition.** Whenever a design choice could make the app easier
   by asking less of the learner, choose the harder one. Free text over multiple choice;
   AI grading over self-grading.
2. **The learner's own material is the best material.** Generic decks are a fallback,
   not the destination.
3. **Never show an empty screen.** A new account has cards before it has notes.
4. **Explain, don't just judge.** Every wrong answer earns a reason.
5. **Honest about limits.** Where quality is device-dependent or hosting is slow, say so
   in the interface and the docs rather than letting the learner discover it as a bug.
6. **Free to run.** Every default in the stack is a free tier.

---

## 6. Functional requirements

Priority: **P0** = required for v1 · **P1** = important, shipped · **P2** = deferred.
All P0 and P1 items below are implemented.

### 6.1 Accounts and access

| ID | Requirement | Priority |
| --- | --- | --- |
| A1 | Register and sign in with email + password | P0 |
| A2 | Sign in with Google, when the deployment configures it; the app must boot without it | P1 |
| A3 | Self-serve password reset by email; links valid one hour, single use | P1 |
| A4 | OAuth-only accounts are told there is no password to reset, rather than silently receiving nothing | P1 |
| A5 | Reset emails are throttled against abuse | P1 |
| A6 | All learner data is scoped to the signed-in session; no route accepts a user id from the caller | P0 |

### 6.2 Deck and content

| ID | Requirement | Priority |
| --- | --- | --- |
| D1 | A new account receives a starter German deck on first sign-in, on **any** sign-in path | P0 |
| D2 | The starter deck is copied, not shared — editing or deleting affects nobody else | P0 |
| D3 | Connect a personal Notion workspace in one click, choosing which pages to share | P0 |
| D4 | A manual integration-token path exists as a fallback and power-user option | P1 |
| D5 | Selected pages are turned into structured flashcards, clustered under grammar topics | P0 |
| D6 | Five card types are supported: cloze, sentence production, grammar Q&A, error correction, vocabulary | P0 |
| D7 | Cards retain the source snippet they came from | P1 |
| D8 | Re-syncing skips unchanged pages and de-duplicates, so the deck extends rather than bloats | P0 |
| D9 | Cards and topics are private to one account | P0 |
| D10 | Scheduled daily sync into a nominated account | P1 |

### 6.3 Review — the core loop

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

### 6.4 Scheduling

| ID | Requirement | Priority |
| --- | --- | --- |
| S1 | Five-box Leitner: promote on correct, hold on partial, reset to box 1 on incorrect | P0 |
| S2 | Base intervals: 4 hours → 1 day → 3 days → 1 week → 3 weeks | P0 |
| S3 | Intervals shorten with estimated difficulty | P0 |
| S4 | Difficulty influence is **bounded**, so a single bad estimate cannot lose or spam a card | P0 |
| S5 | Box position is visible to the learner and meaningful | P1 |

### 6.5 Conversational tutor

| ID | Requirement | Priority |
| --- | --- | --- |
| T1 | Start a focused session on a single grammar topic | P0 |
| T2 | Multi-turn loop: ask → grade → ask again with adjusted difficulty | P0 |
| T3 | "Mastered" requires several *unprompted* correct productions, not one right answer | P0 |
| T4 | Sessions and messages persist, so a session can be resumed | P1 |
| T5 | Prompt size is bounded on long sessions | P1 |
| T6 | Topics are listed with the learner's current mastery | P1 |

### 6.6 Progress

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | Show card distribution across Leitner boxes | P0 |
| P2 | Show overall mastery percentage and accuracy | P0 |
| P3 | Show review streak | P1 |
| P4 | Show **recent mistakes grouped by error type** — the "what to drill next" signal | P0 |

### 6.7 Preferences

| ID | Requirement | Priority |
| --- | --- | --- |
| C1 | Interface language switchable between English and German; **card content stays German** | P1 |
| C2 | Light and dark theme | P1 |
| C3 | Audio auto-play toggle | P1 |
| C4 | Manage the Notion connection: connect, re-sync, disconnect | P0 |
| C5 | Responsive on phones — the primary study device | P0 |

---

## 7. Key user journeys

### J1 — First five minutes (new user)

1. Register → land signed in.
2. **A starter deck is already there.** Go straight to Review.
3. Hear a card in German, type an answer, get graded feedback naming the actual error.
4. Continue until due cards are exhausted.

**Success:** the learner reviews real cards without configuring anything.
**Requirements:** A1, D1, D2, R1–R7, R12.

### J2 — Bringing in your own notes

1. Settings → Your notes → Connect Notion.
2. Choose pages on Notion's consent screen; tick the ones to import.
3. Sync. Notes become cards, grouped by grammar topic.
4. Review now draws on personal material.

**Success:** minutes from connection to a personal deck, with no card authoring.
**Requirements:** D3–D7, D9, C4.

### J3 — Daily review

1. Open the app; due cards are waiting.
2. Answer in free text; struggled cards return sooner than solid ones.
3. Finish when the queue empties.

**Success:** short sessions, correctly timed, no busywork.
**Requirements:** R1–R12, S1–S4.

### J4 — Drilling a weakness

1. Dashboard shows "case declension" dominating recent mistakes.
2. Open Tutor, pick that topic.
3. Work through a multi-turn drill until the tutor declares mastery.

**Success:** the dashboard produces an action, and the tutor closes the gap.
**Requirements:** P4, T1–T4, T6.

### J5 — Notes grow

1. Add a week of notes in Notion.
2. Re-sync from Settings.
3. Only changed pages are processed; new cards join the existing deck.

**Success:** the deck grows with the learner, with no rebuild and no duplicates.
**Requirements:** D8, D10.

### J6 — Locked out

1. Forgot password → enter email.
2. Receive a one-hour, single-use link (OAuth accounts are told to sign in with Google instead).
3. Set a new password, sign in.

**Success:** self-service recovery with no support contact.
**Requirements:** A3, A4, A5.

---

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Privacy** | Learner content is private to one account, enforced in the schema and re-checked on mutation. Deleting an account removes its progress, attempts and tutor history. |
| **Security** | Notion tokens encrypted at rest with authenticated encryption; reset tokens stored only as hashes; passwords bcrypt-hashed; OAuth connect flow CSRF-protected. See [ADR-008](ADR.md#adr-008-encrypt-notion-tokens-at-rest-and-hash-password-reset-tokens). |
| **Cost** | The default configuration runs on free tiers end to end, with no credit card. The free model tier's limits must comfortably exceed one learner's usage. |
| **Availability** | Free hosting sleeps when idle; a cold start must degrade to *slow*, never to *broken*. |
| **Performance** | Review is a typing-paced loop; grading latency is dominated by the model call and is acceptable at conversational speed. |
| **Portability** | Model vendor is swappable by environment variable. Speech backend is swappable by implementing one interface. |
| **Compatibility** | Modern browsers; responsive down to phone widths; dark mode. Speech quality is device-dependent and must be disclosed rather than hidden. |
| **Quality gates** | CI runs on every push and PR: Python tests with mocked model calls, plus lint and a full type-checked build of the web app. Red CI means main is not deployable. |
| **Testability** | The entire model-facing surface is testable without an API key or spend. |

---

## 9. Success metrics

No analytics are instrumented in v1; these define what success *means* and what to
measure when instrumentation lands.

**Activation**
- Share of new accounts that complete a first review within 5 minutes of signup.
  *(Target: high — the starter deck exists precisely to remove every blocker.)*
- Share that connect Notion within their first week.

**The core bet — production over recognition**
- Free-text answers submitted per active learner per week.
- Ratio of `PARTIAL` to `INCORRECT` verdicts over time. Partials rising relative to
  incorrects means learners are getting closer rather than merely being right or wrong.
- Cards reaching box 5 and *staying* there — mastery that survives the 3-week interval.

**Retention**
- Day-7 and day-30 return rates.
- Review streak length distribution.
- Decks that keep growing: share of connected users who re-sync after their first import.

**Feedback quality**
- Error-tag distribution per learner narrowing over time — the tell that specific
  feedback is closing specific gaps.
- Tutor sessions that reach `mastered`.

**Health**
- Grading failure rate (`ai_unavailable` responses per thousand submits).
- Model-call cost per active learner — must stay at zero on the default free tier.

---

## 10. Constraints and assumptions

**Constraints**
- Free-tier model quotas set the ceiling on grading volume. Fine for individuals; it is
  the first thing to break at scale.
- Free hosting sleeps when idle, making the first request after a quiet period slow.
- Browser speech quality is outside the product's control.
- Notion is the only supported note source in v1.

**Assumptions**
- The learner has German notes worth importing. *(If false, the starter deck is the
  entire product for them — a weaker but still functional experience.)*
- Model grading of German is good enough to be trusted with feedback and scheduling.
  *(Validated informally; the `Attempt` table is the dataset that would test it properly.)*
- Typing German is an acceptable proxy for producing it. *(Deliberate v1 scope; speech
  input is the obvious next step.)*
- One learner's volume stays within free-tier limits.

---

## 11. Roadmap

**Shipped in v1** — everything in §6 marked P0/P1.

**Next**

| Item | Rationale | Depends on |
| --- | --- | --- |
| **Neural TTS** | Removes the biggest quality complaint; audio is central and device variance is the weak point | Interface already exists ([ADR-009](ADR.md#adr-009-use-on-device-browser-speech-behind-a-provider-interface)) |
| **Listening-comprehension cards** | Audio prompt → typed answer; trains the ear directly. A card type plus a prompt, no new architecture | Card generation |
| **Billing and tiers** | Required before a paid model provider can be the default | A paid provider path |
| **Shareable public decks** | Requested, but needs a real permission model — not a loosened ownership filter | Deliberate work against [ADR-006](ADR.md#adr-006-make-every-deck-private-and-seed-new-accounts-by-copying-a-template) |

**Under consideration**

- **Speech input** — answer aloud instead of typing. The most direct extension of the
  core bet, and the largest scope increase.
- **Learned difficulty model** — replace the per-answer estimate with a model trained on
  the accumulated `Attempt` history.
- **Additional note sources** — Obsidian, Markdown upload, Google Docs.
- **SM-2 / FSRS scheduling** — only if evidence shows Leitner intervals underperform
  ([ADR-004](ADR.md#adr-004-blend-ai-difficulty-into-leitner-scheduling-with-a-clamp)).

---

## 12. Open questions

| Question | Why it matters | How to resolve |
| --- | --- | --- |
| Is model grading of German reliable enough to drive scheduling unsupervised? | Bad grades corrupt intervals as well as feedback | Sample graded attempts against a native speaker's judgement |
| Does the difficulty clamp (40–100%) hit the right balance? | Too tight wastes the signal; too loose amplifies bad estimates | Compare box-5 retention across clamp settings |
| Do learners actually connect Notion, or live on the starter deck? | If most never connect, the core content bet is wrong and the starter deck is the product | Activation funnel, once instrumented |
| Is typed German a sufficient proxy for spoken production? | Determines whether speech input is a nice-to-have or the next required step | Learner interviews |
| Is Notion the right single source, or the wrong bet? | It gates the primary content path on one vendor | Demand for alternative sources |
