import { createPublicKey, verify } from 'crypto';
import { getAppleAudience } from '@/lib/auth-config';

export class AppleAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid_token'
      | 'invalid_configuration'
      | 'apple_keys_unavailable'
      | 'apple_key_not_found'
      | 'invalid_signature'
      | 'audience_mismatch'
      | 'issuer_mismatch'
      | 'token_expired'
  ) {
    super(message);
    this.name = 'AppleAuthError';
  }
}

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
  [key: string]: unknown;
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

async function fetchAppleKeys() {
  const response = await fetch('https://appleid.apple.com/auth/keys', { cache: 'force-cache' });
  if (!response.ok) {
    throw new AppleAuthError(`Failed to fetch Apple signing keys: ${response.status}`, 'apple_keys_unavailable');
  }

  const data = await response.json() as { keys: AppleJwk[] };
  return data.keys;
}

export async function verifyAppleIdentityToken(identityToken: string) {
  const parts = identityToken.split('.');
  if (parts.length !== 3) {
    throw new AppleAuthError('Invalid Apple identity token', 'invalid_token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: AppleTokenHeader;
  let payload: AppleIdentityClaims;

  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as AppleTokenHeader;
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as AppleIdentityClaims;
  } catch {
    throw new AppleAuthError('Invalid Apple identity token', 'invalid_token');
  }

  if (header.alg !== 'RS256') {
    throw new AppleAuthError('Unexpected Apple identity token algorithm', 'invalid_token');
  }

  if (payload.iss !== 'https://appleid.apple.com') {
    throw new AppleAuthError('Unexpected Apple identity token issuer', 'issuer_mismatch');
  }

  const audience = getAppleAudience();

  if (payload.aud !== audience) {
    throw new AppleAuthError('Apple identity token audience mismatch', 'audience_mismatch');
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new AppleAuthError('Apple identity token expired', 'token_expired');
  }

  const keys = await fetchAppleKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new AppleAuthError('Unable to find matching Apple signing key', 'apple_key_not_found');
  }

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const signedData = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlDecode(encodedSignature);
  const isValid = verify('RSA-SHA256', signedData, publicKey, signature);

  if (!isValid) {
    throw new AppleAuthError('Apple identity token signature verification failed', 'invalid_signature');
  }

  return {
    subject: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}
