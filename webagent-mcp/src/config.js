/**
 * WebMCP Configuration
 * 
 * Centralized configuration with environment variable overrides.
 * All timeouts, ports, and limits are configurable.
 */

// Port configuration
export const WS_PORT = parseInt(process.env.WEBMCP_WS_PORT || '8080', 10);
export const SSE_PORT = parseInt(process.env.WEBMCP_SSE_PORT || '3000', 10);

// Timeout configuration (milliseconds)
export const TIMEOUTS = {
    /** Default timeout for tool execution */
    toolExecution: parseInt(process.env.WEBMCP_TOOL_TIMEOUT || '60000', 10),

    /** Timeout for page navigation */
    navigation: parseInt(process.env.WEBMCP_NAV_TIMEOUT || '30000', 10),

    /** Timeout for WebSocket connection */
    wsConnection: parseInt(process.env.WEBMCP_WS_TIMEOUT || '10000', 10),

    /** Timeout for extension response */
    extensionResponse: parseInt(process.env.WEBMCP_EXT_TIMEOUT || '60000', 10),
};

// Retry configuration
export const RETRY = {
    /** Maximum retry attempts */
    maxAttempts: parseInt(process.env.WEBMCP_RETRY_ATTEMPTS || '3', 10),

    /** Initial delay between retries (ms) */
    initialDelay: parseInt(process.env.WEBMCP_RETRY_DELAY || '1000', 10),

    /** Backoff multiplier */
    backoffMultiplier: parseFloat(process.env.WEBMCP_RETRY_BACKOFF || '2'),

    /** Maximum delay between retries (ms) */
    maxDelay: parseInt(process.env.WEBMCP_RETRY_MAX_DELAY || '10000', 10),
};

// Rate limiting
export const RATE_LIMIT = {
    /** Maximum actions per minute */
    actionsPerMinute: parseInt(process.env.WEBMCP_RATE_LIMIT || '60', 10),

    /** Burst limit (max actions in quick succession) */
    burstLimit: parseInt(process.env.WEBMCP_BURST_LIMIT || '10', 10),
};

// Security
export const SECURITY = {
    /** Blocked URL patterns (regex strings) */
    blockedPatterns: (process.env.WEBMCP_BLOCKED_PATTERNS || '').split(',').filter(Boolean),

    /** Allowed domains (empty = all allowed) */
    allowedDomains: (process.env.WEBMCP_ALLOWED_DOMAINS || '').split(',').filter(Boolean),

    /** Enable action logging */
    enableAuditLog: process.env.WEBMCP_AUDIT_LOG !== 'false',
};

// Feature flags
export const FEATURES = {
    /** Enable mock mode for testing */
    mockMode: process.env.WEBAGENT_MOCK === 'true',

    /** Enable verbose logging */
    verbose: process.env.WEBMCP_VERBOSE === 'true',
};

/**
 * Get full configuration object
 */
export function getConfig() {
    return {
        wsPort: WS_PORT,
        ssePort: SSE_PORT,
        timeouts: TIMEOUTS,
        retry: RETRY,
        rateLimit: RATE_LIMIT,
        security: SECURITY,
        features: FEATURES,
    };
}

/**
 * Log configuration on startup (hides sensitive values)
 */
export function logConfig() {
    console.error('[webagent-mcp] Configuration:');
    console.error(`  WebSocket Port: ${WS_PORT}`);
    console.error(`  SSE Port: ${SSE_PORT}`);
    console.error(`  Tool Timeout: ${TIMEOUTS.toolExecution}ms`);
    console.error(`  Retry Attempts: ${RETRY.maxAttempts}`);
    console.error(`  Rate Limit: ${RATE_LIMIT.actionsPerMinute}/min`);
    console.error(`  Mock Mode: ${FEATURES.mockMode}`);
}
