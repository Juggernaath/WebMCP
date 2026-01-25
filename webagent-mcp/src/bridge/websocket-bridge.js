/**
 * WebSocket Bridge
 * 
 * Alternative to native messaging - uses WebSocket for communication
 * between MCP server and Chrome extension.
 * 
 * Advantages:
 * - Simpler setup (no native host registration needed)
 * - Works across platforms the same way
 * 
 * Disadvantages:
 * - Extension must initiate connection (can't push from MCP)
 * - Requires local WebSocket server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { WS_PORT, TIMEOUTS } from '../config.js';

/**
 * WebSocket server that Chrome extension connects to
 */
export class WebSocketBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port || WS_PORT;
        this.server = null;
        this.clients = new Set();
        this.pendingRequests = new Map();
    }

    /**
     * Start WebSocket server
     */
    async start() {
        return new Promise((resolve, reject) => {
            this.server = new WebSocketServer({ port: this.port });

            this.server.on('listening', () => {
                console.error(`[WebSocketBridge] Listening on port ${this.port}`);
                resolve();
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`[WebSocketBridge] Port ${this.port} in use, trying ${this.port + 1}`);
                    this.port++;
                    this.server.close();
                    this.start().then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            });

            this.server.on('connection', (ws, req) => {
                this.handleConnection(ws, req);
            });
        });
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        const clientId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        console.error(`[WebSocketBridge] Client connected: ${clientId}`);

        this.clients.add(ws);

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('[WebSocketBridge] Invalid message:', error.message);
            }
        });

        ws.on('close', () => {
            console.error(`[WebSocketBridge] Client disconnected: ${clientId}`);
            this.clients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error(`[WebSocketBridge] Client error:`, error.message);
            this.clients.delete(ws);
        });

        // Send handshake
        ws.send(JSON.stringify({
            type: 'handshake',
            version: '1.0.0',
            clientId
        }));
    }

    /**
     * Handle incoming message from extension
     */
    handleMessage(ws, message) {
        const { requestId, type } = message;

        // Response to our request
        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);

            if (message.success) {
                resolve(message.result);
            } else {
                reject(new Error(message.error?.message || 'Unknown error'));
            }
            return;
        }

        // Event from extension
        if (type === 'event') {
            this.emit('extensionEvent', message);
        }
    }

    /**
     * Execute action in browser
     */
    async execute(action, params = {}, timeout = TIMEOUTS.extensionResponse) {
        const ws = this.getActiveClient();
        if (!ws) {
            throw new Error('No extension connected. Make sure the Webagent extension is installed and enabled.');
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${action}`));
            }, timeout);

            this.pendingRequests.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });

            ws.send(JSON.stringify({
                requestId,
                action,
                params
            }));
        });
    }

    /**
     * Get first active WebSocket client
     */
    getActiveClient() {
        for (const ws of this.clients) {
            if (ws.readyState === WebSocket.OPEN) {
                return ws;
            }
        }
        return null;
    }

    /**
     * Check if any extension is connected
     */
    isConnected() {
        return this.getActiveClient() !== null;
    }

    /**
     * Stop server
     */
    async stop() {
        for (const ws of this.clients) {
            ws.close();
        }
        this.clients.clear();
        this.pendingRequests.clear();

        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
    }
}
