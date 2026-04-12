import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { AppleAuthError, verifyAppleIdentityToken } from '@/lib/apple-auth';
import { createAppSession } from '@/lib/app-session';
import { AuthConfigError } from '@/lib/auth-config';
import { ensureDbUserFromIdentity, ensureUserScaffolding } from '@/lib/users';

const appleAuthSchema = z.object({
  identityToken: z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z.string().trim().min(1, 'identityToken is required')
  ),
  fullName: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = appleAuthSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const verified = await verifyAppleIdentityToken(parsed.data.identityToken);
    if (!verified.email) {
      return NextResponse.json(
        { error: 'Apple account did not provide an email address' },
        { status: 400 }
      );
    }

    const user = await ensureDbUserFromIdentity({
      provider: 'apple',
      subject: verified.subject,
      email: verified.email,
      username: parsed.data.fullName || null,
    });
    await ensureUserScaffolding(user.id);

    const session = createAppSession({
      provider: 'apple',
      subject: verified.subject,
      email: user.email,
      name: user.username,
      avatarUrl: user.avatar_url,
    });

    return NextResponse.json({
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    const errorMessage = error instanceof Error ? error.message : 'Apple sign-in failed';
    if (isAuthConfigurationError(error)) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
    if (error instanceof AppleAuthError) {
      return NextResponse.json(
        { error: errorMessage },
        { status: mapAppleAuthErrorStatus(error) }
      );
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    );
  }
}

function isAuthConfigurationError(error: unknown) {
  return error instanceof AuthConfigError
    || (error instanceof Error && error.name === 'AuthConfigError')
    || (error instanceof Error && / is not configured$/.test(error.message));
}

function mapAppleAuthErrorStatus(error: AppleAuthError) {
  switch (error.code) {
    case 'invalid_configuration':
      return 500;
    case 'apple_keys_unavailable':
      return 502;
    case 'invalid_signature':
    case 'audience_mismatch':
    case 'issuer_mismatch':
    case 'token_expired':
    case 'invalid_token':
    case 'apple_key_not_found':
      return 401;
  }

  return 401;
}
