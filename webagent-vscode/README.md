# WebMCP for VS Code

Bring the power of AI browser automation directly into VS Code and Cursor.
This extension wraps the **WebMCP Server**, allowing AI agents within your editor to control your Chrome browser.

## Features

- **One-Click Setup**: Automatically starts the WebMCP server.
- **Status Indicator**: Shows connection status in the status bar.
- **Seamless Integration**: Works out of the box with AI coding assistants that support MCP.

## Requirements

- **WebMCP Chrome Extension**: Must be installed and running in your browser.
- **Chrome**: The extension currently supports Google Chrome.

## Usage

1. Install this extension (`.vsix`).
2. The WebMCP server starts automatically (check status bar).
3. Use your AI assistant to browse:
   > "Go to localhost:3000 and check the console logs"
   > "Login to the staging server and verify the new feature"

## Commands

- `WebMCP: Start Server`
- `WebMCP: Stop Server`

## Configuration

- `webmcp.port`: Port for the MCP server (default: 3000).

## Troubleshooting

If the status bar shows "WebMCP Stopped":
1. Click the status bar item to restart.
2. Check the "WebMCP" output channel for logs.
3. Ensure the Chrome Extension is running.
