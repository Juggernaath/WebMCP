# WebMCP

[![npm version](https://img.shields.io/npm/v/webagent-mcp.svg)](https://www.npmjs.com/package/webagent-mcp)

**WebMCP** gives AI agents control of your real browser — your browser, your data, your machine. No cloud sandboxes, no proxies.

It connects AI agents (Claude, Cursor, custom LLMs) to a Chrome extension via the **Model Context Protocol (MCP)**, letting them navigate, click, type, and read pages exactly like you would.

## What Makes WebMCP Different

- **Real browser** — agents use your actual Chrome with your cookies, sessions, and logins
- **MCP-native** — built on the open standard for AI tool communication
- **Privacy-first** — everything runs locally, nothing leaves your machine
- **25 automation tools** — navigate, read pages, fill forms, manage tabs, and more
- **Accessibility tree** — agents see pages as structured elements with reference numbers, not raw HTML
- **Human oversight** — monitoring popup, kill switch, CAPTCHA detection

## Quick Start

### 1. Install Extension
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `webagent-extension/`

### 2. Start MCP Server
```bash
cd webagent-mcp
npm install
npm start          # stdio transport (for Claude, Cursor)
# or
npm run dev        # SSE transport on port 3000
```

### 3. Connect Your AI
Configure your AI tool to use the WebMCP MCP server. The extension connects automatically via WebSocket.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `webagent-extension/` | Chrome Extension (MV3) |
| `webagent-mcp/` | MCP server + WebSocket bridge |
| `webagent-sdk-js/` | JavaScript SDK for web apps |
| `webagent-vscode/` | VS Code extension wrapper |
| `docs/` | Protocol spec, integration guide |

## Documentation

- [CLAUDE.md](CLAUDE.md) — Project index for AI agents
- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and data flow
- [Integration Guide](docs/integration-guide.md) — SDK usage and examples
- [Protocol Spec](docs/protocol.md) — Message formats and actions
- [Changelog](docs/CHANGELOG.md) — Version history

## Permissions

WebMCP requires 5 Chrome permissions and 1 host permission:

| Permission | Why |
|------------|-----|
| `activeTab` | Screenshot capture |
| `alarms` | Keep-alive for MV3 service worker (prevents WebSocket disconnect) |
| `storage` | Settings persistence |
| `tabs` | Tab management and messaging |
| `cookies` | Session management for automation |
| `<all_urls>` (host) | Content script injection on any page for DOM automation |

**Website:** [webmcp.tanujmittal.com](https://webmcp.tanujmittal.com)
