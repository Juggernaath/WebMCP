# CLAUDE.md - WebMCP Project Index

**WebMCP** is a privacy-first browser automation platform that gives AI agents control of the user's real browser via the MCP protocol.

## Tech Stack

| Component | Tech | Version | Purpose |
|-----------|------|---------|---------|
| webagent-mcp | Node.js + MCP SDK | 18+ | MCP server exposing browser tools |
| webagent-extension | Chrome Extension | MV3 | Browser automation client |
| webagent-sdk-js | JavaScript | ES6 modules | Web app client library |
| webagent-vscode | VS Code Extension | TypeScript | IDE integration wrapper |
| Transport | WebSocket + SSE | Express 5.2.1 | MCP & extension communication |

## Project Structure

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `/webagent-mcp` | MCP server & bridges | `src/server.js`, `src/tools.js`, `src/security.js`, `src/setup.js`, `src/retry.js` |
| `/webagent-mcp/src/bridge` | Transport layer | `extension-bridge.js`, `websocket-bridge.js` |
| `/webagent-extension` | Chrome extension source | `background.js`, `content.js`, `manifest.json` |
| `/webagent-sdk-js` | JavaScript SDK for web apps | `src/index.js` |
| `/webagent-vscode` | VS Code extension wrapper | `package.json`, TypeScript source |
| `/docs` | Documentation | `protocol.md`, `integration-guide.md`, `CHANGELOG.md` |
| `/website` | Marketing site (deployed via Firebase) | `index.html`, `styles.css` |

## Quick-Start Commands

| Command | Location | Effect |
|---------|----------|--------|
| `npm install` | `/webagent-mcp` | Install MCP server dependencies |
| `npm run start` | `/webagent-mcp` | Run on stdio transport |
| `npm run dev` | `/webagent-mcp` | Run SSE server on port 3000 |
| `npm run build` | `/webagent-mcp` | Build executables (Windows/Mac/Linux) |
| `npm run test` | `/webagent-mcp` | Run test suite |
| `npm run setup` | `/webagent-mcp` | Interactive setup wizard |

## Configuration Reference

All environment variables are optional and have defaults.

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `WEBMCP_WS_PORT` | int | 8080 | WebSocket bridge port |
| `WEBMCP_SSE_PORT` | int | 3000 | SSE server port |
| `WEBMCP_TOOL_TIMEOUT` | int | 60000 | Tool execution timeout (ms) |
| `WEBMCP_NAV_TIMEOUT` | int | 30000 | Page navigation timeout (ms) |
| `WEBMCP_WS_TIMEOUT` | int | 10000 | WebSocket connection timeout (ms) |
| `WEBMCP_EXT_TIMEOUT` | int | 60000 | Extension response timeout (ms) |
| `WEBMCP_RETRY_ATTEMPTS` | int | 3 | Max retry attempts for failed actions |
| `WEBMCP_RETRY_DELAY` | int | 1000 | Initial delay between retries (ms) |
| `WEBMCP_RETRY_BACKOFF` | float | 2 | Retry delay multiplier per attempt |
| `WEBMCP_RETRY_MAX_DELAY` | int | 10000 | Max delay between retries (ms) |
| `WEBMCP_RATE_LIMIT` | int | 60 | Max actions per minute |
| `WEBMCP_BURST_LIMIT` | int | 10 | Max rapid-fire actions |
| `WEBMCP_BLOCKED_PATTERNS` | string | empty | Comma-separated domain substrings to block |
| `WEBMCP_ALLOWED_DOMAINS` | string | empty | Comma-separated domains (empty = all allowed) |
| `WEBMCP_AUDIT_LOG` | bool | true | Enable action logging |
| `WEBMCP_VERBOSE` | bool | false | Enable debug output |
| `WEBAGENT_MOCK` | bool | false | Use mock responses (testing) |

## Documentation Index

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, components, data flow |
| [docs/protocol.md](./docs/protocol.md) | Message format, request/response spec, actions |
| [docs/integration-guide.md](./docs/integration-guide.md) | Quick start, SDK usage, examples |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | Version history and release notes |
| [README.md](./README.md) | Project overview and setup |

## MCP Tools Exposed (25 tools)

| Tool | Arguments | Description |
|------|-----------|-------------|
| `web_navigate` | `url` (required) | Navigate to URL |
| `web_back` | `tabId` | Back in history |
| `web_forward` | `tabId` | Forward in history |
| `web_refresh` | `tabId` | Reload page |
| `web_wait` | `ms` | Pause execution (default 1000ms) |
| `web_read_page` | `tabId` | Read page as accessibility tree with element refs |
| `web_screenshot` | `format` (png/jpeg), `tabId` | Capture page image |
| `web_click` | `selector` or `text` or `index` or `ref`, `tabId` | Click element |
| `web_type` | `selector` or `ref`, `text`, `clear`, `tabId` | Type into input |
| `web_select` | `selector` (required), `value` or `text`, `tabId` | Select dropdown option |
| `web_scroll` | `direction` (up/down), `pixels`, `tabId` | Scroll page (default 300px) |
| `web_hover` | `selector` or `ref`, `tabId` | Hover over element |
| `web_press_key` | `key` (required), `selector`, `tabId` | Press keyboard key |
| `web_analyze_form` | `formSelector`, `tabId` | Analyze form fields and structure |
| `web_fill_form` | `data` (required), `tabId` | Auto-fill form with key-value pairs |
| `web_upload` | `selector` (required), `fileBase64` (required), `filename` (required), `tabId` | Upload file (Base64 encoded) |
| `web_list_tabs` | none | List all open browser tabs |
| `web_new_tab` | `url` | Open new browser tab |
| `web_close_tab` | `tabId` | Close a browser tab |
| `web_wait_for_element` | `selector` (required), `timeout`, `tabId` | Wait for element to appear (default 10s) |
| `web_wait_for_navigation` | `timeout`, `tabId` | Wait for page navigation (default 30s) |
| `web_find_element` | `query` (required), `tabId` | Find elements by text/label and return refs |
| `web_get_page_text` | `tabId` | Extract main content text (noise removed) |
| `web_highlight` | `selector` or `ref`, `duration`, `tabId` | Temporarily highlight element on page |
| `web_switch_tab` | `tabId` (required) | Switch browser focus to specified tab |

## Architecture Summary

**Two-Tier Communication:**

1. **Tier 1 (Direct):** Web apps → Extension via Chrome `runtime.sendMessage` → Background Service Worker → Content Script (via persistent `chrome.runtime.Port` connections, with `chrome.tabs.sendMessage` fallback)
2. **Tier 2 (MCP):** AI Agents → MCP Server (stdio/SSE) → WebSocket Bridge → Extension Background Service Worker → Content Script (via persistent port connections, resolving bfcache failures in Chrome MV3)

**Key Components:**
- `ExtensionBridge`: Routes MCP requests to extension via WebSocket, includes retry logic, maintains server-side ref→selector cache for element targeting
- `WebSocketBridge`: WebSocket server that extension connects to (auto-recovery on port conflict)
- `SecurityManager`: URL blocking, rate limiting, action logging
- Content Script: Accessibility tree reader, DOM actions, element reference system, CAPTCHA detection

## MAKER Framework Rules

**Documentation is law.** This file is the single source of truth for:
- Tech stack definitions
- Configuration variable names and defaults
- Directory structure and file purposes
- Available commands and their effects
- External API surface (MCP tools)

**When code and docs disagree, update the docs immediately.** All developers read this file first.

