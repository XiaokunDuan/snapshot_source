# Snapshot

<p align="center">
  <img src="./public/logo-compact.png" alt="Snapshot icon" width="88" height="88" />
</p>

<p align="center">
  <strong>Snapshot</strong> is an image-first language learning desk.
  Capture a real-world object, extract the core concept with Gemini, expand it into multilingual study cards, and archive the result into language-specific libraries.
</p>

<p align="center">
  <a href="https://yulu34.top">Live App</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#quickstart">Quickstart</a>
  ·
  <a href="#deployment">Deployment</a>
</p>

---

## Overview

Snapshot turns a camera roll or a live photo into a lightweight study workflow:

- upload or capture an image
- detect the core object with Gemini
- enrich the result into multilingual learning content
- browse the output in language-specific libraries
- sync history, streaks, stats, and subscription state across devices

The current product is optimized for the web, with Capacitor configuration preserved for hybrid mobile packaging.

## Features

- Image-first vocabulary extraction with Gemini
- Multilingual output flow with language variants such as `zh-CN`, `en`, `ja`, `fr`, and `ru`
- Fast analyze path with progressive enrichment
- Clerk sign-in via Google, GitHub, and email flows
- Stripe subscription flow with free-tier usage and in-app upgrade drawer
- Neon Postgres for user data, history, usage, and billing state
- Cloudflare R2 for image storage
- Sentry monitoring for client and server errors
- Resend transaction email support
- PWA-style install prompt for mobile browsers
- Mobile shell support through Capacitor

## Product Flow

1. User opens the landing page and signs in when ready.
2. User captures or uploads an image.
3. `/api/analyze` returns a fast base result.
4. `/api/analyze/enrich` fills in richer multilingual content asynchronously.
5. The result is archived into the selected language libraries.
6. Usage, history, streaks, and billing state update on the server.

## Architecture

### Frontend

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Clerk UI components
- Framer Motion for subtle motion
- Capacitor bridge for camera / haptics on mobile shells

### Backend

- App Router API routes
- Neon Postgres serverless driver
- Cloudflare R2 via S3-compatible client
- Stripe subscription and webhook handlers
- Sentry instrumentation
- Resend transactional email hooks

### AI Pipeline

- Gemini handles image understanding and base extraction
- OpenAI-compatible text endpoint handles enriched multilingual generation
- Analyze flow is split into:
  - fast path: `/api/analyze`
  - enrichment path: `/api/analyze/enrich`

## Repository Layout

```text
app/                    Next.js app router pages, APIs, layout, PWA metadata
app/components/         UI building blocks and app-specific surfaces
lib/                    services, data access, billing, analytics, AI helpers
public/                 public assets and service worker
scripts/                database setup and migration scripts
tests/                  Vitest coverage for billing, routes, validation
android/                Capacitor Android shell
ios/                    Capacitor iOS shell
```

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Create local env

```bash
cp env.example .env.local
```

### 3. Fill required variables

Use the template in [`env.example`](./env.example).

### 4. Initialize the database

```bash
npm run db:setup
```

### 5. Start development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

### Core AI

```bash
GEMINI_API_KEY_POOL=
GEMINI_MODEL=gemini-2.5-flash-lite
TEXT_API_BASE_URL=
TEXT_API_KEY=
TEXT_MODEL=
```

### Storage and Database

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=word-app-images
DATABASE_URL=
CDN_PUBLIC_BASE_URL=
```

### Auth and App URLs

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/
NEXT_PUBLIC_APP_URL=https://yulu34.top
CAP_SERVER_URL=https://yulu34.top
NEXT_PUBLIC_APP_ENV=development
```

### Billing and Monitoring

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_TRACES_SAMPLE_RATE=0.2
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.2
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

### Optional Enrichment

```bash
MCP_WIKI_ENABLED=false
BRAVE_API_KEY=
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run db:setup
npm run db:migrate
npm run db:add-coins
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

## Testing and Quality Gates

The recommended pre-release checks are:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Current automated coverage focuses on:

- billing status and usage behavior
- analyze gating and rate limiting
- history validation and route behavior

## Deployment

### Vercel

Snapshot is currently deployed on Vercel.

1. Import the GitHub repository into Vercel.
2. Add the same environment variables from local development.
3. Point production domains to the Vercel project.
4. Run `npm run db:setup` against the target production database.
5. Push to `main` to trigger GitHub Actions and Vercel production deployment.

### VERCEL_TOKEN

If you want local CLI-based deployment inspection or automation, create a Vercel personal token here:

- Vercel tokens page: https://vercel.com/account/tokens
- Vercel CLI docs: https://vercel.com/docs/cli

Recommended local setup:

```bash
echo 'export VERCEL_TOKEN=your_token_here' >> ~/.zshrc
source ~/.zshrc
```

Then you can run commands like:

```bash
vercel ls snapshot
vercel env ls
vercel inspect <deployment-url>
```

## Mobile Shell

Capacitor support is included for hybrid packaging.

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Notes:

- the web app is still the primary product surface
- Android shell is the more mature mobile path today
- iOS shell requires a full local Xcode and CocoaPods setup

## Billing Model

- free tier includes a limited number of image analyses
- paid tier uses a Stripe subscription with monthly quota tracking
- billing UI lives in-app rather than on the public landing hero
- webhook events update subscription state server-side

## Monitoring

- Sentry captures client and server errors
- Stripe failures and billing state changes are tracked server-side
- a lightweight internal analytics layer records core product events

## Known Constraints

- the app is optimized for light mode only
- some UI still uses `<img>` and triggers non-blocking Next.js warnings
- mobile packaging exists, but web remains the primary production surface
- third-party services are required for production operation

## Security Notes

- never commit real keys into the repository
- rotate exposed credentials immediately if they are ever pasted into chats, logs, or screenshots
- keep `.env.local` local and configure production values in Vercel

## Acknowledgements

Snapshot draws inspiration from editorial product design, camera-first mobile tools, and language learning interfaces that favor clarity, density, and calm interaction over dashboard clutter.
