/**
 * WebMCP Automated Test Suite
 * 
 * Tests WebMCP through the SSE/HTTP interface.
 * 
 * Usage:
 * 1. Start MCP server in SSE mode: node bin/webagent-mcp.js --sse --port 3000
 * 2. Run tests: node test-webmcp.js
 */

import http from 'http';
import { EventEmitter } from 'events';

const MCP_PORT = 3000;
const TOOL_TIMEOUT = 30000;

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

let messageId = 0;
let sseClient = null;
const pendingMessages = new Map();

/**
 * Connect to SSE endpoint
 */
async function connectSSE() {
    return new Promise((resolve, reject) => {
        console.log(`Connecting to SSE at http://localhost:${MCP_PORT}/sse...`);

        http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
            console.log('✅ SSE Connected');
            sseClient = res;

            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();

                // Parse SSE events
                const events = buffer.split('\n\n');
                buffer = events.pop(); // Keep incomplete data

                for (const event of events) {
                    if (!event.trim()) continue;

                    const lines = event.split('\n');
                    let eventType = 'message';
                    let data = '';

                    for (const line of lines) {
                        if (line.startsWith('event:')) {
                            eventType = line.slice(6).trim();
                        } else if (line.startsWith('data:')) {
                            data = line.slice(5).trim();
                        }
                    }

                    if (data) {
                        try {
                            const parsed = JSON.parse(data);
                            handleSSEMessage(parsed);
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            });

            res.on('error', (err) => {
                console.error('SSE Error:', err.message);
            });

            // Give it a moment to establish
            setTimeout(resolve, 500);
        }).on('error', (err) => {
            reject(new Error(`Failed to connect: ${err.message}`));
        });
    });
}

/**
 * Handle SSE response message
 */
function handleSSEMessage(message) {
    if (message.id && pendingMessages.has(message.id)) {
        const { resolve, reject } = pendingMessages.get(message.id);
        pendingMessages.delete(message.id);

        if (message.error) {
            reject(new Error(message.error.message || 'Unknown error'));
        } else {
            resolve(message.result);
        }
    }
}

/**
 * Send JSON-RPC message via POST
 */
async function sendMessage(method, params) {
    const id = ++messageId;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingMessages.delete(id);
            reject(new Error(`Timeout: ${method}`));
        }, TOOL_TIMEOUT);

        pendingMessages.set(id, {
            resolve: (result) => {
                clearTimeout(timeoutId);
                resolve(result);
            },
            reject: (err) => {
                clearTimeout(timeoutId);
                reject(err);
            }
        });

        const body = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
        });

        const req = http.request({
            hostname: 'localhost',
            port: MCP_PORT,
            path: '/message',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // Response comes via SSE, not here
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeoutId);
            pendingMessages.delete(id);
            reject(err);
        });

        req.write(body);
        req.end();
    });
}

/**
 * Call an MCP tool
 */
async function callTool(toolName, args = {}) {
    const result = await sendMessage('tools/call', {
        name: toolName,
        arguments: args
    });

    // Parse the text content
    if (result?.content?.[0]?.text) {
        return JSON.parse(result.content[0].text);
    }

    return result;
}

/**
 * Run a single test
 */
async function runTest(name, fn) {
    process.stdout.write(`  ${name}... `);

    try {
        await fn();
        console.log('✅ PASS');
        results.passed++;
        results.tests.push({ name, status: 'pass' });
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        results.failed++;
        results.tests.push({ name, status: 'fail', error: error.message });
    }
}

/**
 * Main test suite
 */
async function runTests() {
    console.log('\n🧪 WebMCP Automated Test Suite (SSE Mode)\n');
    console.log('='.repeat(50));

    try {
        await connectSSE();
    } catch (error) {
        console.error(`\n❌ ${error.message}`);
        console.log('\nMake sure to start the MCP server in SSE mode:');
        console.log('  node bin/webagent-mcp.js --sse --port 3000\n');
        process.exit(1);
    }

    console.log('\n📋 Running Tests...\n');

    // =========================================================================
    // NAVIGATION TESTS
    // =========================================================================
    console.log('Navigation:');

    await runTest('navigate to test page', async () => {
        const result = await callTool('web_navigate', {
            url: 'https://httpbin.org/forms/post'
        });
        if (!result.navigated) throw new Error('Navigation failed');
    });

    await runTest('wait 2 seconds', async () => {
        const result = await callTool('web_wait', { ms: 2000 });
        if (!result.waited) throw new Error('Wait failed');
    });

    // =========================================================================
    // PAGE READING TESTS
    // =========================================================================
    console.log('\nPage Reading:');

    await runTest('read page content', async () => {
        const result = await callTool('web_read_page');
        if (!result.url) throw new Error('No URL in response');
        console.log(`\n     URL: ${result.url}`);
        console.log(`     Inputs: ${result.inputs?.length || 0}`);
    });

    // =========================================================================
    // INTERACTION TESTS
    // =========================================================================
    console.log('\nInteractions:');

    await runTest('click on name input', async () => {
        const result = await callTool('web_click', {
            selector: 'input[name="custname"]'
        });
        if (!result.clicked) throw new Error('Click failed');
    });

    await runTest('type customer name', async () => {
        const result = await callTool('web_type', {
            selector: 'input[name="custname"]',
            text: 'WebMCP Test',
            clear: true
        });
        if (!result.typed) throw new Error('Type failed');
    });

    await runTest('click pizza size (radio button)', async () => {
        // Note: httpbin uses radio buttons for size, not a dropdown
        const result = await callTool('web_click', {
            selector: 'input[name="size"][value="medium"]'
        });
        if (!result.clicked) throw new Error('Click failed');
    });

    await runTest('scroll down', async () => {
        const result = await callTool('web_scroll', {
            direction: 'down',
            amount: 200
        });
        if (!result.scrolled) throw new Error('Scroll failed');
    });

    await runTest('press Tab key', async () => {
        const result = await callTool('web_press_key', { key: 'Tab' });
        if (!result.pressed) throw new Error('Key press failed');
    });

    // =========================================================================
    // FORM TESTS
    // =========================================================================
    console.log('\nForms:');

    await runTest('analyze form', async () => {
        const result = await callTool('web_analyze_form', { formIndex: 0 });
        if (!result.hasForm) throw new Error('No form found');
        console.log(`\n     Fields: ${result.fields?.length || 0}`);
    });

    // =========================================================================
    // TAB TESTS  
    // =========================================================================
    console.log('\nTabs:');

    await runTest('list tabs', async () => {
        const result = await callTool('web_list_tabs');
        if (!result.tabs) throw new Error('No tabs returned');
        console.log(`\n     Open tabs: ${result.tabs.length}`);
    });

    // =========================================================================
    // RESULTS
    // =========================================================================
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Test Results:\n');
    console.log(`   ✅ Passed: ${results.passed}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   📋 Total:  ${results.passed + results.failed}`);

    if (results.failed > 0) {
        console.log('\n❌ Failed Tests:');
        results.tests
            .filter(t => t.status === 'fail')
            .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
    }

    const passRate = Math.round((results.passed / (results.passed + results.failed)) * 100);
    console.log(`\n   Pass Rate: ${passRate}%`);

    console.log('\n' + '='.repeat(50) + '\n');

    process.exit(results.failed > 0 ? 1 : 0);
}

// Run
runTests();
