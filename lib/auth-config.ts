export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AuthConfigError(`${name} is not configured`);
  }

  return value;
}

export function getAppSessionSecret() {
  return readEnv('APP_SESSION_SECRET');
}

export function getAppleAudience() {
  const audience = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
  ].map((value) => value?.trim()).find((value) => Boolean(value));

  if (!audience) {
    throw new AuthConfigError('APPLE_CLIENT_ID or APPLE_BUNDLE_ID is not configured');
  }

  return audience;
}
