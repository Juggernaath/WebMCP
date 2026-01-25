/**
 * Retry Utility
 * 
 * Provides exponential backoff retry logic for WebMCP operations.
 */

import { RETRY } from './config.js';

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of the function
 */
export async function withRetry(fn, options = {}) {
    const {
        maxAttempts = RETRY.maxAttempts,
        initialDelay = RETRY.initialDelay,
        backoffMultiplier = RETRY.backoffMultiplier,
        maxDelay = RETRY.maxDelay,
        retryIf = () => true,  // Function to determine if error is retryable
        onRetry = null,        // Callback on retry
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (attempt >= maxAttempts || !retryIf(error)) {
                throw error;
            }

            // Log retry attempt
            console.error(`[Retry] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

            if (onRetry) {
                onRetry(error, attempt, delay);
            }

            // Wait before retrying
            await sleep(delay);

            // Exponential backoff
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }

    throw lastError;
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error) {
    const message = error.message?.toLowerCase() || '';

    // Network/connection errors are retryable
    if (message.includes('timeout')) return true;
    if (message.includes('connection')) return true;
    if (message.includes('network')) return true;
    if (message.includes('econnrefused')) return true;
    if (message.includes('econnreset')) return true;

    // Element not found might be timing issue
    if (message.includes('element not found')) return true;

    // Extension not connected is retryable
    if (message.includes('not connected')) return true;

    // Don't retry validation errors
    if (message.includes('invalid')) return false;
    if (message.includes('blocked')) return false;

    return false;
}

/**
 * Create a timeout wrapper for promises
 */
export function withTimeout(promise, ms, message = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${message} after ${ms}ms`)), ms)
        )
    ]);
}
