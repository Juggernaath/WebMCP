/**
 * Webagent - Content Script
 * 
 * Executes actions in the page context.
 * Detects CAPTCHAs and reports to background.
 */

console.log('[Webagent] Content script loaded:', window.location.href);

// =============================================================================
// CONFIGURATION
// =============================================================================

const FILL_DELAY = 300;  // Delay between actions (human-like)

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleAction(request)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({
            success: false,
            error: error.message
        }));

    return true; // Keep channel open for async
});

async function handleAction(request) {
    const { action, params = {}, context = {} } = request;

    switch (action) {
        case 'getPageContent':
            return getPageContent();
        case 'click':
            return executeClick(params, context);
        case 'type':
            return executeType(params);
        case 'select':
            return executeSelect(params);
        case 'scroll':
            return executeScroll(params);
        case 'upload':
            return executeUpload(params);
        case 'form.analyze':
            return analyzeForm(params);
        case 'form.fill':
            return fillForm(params, context);

        // RECORDING & SCRAPING
        case 'startRecording':
            return startCapture();
        case 'stopRecording':
            return stopCapture();

        case 'scrapeText':
            return scrapeText();
        case 'scrapeTables':
            return scrapeTables();
        case 'scrapeLinks':
            return scrapeLinks();

        // ADDITIONAL ACTIONS
        case 'hover':
            return executeHover(params);
        case 'press_key':
            return executePressKey(params);
        case 'focus':
            return executeFocus(params);
        case 'blur':
            return executeBlur(params);
        case 'getText':
            return executeGetText(params);
        case 'getAttribute':
            return executeGetAttribute(params);
        case 'waitForElement':
            return executeWaitForElement(params);
        case 'evaluate':
            return executeEvaluate(params);

        // Mouse actions
        case 'drag':
            return executeDrag(params);
        case 'rightClick':
            return executeRightClick(params);

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

// =============================================================================
// PAGE READING
// =============================================================================

function getPageContent() {
    return {
        title: document.title,
        url: window.location.href,
        forms: getFormsSummary(),
        buttons: getButtonsSummary(),
        inputs: getInputsSummary(),
        captcha: detectCaptcha()
    };
}

function getFormsSummary() {
    const forms = document.querySelectorAll('form');
    return Array.from(forms).map((form, index) => ({
        index,
        id: form.id || null,
        action: form.action || null,
        method: form.method || 'get',
        fields: form.querySelectorAll('input, select, textarea').length
    }));
}

function getButtonsSummary() {
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]');
    return Array.from(buttons).slice(0, 20).map((btn, index) => ({
        index,
        text: getText(btn),
        type: btn.type || 'button',
        id: btn.id || null,
        classes: btn.className || null
    }));
}

function getInputsSummary() {
    const inputs = document.querySelectorAll('input, select, textarea');
    return Array.from(inputs).slice(0, 30).map((input, index) => ({
        index,
        type: input.type || input.tagName.toLowerCase(),
        name: input.name || null,
        id: input.id || null,
        label: getInputLabel(input),
        required: input.required || false,
        value: input.type === 'password' ? '[hidden]' : (input.value || null)
    }));
}

// =============================================================================
// INTERACTION ACTIONS
// =============================================================================

async function executeClick(params, context) {
    const { selector, description, index } = params;

    let element;

    if (selector) {
        element = document.querySelector(selector);
    } else if (typeof index === 'number') {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a');
        element = buttons[index];
    } else if (description) {
        // Use LLM to find element (via background script)
        const result = await findElementByDescription(description);
        element = result.element;
    }

    if (!element) {
        throw new Error('Element not found');
    }

    await humanClick(element);
    return { clicked: true };
}

async function executeType(params) {
    const { selector, text, clear = true } = params;

    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    element.focus();
    if (clear) {
        element.value = '';
    }

    // Type character by character for human-like behavior
    for (const char of text) {
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30 + Math.random() * 20);
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { typed: true, length: text.length };
}

async function executeSelect(params) {
    const { selector, value, text } = params;

    const select = document.querySelector(selector);
    if (!select) {
        throw new Error(`Select not found: ${selector}`);
    }

    if (value) {
        select.value = value;
    } else if (text) {
        const option = Array.from(select.options).find(
            opt => opt.text.toLowerCase().includes(text.toLowerCase())
        );
        if (option) {
            select.value = option.value;
        }
    }

    select.dispatchEvent(new Event('change', { bubbles: true }));

    return { selected: true, value: select.value };
}

async function executeScroll(params) {
    const { direction = 'down', amount = 300, selector } = params;

    const target = selector ? document.querySelector(selector) : window;
    const scrollAmount = direction === 'up' ? -amount : amount;

    if (target === window) {
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else {
        target.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }

    await sleep(500);
    return { scrolled: true, direction, amount };
}

// =============================================================================
// NEW: HUMAN-EQUIVALENT ACTIONS
// =============================================================================

async function executeHover(params) {
    const { selector } = params;
    const element = document.querySelector(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Dispatch mouseenter and mouseover events
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    await sleep(300);
    return { hovered: true };
}

async function executePressKey(params) {
    const { key, selector, modifiers = {} } = params;

    const target = selector ? document.querySelector(selector) : document.activeElement || document.body;

    const keyEvent = new KeyboardEvent('keydown', {
        key: key,
        code: key,
        bubbles: true,
        cancelable: true,
        ctrlKey: modifiers.ctrl || false,
        shiftKey: modifiers.shift || false,
        altKey: modifiers.alt || false,
        metaKey: modifiers.meta || false
    });

    target.dispatchEvent(keyEvent);

    // Also dispatch keyup
    target.dispatchEvent(new KeyboardEvent('keyup', {
        key: key,
        code: key,
        bubbles: true
    }));

    // Special handling for Enter in forms
    if (key === 'Enter' && target.form) {
        target.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }

    return { pressed: key };
}

async function executeFocus(params) {
    const { selector } = params;
    const element = document.querySelector(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    element.focus();
    return { focused: true };
}

async function executeBlur(params) {
    const { selector } = params;

    if (selector) {
        const element = document.querySelector(selector);
        if (element) element.blur();
    } else {
        document.activeElement?.blur();
    }

    return { blurred: true };
}

function executeGetText(params) {
    const { selector } = params;
    const element = document.querySelector(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    return {
        text: (element.textContent || element.innerText || '').trim(),
        html: element.innerHTML
    };
}

function executeGetAttribute(params) {
    const { selector, attribute } = params;
    const element = document.querySelector(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    return {
        value: element.getAttribute(attribute),
        attribute
    };
}

async function executeWaitForElement(params) {
    const { selector, timeout = 10000 } = params;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
            return { found: true, elapsed: Date.now() - startTime };
        }
        await sleep(200);
    }

    throw new Error(`Element not found within ${timeout}ms: ${selector}`);
}

function executeEvaluate(params) {
    const { expression } = params;

    try {
        // WARNING: This is powerful - use with caution
        const result = eval(expression);
        return { result: String(result) };
    } catch (error) {
        throw new Error(`Evaluation failed: ${error.message}`);
    }
}

async function executeDrag(params) {
    const { sourceSelector, targetSelector, sourceX, sourceY, targetX, targetY } = params;

    let source, target;

    if (sourceSelector && targetSelector) {
        source = document.querySelector(sourceSelector);
        target = document.querySelector(targetSelector);

        if (!source) throw new Error(`Source not found: ${sourceSelector}`);
        if (!target) throw new Error(`Target not found: ${targetSelector}`);
    }

    const sourceRect = source ? source.getBoundingClientRect() : null;
    const targetRect = target ? target.getBoundingClientRect() : null;

    const startX = sourceRect ? sourceRect.left + sourceRect.width / 2 : sourceX;
    const startY = sourceRect ? sourceRect.top + sourceRect.height / 2 : sourceY;
    const endX = targetRect ? targetRect.left + targetRect.width / 2 : targetX;
    const endY = targetRect ? targetRect.top + targetRect.height / 2 : targetY;

    // Create drag events
    const dataTransfer = new DataTransfer();

    const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: startX,
        clientY: startY
    });

    const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    });

    const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    });

    const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    });

    // Execute drag sequence
    if (source) {
        source.dispatchEvent(dragStartEvent);
        await sleep(100);
    }

    if (target) {
        target.dispatchEvent(dragOverEvent);
        await sleep(50);
        target.dispatchEvent(dropEvent);
    }

    if (source) {
        source.dispatchEvent(dragEndEvent);
    }

    return { dragged: true };
}

async function executeRightClick(params) {
    const { selector, x, y } = params;

    let element;
    let clickX, clickY;

    if (selector) {
        element = document.querySelector(selector);
        if (!element) throw new Error(`Element not found: ${selector}`);

        const rect = element.getBoundingClientRect();
        clickX = rect.left + rect.width / 2;
        clickY = rect.top + rect.height / 2;
    } else {
        clickX = x;
        clickY = y;
        element = document.elementFromPoint(x, y) || document.body;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    const contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: clickX,
        clientY: clickY
    });

    element.dispatchEvent(contextMenuEvent);

    return { rightClicked: true };
}

// =============================================================================
// FILE UPLOAD
// =============================================================================

async function executeUpload(params) {
    const { selector, fileUrl, fileName } = params;

    const input = document.querySelector(selector);
    if (!input || input.type !== 'file') {
        throw new Error(`File input not found: ${selector}`);
    }

    try {
        // Fetch file from URL
        const response = await fetch(fileUrl);
        const blob = await response.blob();

        // Create File object
        const file = new File([blob], fileName, { type: blob.type });

        // Use DataTransfer to set files
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;

        // Dispatch events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));

        console.log(`[Webagent] Uploaded file: ${fileName}`);
        return { uploaded: true, fileName };

    } catch (error) {
        console.error('[Webagent] File upload failed:', error);
        throw error;
    }
}

// =============================================================================
// FORM ACTIONS
// =============================================================================

function analyzeForm(params) {
    const { formSelector, formIndex = 0 } = params;

    let form;
    if (formSelector) {
        form = document.querySelector(formSelector);
    } else {
        const forms = document.querySelectorAll('form');
        form = forms[formIndex];
    }

    if (!form) {
        // Try to analyze visible inputs without a form
        const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
        return {
            hasForm: false,
            fields: analyzeInputs(inputs)
        };
    }

    const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    return {
        hasForm: true,
        formId: form.id || null,
        action: form.action || null,
        fields: analyzeInputs(inputs)
    };
}

function analyzeInputs(inputs) {
    return Array.from(inputs).map((input, index) => ({
        index,
        selector: getUniqueSelector(input),
        type: input.type || input.tagName.toLowerCase(),
        name: input.name || null,
        id: input.id || null,
        label: getInputLabel(input),
        placeholder: input.placeholder || null,
        required: input.required || false,
        options: input.tagName === 'SELECT' ? getSelectOptions(input) : null
    }));
}

async function fillForm(params, context) {
    const { data = {}, formSelector } = params;
    const { userProfile = {} } = context;

    let filledCount = 0;
    const errors = [];

    // Merge data with user profile
    const fillData = { ...userProfile, ...data };

    // Get form fields
    const analysis = analyzeForm({ formSelector });

    for (const field of analysis.fields) {
        try {
            const value = matchFieldToData(field, fillData);

            if (value) {
                if (field.type === 'select' || field.type === 'select-one') {
                    await executeSelect({ selector: field.selector, text: value });
                } else if (field.type === 'checkbox') {
                    const checkbox = document.querySelector(field.selector);
                    if (checkbox && !checkbox.checked && value) {
                        checkbox.click();
                    }
                } else {
                    await executeType({ selector: field.selector, text: String(value) });
                }
                filledCount++;
                await sleep(FILL_DELAY);
            }
        } catch (error) {
            errors.push({ field: field.name || field.id, error: error.message });
        }
    }

    return {
        filled: filledCount,
        total: analysis.fields.length,
        errors: errors.length > 0 ? errors : null
    };
}

// =============================================================================
// CAPTCHA DETECTION
// =============================================================================

function detectCaptcha() {
    const captchaIndicators = [
        { selector: '[class*="captcha"]', type: 'generic' },
        { selector: '[id*="captcha"]', type: 'generic' },
        { selector: 'iframe[src*="recaptcha"]', type: 'recaptcha' },
        { selector: 'iframe[src*="hcaptcha"]', type: 'hcaptcha' },
        { selector: '[class*="g-recaptcha"]', type: 'recaptcha' },
        { selector: '[data-sitekey]', type: 'recaptcha' },
        { selector: 'iframe[src*="arkoselabs"]', type: 'arkose' },
        { selector: '[id*="funcaptcha"]', type: 'arkose' }
    ];

    for (const indicator of captchaIndicators) {
        const element = document.querySelector(indicator.selector);
        if (element) {
            // Notify background script
            chrome.runtime.sendMessage({
                source: 'webagent-content',
                action: 'captchaDetected',
                data: { type: indicator.type, url: window.location.href }
            });

            return { detected: true, type: indicator.type };
        }
    }

    return { detected: false };
}

// =============================================================================
// HELPERS
// =============================================================================

function getText(element) {
    return (element?.textContent || element?.innerText || '').trim();
}

function getInputLabel(input) {
    // Check for explicit label
    if (input.labels && input.labels.length > 0) {
        return getText(input.labels[0]);
    }

    // Check for aria-label
    if (input.getAttribute('aria-label')) {
        return input.getAttribute('aria-label');
    }

    // Check parent for label text
    const parent = input.parentElement;
    if (parent) {
        const label = parent.querySelector('label');
        if (label) return getText(label);
    }

    return input.placeholder || null;
}

function getSelectOptions(select) {
    return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.text
    }));
}

function getUniqueSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    if (element.name) {
        return `[name="${element.name}"]`;
    }
    // Fallback to path-based selector
    const path = [];
    let current = element;
    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.className) {
            selector += '.' + current.className.split(' ').join('.');
        }
        path.unshift(selector);
        current = current.parentElement;
    }
    return path.join(' > ');
}

function matchFieldToData(field, data) {
    const fieldName = (field.name || '').toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    const fieldId = (field.id || '').toLowerCase();

    // Direct matches
    const directKeys = ['email', 'phone', 'firstName', 'lastName', 'name', 'address', 'city', 'state', 'zip', 'country'];

    for (const key of directKeys) {
        const lowerKey = key.toLowerCase();
        if (fieldName.includes(lowerKey) || fieldLabel.includes(lowerKey) || fieldId.includes(lowerKey)) {
            if (data[key]) return data[key];
        }
    }

    // Special handling for full name
    if ((fieldName.includes('name') || fieldLabel.includes('name')) && !fieldName.includes('first') && !fieldName.includes('last')) {
        if (data.firstName && data.lastName) {
            return `${data.firstName} ${data.lastName}`;
        }
    }

    return null;
}

async function humanClick(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    element.click();
    await sleep(FILL_DELAY);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function findElementByDescription(description) {
    // TODO: Use LLM via background script to find element
    throw new Error('LLM element finding not yet implemented');
}
// =============================================================================
// RECORDING CAPTURE
// =============================================================================

let isCapturing = false;

function startCapture() {
    if (isCapturing) return { success: true };
    isCapturing = true;

    document.addEventListener('click', captureClick, true);
    document.addEventListener('change', captureChange, true);
    document.addEventListener('input', captureInput, true);
    document.addEventListener('scroll', captureScroll, { capture: true, passive: true });
    
    console.log('[WebMCP] Started capturing DOM events');
    return { success: true };
}

function stopCapture() {
    if (!isCapturing) return { success: true };
    isCapturing = false;

    document.removeEventListener('click', captureClick, true);
    document.removeEventListener('change', captureChange, true);
    document.removeEventListener('input', captureInput, true);
    document.removeEventListener('scroll', captureScroll, true);
    
    console.log('[WebMCP] Stopped capturing DOM events');
    return { success: true };
}

function captureClick(event) {
    if (!isCapturing || !event.isTrusted) return;
    
    // Don't capture clicks on extension UI if injected
    if (event.target.closest('#webmcp-overlay')) return;

    recordAction({
        type: 'click',
        selector: getUniqueSelector(event.target),
        text: getText(event.target)
    });
}

function captureChange(event) {
    if (!isCapturing || !event.isTrusted) return;
    
    const target = event.target;
    if (target.tagName === 'SELECT') {
        recordAction({
            type: 'select',
            selector: getUniqueSelector(target),
            value: target.value
        });
    } else if (target.type === 'checkbox' || target.type === 'radio') {
        recordAction({
            type: 'click',
            selector: getUniqueSelector(target)
        });
    }
}

// Debounce input capture
let inputTimeout;
function captureInput(event) {
    if (!isCapturing || !event.isTrusted) return;
    const target = event.target;
    
    if (target.type === 'password' || target.type === 'hidden') return;

    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        recordAction({
            type: 'type',
            selector: getUniqueSelector(target),
            text: target.value
        });
    }, 500);
}

// Throttle scroll capture
let lastScroll = 0;
function captureScroll(event) {
    if (!isCapturing || !event.isTrusted) return;
    
    const now = Date.now();
    if (now - lastScroll < 1000) return; // Only capture every 1s
    lastScroll = now;

    const target = event.target === document ? window : event.target;
    // We generally just want window scrolls for playback
    if (target !== window && target !== document.scrollingElement) return;

    recordAction({
        type: 'scroll',
        direction: 'down', // Simplified
        amount: window.scrollY
    });
}

function recordAction(action) {
    chrome.runtime.sendMessage({
        type: 'recordedAction',
        action: {
            ...action,
            url: window.location.href,
            timestamp: Date.now()
        }
    });
}

// =============================================================================
// SCRAPING IMPLEMENTATION
// =============================================================================

function scrapeText() {
    return document.body.innerText;
}

function scrapeLinks() {
    return Array.from(document.links).map(a => ({
        text: a.innerText.trim(),
        href: a.href
    })).filter(l => l.text && l.href);
}

function scrapeTables() {
    return Array.from(document.querySelectorAll('table')).map((table, i) => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tr')).slice(1).map(tr => {
            return Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        });
        
        // Convert to object if headers exist
        if (headers.length > 0) {
            return rows.map(row => {
                const obj = {};
                headers.forEach((h, idx) => obj[h] = row[idx]);
                return obj;
            });
        }
        return rows;
    });
}
