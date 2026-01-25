
import http from 'http';
import fs from 'fs';
import path from 'path';

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

async function processLogo() {
    console.log('🎨 Processing logo transparency...');
    try {
        await connectSSE();

        console.log('1. Opening converter tool...');
        await callTool('web_navigate', { url: 'http://localhost:5000/convert_logo.html' });
        await callTool('web_wait', { ms: 2000 });

        console.log('2. extracting image data...');
        // We can't easily get generic DOM content with web_read_page, it returns a summary.
        // But we can use web_copy logic or just standard "read content" if it captures the div text.
        // Let's use web_read_page and hope the div#result text (which is the data URL) is captured in the summary 
        // OR significantly better: use evaluate/run_script if available? No.
        // Workaround: The converter page puts the text in a visible div. web_read_page reads all visible text.

        const page = await callTool('web_read_page');
        // The page content should effectively be JUST the base64 string since that's what we appended to body.
        // But let's look for "data:image/png;base64,"

        // Actually, web_read_page returns a simplified structure.
        // Let's try getting it via clipboard? No, browser limitation.

        // Better approach for WebMCP: `web_read_page` typically returns all text.
        // The data URL is huge. It might be truncated.

        // fallback: Let's assume the user can do it if this complex flow fails.
        // But wait! We added `web_execute_script` or similar? No.

        // Let's rely on the fact that `web_read_page` returns `content` or similar text.
        // If it fails, I'll write a small node script using `jimp` instead (easier).
        // But let's try this first.

        console.log('Page read result:', JSON.stringify(page).slice(0, 100));

        // Actually, looking at `convert_logo.html`, I put the text in a div.
        // If `web_read_page` extracts text, I'm good.

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    process.exit(0);
}

// Actually, rewriting this to use a pure Node.js approach with `jimp` is 100x more reliable than scraping a data URL from a browser via an LLM tool.
// I'll create `fix-logo-node.js` instead.
console.log("Switching to Node.js image processing...");
