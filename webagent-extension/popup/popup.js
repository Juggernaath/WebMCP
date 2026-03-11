/**
 * WebMCP Extension Popup — v1.1.0
 *
 * Monitoring panel for human oversight of AI browser automation.
 * Displays connection status, action log, and extension settings.
 */

// =============================================================================
// STATE
// =============================================================================

let activityLog = [];
let settings = {
    loggingEnabled: true,
    humanDelays: true,
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadActivity();
    updateStatus();
    setupTabs();
    setupSettings();
    setupKillSwitch();
    setupReconnect();
    setupClearLog();

    // Auto-refresh intervals
    setInterval(loadActivity, 5000);
    setInterval(updateStatus, 3000);
});

// =============================================================================
// TAB NAVIGATION
// =============================================================================

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });
}

// =============================================================================
// ACTIVITY LOG
// =============================================================================

async function loadActivity() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getActivity' });
        if (response?.activity) {
            activityLog = response.activity;
            renderActivity();
        }
    } catch (error) {
        console.log('Could not load activity');
    }
}

function renderActivity() {
    const container = document.getElementById('activityList');

    if (!activityLog.length) {
        container.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No recent activity';
        container.appendChild(empty);
        return;
    }

    const icons = {
        'navigate':   '->',
        'click':      '.',
        'type':       'T',
        'page.read':  'R',
        'screenshot': 'S',
        'scroll':     'v',
        'form.fill':  'F',
    };

    container.textContent = '';
    activityLog.slice(0, 20).forEach(item => {
        const row = document.createElement('div');
        row.className = 'activity-item' + (item.success ? '' : ' error');

        const action = document.createElement('div');
        action.className = 'activity-action';
        action.textContent = (icons[item.action] || '+') + ' ' + item.action;
        row.appendChild(action);

        const time = document.createElement('div');
        time.className = 'activity-time';
        time.textContent = formatTime(item.timestamp);
        row.appendChild(time);

        if (item.source) {
            const source = document.createElement('span');
            source.className = 'activity-source';
            source.textContent = item.source;
            row.appendChild(source);
        }

        container.appendChild(row);
    });
}

// =============================================================================
// STATUS
// =============================================================================

function updateStatus() {
    const dot    = document.getElementById('statusDot');
    const text   = document.getElementById('statusText');
    const sub    = document.getElementById('statusSub');
    const count  = document.getElementById('actionCount');
    const killBtn = document.getElementById('killSwitch');

    chrome.runtime.sendMessage({ action: 'getStatus' }, response => {
        if (response?.wsConnected) {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected to MCP server';
            sub.textContent = 'AI agents can control this browser';
            killBtn.disabled = false;
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Waiting for connection...';
            sub.textContent = 'MCP server not detected';
            killBtn.disabled = true;
        }

        // Update session action count
        const total = activityLog.length;
        count.textContent = total;

        // Render last 3 actions in the compact feed
        renderRecentFeed();
    });
}

function renderRecentFeed() {
    const feed = document.getElementById('recentFeed');

    const recent = activityLog.slice(0, 3);

    if (!recent.length) {
        feed.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.padding = '16px';
        empty.textContent = 'No actions yet';
        feed.appendChild(empty);
        return;
    }

    feed.textContent = '';
    recent.forEach(item => {
        const row = document.createElement('div');
        row.className = 'feed-item';

        const name = document.createElement('span');
        name.className = 'feed-name';
        name.textContent = item.action;
        row.appendChild(name);

        const time = document.createElement('span');
        time.className = 'feed-time';
        time.textContent = formatTime(item.timestamp);
        row.appendChild(time);

        feed.appendChild(row);
    });
}

// =============================================================================
// SETTINGS
// =============================================================================

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['webmcpSettings']);
        if (result.webmcpSettings) {
            settings = { ...settings, ...result.webmcpSettings };
        }

        document.getElementById('toggleHumanDelays').classList.toggle('active', settings.humanDelays);
        document.getElementById('toggleLogging').classList.toggle('active', settings.loggingEnabled);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    await chrome.storage.local.set({ webmcpSettings: settings });
    chrome.runtime.sendMessage({ action: 'updateSettings', settings });
}

function setupSettings() {
    document.getElementById('toggleHumanDelays').addEventListener('click', function () {
        this.classList.toggle('active');
        settings.humanDelays = this.classList.contains('active');
        saveSettings();
    });

    document.getElementById('toggleLogging').addEventListener('click', function () {
        this.classList.toggle('active');
        settings.loggingEnabled = this.classList.contains('active');
        saveSettings();
    });
}

// =============================================================================
// KILL SWITCH
// =============================================================================

function setupKillSwitch() {
    document.getElementById('killSwitch').addEventListener('click', async () => {
        if (confirm('Stop all automation? This will disconnect AI agents.')) {
            await chrome.runtime.sendMessage({ action: 'killAll' });
            updateStatus();
        }
    });
}

// =============================================================================
// RECONNECT
// =============================================================================

function setupReconnect() {
    document.getElementById('reconnectBtn').addEventListener('click', async () => {
        const btn = document.getElementById('reconnectBtn');
        btn.textContent = 'Connecting...';
        btn.disabled = true;

        try {
            await chrome.runtime.sendMessage({ action: 'reconnect' });
        } catch (error) {
            console.log('Reconnect message failed:', error);
        }

        // Give the bridge a moment to re-establish, then refresh status
        setTimeout(() => {
            btn.textContent = 'Reconnect';
            btn.disabled = false;
            updateStatus();
        }, 2000);
    });
}

// =============================================================================
// CLEAR LOG
// =============================================================================

function setupClearLog() {
    document.getElementById('clearLog').addEventListener('click', async () => {
        try {
            await chrome.runtime.sendMessage({ action: 'clearActivity' });
            activityLog = [];
            renderActivity();
            renderRecentFeed();
            document.getElementById('actionCount').textContent = '0';
        } catch (error) {
            console.log('Could not clear activity log');
        }
    });
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(ts) {
    const date = new Date(ts);
    const now  = new Date();
    const diff = now - date;

    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString();
    return date.toLocaleDateString();
}
