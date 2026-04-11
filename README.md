# Snapshot

<p align="center">
  <img src="./public/logo-compact.png" alt="Snapshot icon" width="88" height="88" />
</p>

<p align="center">
  <strong>Snapshot</strong> is an image-first language learning product.
  It turns a photo into a useful study unit: concept extraction, multilingual cards, learning history, and a live web workflow that is ready to use on desktop or mobile.
</p>

<p align="center">
  <a href="https://www.yulu34.top">Live App</a>
  ·
  <a href="#why-snapshot">Why</a>
  ·
  <a href="#product-preview">Preview</a>
  ·
  <a href="#quickstart">Quickstart</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-111827?style=flat&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React_19-111827?style=flat&logo=react&logoColor=61dafb" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-111827?style=flat&logo=typescript&logoColor=3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Clerk-111827?style=flat" alt="Clerk" />
  <img src="https://img.shields.io/badge/Neon_Postgres-111827?style=flat&logo=postgresql&logoColor=4169e1" alt="Neon Postgres" />
  <img src="https://img.shields.io/badge/Cloudflare_R2-111827?style=flat&logo=cloudflare&logoColor=f38020" alt="Cloudflare R2" />
  <img src="https://img.shields.io/badge/Gemini-111827?style=flat&logo=google-gemini&logoColor=8e75ff" alt="Gemini" />
</p>

## Why Snapshot

Most language tools start with text.

Snapshot starts where memory is usually stronger: an image from real life. You take or upload a photo, the system detects the core concept, expands it into learning material, and saves the result into a study flow that can be revisited later.

This makes the product useful in ordinary moments:

- turn a street photo, menu, package, or object into a vocabulary entry
- build multilingual cards without manually assembling prompts
- keep history, streaks, and usage state in one place
- support both fast capture and richer follow-up enrichment

## Product Preview

<p align="center">
  <img src="./public/learning.png" alt="Snapshot learning screen" width="880" />
</p>

## What It Does

- Extracts a core object or concept from an image
- Generates multilingual study content for the detected concept
- Saves results into language-specific libraries and history
- Tracks usage, streaks, and subscription state
- Supports a web-first flow with preserved mobile shell support through Capacitor

## Demo

- Live app: [https://www.yulu34.top](https://www.yulu34.top)
- Main analyze flow: upload or capture an image, then review the generated learning card
- Typical output: concept, translations, study history, and library entries by target language

## Architecture

### Frontend

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Clerk auth flows
- Framer Motion
- Capacitor bridge for mobile packaging

### Backend

- App Router API routes
- Neon Postgres
- Cloudflare R2
- Stripe subscriptions and webhooks
- Sentry monitoring
- Resend transactional email hooks

### AI Pipeline

- Gemini handles image understanding and fast concept extraction
- A text-generation endpoint enriches the result into fuller multilingual study content
- The workflow splits into a fast analyze path and a richer asynchronous enrichment path

## Repository Layout

```text
app/                    App Router pages, APIs, layout, PWA metadata
components/             UI primitives and product surfaces
hooks/                  Client hooks
lib/                    services, billing, analytics, AI helpers, data access
public/                 logos, preview assets, service worker
scripts/                database setup and migration scripts
tests/                  Vitest coverage for billing, routes, validation
android/                Capacitor Android shell
ios/                    Capacitor iOS shell
```

## Quickstart

### 1. Install

```bash
npm install
```

### 2. Create local environment

```bash
cp env.example .env.local
```

### 3. Configure required variables

Fill values in [`env.example`](./env.example).

### 4. Initialize the database

```bash
npm run db:setup
```

### 5. Start development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Key Environment Variables

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
NEXT_PUBLIC_APP_URL=https://www.yulu34.top
CAP_SERVER_URL=https://www.yulu34.top
```

### Billing and Monitoring

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run db:setup
npm run db:migrate
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

## Quality Gates

Recommended checks before shipping:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## Deployment

Snapshot is deployed on Vercel.

1. Import the repository into Vercel.
2. Add the same environment variables used locally.
3. Point the production domain to the Vercel project.
4. Run `npm run db:setup` against the target database.
5. Push to `main` for production deployment.

## Roadmap

- Improve the first-run onboarding flow for new learners
- Add clearer card review loops after image analysis
- Expand language support and enrichment quality controls
- Tighten mobile capture and install flows
- Publish more public product documentation and changelog notes
