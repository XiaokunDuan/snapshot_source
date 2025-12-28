# Clerk Setup Instructions

## Step 1: Get your Clerk API keys

1. Go to https://dashboard.clerk.com/
2. Create a new application or select existing one
3. Go to "API Keys" section
4. Copy your Publishable Key and Secret Key

## Step 2: Add to your .env.local file

```env
# Clerk Configuration
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# Clerk Routes  
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

## Step 3: Run database migration

```bash
npx tsx scripts/migrate-db.ts
```

## Step 4: Restart your dev server

```bash
npm run dev
```
