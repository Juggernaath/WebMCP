/**
 * Native Messaging Host
 * 
 * This is the native host that Chrome extension communicates with.
 * It receives messages from the extension and forwards them to the MCP server.
 * 
 * Run as: node native-host.js
 * 
 * Communication is via stdin/stdout with length-prefixed JSON messages.
 */

import { EventEmitter } from 'events';

/**
 * Native Messaging Host that communicates with Chrome extension
 */
export class NativeHost extends EventEmitter {
    constructor() {
        super();
        this.buffer = Buffer.alloc(0);
    }

    /**
     * Start listening for messages from Chrome extension
     */
    start() {
        process.stdin.on('data', (chunk) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.processBuffer();
        });

        process.stdin.on('end', () => {
            this.emit('disconnect');
        });

        process.stdin.on('error', (error) => {
            this.emit('error', error);
        });
    }

    /**
     * Process buffered data to extract complete messages
     * Chrome native messaging uses length-prefixed messages:
     * - First 4 bytes: message length (little-endian uint32)
     * - Remaining bytes: JSON message
     */
    processBuffer() {
        while (this.buffer.length >= 4) {
            const messageLength = this.buffer.readUInt32LE(0);

            if (this.buffer.length < 4 + messageLength) {
                // Not enough data yet
                break;
            }

            const messageData = this.buffer.slice(4, 4 + messageLength);
            this.buffer = this.buffer.slice(4 + messageLength);

            try {
                const message = JSON.parse(messageData.toString('utf8'));
                this.emit('message', message);
            } catch (error) {
                this.emit('error', new Error(`Failed to parse message: ${error.message}`));
            }
        }
    }

    /**
     * Send a message to Chrome extension
     * @param {object} message - Message to send
     */
    send(message) {
        const messageJson = JSON.stringify(message);
        const messageBuffer = Buffer.from(messageJson, 'utf8');
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

        process.stdout.write(lengthBuffer);
        process.stdout.write(messageBuffer);
    }
}

/**
 * Wrapper to use native messaging from MCP server side
 * Connects to the native host process
 */
export class NativeMessagingClient extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.buffer = Buffer.alloc(0);
        this.pendingRequests = new Map();
    }

    /**
     * Spawn the native host process
     * @param {string} hostPath - Path to native host executable
     */
    async connect(hostPath) {
        const { spawn } = await import('child_process');

        this.process = spawn('node', [hostPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout.on('data', (chunk) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.processBuffer();
        });

        this.process.stderr.on('data', (data) => {
            console.error('[NativeMessaging] stderr:', data.toString());
        });

        this.process.on('close', (code) => {
            this.emit('disconnect', code);
        });

        this.process.on('error', (error) => {
            this.emit('error', error);
        });
    }

    /**
     * Process buffered data
     */
    processBuffer() {
        while (this.buffer.length >= 4) {
            const messageLength = this.buffer.readUInt32LE(0);

            if (this.buffer.length < 4 + messageLength) {
                break;
            }

            const messageData = this.buffer.slice(4, 4 + messageLength);
            this.buffer = this.buffer.slice(4 + messageLength);

            try {
                const message = JSON.parse(messageData.toString('utf8'));
                this.handleResponse(message);
            } catch (error) {
                console.error('[NativeMessaging] Parse error:', error.message);
            }
        }
    }

    /**
     * Handle response from native host
     */
    handleResponse(message) {
        const { requestId } = message;

        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);

            if (message.success) {
                resolve(message.result);
            } else {
                reject(new Error(message.error?.message || 'Unknown error'));
            }
        } else {
            this.emit('message', message);
        }
    }

    /**
     * Send a request and wait for response
     */
    async request(action, params = {}, timeout = 30000) {
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

            this.send({
                requestId,
                action,
                params
            });
        });
    }

    /**
     * Send a message
     */
    send(message) {
        if (!this.process) {
            throw new Error('Not connected');
        }

        const messageJson = JSON.stringify(message);
        const messageBuffer = Buffer.from(messageJson, 'utf8');
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

        this.process.stdin.write(lengthBuffer);
        this.process.stdin.write(messageBuffer);
    }

    /**
     * Disconnect
     */
    disconnect() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.pendingRequests.clear();
    }
}
