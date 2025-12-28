import { NextResponse } from 'next/server';

// Global counter for round-robin
let requestCounter = 0;

export interface GeminiRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
}

/**
 * Executes a fetch request to Gemini API with automatic key rotation and retries on failure.
 * It will try up to all available keys in the pool if it encounters common errors.
 */
export async function fetchWithKeyRotation(
    endpoint: string,
    options: GeminiRequestOptions = {}
) {
    const apiKeyPool = process.env.GEMINI_API_KEY_POOL;
    if (!apiKeyPool) {
        throw new Error('GEMINI_API_KEY_POOL environment variable is not set');
    }

    const apiKeys = apiKeyPool.split(',').map(key => key.trim()).filter(key => key.length > 0);
    if (apiKeys.length === 0) {
        throw new Error('No valid API keys found in GEMINI_API_KEY_POOL');
    }

    const maxTries = apiKeys.length;
    let lastError: any = null;

    // Start from the current global index
    let startIndex = requestCounter % apiKeys.length;

    for (let i = 0; i < maxTries; i++) {
        const currentIndex = (startIndex + i) % apiKeys.length;
        const selectedApiKey = apiKeys[currentIndex];

        // Ensure requestCounter advances for the next call (optional, but keeps it rotating)
        if (i === 0) requestCounter++;

        const url = endpoint.includes('?')
            ? `${endpoint}&key=${selectedApiKey}`
            : `${endpoint}?key=${selectedApiKey}`;

        try {
            const response = await fetch(url, {
                method: options.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
            });

            const data = await response.json();

            if (response.ok) {
                // If it's a Gemini error hidden in a 200 (though rare for status codes)
                if (data.error) {
                    console.error(`[Gemini] Key ${currentIndex + 1} returned error:`, data.error.message);
                    lastError = data.error;
                    continue; // Try next key
                }

                return {
                    data,
                    apiKeyIndex: currentIndex + 1,
                    totalKeys: apiKeys.length
                };
            }

            // Handle specific failures that warrant trying another key
            // 403: Suspended/Permission denied
            // 429: Rate limit
            // 500/503: Server error (sometimes key specific or temporary)
            console.warn(`[Gemini] Key ${currentIndex + 1} failed with status ${response.status}:`, data.error?.message || 'Unknown error');

            lastError = {
                status: response.status,
                details: data
            };

            // If it's a "suspended" or "rate limit" error, definitely try another key
            const errorMessage = data.error?.message || '';
            const isSuspended = errorMessage.includes('suspended') || errorMessage.includes('CONSUMER_SUSPENDED');
            const isRateLimit = response.status === 429;

            if (isSuspended || isRateLimit || response.status >= 500) {
                continue;
            } else {
                // For other errors (400 Bad Request etc.), we might not want to retry with other keys
                // as the issue is likely with the request itself.
                break;
            }

        } catch (error) {
            console.error(`[Gemini] Network error with key ${currentIndex + 1}:`, error);
            lastError = error;
            continue; // Try next key
        }
    }

    throw lastError || new Error('All API keys failed');
}
