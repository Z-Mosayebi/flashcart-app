# Flashcart

**Learn German you can actually speak.**

Flashcart turns your own German notes into spoken flashcards and drills you with an
AI tutor that keeps asking until the grammar sticks — not until you recognise the
answer, but until you can produce it yourself.

- 🔊 **Every card is read aloud** in German, so you train your ear and pronunciation
  alongside your reading.
- 📓 **Your notes, your deck.** Connect your own Notion page and it becomes flashcards.
  Decks are private to your account.
- 💬 **A tutor, not a quiz.** Answer in your own words. Get real feedback on word
  order, cases and articles — then a harder question.
- 📈 **Reviews timed for you.** Spaced repetition that watches how hard you
  struggled, not just whether you were right.
- 🌍 **English or German interface**, switchable any time. Card content stays German.
- 📱 **Works on your phone** — responsive, installable, dark mode included.

## Stack

- **Web**: Next.js 14 (App Router, TypeScript), Tailwind, Framer Motion, Prisma, Postgres
- **Auth**: NextAuth — email + password with self-serve password reset, plus
  optional Google sign-in
- **AI service**: FastAPI (Python), pluggable model provider — Google Gemini
  (free tier, default) or Anthropic Claude
- **Speech**: Web Speech API (free, on-device), behind a provider interface so a
  neural TTS vendor can be dropped in later without touching calling code
- **Sync**: Notion API → GitHub Actions (daily) → AI service → Postgres
- **Deploy**: Vercel (web) + Render/Fly.io (AI service) + Neon/Supabase (Postgres)

## Project layout

```
web/            Next.js app — pages, API routes, Prisma schema, UI
ai-service/     FastAPI service — card generation, grading, tutoring (Python)
scripts/        Notion sync job (run manually or via GitHub Actions)
docs/           Architecture notes
.github/workflows/notion-sync.yml   Scheduled sync job
```

## Setup

### 1. Database

Create a Postgres instance ([Neon](https://neon.tech) and [Supabase](https://supabase.com)
both have free tiers) and copy the connection string.

### 2. AI service

```bash
cd ai-service
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Add a model API key to `.env`. The default provider is **Google Gemini**, whose free
tier needs no credit card — get a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey):

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

Free limits are roughly 15 requests/minute and 1,500/day, which is far more than one
learner uses. To switch to Claude instead (paid, best German quality), set
`LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. Both live behind one interface in
`app/services/llm_client.py`, so switching is an env-var change.

Verify: `curl http://localhost:8000/health` → `{"status":"ok"}`

Tests (no API key needed — model calls are mocked):
```bash
python -m pytest tests/ -v
```

### 3. Web app

```bash
cd web
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — from step 1
- `AI_SERVICE_URL` — `http://localhost:8000` locally
- `NEXTAUTH_URL` — the URL the app actually serves on, e.g. `http://localhost:3000`.
  If you start the dev server on another port, update this too — NextAuth builds
  redirects and password-reset links from it
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `ENCRYPTION_KEY` — generate a **second, different** value the same way; encrypts
  users' Notion tokens at rest
- `RESEND_API_KEY` / `EMAIL_FROM` — optional; sends password-reset emails (see
  step 5). Leave blank and reset links print to the server console instead
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional; leave blank for
  email + password sign-in only

```bash
npm install                 # also runs `prisma generate` via postinstall
npm run prisma:migrate      # creates tables
npm run seed                # loads the starter German deck template
npm run dev
```

Open `http://localhost:3000`, create an account, and start reviewing.

### 4. Notion one-click connect (recommended)

So users can connect Notion with a single button instead of creating and pasting an
integration token, register a **public integration** once:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) →
   **New integration**.
2. Set **Type** to **Public**, fill in the required org name / website / privacy
   URLs, and give it read content capability.
3. Add the **Redirect URI**: `http://localhost:3000/api/me/notion/oauth/callback`
   (and your production URL once deployed — Notion allows several).
4. Copy the **OAuth client ID** and **client secret** into `web/.env`:
   ```
   NOTION_OAUTH_CLIENT_ID=...
   NOTION_OAUTH_CLIENT_SECRET=...
   ```

Users then hit **Settings → Your notes → Connect Notion**, choose which pages to
share on Notion's own consent screen, tick the pages they want in the picker, and
sync. No token handling on their side.

If these env vars are blank the UI falls back to the manual token flow, which is also
always available behind "Use an integration token instead" for power users. That path
needs the user to create their own integration and share the page via
**⋯ → Connections** on the Notion page itself.

Re-syncing skips pages whose Notion `last_edited_time` hasn't changed, so adding notes
over time only processes what's new instead of regenerating the whole deck.

### 5. Password reset email (optional)

Forgot-password links are sent through [Resend](https://resend.com), whose free tier
covers 3,000 emails/month without a card:

1. Sign up, then create an **API key**.
2. Put it in `web/.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="Flashcart <onboarding@resend.dev>"
   ```

`onboarding@resend.dev` is Resend's shared sender and works with no DNS setup, but it
**only delivers to the address you signed up with** — enough to test the flow. To email
real users, verify your own domain in Resend and change `EMAIL_FROM` to match.

Leave `RESEND_API_KEY` blank and nothing breaks: the reset link is written to the
server console instead, which is all you need locally. Reset tokens are stored as
SHA-256 hashes, expire after an hour, and are single-use.

### 6. Scheduled sync (optional)

To keep one account's deck updating automatically:

```bash
cd scripts
cp .env.example .env        # NOTION_API_KEY, NOTION_PAGE_IDS, DATABASE_URL,
                            # AI_SERVICE_URL, SYNC_USER_EMAIL
pip install -r requirements.txt
python sync_notion.py
```

`SYNC_USER_EMAIL` must match an account that already exists — decks are per-user, so
the script needs to know whose deck to fill. `.github/workflows/notion-sync.yml` runs
this daily via GitHub Actions; add the same env vars as repository secrets to enable it.

## How decks work

Cards are **private to each account**. The seeded deck is a template: every new user
gets their own copy on first sign-in, so they can start reviewing immediately and can
edit or delete cards without affecting anyone else. Anything you sync from your Notion
page belongs only to you.

## Audio

German audio uses the browser's built-in speech synthesis — free, works offline, and
needs no API key. Voice quality varies by device: excellent on iOS/macOS and Edge,
more synthetic on some Android and Linux setups. Playback is isolated behind
`SpeechProvider` in [`web/lib/speech.ts`](web/lib/speech.ts), so swapping in a neural
TTS vendor (ElevenLabs, Azure, Google) is a single new class — no component changes.

Auto-play is off by default and toggleable in Settings.

## Deploying

**Web (Vercel)** — import the repo, set root directory to `web/`, add the env vars
from step 3, and set `NEXTAUTH_URL` to your production URL. If you use Google
sign-in, add `{your-domain}/api/auth/callback/google` as an authorised redirect URI.

**AI service (Render)** — [`render.yaml`](render.yaml) in the repo root is a blueprint,
so the build and start commands are already defined:

1. At [render.com](https://render.com) → **New** → **Blueprint**, connect this repo.
   Render finds `render.yaml` and proposes a free `flashcart-ai` service.
2. It will prompt for the two secrets marked `sync: false`:
   - `GEMINI_API_KEY` — free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
     no card required
   - `ALLOWED_ORIGINS` — your web app's origin, e.g. `https://your-app.vercel.app`,
     so the service isn't callable by any site on the internet
3. Deploy, then copy the resulting URL (`https://flashcart-ai-xxxx.onrender.com`)
   into Vercel as `AI_SERVICE_URL` and redeploy the web app.

Render's free plan sleeps after ~15 minutes idle and takes 30-60s to wake, so the
first review after a quiet spell is slow. [`web/lib/ai.ts`](web/lib/ai.ts) retries
once for exactly this reason, which turns a cold start into a slow success rather
than a visible error.

## Roadmap

- Billing and subscription tiers
- Neural TTS upgrade
- Listening-comprehension cards (audio prompt → typed answer)
- Shareable public decks
