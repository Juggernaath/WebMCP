# WebMCP

> MCP Server for browser automation via Chrome extension

WebMCP enables AI agents (Claude, Cursor, etc.) to control your browser through the [Model Context Protocol](https://modelcontextprotocol.io/).

## Quick Start

### 1. Install the MCP Server

```bash
npm install -g webagent-mcp
```

Or run directly:
```bash
npx webagent-mcp
```

### 2. Install Chrome Extension

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/webmcp/angbjhnglmgbaoknfnifedallkocldah), or load unpacked from `chrome://extensions` → select the `webagent-extension` folder.

### 3. Configure Your AI Client

#### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webagent": {
      "command": "npx",
      "args": ["webagent-mcp"]
    }
  }
}
```

#### Cursor

Add to MCP settings in Cursor preferences.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `web_navigate` | Navigate to a URL |
| `web_read_page` | Read page content, forms, buttons |
| `web_click` | Click elements |
| `web_type` | Type text into inputs |
| `web_select` | Select dropdown options |
| `web_scroll` | Scroll page up/down |
| `web_press_key` | Press keyboard keys |
| `web_analyze_form` | Analyze form structure |
| `web_fill_form` | Fill form intelligently |
| `web_list_tabs` | List open browser tabs |
| `web_create_tab` | Open new tab |
| `web_close_tab` | Close a tab |
| `web_screenshot` | Capture visible area |
| `web_wait` | Wait for specified time |

---

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBMCP_WS_PORT` | `8080` | WebSocket port for extension |
| `WEBMCP_SSE_PORT` | `3000` | SSE port for HTTP mode |
| `WEBMCP_TOOL_TIMEOUT` | `60000` | Tool execution timeout (ms) |
| `WEBMCP_RETRY_ATTEMPTS` | `3` | Retry attempts on failure |
| `WEBMCP_RATE_LIMIT` | `60` | Max actions per minute |
| `WEBAGENT_MOCK` | `false` | Enable mock mode |

---

## Usage Examples

### Navigate and Read

```
User: Go to example.com and tell me what you see

AI uses:
1. web_navigate { url: "https://example.com" }
2. web_read_page {}
```

### Fill a Form

```
User: Fill the contact form with my info

AI uses:
1. web_read_page {} → sees form structure
2. web_click { selector: "input[name='email']" }
3. web_type { selector: "input[name='email']", text: "user@email.com" }
4. web_click { selector: "button[type='submit']" }
```

---

## Development

```bash
# Clone repo
git clone https://github.com/user/webmcp.git

# Install dependencies
cd webagent-mcp
npm install

# Run in development
npm run dev

# Run tests
npm test
```

---

## License

MIT
