# WebMCP Browser Extension

The core component of the WebMCP platform. This Chrome extension enables:

- **Recording**: Capture user interactions (clicks, types, formatting) and save them as tasks.
- **Scraping**: Extract text, tables, links, and logs from any page.
- **Playback**: Replay saved tasks automatically with human-like delays.
- **AI Integration**: Acts as the bridge for the WebMCP server to control the browser.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this `webagent-extension` folder.

## Features

### Popup UI
- **Record**: Start/stop recording. Visual indicator of captured actions.
- **Tasks**: Manage saved tasks. Play, export, or delete them.
- **Scrape**: One-click extraction of data to clipboard/JSON.
- **Activity**: Live log of all automation events.
- **Settings**: Toggle logs, blocking, and AI features.

### Permissions
- `debugger`: Required for capturing console logs and network requests.
- `webRequest`: Required for analyzing network traffic.
- `nativeMessaging`: Required for communicating with the MCP server (if installed).
