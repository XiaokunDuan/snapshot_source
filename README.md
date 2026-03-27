# Snapshot

Snapshot is a Next.js web app for image-based English vocabulary learning. Users can sign in with Clerk, upload or capture an image, send it to Gemini for word extraction, and save the result into history, check-ins, and word books stored in Neon Postgres.

## Stack

- Next.js 16 App Router
- React 19
- Clerk authentication
- Neon Postgres
- Cloudflare R2 for image hosting
- Gemini for analysis and chat
- Capacitor is present for mobile packaging, but the current production target is Web

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `env.example` and fill in all required values.

3. Initialize the database schema:

```bash
npm run db:setup
```

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Required Environment Variables

```bash
GEMINI_API_KEY_POOL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
CDN_PUBLIC_BASE_URL=
```

Optional:

```bash
MCP_WIKI_ENABLED=false
BRAVE_API_KEY=
```

## Database Setup

`npm run db:setup` creates the tables required by the current web app:

- `users`
- `learning_challenges`
- `check_ins`
- `word_books`
- `saved_words`
- `notifications`
- `vocabulary_history`

Legacy scripts are still available:

```bash
npm run db:migrate
npm run db:add-coins
```

Use `db:setup` for a fresh environment. The legacy scripts are only for existing environments that were created before the consolidated setup script.

## Deployment

The recommended production target is Vercel.

1. Import or link the project to Vercel.
2. Configure the same environment variables in Vercel Project Settings.
3. Make sure your Clerk app allows the production domain in its allowed origins and redirect URLs.
4. Run `npm run db:setup` against the production `DATABASE_URL` before the first release.
5. Deploy with:

```bash
npm run build
vercel --prod
```

## Post-Deploy Verification

Verify these flows after deployment:

- Sign in and sign up work on the production domain.
- `/api/user/sync` creates a user record and default challenge resources.
- Uploading an image returns a Gemini result.
- New history items appear after refresh and across devices for the same account.
- Word books, notifications, and check-ins load without database errors.

## Current Production Notes

- Web is the primary deployment target.
- `app/api/upload/route.ts` currently uses the hardcoded R2 bucket name `word-app-images`.
- Home history now prefers the remote `/api/history` source when signed in and falls back to local cache if the request fails.
- Capacitor config is still present for Android development, but it is not part of the web deployment path.
