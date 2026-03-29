'use client';

export async function trackClientEvent(event: string, properties: Record<string, unknown> = {}) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event, properties }),
      keepalive: true,
    });
  } catch {
    // Analytics should never block the UX.
  }
}
