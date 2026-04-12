import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

class TestAppleAuthError extends Error {
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

const captureException = vi.fn();
const verifyAppleIdentityToken = vi.fn();
const createAppSession = vi.fn();
const ensureDbUserFromIdentity = vi.fn();
const ensureUserScaffolding = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/apple-auth', () => ({
  verifyAppleIdentityToken,
  AppleAuthError: TestAppleAuthError,
}));

vi.mock('../lib/app-session', () => ({
  createAppSession,
}));

vi.mock('../lib/users', () => ({
  ensureDbUserFromIdentity,
  ensureUserScaffolding,
}));

describe('/api/auth/apple', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects malformed requests', async () => {
    const { POST } = await import('../app/api/auth/apple/route');
    const request = new NextRequest('http://localhost/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'identityToken is required',
    });
  });

  it('maps Apple upstream failures to 502', async () => {
    verifyAppleIdentityToken.mockRejectedValue(
      new TestAppleAuthError('Failed to fetch Apple signing keys: 503', 'apple_keys_unavailable')
    );

    const { POST } = await import('../app/api/auth/apple/route');
    const request = new NextRequest('http://localhost/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken: 'token' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch Apple signing keys: 503',
    });
  });

  it('maps auth config failures to 500', async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      subject: 'apple-user',
      email: 'user@example.com',
    });
    ensureDbUserFromIdentity.mockResolvedValue({
      id: 7,
      email: 'user@example.com',
      username: 'User',
      avatar_url: null,
    });
    ensureUserScaffolding.mockResolvedValue(undefined);
    createAppSession.mockImplementation(() => {
      throw new Error('APP_SESSION_SECRET is not configured');
    });

    const { POST } = await import('../app/api/auth/apple/route');
    const request = new NextRequest('http://localhost/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken: 'token' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'APP_SESSION_SECRET is not configured',
    });
  });
});
