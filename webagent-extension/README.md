# WebMCP Browser Extension

Chrome extension for AI browser automation via the Model Context Protocol (MCP). Your browser, your data.

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `webagent-extension` folder

## What It Does

Connects AI agents to your real browser session over a local WebSocket bridge. Agents send MCP tool calls; the extension executes them in the active tab.

- **Navigate**: Go to URLs, back/forward, refresh
- **Read**: Accessibility tree with element refs, text extraction, screenshots
- **Interact**: Click, type, scroll, hover, press keys (by selector, text, or ref)
- **Forms**: Analyze and auto-fill forms, upload files
- **Tabs**: List, create, close, switch between tabs

## Popup UI (3 tabs)

- **Status**: Connection indicator, session info, kill switch
- **Activity**: Scrollable log of all automation actions
- **Settings**: Human-like delays toggle, logging toggle, reconnect

## Permissions (5)

| Permission | Why |
|---|---|
| `activeTab` | Screenshot capture via `captureVisibleTab` |
| `alarms` | Keep MV3 service worker alive for WebSocket |
| `storage` | Persist user settings across sessions |
| `tabs` | Tab management, navigation, messaging |
| `cookies` | Session management for authenticated workflows |

See `PERMISSIONS.md` for detailed justifications with code references.

## Privacy

- All communication is local (`localhost` WebSocket, port 8080)
- No data sent to any remote server
- No analytics or tracking
- Password fields are masked as `[filled]` in page reads
