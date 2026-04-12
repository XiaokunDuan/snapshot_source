# App Store Prep

This document collects the release-readiness items that matter before the first App Store submission.

## Metadata Scaffold

| Field | Suggested Value |
|---|---|
| App name | Snapshot |
| Subtitle | Turn images into study cards |
| Category | Education |
| Primary language | Chinese (Simplified) |
| Support URL | `https://example.com/support` |
| Privacy policy URL | `https://example.com/privacy` |
| Terms URL | `https://example.com/terms` |
| App Store URL | `https://apps.apple.com/app/id0000000000` |
| Review notes | Explain the login flow, image capture flow, and any account-required areas |

## Submission Copy

- App description should explain that Snapshot turns images into study cards, keeps a history of generated cards, and supports Apple-native sign-in and subscriptions.
- Avoid describing the app as a PWA or browser shell in App Store-facing text.
- Keep the first two sentences focused on the user outcome, not the implementation.

## Required Release Values

- `NEXT_PUBLIC_SUPPORT_EMAIL`
- `NEXT_PUBLIC_PRIVACY_POLICY_URL`
- `NEXT_PUBLIC_TERMS_URL`
- `NEXT_PUBLIC_APP_STORE_URL`
- `APP_SESSION_SECRET`
- `APPLE_CLIENT_ID` or `APPLE_BUNDLE_ID`

## Review Notes Checklist

- Explain how to reach the main capture flow from a fresh install.
- Explain any sign-in requirement before upload or analysis.
- Mention if camera and photo library permissions are needed.
- Mention whether subscriptions unlock limits or premium features.
- Include test account details if review access is gated.

## Validation Before Upload

```bash
npm run lint
npx tsc --noEmit
npm test
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' build
```

