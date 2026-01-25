/**
 * Security Manager
 * 
 * Handles security policies for Webagent:
 * - Domain allow/block lists
 * - Session authorization
 * - Activity logging
 */

export class SecurityManager {
    constructor() {
        this.config = {
            blockedDomains: [],
            allowedDomains: [],  // Empty = allow all
            requireSessionApproval: false,
            logActions: true,
            maxActionsPerMinute: 60,
        };

        this.actionLog = [];
        this.actionCount = 0;
        this.lastMinuteReset = Date.now();
    }

    /**
     * Check if a URL is allowed
     */
    isUrlAllowed(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.toLowerCase();

            // Check blocked domains (user configured only)
            if (this.config.blockedDomains.length > 0) {
                for (const blocked of this.config.blockedDomains) {
                    if (domain.includes(blocked.toLowerCase())) {
                        return { allowed: false, reason: `Domain blocked: ${blocked}` };
                    }
                }
            }

            // Check allowed domains (if configured)
            if (this.config.allowedDomains.length > 0) {
                const isAllowed = this.config.allowedDomains.some(
                    allowed => domain.includes(allowed.toLowerCase())
                );
                if (!isAllowed) {
                    return { allowed: false, reason: 'Domain not in allowlist' };
                }
            }

            return { allowed: true };
        } catch (error) {
            return { allowed: false, reason: `Invalid URL: ${error.message}` };
        }
    }

    /**
     * Check rate limits
     */
    checkRateLimit() {
        const now = Date.now();

        // Reset counter every minute
        if (now - this.lastMinuteReset > 60000) {
            this.actionCount = 0;
            this.lastMinuteReset = now;
        }

        if (this.actionCount >= this.config.maxActionsPerMinute) {
            return { allowed: false, reason: 'Rate limit exceeded' };
        }

        this.actionCount++;
        return { allowed: true };
    }

    /**
     * Log an action
     */
    logAction(action, params, result, source) {
        if (!this.config.logActions) return;

        const entry = {
            timestamp: Date.now(),
            action,
            params: this.sanitizeParams(params),
            success: result?.success !== false,
            source,
        };

        this.actionLog.push(entry);

        // Keep only last 1000 entries
        if (this.actionLog.length > 1000) {
            this.actionLog = this.actionLog.slice(-1000);
        }
    }

    /**
     * Get recent activity
     */
    getRecentActivity(limit = 50) {
        return this.actionLog.slice(-limit).reverse();
    }

    /**
     * Sanitize params for logging (remove sensitive data)
     */
    sanitizeParams(params) {
        const sanitized = { ...params };

        // Remove potentially sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'cookie'];
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        // Truncate long values
        for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === 'string' && value.length > 100) {
                sanitized[key] = value.slice(0, 100) + '...';
            }
        }

        return sanitized;
    }

    /**
     * Update security config
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Get current config
     */
    getConfig() {
        return { ...this.config };
    }
}

// Singleton instance
export const securityManager = new SecurityManager();
