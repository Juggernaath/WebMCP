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
import { WebMCPClient } from '@webmcp/sdk';

const webmcp = new WebMCPClient({
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

## Job Application Example

```javascript
import { WebMCPClient } from '@webmcp/sdk';

const webmcp = new WebMCPClient({ appId: 'my-job-app' });

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

## Finding Extension ID

After loading the extension:
1. Go to `chrome://extensions`
2. Find "WebMCP"
3. Copy the ID (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
