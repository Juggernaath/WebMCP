/**
 * Real-World Scenario: GitHub Profile Search & Scrape
 * 
 * Similar to social media but fully legitimate - GitHub profiles are public
 */

import http from 'http';

const MCP_PORT = 3000;
let messageId = 0;
const pendingMessages = new Map();

async function connectSSE() {
    return new Promise((resolve, reject) => {
        console.log('🔌 Connecting to WebMCP...');
        http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
            console.log('✅ Connected\n');
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                const events = buffer.split('\n\n');
                buffer = events.pop();
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
        }).on('error', reject);
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

async function runScenario() {
    console.log('═'.repeat(60));
    console.log('🎯 SCENARIO: AI searches GitHub for a developer profile');
    console.log('═'.repeat(60) + '\n');

    const targetUser = 'torvalds'; // Linus Torvalds - very public figure

    try {
        await connectSSE();

        console.log(`🌐 Step 1: Going to GitHub profile: ${targetUser}...`);
        await callTool('web_navigate', { url: `https://github.com/${targetUser}` });
        await callTool('web_wait', { ms: 3000 });
        console.log('✅ Profile page loaded\n');

        console.log('👀 Step 2: Reading profile page...');
        const page = await callTool('web_read_page');
        console.log(`📄 Page Title: ${page.title}\n`);

        console.log('📊 Step 3: Analyzing page structure...');
        console.log(`   • Inputs found: ${page.inputs?.length || 0}`);
        console.log(`   • Buttons found: ${page.buttons?.length || 0}`);
        console.log(`   • Forms found: ${page.forms?.length || 0}\n`);

        console.log('🔍 Step 4: Scrolling to see more content...');
        await callTool('web_scroll', { direction: 'down', amount: 500 });
        await callTool('web_wait', { ms: 1000 });
        console.log('✅ Scrolled down\n');

        console.log('📖 Step 5: Reading updated page after scroll...');
        const page2 = await callTool('web_read_page');

        // Analyze buttons to find repo links
        const repoButtons = page2.buttons?.filter(b =>
            b.text?.includes('repo') ||
            b.text?.includes('Repository') ||
            b.text?.includes('Repositories')
        ) || [];

        console.log('\n' + '═'.repeat(60));
        console.log('✅ PROFILE SCRAPE COMPLETE');
        console.log('═'.repeat(60));

        console.log('\n📊 What an AI could extract from this public profile:');
        console.log(`   • Profile URL: https://github.com/${targetUser}`);
        console.log(`   • Page Title: ${page.title}`);
        console.log(`   • Interactive elements: ${page.buttons?.length || 0} buttons`);
        console.log(`   • Navigation detected: ${page.inputs?.length || 0} inputs`);

        console.log('\n📋 Sample buttons found:');
        (page2.buttons || []).slice(0, 5).forEach((btn, i) => {
            console.log(`   ${i + 1}. "${btn.text?.substring(0, 40) || 'No text'}"`)
        });

        console.log('\n🎯 What AI could do next:');
        console.log('   • Click on "Repositories" tab to see all repos');
        console.log('   • Click on a specific repo to read its README');
        console.log('   • Extract contribution activity');
        console.log('   • Navigate to followers/following');

        console.log('\n🎉 WebMCP successfully scraped a public profile!\n');
        console.log('💡 This is the SAME flow that would work on any public profile site.\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }

    process.exit(0);
}

runScenario();
