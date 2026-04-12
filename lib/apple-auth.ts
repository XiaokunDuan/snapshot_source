import { createPublicKey, verify } from 'crypto';

interface AppleTokenHeader {
  alg: string;
  kid: string;
}

interface AppleIdentityClaims {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: string | boolean;
}

interface AppleJwk extends JsonWebKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function getAppleAudience() {
  return process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
}

async function fetchAppleKeys() {
  const response = await fetch('https://appleid.apple.com/auth/keys', { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch Apple signing keys: ${response.status}`);
  }

  const data = await response.json() as { keys: AppleJwk[] };
  return data.keys;
}

export async function verifyAppleIdentityToken(identityToken: string) {
  const parts = identityToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Apple identity token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as AppleTokenHeader;
  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as AppleIdentityClaims;

  if (header.alg !== 'RS256') {
    throw new Error('Unexpected Apple identity token algorithm');
  }

  if (payload.iss !== 'https://appleid.apple.com') {
    throw new Error('Unexpected Apple identity token issuer');
  }

  const audience = getAppleAudience();
  if (!audience) {
    throw new Error('APPLE_CLIENT_ID not configured');
  }

  if (payload.aud !== audience) {
    throw new Error('Apple identity token audience mismatch');
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Apple identity token expired');
  }

  const keys = await fetchAppleKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error('Unable to find matching Apple signing key');
  }

  const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
  const signedData = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlDecode(encodedSignature);
  const isValid = verify('RSA-SHA256', signedData, publicKey, signature);

  if (!isValid) {
    throw new Error('Apple identity token signature verification failed');
  }

  return {
    subject: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}
