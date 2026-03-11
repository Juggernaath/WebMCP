/**
 * Webagent MCP Server
 * 
 * Exposes browser automation tools via MCP protocol.
 * Connects to Chrome extension via WebSocket bridge.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors'; // Added cors for SSE
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools, handleToolCall } from './tools.js';
import { ExtensionBridge } from './bridge/extension-bridge.js';
import { securityManager } from './security.js';
import { RATE_LIMIT, SECURITY, FEATURES } from './config.js';

let extensionBridge = null;
let app = null;

export async function startServer(options = {}) {
    const { transport = 'stdio', port = 3000 } = options;

    console.error(`[webagent-mcp] Starting server (${transport} mode)...`);
    console.error('[webagent-mcp] Version: 1.1.0');

    // Apply environment config to security manager
    securityManager.updateConfig({
        maxActionsPerMinute: RATE_LIMIT.actionsPerMinute,
        blockedDomains: SECURITY.blockedPatterns,
        allowedDomains: SECURITY.allowedDomains,
        logActions: SECURITY.enableAuditLog,
    });

    // Initialize extension bridge
    extensionBridge = new ExtensionBridge();
    await extensionBridge.connect();

    // Create MCP server
    const server = new Server(
        {
            name: 'webagent',
            version: '1.1.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        console.error(`[webagent-mcp] Tool call: ${name}`);

        // Check rate limit
        const rateCheck = securityManager.checkRateLimit();
        if (!rateCheck.allowed) {
            console.error(`[webagent-mcp] Rate limited: ${rateCheck.reason}`);
            throw new Error(`Rate limited: ${rateCheck.reason}`);
        }

        // Check URL security for navigation
        if (name === 'web_navigate' && args?.url) {
            const urlCheck = securityManager.isUrlAllowed(args.url);
            if (!urlCheck.allowed) {
                console.error(`[webagent-mcp] URL blocked: ${urlCheck.reason}`);
                throw new Error(`URL blocked: ${urlCheck.reason}`);
            }
        }

        try {
            const result = await handleToolCall(name, args, extensionBridge);
            securityManager.logAction(name, args, { success: true }, 'mcp');

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            console.error(`[webagent-mcp] Tool error: ${error.message}`);
            securityManager.logAction(name, args, { success: false, error: error.message }, 'mcp');

            return {
                content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
                isError: true,
            };
        }
    });

    // Connect transport
    if (transport === 'stdio') {
        const stdioTransport = new StdioServerTransport();
        await server.connect(stdioTransport);
        console.error('[webagent-mcp] Server running on stdio');
    } else if (transport === 'sse') {
        app = express();
        app.use(cors()); // Allow CORS for cross-origin SSE

        let sseTransport = null;

        app.get('/sse', async (req, res) => {
            console.error('[webagent-mcp] New SSE connection');
            sseTransport = new SSEServerTransport('/message', res);
            await server.connect(sseTransport);
        });

        app.post('/message', async (req, res) => {
            if (!sseTransport) {
                res.sendStatus(400);
                return;
            }
            await sseTransport.handlePostMessage(req, res);
        });

        app.listen(port, () => {
            console.error(`[webagent-mcp] SSE Server running on port ${port}`);
        });
    }

    // Handle shutdown
    const shutdown = async () => {
        console.error('[webagent-mcp] Shutting down...');
        await extensionBridge?.disconnect();
        await server.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
