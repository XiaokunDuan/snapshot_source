import { afterEach, describe, expect, it } from 'vitest';
import { createAppSession, createAppSessionToken, verifyAppSessionToken } from '../lib/app-session';

describe('app session tokens', () => {
  const previousSecret = process.env.APP_SESSION_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.APP_SESSION_SECRET;
    } else {
      process.env.APP_SESSION_SECRET = previousSecret;
    }
  });

  it('creates and verifies a valid session token', () => {
    process.env.APP_SESSION_SECRET = 'test-secret';

    const session = createAppSession({
      provider: 'apple',
      subject: 'user-123',
      email: 'user@example.com',
    }, 60);

    expect(session.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const claims = verifyAppSessionToken(session.token);
    expect(claims).toMatchObject({
      provider: 'apple',
      subject: 'user-123',
      email: 'user@example.com',
    });
  });

  it('rejects expired or tampered tokens', () => {
    process.env.APP_SESSION_SECRET = 'test-secret';

    const expiredToken = createAppSessionToken({
      provider: 'apple',
      subject: 'user-123',
      email: 'user@example.com',
    }, -1);
    const token = createAppSessionToken({
      provider: 'apple',
      subject: 'user-123',
      email: 'user@example.com',
    }, 60);

    expect(verifyAppSessionToken(expiredToken)).toBeNull();

    const tampered = `${token.slice(0, -1)}x`;
    expect(verifyAppSessionToken(tampered)).toBeNull();
  });
});
