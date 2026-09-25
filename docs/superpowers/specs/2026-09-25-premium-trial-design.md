# Free demo limits, premium trial requests, and admin dashboard — design

Date: 2026-09-25 · Status: approved in conversation, awaiting spec review

## Why

The owner wants to measure demand before launching a paid version. The app stays
free, but a free account gets a small, useful allowance. Anyone who wants more
fills in a short request form; the owner reads the requests, activates a
time-limited premium trial by hand, and sees in one place how many people want
more and what they would pay.

Constraints: everything must stay on free tiers (Vercel, Render, Neon, Gemini,
Resend, Telegram). Google sign-in currently only works for listed test users
(`drive.readonly` is unverified), so importing must not depend on Drive.

Out of scope: payments, a Persian UI (separate follow-up project), renaming
external service URLs.

## Plans and limits

All numbers live in one module, `web/lib/plans.ts`.

| | Free | Premium |
|---|---|---|
| Imported documents (total) | 1 | 10 |
| Graded answers per day | 30 | 200 |
| Tutor replies per day | 10 | 50 |

- A user is premium while `User.premiumUntil > now`. No scheduled job: expiry is
  just the date passing, and the user falls back to free limits.
- Admins (emails in `ADMIN_EMAILS`, comma-separated) have no limits.
- "Per day" resets at midnight Europe/Berlin.
- The starter deck does not count as a document. Re-importing a document the
  user already has, or continuing an unfinished import, is always allowed.
- Existing users above the free document limit keep what they have but cannot
  add a new document.
- Card generation during an allowed import does not count toward daily limits.

### Counting (no new counter table)

Usage is counted from rows the app already writes:

- Graded answers today = `Attempt` rows for the user since the start of today.
- Tutor replies today = `TutorMessage` rows with role `ASSISTANT` in the user's
  sessions since the start of today (every tutor model call writes exactly one).
- Documents = `SourceDocument` rows owned by the user.

A failed model call writes no row, so it costs the user nothing. Two perfectly
concurrent requests at the boundary can overshoot by one; accepted.

### Enforcement

Checked server-side before any model call:

- `POST /api/review/submit` and `POST /api/tutor/chat`: at the limit, respond
  `429 { error: "limit_reached", kind: "graded" | "tutor", limit, plan }`.
- Imports (Drive and upload): a *new* document at the limit responds
  `403 { error: "limit_reached", kind: "documents", limit, plan }`.

`GET /api/me/plan` returns plan, `premiumUntil`, limits, today's usage, document
count and the state of the user's latest premium request, for the UI.

## Data model (one migration)

- `User.premiumUntil DateTime?`
- `SourceProvider` gains `UPLOAD`. An upload's `externalId` and `revisionId`
  are the SHA-256 of the file bytes, so re-uploading the same file resolves to
  the same document and is skipped as unchanged.
- New `PremiumRequest`:
  `id, userId, goal, level, willingToPay, contact?, message?, status
  (PENDING | APPROVED | REJECTED), grantedDays?, createdAt, decidedAt?`.
  Indexed on `(status, createdAt)` and `userId`. At most one PENDING request
  per user, enforced in the route.

`goal`: EXAM, WORK, IMMIGRATION, STUDY, PERSONAL, OTHER.
`level`: A1, A2, B1, B2, C1, C2, UNKNOWN.
`willingToPay`: NOTHING, UNDER_5, FROM_5_TO_10, OVER_10 (EUR per month).

The migration must be applied to Neon before the web deploy that uses it; the
build does not run migrations. Rollout steps follow the previous Drive
migration (`scripts/verify_migration.mjs`) and will be written into the plan.

## Importing from the computer (upload)

- Settings gets an "Upload from computer" panel next to Google Drive, open to
  every signed-in user.
- Accepted: `.xlsx`, `.csv`, `.docx`, `.txt`, `.md`, at most 2 MB.
- `POST /api/me/upload` (multipart). The server extracts text or rows; the file
  itself is never stored — only the extracted text, as with Drive today.
- Parsers: `read-excel-file` (xlsx, first sheet), `papaparse` (csv),
  `mammoth` (docx → raw text).

`web/lib/import.ts` is split into *sourcing* (Drive fetch, upload parse) and
*processing* (the existing spreadsheet-mapping and section-by-section
generation, time budget and resume). Drive behaviour is unchanged except:

- Drive `.xlsx` files are downloaded and parsed with the same parser instead of
  failing with "convert to Google Sheets first".

Long uploads continue the same way long Drive imports do: the first request
stores the extracted text; if it returns `partial`, the client calls
`POST /api/me/documents/{id}/continue`, which resumes from the stored text for
either source.

## What users see

- Review and Tutor show "today 12 / 30".
- Settings shows a plan card: "Free · 1 of 1 documents" or "Premium until
  12 Oct".
- On any `limit_reached`, one shared `UpgradePrompt` explains the limit and
  links to `/premium`; if a request is already pending it says so instead.
- UI strings are added in English and German, keyed so a Persian translation
  can be added later.

## Premium request form (`/premium`)

Signed-in users only. Fields: goal, level, willingness to pay, contact (Telegram
id or phone, optional, ≤100 chars), message (optional, ≤1000 chars). Name and
email come from the account. After submitting, the page shows the request's
status: pending, active until a date, or rejected. A new request is possible
only when none is pending.

## Notifications

On a new request, after it is saved, the admin is notified through each
configured channel independently — a failure in one never blocks the other, and
never fails the user's request (errors are logged; the dashboard is the source
of truth):

- Telegram: Bot API `sendMessage` with `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Email: existing `sendMail` (Resend) to every address in `ADMIN_EMAILS`.

Content: name, email, answers, contact, link to `/admin`. When the admin
activates a trial, the user gets an email with the end date if Resend is
configured.

## Admin dashboard (`/admin`)

Access: only emails in `ADMIN_EMAILS` (the owner, zhmosayebi@gmail.com). The
nav link is rendered only for admins. A non-admin opening `/admin` is silently
redirected to `/dashboard` — no error page. Admin API routes check the same
list server-side and return 404 to anyone else.

Sections:

1. **Requests** — pending first. Per request: user, date, answers, contact;
   actions "Activate 7 / 14 / 30 days" and "Reject". Activating sets
   `premiumUntil = max(now, premiumUntil) + days`.
2. **Premium users** — current premium users with end dates; extend or revoke
   (revoke sets `premiumUntil` to now).
3. **Analytics** — total users; sign-ups in the last 7 / 30 days; users active
   in the last 7 days; number of requests and requests ÷ users; bar charts
   (plain CSS) for willingness to pay, goal and level; number of free users who
   hit a daily limit in the last 7 days (from `Attempt` / `TutorMessage`
   counts per user per day).

## Configuration (Vercel, all free)

`ADMIN_EMAILS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`
(+ `EMAIL_FROM`). Every channel is optional; with none configured the dashboard
still works. Step-by-step setup instructions are given to the owner after
implementation, including enabling Resend.

## Errors and edge cases

- Upload: wrong type or over 2 MB → 400 with a readable message; unreadable
  file → 422; empty file → the existing "document is empty" message.
- Premium expiring mid-session: the next request is checked against free limits.
- Admin actions are idempotent: approving an already-decided request is a no-op
  with a clear response.
- Contact details are personal data: shown only on the admin page and in the
  admin notification, never elsewhere.

## Testing

- Unit (vitest): `plans.ts` (limits, premium check, Berlin day boundary), upload
  parsers (xlsx, csv, docx, txt fixtures), notification fan-out (one channel
  failing), admin-access check.
- Existing pytest and vitest suites stay green; `next build` passes in CI.
- Manual online check after deploy, with the steps given to the owner.
