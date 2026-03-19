# Changelog

All notable changes to the WebMCP project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-11

### Added

- **Accessibility tree page reader** — `web_read_page` now returns structured elements with integer reference numbers, ARIA roles, accessible names, and stable CSS selectors. Agents can target elements by ref number instead of CSS selector. — Closes the quality gap with Claude in Chrome for page understanding.
- **Element reference system** — Integer refs (1, 2, 3...) assigned per page read, stored in a Map. `web_click`, `web_type`, and `web_hover` accept `ref` as alternative to `selector`. — More reliable than CSS selectors for dynamic pages.
- **`web_find_element` tool** — Find elements by visible text, aria-label, placeholder, or title. Returns matching elements with ref numbers. — Enables natural language element targeting.
- **`web_get_page_text` tool** — Extract cleaned main content from a page with navigation/UI noise removed. — Useful for reading articles and documentation.
- **`web_highlight` tool** — Temporarily highlight an element with a visible outline. — Enables human oversight of what the AI will interact with next.
- **`web_switch_tab` tool** — Switch browser focus to a specific tab by ID. — Enables multi-tab workflows.
- **`tabId` parameter** — All page-targeting tools now accept optional `tabId` to target specific tabs. — Enables parallel work across multiple tabs.
- **Popup monitoring panel** — 3-tab design (Status, Activity, Settings) replacing the 5-tab design. Status tab shows connection state, action count, kill switch, and last 3 actions. — Focused on human oversight, not manual operation.
- **Reconnect button** — Settings tab includes a manual WebSocket reconnect button.
- **Clear activity log** — Activity tab includes a clear button.

### Removed

- **Recording engine** — Debugger-based action recording removed. — Required `debugger` permission; human-facing feature not needed for AI agent automation.
- **Task playback** — Saved task replay removed. — Depended on recording engine.
- **Native messaging bridge** — `chrome.runtime.connectNative()` removed. — WebSocket is the primary and sufficient transport.
- **Download handler** — `chrome.downloads.download()` removed. — Required `downloads` permission; not an MCP automation primitive.
- **`eval()` execution** — `executeEvaluate()` removed from content script. — Security risk; Chrome Web Store would flag it.
- **Scraping functions** — `scrapeText()`, `scrapeTables()`, `scrapeLinks()` removed. — Replaced by `web_get_page_text` and the accessibility tree.
- **5 Chrome permissions** — `scripting`, `downloads`, `nativeMessaging`, `debugger`, `webRequest` removed. — Permissions 9 → 4. `scripting` was never used (Chrome Web Store rejection cause). Others required by removed features.
- **Record/Tasks/Scrape popup tabs** — Removed from popup UI. — Features they controlled no longer exist.

### Changed

- **`web_read_page` output** — Now returns `{ title, url, elements: [...], forms: [...], captcha }` where elements is an accessibility tree array instead of separate buttons/inputs lists.
- **`web_click` targeting** — Now resolves in order: ref → selector → index → description (text search).
- **`web_type` required params** — `selector` no longer required when `ref` is provided.
- **MCP tool count** — 21 → 25 tools.
- **Extension version** — 1.0.0 → 1.1.0.
- **MCP server version** — 1.0.0 → 1.1.0.

### Fixed

- **Chrome Web Store rejection** — Purple Potassium violation resolved by removing unused `scripting` permission.

## [1.0.0] - 2026-01-25

### Added

- **MCP Server (webagent-mcp)** - Complete Model Context Protocol server for AI agent integration
  - stdio transport for local/direct connections
  - SSE transport for cloud/remote deployments
  - 21 browser automation tools exposed via MCP
  - Retry logic with exponential backoff for transient failures
  - Mock mode for testing without extension

- **WebSocket Bridge** - Bidirectional communication between MCP server and Chrome extension
  - Auto-recovery on port conflicts (8080 → 8081 → 8082)
  - Request-response correlation via UUID
  - Event-driven architecture for reliable messaging

- **Security Manager** - Comprehensive security policies
  - URL blocking via regex patterns
  - Domain allowlist/blocklist
  - Rate limiting (60 actions/min, burst limit of 10)
  - Action logging with automatic sanitization of sensitive fields
  - Session tracking and activity audit trail

- **Chrome Extension (webagent-extension)** - Manifest V3 compliant extension
  - Two-tier communication: direct apps + MCP agents
  - Content script for DOM execution
  - Background service worker for message routing
  - CAPTCHA detection
  - Recording and scraping features
  - Popup UI for configuration and activity monitoring

- **JavaScript SDK (webagent-sdk-js)** - Client library for web applications
  - Navigate, click, type, select actions
  - Form analysis and auto-fill
  - Page reading and screenshots
  - File upload support
  - CAPTCHA detection and human-in-loop handling
  - Request timeout and error handling

- **VS Code Extension (webagent-vscode)** - IDE integration wrapper
  - Spawn MCP server from VS Code
  - Configuration UI for port and settings
  - Cursor/VS Code AI integration

- **Configuration System**
  - 15+ environment variables for port, timeouts, retry, rate limiting, security
  - Centralized config.js with sensible defaults
  - Runtime configuration via SecurityManager.updateConfig()

- **Documentation**
  - Protocol specification (two-tier architecture, message formats)
  - Integration guide with quick-start examples
  - Architecture design document
  - Project index for AI agent understanding (CLAUDE.md)

### Fixed

- npm package structure corrected for v1.0.0 release
  - bin paths properly configured
  - Main entry point set to src/server.js
  - Files field includes all necessary assets

### Changed

- Removed website source and Firebase config from public repository
- Website now hosted separately at https://webmcp.tanujmittal.com
- Mobile UI responsiveness optimized
  - Menu and footer layout improvements
  - Typography scaling for small screens
  - Touch-friendly interface adjustments

### Technical Details

**Minimum Requirements:**
- Node.js 18+
- Chrome browser (extension)
- Modern browser with ES6 module support (for SDK)

**Dependencies:**
- `@modelcontextprotocol/sdk` ^1.0.0 - MCP protocol
- `express` ^5.2.1 - SSE server and routing
- `ws` ^8.14.0 - WebSocket communication
- `jimp` ^1.6.0 - Image processing for screenshots
- `cors` ^2.8.5 - CORS support for SSE

**Architecture:**
- 21 browser automation tools via MCP (web_click, web_type, web_navigate, web_list_tabs, etc.)
- Dual transport: stdio for local, SSE for cloud
- WebSocket bridge with auto-recovery
- Full request/response lifecycle with error handling

### Known Limitations

- WebSocket connection requires local network (does not work over internet without VPN/tunnel)
- Chrome extension limited to Chrome/Chromium browsers
- CAPTCHA detection heuristic-based (may miss sophisticated CAPTCHAs)
- Rate limiting is per-MCP-server (not global across multiple servers)

### Migration Guide

**For AI Agent Integrations:**
1. Install via npm: `npm install webagent-mcp`
2. Start server: `npm start` (stdio) or `npm run dev` (SSE on port 3000)
3. Load Chrome extension from `webagent-extension/`
4. Configure MCP in your AI tool (Cursor, VS Code, etc.)
5. Use MCP tools from your AI agent (web_navigate, web_click, etc.)

**For Web App Integrations:**
1. Install extension from [Chrome Web Store](https://chromewebstore.google.com/detail/webmcp/angbjhnglmgbaoknfnifedallkocldah)
2. Import SDK: `import { WebagentClient } from '@webagent/sdk'`
3. Initialize client with extension ID from `chrome://extensions`
4. Call methods: `await client.navigate(url)`, `await client.click(selector)`, etc.

---

**Release Date:** January 25, 2026
**Status:** Stable - Ready for production use
**Maintainers:** WebMCP Team

