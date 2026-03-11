# WebMCP — Chrome Permission Justifications

**Extension name:** WebMCP
**Version:** 1.1.0
**Single purpose:** WebMCP provides browser automation primitives for AI agents connected via the Model Context Protocol (MCP).

## Permissions (5)

### `activeTab`
**Used for:** Capturing screenshots of the current visible tab via `chrome.tabs.captureVisibleTab()`.
**Why needed:** AI agents need visual feedback of the page state. Screenshots are captured only when explicitly requested by the connected AI agent through an MCP tool call.
**Code reference:** `background.js` → `handleScreenshot()`

### `alarms`
**Used for:** Periodic keep-alive alarm via `chrome.alarms.create()` to prevent the Manifest V3 service worker from being terminated by Chrome after idle timeout.
**Why needed:** Chrome MV3 service workers are automatically killed after ~30 seconds of inactivity. This would disconnect the WebSocket bridge to the MCP server. A periodic alarm (every 24 seconds) keeps the service worker alive and automatically reconnects the WebSocket if it drops.
**Code reference:** `background.js` → `chrome.alarms.create('keepAlive', ...)`, `chrome.alarms.onAlarm.addListener()`

### `storage`
**Used for:** Persisting user preferences (human-like delay toggle, activity logging toggle) and registered app configurations via `chrome.storage.local`.
**Why needed:** Settings must survive browser restarts and service worker lifecycle events. No sensitive user data is stored.
**Code reference:** `background.js` → `chrome.storage.local.get/set()`, `popup.js` → `loadSettings()/saveSettings()`

### `tabs`
**Used for:** Querying open tabs (`chrome.tabs.query`), sending messages to content scripts (`chrome.tabs.sendMessage`), creating/closing/updating tabs, and capturing tab metadata (URL, title).
**Why needed:** Core to the browser automation functionality. AI agents need to navigate between tabs, read page content, and perform actions in specific tabs. The `tabId` parameter on all tools requires tab management access.
**Code reference:** `background.js` → `handleTabsList()`, `handleTabsCreate()`, `handleTabsClose()`, `handleTabsSwitch()`, `sendToContentScript()`, `getActiveTabId()`

### `cookies`
**Used for:** Reading and setting cookies via `chrome.cookies.get/getAll/set` for session management during automation workflows.
**Why needed:** Many automation workflows require maintaining login sessions, checking authentication state, or managing session tokens. Without cookie access, AI agents cannot effectively automate authenticated workflows.
**Code reference:** `background.js` → `handleCookiesGet()`, `handleCookiesSet()`

## Host Permissions

### `<all_urls>`
**Used for:** Injecting the content script on all pages so the extension can execute browser automation actions (click, type, scroll, read page, etc.) on any website the user visits.
**Why needed:** AI agents need to automate actions on arbitrary websites chosen by the user. The content script is injected at `document_idle` and only responds to explicit action requests from the background service worker.
**Code reference:** `manifest.json` → `content_scripts[0].matches`, `content.js` → `chrome.runtime.onMessage.addListener`

## Privacy

- **No data collection:** WebMCP does not collect, transmit, or store any user browsing data.
- **Local-only communication:** All communication between the MCP server and extension happens over `localhost` WebSocket (port 8080).
- **No remote servers:** No data is sent to any remote server. The MCP server runs on the user's own machine.
- **No tracking:** No analytics, telemetry, or usage tracking of any kind.
- **Password protection:** Password field values are never included in page reads (masked as `[filled]`).
