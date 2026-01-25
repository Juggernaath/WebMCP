/**
 * WebMCP - Background Service Worker
 * 
 * AI Browser Automation with Human Oversight.
 * Routes messages between apps and content scripts.
 * 
 * Tier 1: Web apps communicate via chrome.runtime.sendMessage
 * Tier 2: MCP clients communicate via WebSocket / native messaging
 */

// =============================================================================
// CONFIGURATION (stored in chrome.storage for persistence)
// =============================================================================

let config = {
    registeredApps: {},              // appId -> { name, allowedOrigins }
    loggingEnabled: true,
    humanDelays: true,
    debug: true
};

// Native messaging port for MCP bridge (Tier 2)
let mcpPort = null;

// Load config from storage on startup
chrome.storage.local.get(['webmcpConfig'], (result) => {
    if (result.webmcpConfig) {
        config = { ...config, ...result.webmcpConfig };
        console.log('[WebMCP] Loaded config:', config);
    }
});

// Track active sessions (tabId -> appId)
const activeSessions = new Map();

// =============================================================================
// MESSAGE ROUTING
// =============================================================================

/**
 * Handle messages from external apps (web pages)
 */
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('[WebMCP] External message:', request.action, 'from:', sender.origin);

    handleRequest(request, sender)
        .then(response => sendResponse(response))
        .catch(error => sendResponse({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message }
        }));

    return true; // Keep channel open for async response
});

// Activity log for popup
const activityLog = [];
const MAX_ACTIVITY = 100;

function logActivity(action, params, success, source) {
    activityLog.unshift({
        action,
        params: params ? JSON.stringify(params).slice(0, 100) : '',
        success,
        source,
        timestamp: Date.now()
    });
    if (activityLog.length > MAX_ACTIVITY) {
        activityLog.pop();
    }
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle popup requests
    if (request.action === 'getActivity') {
        sendResponse({ activity: activityLog });
        return true;
    }

    if (request.action === 'getStatus') {
        sendResponse({
            wsConnected: wsConnection && wsConnection.readyState === WebSocket.OPEN,
            mcpEnabled: config.mcpEnabled !== false,
            version: chrome.runtime.getManifest().version
        });
        return true;
    }

    if (request.action === 'updateSettings') {
        if (request.settings) {
            config.loggingEnabled = request.settings.loggingEnabled !== false;
            config.humanDelays = request.settings.humanDelays !== false;
            chrome.storage.local.set({ webmcpConfig: config });
        }
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'killAll') {
        // Disconnect WebSocket
        if (wsConnection) {
            wsConnection.close();
            wsConnection = null;
        }
        // Disconnect native messaging
        if (mcpPort) {
            mcpPort.disconnect();
            mcpPort = null;
        }
        clearReconnectTimer();
        isRecording = false;
        sendResponse({ success: true });
        return true;
    }

    // =========================================================================
    // RECORDING
    // =========================================================================

    if (request.action === 'startRecording') {
        startRecording();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'stopRecording') {
        stopRecording();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'playTask') {
        playTask(request.task);
        sendResponse({ success: true });
        return true;
    }

    // =========================================================================
    // SCRAPING
    // =========================================================================

    if (request.action === 'scrape') {
        handleScrape(request.type)
            .then(data => sendResponse({ data }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    // Handle content script messages
    if (request.source === 'webagent-content') {
        handleContentMessage(request, sender)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// =============================================================================
// REQUEST HANDLER
// =============================================================================

async function handleRequest(request, sender) {
    const { requestId, appId, action, params, context } = request;

    // Validate request
    if (!requestId || !action) {
        return {
            requestId,
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Missing requestId or action' }
        };
    }

    try {
        let result;

        switch (action) {
            // Navigation
            case 'navigate':
                result = await handleNavigate(params);
                break;
            case 'wait':
                result = await handleWait(params);
                break;
            case 'refresh':
                result = await handleRefresh(params);
                break;

            // Page reading
            case 'page.read':
                result = await handlePageRead(params);
                break;

            // Interactions (delegated to content script)
            case 'click':
            case 'type':
            case 'select':
            case 'scroll':
            case 'upload':
            case 'form.analyze':
            case 'form.fill':
            // Human-equivalent actions
            case 'hover':
            case 'press_key':
            case 'focus':
            case 'blur':
            case 'getText':
            case 'getAttribute':
            case 'waitForElement':
            case 'evaluate':
                result = await delegateToContent(action, params, context);
                break;

            // Note: LLM actions removed - apps should call their own LLM backend
            // Webagent is purely browser automation primitives

            // HIL
            case 'hil.request':
                result = await handleHILRequest(params);
                break;
            case 'hil.resolve':
                result = await handleHILResolve(params);
                break;

            // Browser APIs (require chrome.* access)
            case 'screenshot':
                result = await handleScreenshot(params);
                break;
            case 'download':
                result = await handleDownload(params);
                break;
            case 'cookies.get':
                result = await handleCookiesGet(params);
                break;
            case 'cookies.set':
                result = await handleCookiesSet(params);
                break;
            case 'tabs.list':
                result = await handleTabsList();
                break;
            case 'tabs.create':
                result = await handleTabsCreate(params);
                break;
            case 'tabs.close':
                result = await handleTabsClose(params);
                break;
            case 'waitForNavigation':
                result = await handleWaitForNavigation(params);
                break;

            // Additional content actions
            case 'drag':
            case 'rightClick':
                result = await delegateToContent(action, params, context);
                break;

            // Configuration
            case 'config.get':
                result = { config: { registeredApps: Object.keys(config.registeredApps) } };
                break;
            case 'config.setBlockedDomains':
                config.blockedDomains = params.domains || [];
                await chrome.storage.local.set({ webagentConfig: config });
                result = { updated: true };
                break;
            case 'app.register':
                result = await handleAppRegister(params, sender);
                break;

            // Ping (for health checks)
            case 'ping':
                result = { pong: true, version: chrome.runtime.getManifest().version };
                break;

            default:
                return {
                    requestId,
                    success: false,
                    error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` }
                };
        }

        return { requestId, success: true, result };

    } catch (error) {
        console.error('[Webagent] Action failed:', action, error);
        return {
            requestId,
            success: false,
            error: { code: 'ACTION_FAILED', message: error.message }
        };
    }
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

async function handleNavigate(params) {
    const { url, tabId } = params;

    const targetTabId = tabId || (await getActiveTabId());
    await chrome.tabs.update(targetTabId, { url });

    // Wait for load
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === targetTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ navigated: true, url });
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function handleWait(params) {
    const { ms = 1000 } = params;
    await new Promise(resolve => setTimeout(resolve, ms));
    return { waited: ms };
}

async function handleRefresh(params) {
    const tabId = params.tabId || (await getActiveTabId());

    await chrome.tabs.reload(tabId);

    // Wait for load
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ refreshed: true });
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function handlePageRead(params) {
    const tabId = params.tabId || (await getActiveTabId());
    const tab = await chrome.tabs.get(tabId);

    // Get page content from content script
    const pageContent = await sendToContentScript(tabId, {
        action: 'getPageContent'
    });

    return {
        url: tab.url,
        title: tab.title,
        ...pageContent
    };
}

async function delegateToContent(action, params, context) {
    const tabId = params.tabId || (await getActiveTabId());

    return await sendToContentScript(tabId, {
        action,
        params,
        context
    });
}

// =============================================================================
// BROWSER API HANDLERS
// =============================================================================

async function handleScreenshot(params) {
    const { format = 'png', quality = 90 } = params;
    const tabId = params.tabId || (await getActiveTabId());

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: format,
        quality: quality
    });

    return { dataUrl, format };
}

async function handleDownload(params) {
    const { url, filename, saveAs = false } = params;

    const downloadId = await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: saveAs
    });

    return { downloadId, started: true };
}

async function handleCookiesGet(params) {
    const { url, name, domain } = params;

    if (name && url) {
        const cookie = await chrome.cookies.get({ url, name });
        return { cookie };
    } else {
        const cookies = await chrome.cookies.getAll({ domain: domain || url });
        return { cookies };
    }
}

async function handleCookiesSet(params) {
    const { url, name, value, domain, path = '/', secure = false, httpOnly = false, expirationDate } = params;

    const cookie = await chrome.cookies.set({
        url,
        name,
        value,
        domain,
        path,
        secure,
        httpOnly,
        expirationDate
    });

    return { cookie, set: true };
}

async function handleTabsList() {
    const tabs = await chrome.tabs.query({});
    return {
        tabs: tabs.map(t => ({
            id: t.id,
            url: t.url,
            title: t.title,
            active: t.active,
            index: t.index
        }))
    };
}

async function handleTabsCreate(params) {
    const { url, active = true } = params;
    const tab = await chrome.tabs.create({ url, active });
    return { tabId: tab.id, url: tab.url };
}

async function handleTabsClose(params) {
    const { tabId } = params;
    await chrome.tabs.remove(tabId);
    return { closed: true };
}

async function handleWaitForNavigation(params) {
    const { timeout = 30000 } = params;
    const tabId = params.tabId || (await getActiveTabId());
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ navigated: true, elapsed: Date.now() - startTime });
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error(`Navigation timeout after ${timeout}ms`));
        }, timeout);
    });
}

// =============================================================================
// TIER 2 BRIDGE (WebSocket + Native Messaging)
// =============================================================================

const WS_PORT = 8080;  // Default WebSocket port for MCP bridge
let wsConnection = null;
let wsReconnectTimer = null;

/**
 * Connect to MCP bridge via WebSocket
 * Primary method for Tier 2 communication
 */
function connectToWebSocketBridge() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    try {
        wsConnection = new WebSocket(`ws://localhost:${WS_PORT}`);

        wsConnection.onopen = () => {
            console.log('[Webagent] Connected to MCP WebSocket bridge');
            clearReconnectTimer();
        };

        wsConnection.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);

                // Handle handshake
                if (message.type === 'handshake') {
                    console.log('[Webagent] MCP bridge handshake:', message.version);
                    return;
                }

                // Handle action request
                await handleWebSocketMessage(message);
            } catch (error) {
                console.error('[Webagent] WS message error:', error);
            }
        };

        wsConnection.onclose = () => {
            console.log('[Webagent] MCP WebSocket disconnected');
            wsConnection = null;
            scheduleReconnect();
        };

        wsConnection.onerror = (error) => {
            console.log('[Webagent] MCP WebSocket error (MCP server may not be running)');
            wsConnection = null;
        };

    } catch (error) {
        console.log('[Webagent] WebSocket connection failed:', error.message);
        scheduleReconnect();
    }
}

async function handleWebSocketMessage(message) {
    const { requestId, action, params, context } = message;

    try {
        const result = await handleRequest({ requestId, action, params, context }, { origin: 'mcp-websocket' });

        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify(result));
        }
    } catch (error) {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
                requestId,
                success: false,
                error: { code: 'ACTION_FAILED', message: error.message }
            }));
        }
    }
}

function scheduleReconnect() {
    if (wsReconnectTimer) return;

    // Try to reconnect every 5 seconds
    wsReconnectTimer = setTimeout(() => {
        wsReconnectTimer = null;
        connectToWebSocketBridge();
    }, 5000);
}

function clearReconnectTimer() {
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
}

/**
 * Connect to native MCP bridge (legacy/fallback)
 * Only used if WebSocket fails - safe to ignore errors
 */
function connectToNativeBridge() {
    // Skip if WebSocket is already connected
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        return;
    }

    try {
        mcpPort = chrome.runtime.connectNative('com.webagent.mcp');

        mcpPort.onMessage.addListener((message) => {
            console.log('[Webagent] Native MCP message:', message);
            handleNativeMessage(message);
        });

        mcpPort.onDisconnect.addListener(() => {
            // Silently ignore - this is expected if native host isn't set up
            mcpPort = null;
        });

        console.log('[Webagent] Connected to native MCP bridge');
    } catch (error) {
        // Silently ignore - native messaging is optional fallback
    }
}

async function handleNativeMessage(message) {
    const { requestId, action, params, context } = message;

    try {
        const result = await handleRequest({ requestId, action, params, context }, { origin: 'mcp-native' });
        mcpPort?.postMessage(result);
    } catch (error) {
        mcpPort?.postMessage({
            requestId,
            success: false,
            error: { code: 'ACTION_FAILED', message: error.message }
        });
    }
}

// Initialize Tier 2 connections on startup
setTimeout(() => {
    connectToWebSocketBridge();  // Primary: WebSocket
    connectToNativeBridge();      // Fallback: Native messaging
}, 1000);

async function handleAppRegister(params, sender) {
    const { appId, name } = params;
    const origin = sender.origin;

    config.registeredApps[appId] = {
        name: name || appId,
        origin,
        registeredAt: Date.now()
    };

    await chrome.storage.local.set({ webagentConfig: config });

    console.log(`[Webagent] App registered: ${appId} from ${origin}`);
    return { registered: true, appId };
}

// =============================================================================
// HIL (Human-in-Loop)
// =============================================================================

const pendingHIL = new Map();

async function handleHILRequest(params) {
    const { type, message, tabId } = params;
    const hilId = `hil_${Date.now()}`;

    pendingHIL.set(hilId, { type, message, tabId, timestamp: Date.now() });

    // Notify via badge or popup
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });

    return { hilId, status: 'pending' };
}

async function handleHILResolve(params) {
    const { hilId } = params;

    if (!pendingHIL.has(hilId)) {
        throw new Error(`Unknown HIL request: ${hilId}`);
    }

    pendingHIL.delete(hilId);

    // Clear badge if no pending HIL
    if (pendingHIL.size === 0) {
        chrome.action.setBadgeText({ text: '' });
    }

    return { resolved: true };
}

// =============================================================================
// CONTENT SCRIPT COMMUNICATION
// =============================================================================

async function handleContentMessage(request, sender) {
    // Handle messages from content script (e.g., CAPTCHA detected)
    const { action, data } = request;

    switch (action) {
        case 'captchaDetected':
            return handleHILRequest({
                type: 'captcha',
                message: 'CAPTCHA detected',
                tabId: sender.tab.id
            });
        default:
            return { received: true };
    }
}

async function sendToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    return tab.id;
}

// =============================================================================
// RECORDING ENGINE
// =============================================================================

let isRecording = false;
let recordingTabId = null;
let debuggerAttached = false;
let consoleMessages = [];
let networkRequests = [];

function startRecording() {
    isRecording = true;
    consoleMessages = [];
    networkRequests = [];

    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return;
        recordingTabId = tabs[0].id;

        // Attach debugger for console/network capture
        try {
            await chrome.debugger.attach({ tabId: recordingTabId }, '1.3');
            debuggerAttached = true;

            // Enable network and console domains
            await chrome.debugger.sendCommand({ tabId: recordingTabId }, 'Network.enable');
            await chrome.debugger.sendCommand({ tabId: recordingTabId }, 'Console.enable');
            await chrome.debugger.sendCommand({ tabId: recordingTabId }, 'Runtime.enable');

            console.log('[WebMCP] Debugger attached for recording');
        } catch (error) {
            console.log('[WebMCP] Could not attach debugger:', error.message);
        }

        // Notify content script to start capturing DOM events
        chrome.tabs.sendMessage(recordingTabId, { action: 'startRecording' });
    });
}

function stopRecording() {
    isRecording = false;

    // Detach debugger
    if (debuggerAttached && recordingTabId) {
        chrome.debugger.detach({ tabId: recordingTabId }).catch(() => { });
        debuggerAttached = false;
    }

    // Notify content script to stop capturing
    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, { action: 'stopRecording' });
    }

    recordingTabId = null;
    console.log('[WebMCP] Recording stopped');
}

// Handle debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (!isRecording || source.tabId !== recordingTabId) return;

    // Capture console messages
    if (method === 'Console.messageAdded') {
        consoleMessages.push({
            type: params.message.level,
            text: params.message.text,
            timestamp: Date.now()
        });
    }

    // Capture network requests
    if (method === 'Network.requestWillBeSent') {
        networkRequests.push({
            id: params.requestId,
            url: params.request.url,
            method: params.request.method,
            timestamp: params.timestamp,
            type: params.type
        });
    }

    if (method === 'Network.responseReceived') {
        const req = networkRequests.find(r => r.id === params.requestId);
        if (req) {
            req.status = params.response.status;
            req.mimeType = params.response.mimeType;
        }
    }
});

// =============================================================================
// TASK PLAYBACK
// =============================================================================

async function playTask(task) {
    if (!task || !task.actions) return;

    console.log('[WebMCP] Playing task:', task.name);
    logActivity('playTask', { name: task.name }, true, 'extension');

    for (const action of task.actions) {
        try {
            await executeRecordedAction(action);

            // Human-like delay between actions
            if (config.humanDelays) {
                await sleep(300 + Math.random() * 200);
            }
        } catch (error) {
            console.error('[WebMCP] Playback error:', error);
            logActivity(action.type, action, false, 'playback');
        }
    }

    console.log('[WebMCP] Task playback complete');
}

async function executeRecordedAction(action) {
    const tabId = await getActiveTabId();

    switch (action.type) {
        case 'navigate':
            await chrome.tabs.update(tabId, { url: action.url });
            await waitForNavigation(tabId);
            break;

        case 'click':
            await sendToContentScript(tabId, {
                action: 'click',
                params: { selector: action.selector }
            });
            break;

        case 'type':
            await sendToContentScript(tabId, {
                action: 'type',
                params: { selector: action.selector, text: action.text }
            });
            break;

        case 'select':
            await sendToContentScript(tabId, {
                action: 'select',
                params: { selector: action.selector, value: action.value }
            });
            break;

        case 'scroll':
            await sendToContentScript(tabId, {
                action: 'scroll',
                params: { direction: action.direction, amount: action.amount }
            });
            break;

        default:
            console.log('[WebMCP] Unknown action type:', action.type);
    }

    logActivity(action.type, action, true, 'playback');
}

async function waitForNavigation(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Navigation timeout'));
        }, timeout);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// SCRAPING HANDLERS
// =============================================================================

async function handleScrape(type) {
    const tabId = await getActiveTabId();

    switch (type) {
        case 'text':
            return await sendToContentScript(tabId, { action: 'scrapeText' });

        case 'tables':
            return await sendToContentScript(tabId, { action: 'scrapeTables' });

        case 'links':
            return await sendToContentScript(tabId, { action: 'scrapeLinks' });

        case 'console':
            return consoleMessages.slice(-100);

        case 'network':
            return networkRequests.slice(-100);

        default:
            throw new Error(`Unknown scrape type: ${type}`);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log('[WebMCP] Background service worker loaded');
