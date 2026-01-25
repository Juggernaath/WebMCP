#!/usr/bin/env node

/**
 * Webagent MCP - CLI Entry Point
 * 
 * Commands:
 *   webagent-mcp          Start MCP server (default, stdio transport)
 *   webagent-mcp serve    Start MCP server explicitly
 *   webagent-mcp setup    Auto-configure for Claude Desktop and other clients
 *   webagent-mcp --help   Show help
 */

import { startServer } from '../src/server.js';
import { runSetup } from '../src/setup.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    // If first arg is a flag or undefined, treat as "serve"
    if (!command || command.startsWith('-')) {
        await startServer({
            transport: args.includes('--sse') ? 'sse' : 'stdio',
            port: getArgValue('--port', 3000)
        });
        return;
    }

    switch (command) {
        case 'setup':
            await runSetup();
            break;

        case 'serve':
            await startServer({
                transport: args.includes('--sse') ? 'sse' : 'stdio',
                port: getArgValue('--port', 3000)
            });
            break;

        case '--help':
        case '-h':
            showHelp();
            break;

        case '--version':
        case '-v':
            const pkg = await import('../package.json', { assert: { type: 'json' } });
            console.log(pkg.default.version);
            break;

        default:
            console.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

function getArgValue(flag, defaultValue) {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
        return parseInt(args[index + 1], 10);
    }
    return defaultValue;
}

function showHelp() {
    console.log(`
Webagent MCP - Browser automation for AI agents

USAGE:
    webagent-mcp [command] [options]

COMMANDS:
    serve       Start the MCP server (default)
    setup       Auto-configure for Claude Desktop and register native messaging host

OPTIONS:
    --sse           Use SSE transport instead of stdio
    --port <num>    Port for SSE server (default: 3000)
    --help, -h      Show this help message
    --version, -v   Show version

EXAMPLES:
    webagent-mcp                    Start MCP server (stdio mode)
    webagent-mcp --sse --port 3001  Start SSE server on port 3001
    webagent-mcp setup              Configure for Claude Desktop

For more information, visit: https://webagent.dev
`);
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
