
import http from 'http';

const MCP_PORT = 3000;
let messageId = 0;
const pendingMessages = new Map();

async function connectSSE() {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
            res.on('data', (chunk) => {
                const events = chunk.toString().split('\n\n');
                for (const event of events) {
                    if (!event.trim()) continue;
                    let data = '';
                    for (const line of event.split('\n')) {
                        if (line.startsWith('data:')) data = line.slice(5).trim();
                    }
                    if (data) {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.id && pendingMessages.has(parsed.id)) {
                                pendingMessages.get(parsed.id).resolve(parsed.result);
                                pendingMessages.delete(parsed.id);
                            }
                        } catch (e) { }
                    }
                }
            });
            setTimeout(resolve, 500);
        });
        req.on('error', reject);
    });
}

async function callTool(name, args = {}) {
    const id = ++messageId;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pendingMessages.delete(id); reject(new Error(`Timeout: ${name}`)); }, 30000);
        pendingMessages.set(id, {
            resolve: (result) => {
                clearTimeout(timeout);
                resolve(result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result);
            }
        });
        const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
        const req = http.request({
            hostname: 'localhost', port: MCP_PORT, path: '/message', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function runReview() {
    console.log('🔍 Reviewing Website...');
    try {
        await connectSSE();

        console.log('1. Navigating to localhost:5000...');
        await callTool('web_navigate', { url: 'http://localhost:5000' });
        await callTool('web_wait', { ms: 1000 });

        console.log('2. Reading page content...');
        const page = await callTool('web_read_page');

        console.log('\n--- Website Audit Report ---');
        console.log(`Title: ${page.title}`);
        console.log(`URL: ${page.url}`);
        console.log(`Buttons: ${page.buttons?.length || 0}`);
        console.log(`Navigation Links: ${page.buttons?.filter(b => b.val || b.text).length || 0}`);

        console.log('\n--- Key Sections Detected ---');
        const sections = ['Features', 'How', 'Demo', 'Install'];
        const content = JSON.stringify(page);
        sections.forEach(s => {
            const found = content.includes(s) ? '✅ Found' : '❌ Missing';
            console.log(`- ${s}: ${found}`);
        });

        console.log('\n✅ Website loaded successfully!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    process.exit(0);
}

runReview();
