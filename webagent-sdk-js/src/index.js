/**
 * Webagent JavaScript SDK
 * 
 * Client library for web apps to communicate with the Webagent extension.
 */

class WebagentClient {
    constructor(options = {}) {
        this.extensionId = options.extensionId || null;
        this.appId = options.appId || 'unknown';
        this.timeout = options.timeout || 30000;
        this.debug = options.debug || false;
    }

    /**
     * Check if Webagent extension is available
     */
    isAvailable() {
        return typeof chrome !== 'undefined' &&
            typeof chrome.runtime !== 'undefined' &&
            typeof chrome.runtime.sendMessage === 'function';
    }

    /**
     * Send a request to the Webagent extension
     */
    async send(action, params = {}, context = {}) {
        if (!this.isAvailable()) {
            throw new Error('Webagent extension not available');
        }

        const requestId = this._generateId();
        const request = {
            requestId,
            appId: this.appId,
            action,
            params,
            context
        };

        if (this.debug) {
            console.log('[Webagent SDK] Sending:', request);
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Webagent request timeout'));
            }, this.timeout);

            chrome.runtime.sendMessage(this.extensionId, request, response => {
                clearTimeout(timeoutId);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (this.debug) {
                    console.log('[Webagent SDK] Response:', response);
                }

                if (!response.success) {
                    const error = new Error(response.error?.message || 'Unknown error');
                    error.code = response.error?.code;
                    reject(error);
                    return;
                }

                resolve(response.result);
            });
        });
    }

    // =========================================================================
    // NAVIGATION
    // =========================================================================

    async navigate(url) {
        return this.send('navigate', { url });
    }

    async wait(ms) {
        return this.send('wait', { ms });
    }

    // =========================================================================
    // PAGE READING
    // =========================================================================

    async readPage() {
        return this.send('page.read', {});
    }

    // =========================================================================
    // INTERACTIONS
    // =========================================================================

    async click(selectorOrOptions) {
        const params = typeof selectorOrOptions === 'string'
            ? { selector: selectorOrOptions }
            : selectorOrOptions;
        return this.send('click', params);
    }

    async type(selector, text, clear = true) {
        return this.send('type', { selector, text, clear });
    }

    async select(selector, valueOrText) {
        const params = { selector };
        // If it looks like an option value, use value; otherwise use text
        if (valueOrText.length <= 3) {
            params.value = valueOrText;
        } else {
            params.text = valueOrText;
        }
        return this.send('select', params);
    }

    async scroll(direction = 'down', amount = 300) {
        return this.send('scroll', { direction, amount });
    }

    // =========================================================================
    // FILE UPLOAD
    // =========================================================================

    async upload(selector, fileUrl, fileName) {
        return this.send('upload', { selector, fileUrl, fileName });
    }

    // =========================================================================
    // FORMS
    // =========================================================================

    async analyzeForm(formIndex = 0) {
        return this.send('form.analyze', { formIndex });
    }

    async fillForm(data, userProfile = null) {
        return this.send('form.fill', { data }, { userProfile });
    }

    // =========================================================================
    // HUMAN-IN-LOOP
    // =========================================================================

    async requestHIL(type, message) {
        return this.send('hil.request', { type, message });
    }

    async resolveHIL(hilId) {
        return this.send('hil.resolve', { hilId });
    }

    /**
     * Wait for user to complete HIL action
     */
    async waitForHIL(hilId, pollInterval = 2000, maxWait = 300000) {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            // Check if HIL is still pending
            const page = await this.readPage();

            // If CAPTCHA is gone, assume resolved
            if (!page.captcha?.detected) {
                await this.resolveHIL(hilId);
                return { resolved: true };
            }

            await new Promise(r => setTimeout(r, pollInterval));
        }

        throw new Error('HIL wait timeout');
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    _generateId() {
        return 'req_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
}

// =========================================================================
// EXPORTS
// =========================================================================

// ES Module export
export { WebagentClient };

// UMD export for script tag usage
if (typeof window !== 'undefined') {
    window.WebagentClient = WebagentClient;
}
