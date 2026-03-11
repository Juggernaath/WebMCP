/**
 * Extension Bridge
 * 
 * Handles communication between the MCP server and the Chrome extension.
 * Uses WebSocket for reliable bidirectional communication.
 */

import { EventEmitter } from 'events';
import { WebSocketBridge } from './websocket-bridge.js';
import { WS_PORT, FEATURES } from '../config.js';
import { withRetry, isRetryableError } from '../retry.js';

export class ExtensionBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        this.connected = false;
        this.wsBridge = null;
        this.mockMode = options.mock || FEATURES.mockMode;
        this.port = options.port || WS_PORT;
    }

    /**
     * Connect to the Chrome extension
     */
    async connect() {
        if (this.mockMode) {
            console.error('[ExtensionBridge] Running in MOCK mode (set WEBAGENT_MOCK=false for production)');
            this.connected = true;
            return true;
        }

        console.error('[ExtensionBridge] Starting WebSocket bridge...');

        try {
            this.wsBridge = new WebSocketBridge({ port: this.port });
            await this.wsBridge.start();

            this.wsBridge.on('extensionEvent', (event) => {
                this.emit('extensionEvent', event);
            });

            this.connected = true;
            console.error('[ExtensionBridge] Waiting for extension to connect...');
            console.error(`[ExtensionBridge] Extension should connect to ws://localhost:${this.wsBridge.port}`);

            return true;
        } catch (error) {
            console.error('[ExtensionBridge] Failed to start:', error.message);
            console.error('[ExtensionBridge] Falling back to mock mode');
            this.mockMode = true;
            this.connected = true;
            return true;
        }
    }

    /**
     * Disconnect from the extension
     */
    async disconnect() {
        if (this.wsBridge) {
            await this.wsBridge.stop();
            this.wsBridge = null;
        }
        this.connected = false;
        console.error('[ExtensionBridge] Disconnected');
    }

    /**
     * Check if extension is connected
     */
    isExtensionConnected() {
        if (this.mockMode) return true;
        return this.wsBridge?.isConnected() || false;
    }

    /**
     * Execute an action in the browser via the extension
     * Includes retry logic for transient failures
     */
    async execute(action, params = {}) {
        if (!this.connected) {
            throw new Error('Extension bridge not connected');
        }

        console.error(`[ExtensionBridge] Executing: ${action}`, JSON.stringify(params).slice(0, 100));

        // Use real bridge if extension is connected
        if (!this.mockMode && this.wsBridge?.isConnected()) {
            return await withRetry(
                async () => await this.wsBridge.execute(action, params),
                {
                    retryIf: isRetryableError,
                    onRetry: (err, attempt, delay) => {
                        console.error(`[ExtensionBridge] Retry ${attempt}: ${err.message}, waiting ${delay}ms`);
                    }
                }
            );
        }

        // Fall back to mock for testing
        if (this.mockMode || !this.wsBridge?.isConnected()) {
            console.error('[ExtensionBridge] Using mock response (no extension connected)');
            return this.mockExecute(action, params);
        }
    }

    /**
     * Mock execution for testing without extension
     */
    async mockExecute(action, params) {
        await new Promise(r => setTimeout(r, 100));

        switch (action) {
            case 'navigate':
                return { navigated: true, url: params.url };

            case 'page.read':
                return {
                    url: 'https://example.com',
                    title: 'Mock Page',
                    elements: [
                        { ref: 1, role: 'link', name: 'Example Link', visible: true, selector: 'a' },
                        { ref: 2, role: 'textbox', name: 'Search', visible: true, selector: 'input[type="text"]' },
                        { ref: 3, role: 'button', name: 'Submit', visible: true, selector: 'button' }
                    ],
                    forms: [],
                    captcha: { detected: false },
                };

            case 'click':
                return { clicked: true };

            case 'type':
                return { typed: true, length: params.text?.length || 0 };

            case 'select':
                return { selected: true, value: params.value || params.text };

            case 'scroll':
                return { scrolled: true, direction: params.direction, amount: params.amount };

            case 'wait':
                await new Promise(r => setTimeout(r, params.ms || 1000));
                return { waited: params.ms || 1000 };

            case 'screenshot':
                return {
                    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    format: params.format || 'png'
                };

            case 'tabs.list':
                return {
                    tabs: [
                        { id: 1, url: 'https://example.com', title: 'Example (Mock)', active: true },
                    ],
                };

            case 'tabs.create':
                return { tabId: 2, url: params.url };

            case 'tabs.close':
                return { closed: true };

            case 'form.analyze':
                return {
                    hasForm: true,
                    fields: [
                        { index: 0, selector: '#email', type: 'email', label: 'Email', required: true },
                        { index: 1, selector: '#password', type: 'password', label: 'Password', required: true },
                    ],
                };

            case 'form.fill':
                return { filled: Object.keys(params.data || {}).length, total: 2, errors: null };

            case 'hover':
                return { hovered: true };

            case 'press_key':
                return { pressed: params.key };

            case 'waitForElement':
                return { found: true, elapsed: 100 };

            case 'waitForNavigation':
                return { navigated: true, elapsed: 500 };

            case 'upload':
                return { uploaded: true, fileName: params.filename };

            case 'ping':
                return { pong: true, version: '1.1.0', mock: true };

            default:
                console.error(`[ExtensionBridge] Unknown action: ${action}`);
                throw new Error(`Unknown action: ${action}`);
        }
    }
}
