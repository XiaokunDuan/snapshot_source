# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
"Visual Vocabulary" (snapshot) is a hybrid Next.js and Capacitor application for AI-powered visual learning. It uses Gemini models with a custom round-robin API key rotation mechanism for high-volume requests.

## Development Commands
- `npm run dev`: Start Next.js development server
- `npm run build`: Build Next.js application (outputs to `out/` for Capacitor)
- `npm run lint`: Run ESLint checks
- `npx cap sync`: Sync web assets to native mobile platforms (Android/iOS)
- `npx cap open android`: Open Android Studio for the android project
- `npx cap open ios`: Open Xcode for the ios project
- `npx cap run android`: Run the app on an Android device/emulator
- `npx cap run ios`: Run the app on an iOS device/simulator

## Code Architecture
- **Frontend**: Next.js 16 (App Router) with React 19 and Tailwind CSS 4.
- **Mobile**: Capacitor 8.0/7.4 integration. Native features like Camera are handled via `@capacitor/camera`.
- **API Routes (`app/api/`)**:
  - `/api/chat`: Implements Gemini AI chat with a **Round-Robin key rotation** logic. It uses a pool of API keys defined in environment variables.
  - `/api/analyze`: Handles image processing and AI analysis.
  - `/api/upload`: Manages file uploads, configured for AWS S3.
- **Key Rotation**: The server-side logic in `app/api/chat/route.ts` manages sequential selection from multiple Gemini API keys to bypass rate limits.

## Environment Setup
- Copy `env.example` to `.env.local` and configure the `GEMINI_API_KEY_POOL` (comma-separated keys).
- AWS credentials are required for S3 upload functionality.
