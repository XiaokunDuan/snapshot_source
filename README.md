# Snapshot

Snapshot is an image-first English learning app built with Next.js. Users can upload or capture a picture, let Gemini extract a core English word from the image, and save the result into history, check-ins, notifications, and word books.

Snapshot 是一个“拍图学英语”的应用。用户上传或拍摄图片后，Gemini 会识别图片中的核心对象并生成英文单词、音标、释义和例句，结果会保存到历史记录、打卡、通知和单词本。

## Features

- Image-based vocabulary extraction with Gemini
- Email and social sign-in with Clerk
- Neon Postgres for user data, history, challenges, and word books
- Cloudflare R2 for image hosting
- MiniMax-compatible text chat API
- Web-first deployment, with Capacitor config kept for later mobile packaging

## Image Support

- Web upload accepts any browser-readable `image/*` file
- Typical formats: `PNG`, `JPG`, `JPEG`, `WEBP`, `GIF`, `HEIC/HEIF` when the browser can decode them
- The web client now compresses uploads before analysis and converts them to JPEG for Gemini requests
- Native camera/gallery input depends on the device OS and Capacitor camera plugin output

## Stack

- Next.js 16 App Router
- React 19
- Clerk
- Neon Postgres
- Cloudflare R2
- Gemini
- OpenAI-compatible text API endpoint
- Tailwind CSS 4

## Local Development

1. Install dependencies

```bash
npm install
```

2. Copy the environment template

```bash
cp env.example .env.local
```

3. Fill in the required values in `.env.local`

4. Initialize the database

```bash
npm run db:setup
```

5. Start the app

```bash
npm run dev
```

6. Open `http://localhost:3000`

## Environment Variables

Required:

```bash
GEMINI_API_KEY_POOL=
GEMINI_MODEL=gemini-2.5-flash
TEXT_API_BASE_URL=
TEXT_API_KEY=
TEXT_MODEL=
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

## Database Scripts

```bash
npm run db:setup
npm run db:migrate
npm run db:add-coins
```

`db:setup` is the recommended command for a fresh environment.

## Deployment

The current production target is Vercel.

1. Configure the same environment variables in Vercel
2. Run `npm run db:setup` against the production database
3. Make sure Clerk production keys and production domains are configured
4. Deploy with:

```bash
npm run build
vercel --prod
```

## Open-Source Notes

- `env.example` contains placeholders only
- `.env.local`, Clerk local config, editor temp folders, and local agent folders are gitignored
- The app can be self-hosted, but production auth, storage, database, and AI credentials must be provided by the deployer

## Current Notes

- Web is the primary deployment path
- `/api/upload` still uses the hardcoded R2 bucket name `word-app-images`
- `/api/history` is still not multi-user safe enough for a public launch and should be hardened before a broader release
- `middleware.ts` should eventually be migrated to the Next.js `proxy` convention
