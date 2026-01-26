# WebMCP

**WebMCP** is a standalone browser automation platform that bridges the gap between human browsing and AI agent control.

It consists of two main components:
1. **WebMCP Extension** (`webagent-extension`): A powerful Chrome extension for recording, scraping, and managing browser tasks.
2. **WebMCP Server** (`webagent-mcp`): An MCP (Model Context Protocol) server that allows AI agents (like Claude, Cursor, or custom LLMs) to control the browser via the extension.

**🌐 Live Website:** [https://webmcp.tanujmittal.com](https://webmcp.tanujmittal.com)

## Project Structure

- **`webagent-extension/`**: The Chrome Extension source code.
- **`webagent-mcp/`**: The MCP server and bridge implementation (Node.js).
- **`webagent-vscode/`**: VS Code extension wrapper for the MCP server.
- **`releases/`**: Downloadable extension packages (v1.0.4).
- **`assets/`**: Branding and store listing images.
- **`scripts/`**: Helper scripts for deployment and maintenance.
- **`docs/`**: Integration guides and protocol documentation.

## Quick Start

### 1. Install the Extension
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load unpacked** and select the `webagent-extension` folder.

### 2. Use Standalone Features
- Open the WebMCP popup.
- **Record**: Capture your actions and save them as tasks.
- **Scrape**: Extract data from pages instantly.
- **Settings**: Configure behavior and logs.

### 3. Enable AI Control (Optional)
To let AI agents control your browser:

1. **Build the MCP Server**:
   ```bash
   cd webagent-mcp
   npm install
   npm run build
   ```
   
2. **Run in VS Code** (if using Cursor/VS Code AI):
   - Open `webagent-vscode` folder in VS Code.
   - Press `F5` to debug or install the generic VSIX package.
   
3. **Connect**:
   - The MCP server will start on port 3000 (SSE) or stdio.
   - The extension connects automatically via WebSocket.

## Documentation
- [Integration Guide](docs/integration-guide.md)
- [Walkthrough](docs/walkthrough.md)
