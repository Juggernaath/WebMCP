# ARCHITECTURE.md - WebMCP System Design

## System Overview

WebMCP is a dual-tier browser automation platform. AI agents and web applications communicate with a Chrome extension via two distinct pathways, each optimized for its use case.

```
┌─────────────────────────────────────────────────────────────────┐
│                     TWO-TIER ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

TIER 1: Direct Web App Control (Intra-Browser)
────────────────────────────────────────────────
    Web App (DOM context)
           │ chrome.runtime.sendMessage (externally_connectable)
           ↓
    Extension Background Service Worker
           │ chrome.runtime.Port (persistent, primary)
           │ or chrome.tabs.sendMessage (fallback)
           ↓
    Content Script (page context)
           │ DOM API calls
           ↓
    [Browser Actions: click, type, scroll, etc.]


TIER 2: Remote MCP Agent Control
────────────────────────────────
    AI Agent (Claude, Cursor, LangChain, etc.)
           │ MCP protocol (stdio or SSE)
           ↓
    MCP Server (Node.js)
           │ ExtensionBridge with retry logic
           ↓
    WebSocket Bridge
           │ JSON messages over ws://localhost:8080
           ↓
    Extension Background Service Worker
           │ chrome.runtime.Port (persistent, primary)
           │ or chrome.tabs.sendMessage (fallback)
           ↓
    Content Script (page context)
           │ DOM API calls
           ↓
    [Browser Actions: click, type, scroll, etc.]

┌──────────────────────────────────────────┐
│  Security & Monitoring (both tiers)      │
├──────────────────────────────────────────┤
│ • URL blocking (regex patterns)           │
│ • Domain allowlist/blocklist              │
│ • Rate limiting (60 actions/min)          │
│ • Action logging (with sanitization)      │
│ • CAPTCHA detection                       │
│ • Human-in-loop interrupts                │
└──────────────────────────────────────────┘
```

## Components

| Component | Purpose | Key Files | Responsibilities |
|-----------|---------|-----------|------------------|
| **MCP Server** | Entry point for AI agents | `webagent-mcp/src/server.js` | Initialize MCP transports (stdio/SSE), expose tools, handle tool calls, manage server lifecycle |
| **Tools Layer** | MCP tool definitions | `webagent-mcp/src/tools.js` | Define 25 `web_*` tools including accessibility tree reader, element finder, and tab management |
| **ExtensionBridge** | Route MCP requests to extension | `webagent-mcp/src/bridge/extension-bridge.js` | Send requests to extension, implement retry logic, mock mode for testing, error handling |
| **WebSocketBridge** | Bidirectional extension connection | `webagent-mcp/src/bridge/websocket-bridge.js` | WebSocket server on port 8080, handle extension connections, match requests to responses, auto-recovery on port conflicts |
| **SecurityManager** | Policy enforcement | `webagent-mcp/src/security.js` | Check URLs against blocklist/allowlist, enforce rate limits, log actions with sanitization, track activity |
| **Extension Background** | Background service worker | `webagent-extension/background.js` | Route messages from web apps and MCP server, manage WebSocket connection, keep-alive via `chrome.alarms` (MV3), port-based content script messaging, handle tab switching, track sessions, maintain activity log |
| **Content Script** | DOM executor, accessibility tree builder | `webagent-extension/content.js` | Build accessibility tree with element refs, execute DOM operations (click, type, scroll), find elements by description, detect CAPTCHAs, highlight elements, extract main content text |
| **JavaScript SDK** | Web app client library | `webagent-sdk-js/src/index.js` | Methods for web apps to call extension (navigate, click, form fill, etc.), request correlation, error handling |
| **Retry Utility** | Retry logic with exponential backoff | `webagent-mcp/src/retry.js` | `withRetry()` wrapper, `isRetryableError()` classification, configurable attempts/delays |
| **VS Code Extension** | IDE integration | `webagent-vscode/` | Spawn MCP server from VS Code, provide configuration UI |

## Data Flow: AI Agent to Browser Action

**Request Path (MCP Server → Extension → DOM):**

```
1. AI Agent calls MCP tool
   Example: { name: 'web_click', arguments: { ref: 5 } }

2. MCP Server receives CallToolRequest
   handler: server.setRequestHandler(CallToolRequestSchema, async (request) => {
       - Extract tool name and args
       - Check rate limit via securityManager.checkRateLimit()
       - For navigation: check URL via securityManager.isUrlAllowed()

3. MCP Server calls handleToolCall(name, args, extensionBridge)
   handler: webagent-mcp/src/tools.js

4. ExtensionBridge.execute(action, params)
   - If mockMode=true: return mock response
   - If extension not connected: retry with backoff
   - Send via WebSocketBridge.execute()

5. WebSocketBridge sends message over WebSocket
   { requestId: 'req_1234_abc', action: 'click', params: { ref: 5 } }
   Extension receives on ws.onmessage

6. Extension Background receives message
   Looks up action handler, sends via port (contentPorts.get(tabId)) or falls back to chrome.tabs.sendMessage

7. Content Script receives message
   Resolves ref to DOM element, executes action

8. Content Script sends response back to Background
   { success: true, result: { clicked: true } }

9. Background routes response back to WebSocket
   { requestId: 'req_1234_abc', success: true, result: { clicked: true } }

10. MCP Server receives response over WebSocket
    ExtensionBridge awaits promise, returns result

11. MCP Server returns to agent
    { content: [{ type: 'text', text: '{"clicked": true}' }] }

12. AI Agent receives result and decides next action
```

**Response Path (DOM → MCP Server):**
Same WebSocket connection is bidirectional. Responses match request IDs for correlation.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **MCP Transport** | stdio + SSE options | stdio for local/direct use, SSE for cloud/remote MCP servers |
| **Extension ↔ Server** | WebSocket | Simpler than native messaging, works across platforms, supports bi-directional messages |
| **Extension ↔ App** | Chrome `runtime.sendMessage` | Native, no library required, built-in security context |
| **App ↔ Content Script** | Chrome messaging | Secure isolation, no direct DOM access from background |
| **Retry Strategy** | Exponential backoff (1s, 2s, 4s, max 10s) | Handles transient network issues without overwhelming server |
| **Rate Limiting** | 60 actions/min per server | Prevents abuse, allows burst of 10 rapid actions |
| **Security Model** | Allowlist/blocklist URLs | Flexible: empty allowlist = all allowed, can restrict to specific domains |
| **Action Logging** | Sanitized, length-limited | Never log passwords/tokens, truncate long values, keep 1000 entries |
| **Mock Mode** | Off by default (`WEBAGENT_MOCK=false`), auto-fallback on connection failure | Enables testing without extension; production defaults to real connections |
| **Element References** | Integer refs assigned per page read | Stable targeting without CSS selectors; refs persist within a page load |

## Dependencies

| Package | Version | Used By | Purpose |
|---------|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.0.0 | webagent-mcp | MCP protocol implementation |
| `express` | ^5.2.1 | webagent-mcp | SSE server, routing |
| `ws` | ^8.14.0 | webagent-mcp | WebSocket bridge |
| `cors` | ^2.8.5 | webagent-mcp | SSE cross-origin support |
| `pkg` | ^5.8.1 | webagent-mcp (dev) | Build executables |
| `typescript` | ^5.1.3 | webagent-vscode (dev) | VS Code extension compilation |
| `@types/vscode` | ^1.80.0 | webagent-vscode (dev) | VS Code API types |
| `vsce` | ^2.15.0 | webagent-vscode (dev) | VS Code package tool |

## Request-Response Correlation

**WebSocket message format:**

```json
{
  "requestId": "req_1234_abc",
  "action": "click",
  "params": { "selector": "#button" }
}

{
  "requestId": "req_1234_abc",
  "success": true,
  "result": { "clicked": true }
}

{
  "requestId": "req_1234_abc",
  "success": false,
  "error": { "code": "ACTION_FAILED", "message": "Element not found" }
}
```

Requests are matched to responses by `requestId`. Pending requests are tracked in `WebSocketBridge.pendingRequests` Map.

## Extension Connection Lifecycle

1. **Startup:** MCP server starts WebSocketBridge on port 8080
2. **Extension Load:** Extension loads, initiates WebSocket connection to `ws://localhost:8080`
3. **Handshake:** Server sends `{ type: 'handshake', version: '1.0.0', clientId }` to the connecting extension; extension logs receipt and considers connection established
4. **Active:** Extension maintains connection, listens for incoming requests
5. **Request:** MCP requests routed over this connection
6. **Disconnect:** If connection lost, MCP retries with backoff; extension auto-reconnects
7. **Port Conflict:** If 8080 in use, WebSocketBridge tries 8081, 8082, etc.

## Error Handling & Recovery

| Scenario | Handler | Behavior |
|----------|---------|----------|
| Extension not connected | ExtensionBridge fallback | Returns mock response, logs warning |
| WebSocket network error | ExtensionBridge retry | 3 attempts with 1s, 2s, 4s delays |
| Tool timeout (60s default) | MCP server | Returns error to agent, security logs action |
| Rate limit exceeded | SecurityManager | Rejects request immediately |
| Blocked URL | SecurityManager | Rejects navigation before sending to extension |
| Port 8080 in use | WebSocketBridge | Auto-increments port, logs new port |

## Configuration Injection Points

1. **Environment variables** (`config.js`): Centralized config with env var overrides
2. **SecurityManager.updateConfig()**: Runtime security policy changes
3. **WebSocketBridge options**: Port, TLS settings (planned)
4. **ExtensionBridge options**: Mock mode, port, custom handlers
5. **Server options** (`startServer`): Transport type (stdio/sse), port

