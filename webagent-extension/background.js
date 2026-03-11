/**
 * WebMCP - Background Service Worker
 * 
 * AI Browser Automation with Human Oversight.
 * Routes messages between apps and content scripts.
 * 
 * Tier 1: Web apps communicate via chrome.runtime.sendMessage
 * Tier 2: MCP clients communicate via WebSocket
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

// Load config from storage on startup
chrome.storage.local.get(['webmcpConfig'], (result) => {
    if (result.webmcpConfig) {
        config = { ...config, ...result.webmcpConfig };
        console.log('[WebMCP] Loaded config:', config);
    }
});

// Track active sessions (tabId -> appId)
const activeSessions = new Map();

// Ref→selector cache from most recent page.read (per tab)
// Used as fallback when content script's in-memory Map is stale
const refCache = new Map(); // tabId -> { refs: { ref: selector } }

// Port-based content script connections (tabId -> port)
// More reliable than chrome.tabs.sendMessage which hits bfcache errors
const contentPorts = new Map();

// Listen for content script port connections
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'webmcp-content') return;
    const tabId = port.sender?.tab?.id;
    if (!tabId) return;

    console.log(`[WebMCP] Content script connected via port (tab ${tabId})`);
    contentPorts.set(tabId, port);

    port.onDisconnect.addListener(() => {
        console.log(`[WebMCP] Content script port disconnected (tab ${tabId})`);
        contentPorts.delete(tabId);
    });
});

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
        clearReconnectTimer();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'reconnect') {
        // Force reconnect to WebSocket bridge
        if (wsConnection) {
            wsConnection.close();
            wsConnection = null;
        }
        clearReconnectTimer();
        connectToWebSocketBridge();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'clearActivity') {
        activityLog.length = 0;
        sendResponse({ success: true });
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
            case 'back':
                result = await handleBack(params);
                break;
            case 'forward':
                result = await handleForward(params);
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
            // v1.1.0: New content-delegated actions
            case 'findElement':
            case 'getPageText':
            case 'highlightElement':
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
            case 'tabs.switch':
                result = await handleTabsSwitch(params);
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
                await chrome.storage.local.set({ webmcpConfig: config });
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

    // Wait for load + content script initialization
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === targetTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                // Small delay to ensure content script (document_idle) has initialized
                setTimeout(() => resolve({ navigated: true, url }), 150);
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

async function handleBack(params) {
    const tabId = params.tabId || (await getActiveTabId());
    await chrome.tabs.goBack(tabId);
    // Brief wait for navigation to start
    await new Promise(r => setTimeout(r, 500));
    return { back: true };
}

async function handleForward(params) {
    const tabId = params.tabId || (await getActiveTabId());
    await chrome.tabs.goForward(tabId);
    await new Promise(r => setTimeout(r, 500));
    return { forward: true };
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

    // Cache ref→selector mapping in background for fallback
    if (pageContent && pageContent.elements) {
        const refs = {};
        for (const el of pageContent.elements) {
            if (el.ref && el.selector) {
                refs[el.ref] = el.selector;
            }
        }
        refCache.set(tabId, { refs, url: tab.url });
    }

    return {
        url: tab.url,
        title: tab.title,
        ...pageContent
    };
}

async function delegateToContent(action, params, context) {
    const tabId = params.tabId || (await getActiveTabId());

    const result = await sendToContentScript(tabId, {
        action,
        params,
        context
    });

    // If ref-based action failed with "not found or stale", retry with cached selector
    if (result && result.success === false && result.error &&
        result.error.includes('not found or stale') &&
        params.ref !== undefined) {
        const cached = refCache.get(tabId);
        if (cached && cached.refs[params.ref]) {
            console.log(`[WebMCP] Ref ${params.ref} stale, retrying with cached selector: ${cached.refs[params.ref]}`);
            const fallbackParams = { ...params, selector: cached.refs[params.ref] };
            delete fallbackParams.ref; // Use selector instead
            return await sendToContentScript(tabId, {
                action,
                params: fallbackParams,
                context
            });
        }
    }

    return result;
}

// =============================================================================
// BROWSER API HANDLERS
// =============================================================================

async function handleScreenshot(params) {
    const { format = 'png', quality = 90 } = params;
    const tabId = params.tabId || (await getActiveTabId());

    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: format,
            quality: quality
        });
        return { dataUrl, format };
    } catch (err) {
        // Chrome's captureVisibleTab requires the browser window to be visible
        // and in the foreground. If minimized or occluded, image readback fails.
        if (err.message && err.message.includes('image readback failed')) {
            throw new Error('Failed to capture screenshot: Chrome window must be visible and in the foreground. Use web_read_page for background automation.');
        }
        throw err;
    }
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

async function handleTabsSwitch(params) {
    const { tabId } = params;
    if (!tabId) throw new Error('tabId is required for tabs.switch');
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    return { switched: true, tabId, url: tab.url, title: tab.title };
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
// TIER 2 BRIDGE (WebSocket)
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

// Initialize Tier 2 connections on startup
setTimeout(() => {
    connectToWebSocketBridge();
}, 1000);

// MV3 Keep-Alive: Service workers get terminated after ~30s of inactivity.
// Use chrome.alarms to periodically wake the worker and maintain WebSocket.
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }); // Every 24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
            console.log('[WebMCP] Keep-alive: reconnecting WebSocket...');
            connectToWebSocketBridge();
        }
    }
});

async function handleAppRegister(params, sender) {
    const { appId, name } = params;
    const origin = sender.origin;

    config.registeredApps[appId] = {
        name: name || appId,
        origin,
        registeredAt: Date.now()
    };

    await chrome.storage.local.set({ webmcpConfig: config });

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

/**
 * Send a message to a content script via its persistent port.
 * Uses request-response correlation via _msgId so multiple in-flight messages
 * on the same port do not collide.
 *
 * @param {chrome.runtime.Port} port - The port returned by chrome.runtime.onConnect
 * @param {object} message - The action message to send
 * @param {number} [timeout=15000] - Max ms to wait for a response
 * @returns {Promise<any>} Resolves with the result from the content script
 */
function sendViaPort(port, message, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const msgId = Math.random().toString(36).substring(2, 10);

        function cleanup() {
            clearTimeout(timer);
            port.onMessage.removeListener(listener);
            try { port.onDisconnect.removeListener(onDisconnect); } catch (_) {}
        }

        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Port message timeout'));
        }, timeout);

        const listener = (response) => {
            if (response._msgId === msgId) {
                cleanup();
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.result);
                }
            }
        };

        // If the port disconnects while waiting (e.g. a click caused navigation
        // and the content script was torn down), treat it as a success rather
        // than hanging until the timeout fires.  Return an action-appropriate
        // default result so callers see the expected response shape.
        const onDisconnect = () => {
            cleanup();
            const action = message.action || '';
            console.log(`[WebMCP] Port disconnected during pending message (action: ${action}) — assuming action succeeded`);
            const defaults = {
                click:            { clicked: true },
                type:             { typed: true, length: 0 },
                hover:            { hovered: true },
                scroll:           { scrolled: true, direction: 'down', amount: 0 },
                press_key:        { pressed: (message.params && message.params.key) || '' },
                highlightElement: { highlighted: true, duration: 0 },
            };
            resolve(defaults[action] || { success: true });
        };

        port.onMessage.addListener(listener);
        port.onDisconnect.addListener(onDisconnect);
        port.postMessage({ ...message, _msgId: msgId });
    });
}

/**
 * Send a message to the content script running in the given tab.
 * Primary path uses the persistent port registered via chrome.runtime.onConnect
 * (avoids bfcache "page moved into back/forward cache" errors).
 * Falls back to chrome.tabs.sendMessage if no port is available, with a
 * one-time tab-reload retry on bfcache / "Receiving end does not exist" errors.
 *
 * @param {number} tabId - Target tab
 * @param {object} message - Action message
 * @param {boolean} [retried=false] - Internal flag to prevent infinite reload loops
 * @returns {Promise<any>}
 */
async function sendToContentScript(tabId, message, retried = false) {
    // Try port-based messaging first (avoids bfcache issues)
    const port = contentPorts.get(tabId);
    if (port) {
        try {
            return await sendViaPort(port, message);
        } catch (portErr) {
            console.log(`[WebMCP] Port message failed (${portErr.message}), falling back to sendMessage`);
            contentPorts.delete(tabId);
            // Fall through to chrome.tabs.sendMessage
        }
    }

    // Fallback: chrome.tabs.sendMessage
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, response => {
            if (chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message || '';
                if (!retried && (errMsg.includes('back/forward cache') || errMsg.includes('Receiving end does not exist'))) {
                    console.log('[WebMCP] Content script port lost, reloading tab and retrying...');
                    chrome.tabs.reload(tabId, {}, () => {
                        const listener = (updatedTabId, changeInfo) => {
                            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);
                                setTimeout(() => {
                                    sendToContentScript(tabId, message, true)
                                        .then(resolve)
                                        .catch(reject);
                                }, 300);
                            }
                        };
                        chrome.tabs.onUpdated.addListener(listener);
                    });
                } else {
                    reject(new Error(errMsg));
                }
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
// INITIALIZATION
// =============================================================================

console.log('[WebMCP] Background service worker loaded');
