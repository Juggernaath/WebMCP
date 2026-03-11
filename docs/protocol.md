# Webagent Protocol Specification

## Overview

Webagent is a universal browser automation platform that allows apps to control the browser through a standardized message-passing protocol.

**Two-Tier Architecture:**
- **Tier 1:** Web apps communicate directly via Chrome's `externally_connectable` messaging
- **Tier 2:** AI agents communicate via MCP protocol through the `webagent-mcp` package

> **Note:** Webagent is purely browser automation primitives. LLM/AI logic should live in your app, not in Webagent.

> **Note (v1.1.0):** All page-targeting actions now accept an optional `tabId` parameter to target a specific tab instead of the active tab.

## Communication

Apps communicate with Webagent via Chrome's `externally_connectable` messaging.

### Connection

```javascript
// Get extension ID (published extension will have fixed ID)
const WEBAGENT_EXTENSION_ID = 'your-extension-id';

// Send message
chrome.runtime.sendMessage(WEBAGENT_EXTENSION_ID, request, response => {
    console.log('Response:', response);
});
```

## Request Format

```typescript
interface WebagentRequest {
    requestId: string;          // UUID for correlation
    appId: string;              // Your app identifier
    action: string;             // Action to perform
    params: object;             // Action-specific parameters
    context?: {
        userProfile?: object;   // User data for form filling
        timeout?: number;       // Max wait in ms
    };
}
```

## Response Format

```typescript
interface WebagentResponse {
    requestId: string;          // Matches request
    success: boolean;
    result?: any;               // Action-specific result
    error?: {
        code: string;           // Error code
        message: string;        // Human-readable message
    };
    hil?: {                     // Human-in-loop needed
        hilId: string;
        type: 'captcha' | 'question' | 'auth';
        message: string;
    };
}
```

## Actions

### Navigation

#### `navigate`
Navigate to a URL.

```javascript
{
    action: 'navigate',
    params: { url: 'https://example.com' }
}
// Response: { navigated: true, url: '...' }
```

#### `wait`
Wait for specified duration.

```javascript
{
    action: 'wait',
    params: { ms: 1000 }
}
// Response: { waited: 1000 }
```

### Page Reading

#### `page.read`
Get current page state.

```javascript
{
    action: 'page.read',
    params: {}
}
// Response: {
//   url, title,
//   elements: [
//     { ref: 1, role: "link", name: "Home", selector: "a.nav-home", href: "/" },
//     { ref: 2, role: "textbox", name: "Search", selector: "#search", type: "search", placeholder: "Search...", value: "" },
//     { ref: 3, role: "button", name: "Sign In", selector: "#signin-btn" },
//     ...
//   ],
//   forms: [...],
//   captcha: { detected: false }
// }
```

**Accessibility Tree (v1.1.0):**
The `elements` array contains an accessibility tree with:
- `ref` — Integer identifier for targeting (1, 2, 3, ...). Used with `web_click`, `web_type`, `web_hover` instead of CSS selectors.
- `role` — ARIA role (e.g., "button", "link", "textbox", "heading", "navigation")
- `name` — Accessible name from aria-label, placeholder, text content, title, or alt text
- `selector` — Stable CSS selector for this element
- Additional properties based on element type (href for links, type/placeholder/value for inputs, etc.)

Password fields have their `value` masked as `[filled]` for privacy.

### Interactions

#### `click`
Click an element.

```javascript
{
    action: 'click',
    params: {
        ref: 3,                    // Element ref from page.read (preferred)
        // OR
        selector: '#submit-btn',   // CSS selector
        // OR
        index: 0,                  // Button index
        // OR
        description: 'Submit'      // Text search
    }
}
// Response: { clicked: true }
```

**Resolution order:** `ref` → `selector` → `index` → `description`. Uses the first method that resolves an element.

#### `type`
Type text into an input.

```javascript
{
    action: 'type',
    params: {
        ref: 2,                    // Element ref from page.read (preferred)
        // OR
        selector: '#email',
        text: 'user@example.com',
        clear: true  // Clear existing value first
    }
}
// Response: { typed: true, length: 17 }
```

**v1.1.0:** `selector` is no longer required when `ref` is provided.

#### `select`
Select dropdown option.

```javascript
{
    action: 'select',
    params: { 
        selector: '#country',
        value: 'US',           // By value
        // OR
        text: 'United States'  // By text (partial match)
    }
}
// Response: { selected: true, value: 'US' }
```

#### `scroll`
Scroll the page.

```javascript
{
    action: 'scroll',
    params: { 
        direction: 'down',  // 'up' or 'down'
        amount: 300         // Pixels
    }
}
// Response: { scrolled: true }
```

### File Upload

#### `upload`
Upload a file to file input.

```javascript
{
    action: 'upload',
    params: {
        selector: 'input[type="file"]',  // required
        fileBase64: '<base64-encoded-content>',  // required — Base64 encoded file content
        filename: 'resume.pdf'           // required — name for the file
    }
}
// Response: { uploaded: true, fileName: 'resume.pdf' }
```

> **Note:** The MCP tool (`web_upload`) accepts `fileBase64` + `filename`. The content script resolves the Base64 payload in the page context.

### Forms

#### `form.analyze`
Analyze form fields.

```javascript
{
    action: 'form.analyze',
    params: { formIndex: 0 }
}
// Response: { hasForm: true, fields: [...] }
```

#### `form.fill`
Fill form with data.

```javascript
{
    action: 'form.fill',
    params: { 
        data: { email: 'user@example.com' }
    },
    context: {
        userProfile: { firstName: 'John', lastName: 'Doe', ... }
    }
}
// Response: { filled: 5, total: 8, errors: null }
```

### Human-in-Loop

#### `hil.request`
Request user intervention.

```javascript
{
    action: 'hil.request',
    params: { 
        type: 'captcha',
        message: 'Please solve the CAPTCHA'
    }
}
// Response: { hilId: 'hil_123', status: 'pending' }
```

#### `hil.resolve`
Confirm user completed intervention.

```javascript
{
    action: 'hil.resolve',
    params: { hilId: 'hil_123' }
}
// Response: { resolved: true }
```

### Element Targeting (v1.1.0)

#### `findElement`
Find elements by description.

```javascript
{
    action: 'findElement',
    params: { query: 'Sign In' }
}
// Response: { matches: [{ ref: 3, role: "button", name: "Sign In", selector: "#signin-btn", score: 100 }, ...] }
```

#### `getPageText`
Extract main content text.

```javascript
{
    action: 'getPageText',
    params: {}
}
// Response: { text: "...", length: 1234 }
```

#### `highlightElement`
Highlight an element.

```javascript
{
    action: 'highlightElement',
    params: { ref: 3, duration: 2000 }
}
// Response: { highlighted: true, duration: 2000 }
```

### Tabs (v1.1.0)

#### `tabs.switch`
Switch to a tab.

```javascript
{
    action: 'tabs.switch',
    params: { tabId: 123 }
}
// Response: { switched: true, tabId: 123, url: "...", title: "..." }
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Missing required fields |
| `UNKNOWN_ACTION` | Action not recognized |
| `ACTION_FAILED` | Action execution failed |
| `NOT_FOUND` | Element not found |
| `TIMEOUT` | Operation timed out |
| `INTERNAL_ERROR` | Unexpected error |

## App Registration

To use Webagent, your app's origin must be listed in the extension's `externally_connectable.matches`.

During development:
- `http://localhost:*/*` is allowed

For production:
- Contact Webagent team to add your domain
