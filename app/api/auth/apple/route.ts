import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { verifyAppleIdentityToken } from '@/lib/apple-auth';
import { createAppSessionToken } from '@/lib/app-session';
import { ensureDbUserFromIdentity, ensureUserScaffolding } from '@/lib/users';

const appleAuthSchema = z.object({
  identityToken: z.string().trim().min(1, 'identityToken is required'),
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

    const sessionToken = createAppSessionToken({
      provider: 'apple',
      subject: verified.subject,
      email: user.email,
      name: user.username,
      avatarUrl: user.avatar_url,
    });

    return NextResponse.json({
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Apple sign-in failed' },
      { status: 401 }
    );
  }
}
