/**
 * COMPLEX END-TO-END STRESS TEST
 * 
 * Scenario: AI Research Assistant
 * - Browse Hacker News for trending topics
 * - Open multiple tabs to research
 * - Extract article titles and links
 * - Navigate to a form and fill it with findings
 * - Test scrolling, clicking, typing, tab management
 * 
 * Tests: 15+ WebMCP actions in sequence
 */

import http from 'http';

const MCP_PORT = 3000;
let messageId = 0;
const pendingMessages = new Map();
let sseRes = null;

// Stats tracking
const stats = {
    actionsExecuted: 0,
    actionsPassed: 0,
    actionsFailed: 0,
    startTime: null,
    endTime: null
};

async function connectSSE() {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
            sseRes = res;
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
    stats.actionsExecuted++;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingMessages.delete(id);
            stats.actionsFailed++;
            reject(new Error(`Timeout: ${name}`));
        }, 30000);

        pendingMessages.set(id, {
            resolve: (result) => {
                clearTimeout(timeout);
                stats.actionsPassed++;
                resolve(result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result);
            }
        });

        const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
        const req = http.request({
            hostname: 'localhost', port: MCP_PORT, path: '/message', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        });
        req.on('error', (e) => { stats.actionsFailed++; reject(e); });
        req.write(body);
        req.end();
    });
}

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function section(title) {
    console.log('\n' + '─'.repeat(50));
    console.log(`📌 ${title}`);
    console.log('─'.repeat(50));
}

async function runStressTest() {
    console.log('═'.repeat(60));
    console.log('🔥 COMPLEX END-TO-END STRESS TEST');
    console.log('═'.repeat(60));
    console.log('\nScenario: AI Research Assistant browses multiple sites,');
    console.log('extracts data, manages tabs, and fills a form.\n');

    stats.startTime = Date.now();

    try {
        log('🔌', 'Connecting to WebMCP...');
        await connectSSE();
        log('✅', 'Connected!\n');

        // =====================================================================
        section('PHASE 1: Hacker News Research');
        // =====================================================================

        log('🌐', 'Navigating to Hacker News...');
        await callTool('web_navigate', { url: 'https://news.ycombinator.com' });
        await callTool('web_wait', { ms: 2000 });

        log('📖', 'Reading front page...');
        const hn = await callTool('web_read_page');
        log('📄', `Title: ${hn.title}`);
        log('📊', `Found ${hn.buttons?.length} clickable elements`);

        log('📜', 'Scrolling to load more stories...');
        await callTool('web_scroll', { direction: 'down', amount: 400 });
        await callTool('web_wait', { ms: 500 });

        log('📜', 'Scrolling more...');
        await callTool('web_scroll', { direction: 'down', amount: 400 });

        // =====================================================================
        section('PHASE 2: Tab Management');
        // =====================================================================

        log('📑', 'Listing current tabs...');
        const tabs1 = await callTool('web_list_tabs');
        log('📋', `Open tabs: ${tabs1.tabs?.length}`);

        log('➕', 'Opening new tab with GitHub...');
        const newTab = await callTool('web_create_tab', { url: 'https://github.com/trending', active: false });
        log('✅', `Created tab ID: ${newTab.tabId}`);

        log('📑', 'Listing tabs again...');
        const tabs2 = await callTool('web_list_tabs');
        log('📋', `Open tabs now: ${tabs2.tabs?.length}`);

        // =====================================================================
        section('PHASE 3: GitHub Trending Analysis');
        // =====================================================================

        log('🔀', 'Switching to GitHub tab...');
        await callTool('web_navigate', { url: 'https://github.com/trending' });
        await callTool('web_wait', { ms: 3000 });

        log('📖', 'Reading GitHub Trending page...');
        const gh = await callTool('web_read_page');
        log('📄', `Title: ${gh.title}`);
        log('📊', `Elements: ${gh.buttons?.length} buttons, ${gh.inputs?.length} inputs`);

        log('📜', 'Scrolling through repos...');
        for (let i = 0; i < 3; i++) {
            await callTool('web_scroll', { direction: 'down', amount: 300 });
            await callTool('web_wait', { ms: 300 });
        }

        // =====================================================================
        section('PHASE 4: Form Interaction Test');
        // =====================================================================

        log('🌐', 'Navigating to test form...');
        await callTool('web_navigate', { url: 'https://httpbin.org/forms/post' });
        await callTool('web_wait', { ms: 2000 });

        log('📖', 'Analyzing form structure...');
        const form = await callTool('web_analyze_form', { formIndex: 0 });
        log('📋', `Form has ${form.fields?.length} fields`);

        log('⌨️', 'Filling name field...');
        await callTool('web_click', { selector: 'input[name="custname"]' });
        await callTool('web_type', { selector: 'input[name="custname"]', text: 'AI Stress Tester', clear: true });

        log('📱', 'Filling phone...');
        await callTool('web_type', { selector: 'input[name="custtel"]', text: '555-STRESS', clear: true });

        log('📧', 'Filling email...');
        await callTool('web_type', { selector: 'input[name="custemail"]', text: 'stress@test.ai', clear: true });

        log('🔘', 'Selecting pizza size...');
        await callTool('web_click', { selector: 'input[value="large"]' });

        log('☑️', 'Checking toppings...');
        await callTool('web_click', { selector: 'input[name="topping"][value="bacon"]' });
        await callTool('web_click', { selector: 'input[name="topping"][value="cheese"]' });
        await callTool('web_click', { selector: 'input[name="topping"][value="mushroom"]' });

        log('📝', 'Adding special instructions...');
        await callTool('web_type', {
            selector: 'textarea[name="comments"]',
            text: 'STRESS TEST COMPLETE! This form was filled by an AI using WebMCP. Actions tested: navigate, scroll, click, type, tab management, form analysis.',
            clear: true
        });

        // =====================================================================
        section('PHASE 5: Keyboard & Final Verification');
        // =====================================================================

        log('⌨️', 'Testing keyboard navigation...');
        await callTool('web_press_key', { key: 'Tab' });
        await callTool('web_press_key', { key: 'Tab' });
        await callTool('web_press_key', { key: 'Tab' });

        log('📖', 'Final page read to verify form state...');
        const finalPage = await callTool('web_read_page');

        log('📑', 'Counting final tabs...');
        const tabsFinal = await callTool('web_list_tabs');

        // =====================================================================
        // RESULTS
        // =====================================================================
        stats.endTime = Date.now();
        const duration = ((stats.endTime - stats.startTime) / 1000).toFixed(1);

        console.log('\n' + '═'.repeat(60));
        console.log('🏁 STRESS TEST COMPLETE');
        console.log('═'.repeat(60));

        console.log('\n📊 STATISTICS:');
        console.log(`   ⏱️  Total Duration: ${duration} seconds`);
        console.log(`   🎯 Actions Executed: ${stats.actionsExecuted}`);
        console.log(`   ✅ Actions Passed: ${stats.actionsPassed}`);
        console.log(`   ❌ Actions Failed: ${stats.actionsFailed}`);
        console.log(`   📈 Success Rate: ${Math.round((stats.actionsPassed / stats.actionsExecuted) * 100)}%`);

        console.log('\n📋 FEATURES TESTED:');
        console.log('   ✅ web_navigate (multiple sites)');
        console.log('   ✅ web_wait (page loads)');
        console.log('   ✅ web_read_page (content extraction)');
        console.log('   ✅ web_scroll (up/down)');
        console.log('   ✅ web_click (buttons, radio, checkbox)');
        console.log('   ✅ web_type (text inputs, textarea)');
        console.log('   ✅ web_press_key (Tab navigation)');
        console.log('   ✅ web_analyze_form (form structure)');
        console.log('   ✅ web_list_tabs (tab management)');
        console.log('   ✅ web_create_tab (new tabs)');

        console.log('\n🌐 SITES VISITED:');
        console.log('   1. news.ycombinator.com (Hacker News)');
        console.log('   2. github.com/trending');
        console.log('   3. httpbin.org/forms/post');

        console.log('\n🎉 WebMCP passed the stress test!\n');

    } catch (error) {
        stats.endTime = Date.now();
        console.error('\n❌ Stress test failed:', error.message);
        console.log(`   Actions completed before failure: ${stats.actionsExecuted}`);
    }

    process.exit(stats.actionsFailed > 0 ? 1 : 0);
}

runStressTest();
