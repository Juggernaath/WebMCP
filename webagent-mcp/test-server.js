import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';

console.log('🧪 Starting WebMCP Server Test...');

// Start the server (assuming it's running via node)
const serverProcess = spawn('node', ['bin/webagent-mcp.js', '--sse', '--port', '3000'], {
    cwd: process.cwd(),
    stdio: 'pipe'
});

serverProcess.stdout.on('data', (data) => console.log(`[Server] ${data}`));
serverProcess.stderr.on('data', (data) => console.error(`[Server Error] ${data}`));

// Give it time to start
await new Promise(resolve => setTimeout(resolve, 2000));

try {
    console.log('🔌 Connecting to WebSocket...');
    // Note: MCP might use SSE or Stdio. The --sse flag starts an HTTP/SSE server.
    // BUT the internal bridge for the extension uses WebSocket on port 52789.
    // Let's test the INTERNAL BRIDGE first because that's what the extension uses.

    // Test 1: Connect to Extension Bridge (Port 52789)
    const ws = new WebSocket('ws://localhost:52789');

    await new Promise((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Connected to Extension Bridge (Port 52789)');
            resolve();
        });
        ws.on('error', (err) => reject(new Error(`Failed to connect: ${err.message}`)));
    });

    // Test 2: Send "ping" or "getStatus"
    console.log('📡 Sending status check...');
    ws.send(JSON.stringify({ action: 'ping' }));

    // Wait for response
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for pong')), 5000);

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            console.log('📥 Received:', msg);
            if (msg.pong || msg.version) {
                console.log('✅ Received PONG/Version');
                clearTimeout(timeout);
                resolve();
            }
        });
    });

    ws.close();
    console.log('✅ WebSocket Test Passed');

} catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
} finally {
    serverProcess.kill();
    console.log('🧹 Cleanup complete');
}
