import { createHmac, timingSafeEqual } from 'crypto';

export type AppSessionProvider = 'apple' | 'clerk';

export interface AppSessionClaims {
  provider: AppSessionProvider;
  subject: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  exp: number;
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;

  if (!secret) {
    throw new Error('APP_SESSION_SECRET not configured');
  }

  return secret;
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(data: string) {
  return base64UrlEncode(createHmac('sha256', getSessionSecret()).update(data).digest());
}

export function createAppSessionToken(claims: Omit<AppSessionClaims, 'exp'>, ttlSeconds = 60 * 60 * 24 * 30) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  } satisfies AppSessionClaims));
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifyAppSessionToken(token: string): AppSessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = sign(`${header}.${payload}`);

  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(payload).toString('utf8')) as AppSessionClaims;
    if (!claims.subject || !claims.provider || typeof claims.exp !== 'number') {
      return null;
    }

    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}
