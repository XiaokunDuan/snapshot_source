import { describe, expect, it } from 'vitest';
import { getRateLimitWindow } from '../lib/rate-limit';

describe('rate limit window', () => {
  it('rounds timestamps down to the current window and computes reset time', () => {
    const window = getRateLimitWindow(65_000, 60);

    expect(window.windowStart.toISOString()).toBe('1970-01-01T00:01:00.000Z');
    expect(window.resetAt.toISOString()).toBe('1970-01-01T00:02:00.000Z');
  });

  it('handles shorter windows', () => {
    const window = getRateLimitWindow(12_345, 10);

    expect(window.windowStart.toISOString()).toBe('1970-01-01T00:00:10.000Z');
    expect(window.resetAt.toISOString()).toBe('1970-01-01T00:00:20.000Z');
  });
});
