/**
 * WebMCP Extension Popup
 * 
 * Handles UI for recording, tasks, scraping, and settings.
 */

// =============================================================================
// STATE
// =============================================================================

let isRecording = false;
let recordedActions = [];
let savedTasks = [];
let activityLog = [];
let settings = {
    loggingEnabled: true,
    humanDelays: true,
    mcpEnabled: false,
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadTasks();
    await loadActivity();
    updateStatus();
    setupTabs();
    setupRecording();
    setupScraping();
    setupSettings();
    setupMCP();
    setupKillSwitch();

    // Auto-refresh
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
// RECORDING
// =============================================================================

function setupRecording() {
    document.getElementById('recordStart').addEventListener('click', startRecording);
    document.getElementById('recordStop').addEventListener('click', stopRecording);
}

async function startRecording() {
    isRecording = true;
    recordedActions = [];

    document.getElementById('recordStart').disabled = true;
    document.getElementById('recordStop').disabled = false;
    document.getElementById('statusDot').className = 'status-dot recording';
    document.getElementById('statusText').textContent = 'Recording...';

    renderRecordedActions();

    // Notify background to start capturing
    chrome.runtime.sendMessage({ action: 'startRecording' });

    // Listen for recorded actions
    chrome.runtime.onMessage.addListener(handleRecordedAction);
}

function handleRecordedAction(message) {
    if (message.type === 'recordedAction' && isRecording) {
        recordedActions.push({
            ...message.action,
            timestamp: Date.now()
        });
        renderRecordedActions();
    }
}

async function stopRecording() {
    isRecording = false;

    document.getElementById('recordStart').disabled = false;
    document.getElementById('recordStop').disabled = true;
    updateStatus();

    chrome.runtime.sendMessage({ action: 'stopRecording' });

    if (recordedActions.length > 0) {
        const name = prompt('Save recording as:', `Task ${savedTasks.length + 1}`);
        if (name) {
            await saveTask(name, recordedActions);
        }
    }
}

function renderRecordedActions() {
    const container = document.getElementById('recordingActions');

    if (recordedActions.length === 0) {
        container.innerHTML = '<div class="empty-state">Click "Start Recording" to capture browser actions</div>';
        return;
    }

    const icons = {
        'click': '👆',
        'type': '⌨️',
        'navigate': '🔗',
        'scroll': '📜',
        'select': '📋',
    };

    container.innerHTML = recordedActions.slice(-10).reverse().map(action => `
        <div class="action-item">
            <span class="action-icon">${icons[action.type] || '▸'}</span>
            <span class="action-text">${formatActionText(action)}</span>
            <span class="action-time">${formatTime(action.timestamp)}</span>
        </div>
    `).join('');
}

function formatActionText(action) {
    switch (action.type) {
        case 'click':
            return `Click: ${action.selector || action.text || 'element'}`;
        case 'type':
            return `Type: "${action.text?.slice(0, 20)}${action.text?.length > 20 ? '...' : ''}"`;
        case 'navigate':
            return `Navigate: ${new URL(action.url).hostname}`;
        case 'scroll':
            return `Scroll ${action.direction}`;
        case 'select':
            return `Select: ${action.value}`;
        default:
            return action.type;
    }
}

// =============================================================================
// TASKS
// =============================================================================

async function loadTasks() {
    try {
        const result = await chrome.storage.local.get(['webmcpTasks']);
        savedTasks = result.webmcpTasks || [];
        renderTasks();
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

async function saveTask(name, actions) {
    const task = {
        id: Date.now().toString(),
        name,
        actions,
        createdAt: Date.now(),
    };

    savedTasks.push(task);
    await chrome.storage.local.set({ webmcpTasks: savedTasks });
    renderTasks();
}

function renderTasks() {
    const container = document.getElementById('taskList');

    if (savedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved tasks yet.<br>Record actions and save them as tasks.</div>';
        return;
    }

    container.innerHTML = savedTasks.map(task => `
        <div class="task-item" data-id="${task.id}">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-meta">${task.actions.length} actions • ${formatTime(task.createdAt)}</div>
            </div>
            <div class="task-actions">
                <button class="task-btn play" onclick="playTask('${task.id}')">▶ Play</button>
                <button class="task-btn" onclick="exportTask('${task.id}')">↓</button>
                <button class="task-btn" onclick="deleteTask('${task.id}')">✕</button>
            </div>
        </div>
    `).join('');
}

async function playTask(taskId) {
    const task = savedTasks.find(t => t.id === taskId);
    if (!task) return;

    chrome.runtime.sendMessage({
        action: 'playTask',
        task: task
    });
}

async function exportTask(taskId) {
    const task = savedTasks.find(t => t.id === taskId);
    if (!task) return;

    // Export as JSON
    const json = JSON.stringify(task, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: url,
        filename: `webmcp-${task.name.replace(/\s+/g, '-').toLowerCase()}.json`,
        saveAs: true
    });
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;

    savedTasks = savedTasks.filter(t => t.id !== taskId);
    await chrome.storage.local.set({ webmcpTasks: savedTasks });
    renderTasks();
}

// Make functions global for onclick handlers
window.playTask = playTask;
window.exportTask = exportTask;
window.deleteTask = deleteTask;

// =============================================================================
// SCRAPING
// =============================================================================

function setupScraping() {
    document.getElementById('scrapeText').addEventListener('click', () => scrape('text'));
    document.getElementById('scrapeTables').addEventListener('click', () => scrape('tables'));
    document.getElementById('scrapeLinks').addEventListener('click', () => scrape('links'));
    document.getElementById('scrapeConsole').addEventListener('click', () => scrape('console'));
    document.getElementById('scrapeNetwork').addEventListener('click', () => scrape('network'));
}

async function scrape(type) {
    const resultEl = document.getElementById('scrapeResult');
    resultEl.style.display = 'block';
    resultEl.textContent = 'Loading...';

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'scrape',
            type: type
        });

        if (response.error) {
            resultEl.textContent = `Error: ${response.error}`;
        } else {
            const data = typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data, null, 2);

            resultEl.textContent = data.slice(0, 5000);

            // Copy to clipboard
            await navigator.clipboard.writeText(data);
        }
    } catch (error) {
        resultEl.textContent = `Error: ${error.message}`;
    }
}

// =============================================================================
// ACTIVITY
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
        container.innerHTML = '<div class="empty-state">No recent activity</div>';
        return;
    }

    const icons = {
        'navigate': '🔗',
        'click': '👆',
        'type': '⌨️',
        'page.read': '📖',
        'screenshot': '📸',
        'scroll': '📜',
        'form.fill': '📝',
    };

    container.innerHTML = activityLog.slice(0, 20).map(item => `
        <div class="activity-item ${item.success ? '' : 'error'}">
            <div class="activity-action">${icons[item.action] || '▸'} ${item.action}</div>
            <div class="activity-time">${formatTime(item.timestamp)}</div>
            ${item.source ? `<span class="activity-source">${item.source}</span>` : ''}
        </div>
    `).join('');
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

        document.getElementById('toggleLogging').classList.toggle('active', settings.loggingEnabled);
        document.getElementById('toggleHumanDelays').classList.toggle('active', settings.humanDelays);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    await chrome.storage.local.set({ webmcpSettings: settings });
    chrome.runtime.sendMessage({ action: 'updateSettings', settings });
}

function setupSettings() {
    document.getElementById('toggleLogging').addEventListener('click', function () {
        this.classList.toggle('active');
        settings.loggingEnabled = this.classList.contains('active');
        saveSettings();
    });

    document.getElementById('toggleHumanDelays').addEventListener('click', function () {
        this.classList.toggle('active');
        settings.humanDelays = this.classList.contains('active');
        saveSettings();
    });
}

// =============================================================================
// MCP
// =============================================================================

function setupMCP() {
    document.getElementById('mcpDownload').addEventListener('click', () => {
        // Open download page
        chrome.tabs.create({ url: 'https://webmcp.tanujmittal.com/download' });
    });

    // Check if MCP is connected
    updateMCPStatus();
}

async function updateMCPStatus() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
        const mcpSection = document.getElementById('mcpSection');

        if (response?.wsConnected) {
            mcpSection.innerHTML = `
                <div class="mcp-title">
                    <span>🤖</span> AI Control Active
                </div>
                <div class="mcp-desc" style="color: #22c55e;">
                    Connected to MCP server. AI agents can now control your browser.
                </div>
            `;
        }
    } catch (error) {
        console.log('Could not check MCP status');
    }
}

// =============================================================================
// STATUS & KILL SWITCH
// =============================================================================

function updateStatus() {
    if (isRecording) return; // Don't update while recording

    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const killBtn = document.getElementById('killSwitch');

    chrome.runtime.sendMessage({ action: 'getStatus' }, response => {
        if (response?.wsConnected) {
            dot.className = 'status-dot connected';
            text.textContent = 'MCP Connected';
            killBtn.disabled = false;
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Ready';
            killBtn.disabled = true;
        }
    });
}

function setupKillSwitch() {
    document.getElementById('killSwitch').addEventListener('click', async () => {
        if (confirm('Stop all automation? This will disconnect AI agents.')) {
            await chrome.runtime.sendMessage({ action: 'killAll' });
            updateStatus();
        }
    });
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString();
    return date.toLocaleDateString();
}
