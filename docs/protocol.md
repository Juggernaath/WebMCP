# Webagent Protocol Specification

## Overview

Webagent is a universal browser automation platform that allows apps to control the browser through a standardized message-passing protocol.

**Two-Tier Architecture:**
- **Tier 1:** Web apps communicate directly via Chrome's `externally_connectable` messaging
- **Tier 2:** AI agents communicate via MCP protocol through the `webagent-mcp` package

> **Note:** Webagent is purely browser automation primitives. LLM/AI logic should live in your app, not in Webagent.

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
// Response: { url, title, forms, buttons, inputs, captcha }
```

### Interactions

#### `click`
Click an element.

```javascript
{
    action: 'click',
    params: { 
        selector: '#submit-btn',  // CSS selector
        // OR
        index: 0,                 // Button index
        // OR
        description: 'the blue Submit button'  // LLM-powered (future)
    }
}
// Response: { clicked: true }
```

#### `type`
Type text into an input.

```javascript
{
    action: 'type',
    params: { 
        selector: '#email',
        text: 'user@example.com',
        clear: true  // Clear existing value first
    }
}
// Response: { typed: true, length: 17 }
```

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
        selector: 'input[type="file"]',
        fileUrl: 'https://example.com/resume.pdf',  // URL to fetch
        fileName: 'resume.pdf'
    }
}
// Response: { uploaded: true, fileName: 'resume.pdf' }
```

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
