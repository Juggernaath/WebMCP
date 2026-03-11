# WebMCP Integration Guide

## Quick Start

### 1. Install the Extension

Load the unpacked extension from `webagent-extension/` in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `webagent-extension` folder

### 2. Add SDK to Your App

```html
<script src="path/to/webagent-sdk-js/src/index.js" type="module"></script>
```

Or copy the SDK to your project.

### 3. Initialize Client

```javascript
import { WebagentClient } from './webagent-sdk-js/src/index.js';

const webmcp = new WebagentClient({
    extensionId: 'your-extension-id',  // Get from chrome://extensions
    appId: 'my-app',
    debug: true
});
```

### 4. Use Actions

```javascript
// Navigate to a page
await webmcp.navigate('https://example.com/form');

// Read page state
const page = await webmcp.readPage();
console.log('Forms found:', page.forms.length);

// Fill a form
await webmcp.fillForm({
    email: 'user@example.com'
}, {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890'
});

// Click submit
await webmcp.click('#submit-btn');
```

### 5. Use Element References (v1.1.0)

```javascript
// Read page to get element references
const page = await webmcp.readPage();
console.log('Elements:', page.elements.length);

// Find a specific element
const signIn = page.elements.find(el => el.name === 'Sign In');
console.log('Sign In ref:', signIn.ref);

// Click using ref (more reliable than CSS selector)
await webmcp.click({ ref: signIn.ref });
```

**Why use refs?** Element references are more reliable than CSS selectors on dynamic pages. The accessibility tree is generated fresh on each page read and uses integer refs that persist for the entire page state.

## Job Application Example

```javascript
import { WebagentClient } from './webagent-sdk-js/src/index.js';

const webmcp = new WebagentClient({ appId: 'my-job-app' });

async function applyToJob(jobUrl, userProfile, resumeUrl) {
    // Navigate to job
    await webmcp.navigate(jobUrl);
    await webmcp.wait(2000);
    
    // Check for CAPTCHA
    const page = await webmcp.readPage();
    if (page.captcha?.detected) {
        const hil = await webmcp.requestHIL('captcha', 'Please solve CAPTCHA');
        await webmcp.waitForHIL(hil.hilId);
    }
    
    // Analyze form
    const form = await webmcp.analyzeForm();
    
    // Fill form with user profile
    await webmcp.fillForm({}, userProfile);
    
    // Upload resume
    const fileInput = form.fields.find(f => f.type === 'file');
    if (fileInput) {
        await webmcp.upload(fileInput.selector, resumeUrl, 'resume.pdf');
    }
    
    // Click next/submit
    await webmcp.click('#submit-btn');
}
```

## Deprecated Features (v1.1.0)

The following features have been removed in v1.1.0:

- **Recording** — Debugger-based action recording is no longer available. For automation workflows, use the MCP tools directly.
- **Scraping** — `scrapeText()`, `scrapeTables()`, `scrapeLinks()` have been removed. Use `web_get_page_text` instead, or parse the accessibility tree from `web_read_page`.

## Error Handling

```javascript
try {
    await webmcp.click('#non-existent');
} catch (error) {
    if (error.code === 'NOT_FOUND') {
        console.log('Element not found, trying alternative...');
    }
}
```

## Human-in-Loop Flow

When automation encounters something it can't handle:

```javascript
// Detect CAPTCHA
const page = await webmcp.readPage();

if (page.captcha?.detected) {
    // Request user help
    const { hilId } = await webmcp.requestHIL('captcha', 'Solve the CAPTCHA');
    
    // Show notification to user in your UI
    showNotification('Please solve the CAPTCHA in the browser');
    
    // Wait for user to complete
    await webmcp.waitForHIL(hilId, 2000, 300000);  // Poll every 2s, max 5 min
    
    // Continue automation
    console.log('CAPTCHA solved, continuing...');
}
```

## Known Limitations

| Limitation | Affected Tool | Workaround |
|---|---|---|
| Screenshots require Chrome to be visible and in the foreground | `web_screenshot` | Use `web_read_page` for page understanding — the accessibility tree works regardless of window visibility |
| CAPTCHA cannot be solved automatically | All navigation | Use the Human-in-Loop flow above |

All other tools (`web_navigate`, `web_click`, `web_type`, `web_read_page`, `web_find_element`, etc.) work whether Chrome is in the foreground or background.

## Finding Extension ID

After loading the extension:
1. Go to `chrome://extensions`
2. Find "WebMCP"
3. Copy the ID (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
