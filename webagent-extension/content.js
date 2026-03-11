/**
 * Webagent - Content Script
 * 
 * Executes actions in the page context.
 * Detects CAPTCHAs and reports to background.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const FILL_DELAY = 300;  // Delay between actions (human-like)

// =============================================================================
// ELEMENT REFERENCE SYSTEM
// =============================================================================

// Map of integer refs to DOM elements — persists across actions within a page
let elementRefMap = new Map();
let nextRef = 1;

// Backup ref→selector mapping key in sessionStorage
// Survives content script re-injection on the same page
const REF_STORAGE_KEY = '__webmcp_refs__';

/**
 * Reset refs when page changes
 */
function resetRefs() {
    elementRefMap.clear();
    nextRef = 1;
}

/**
 * Persist ref→selector mapping to sessionStorage as fallback
 */
function persistRefs() {
    try {
        const mapping = {};
        for (const [ref, el] of elementRefMap) {
            const selector = getUniqueSelector(el);
            if (selector) mapping[ref] = selector;
        }
        sessionStorage.setItem(REF_STORAGE_KEY, JSON.stringify(mapping));
    } catch (e) {
        // sessionStorage might not be available (e.g., file:// URLs)
    }
}

/**
 * Assign a ref to an element and store it
 */
function assignRef(element) {
    // Check if element already has a ref
    for (const [ref, el] of elementRefMap) {
        if (el === element) return ref;
    }
    const ref = nextRef++;
    elementRefMap.set(ref, element);
    return ref;
}

/**
 * Get element by its ref number.
 * First tries in-memory Map (fast), then falls back to sessionStorage selectors.
 */
function getElementByRef(ref) {
    // Coerce to number — refs may arrive as strings from JSON message passing
    const numRef = Number(ref);

    // Primary: in-memory Map
    const element = elementRefMap.get(numRef);
    if (element && document.contains(element)) {
        return element;
    }
    elementRefMap.delete(numRef);

    // Fallback: sessionStorage selector mapping
    try {
        const stored = sessionStorage.getItem(REF_STORAGE_KEY);
        if (stored) {
            const mapping = JSON.parse(stored);
            const selector = mapping[numRef];
            if (selector) {
                const fallbackEl = document.querySelector(selector);
                if (fallbackEl && document.contains(fallbackEl)) {
                    // Re-populate the Map for future fast lookups
                    elementRefMap.set(numRef, fallbackEl);
                    return fallbackEl;
                }
            }
        }
    } catch (e) {
        // sessionStorage not available or corrupted
    }

    return null;
}

// =============================================================================
// PORT-BASED CONNECTION (primary communication channel)
// Avoids "page moved into back/forward cache" errors from chrome.tabs.sendMessage
// =============================================================================

/**
 * Establish a persistent port connection to the background service worker.
 * The background uses this port to send action messages; responses are correlated
 * via the _msgId field injected by sendViaPort() in background.js.
 *
 * If the port disconnects (e.g. the service worker restarts), we attempt to
 * reconnect after a short delay so the background can re-register us in its
 * contentPorts Map.
 */
(function initPort() {
    let port = null;

    function connect() {
        try {
            port = chrome.runtime.connect({ name: 'webmcp-content' });

            port.onMessage.addListener(async (message) => {
                const { _msgId } = message;

                // Every message coming through the port must carry a _msgId so the
                // background can match the response to the originating sendViaPort call.
                if (!_msgId) return;

                try {
                    const result = await handleAction(message);
                    port.postMessage({ _msgId, result });
                } catch (error) {
                    port.postMessage({ _msgId, error: error.message });
                }
            });

            port.onDisconnect.addListener(() => {
                port = null;
                // chrome.runtime.lastError must be read to suppress the unchecked error warning
                void chrome.runtime.lastError;
                // Reconnect after a short delay in case the service worker restarted
                setTimeout(connect, 500);
            });
        } catch (e) {
            // Extension context may be invalidated (e.g. extension reload); give up silently
            console.warn('[WebMCP] Port connect failed:', e.message);
        }
    }

    connect();
})();

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

// Fallback: keep the legacy onMessage listener so callers that still use
// chrome.tabs.sendMessage (e.g. the reload-retry path in background.js) continue
// to work without modification.
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

        // Element finding
        case 'findElement':
            return findElementByDescription(params.query || params.description);
        case 'getPageText':
            return extractMainContent();
        case 'highlightElement':
            return highlightElement(params);

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
// PAGE READING — ACCESSIBILITY TREE
// =============================================================================

function getPageContent() {
    // Reset refs on each page read so they stay fresh
    resetRefs();

    const elements = getAccessibilityTree();
    const forms = getFormsSummary();

    // Persist ref→selector mapping to sessionStorage as fallback
    persistRefs();

    return {
        title: document.title,
        url: window.location.href,
        elements,
        forms,
        captcha: detectCaptcha()
    };
}

/**
 * Build an accessibility-tree-like structure of interactive elements.
 * Returns elements with stable integer refs that can be used for click/type/hover.
 */
function getAccessibilityTree() {
    const results = [];
    const seen = new Set();

    // Collect all interactive elements
    const selectors = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="combobox"]',
        '[role="searchbox"]',
        '[role="textbox"]',
        '[contenteditable="true"]',
        'summary',
        'details',
        '[tabindex]',
        'input[type="submit"]',
        'input[type="button"]',
    ];

    const allElements = document.querySelectorAll(selectors.join(','));

    for (const el of allElements) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Skip invisible elements
        if (!isElementVisible(el)) continue;

        const ref = assignRef(el);
        const entry = buildElementEntry(el, ref);
        if (entry) results.push(entry);

        // Cap at 200 elements for performance
        if (results.length >= 200) break;
    }

    return results;
}

/**
 * Check if an element is visible in the viewport or scrollable area
 */
function isElementVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    // Check if element has dimensions
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
}

/**
 * Build a structured entry for one element
 */
function buildElementEntry(el, ref) {
    const tag = el.tagName.toLowerCase();
    const role = getEffectiveRole(el);
    const name = getAccessibleName(el);
    const selector = getUniqueSelector(el);

    const entry = { ref, role, name, selector };

    // Add state for inputs
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        entry.type = el.type || tag;
        if (el.type === 'password') {
            entry.value = el.value ? '[filled]' : '';
        } else if (tag === 'select') {
            entry.value = el.options[el.selectedIndex]?.text || '';
        } else {
            entry.value = el.value || '';
        }
        if (el.placeholder) entry.placeholder = el.placeholder;
        if (el.required) entry.required = true;
        if (el.disabled) entry.disabled = true;
    }

    // Add checked state for checkboxes/radios
    if (el.type === 'checkbox' || el.type === 'radio') {
        entry.checked = el.checked;
    }

    // Add href for links
    if (tag === 'a' && el.href) {
        try {
            const url = new URL(el.href);
            entry.href = url.pathname + url.search;
        } catch {
            entry.href = el.getAttribute('href');
        }
    }

    // Skip elements with no useful name or role
    if (!name && role === 'generic') return null;

    return entry;
}

/**
 * Get the effective ARIA role for an element
 */
function getEffectiveRole(el) {
    // Explicit role takes priority
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole;

    // Implicit roles by tag
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();

    switch (tag) {
        case 'a':       return el.href ? 'link' : 'generic';
        case 'button':  return 'button';
        case 'input':
            switch (type) {
                case 'button':
                case 'submit':
                case 'reset':  return 'button';
                case 'checkbox': return 'checkbox';
                case 'radio':   return 'radio';
                case 'search':  return 'searchbox';
                case 'email':
                case 'tel':
                case 'text':
                case 'url':
                case 'number':
                case 'password': return 'textbox';
                case 'range':   return 'slider';
                default:        return 'textbox';
            }
        case 'select':   return el.multiple ? 'listbox' : 'combobox';
        case 'textarea': return 'textbox';
        case 'summary':  return 'button';
        default:         return 'generic';
    }
}

/**
 * Get the accessible name for an element using the WAI-ARIA name computation
 * (simplified version)
 */
function getAccessibleName(el) {
    // 1. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const names = labelledBy.split(/\s+/).map(id => {
            const ref = document.getElementById(id);
            return ref ? getText(ref) : '';
        }).filter(Boolean);
        if (names.length) return names.join(' ');
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 3. Associated <label>
    if (el.labels && el.labels.length > 0) {
        return getText(el.labels[0]);
    }

    // 4. title attribute
    if (el.title) return el.title.trim();

    // 5. placeholder for inputs
    if (el.placeholder) return el.placeholder.trim();

    // 6. alt for images inside buttons/links
    if (el.tagName.toLowerCase() === 'img') return (el.alt || '').trim();
    const img = el.querySelector('img[alt]');
    if (img && img.alt) return img.alt.trim();

    // 7. Text content (trimmed, limited)
    const text = getText(el);
    if (text) return text.slice(0, 80);

    // 8. value for submit buttons
    if (el.type === 'submit' || el.type === 'button') {
        return (el.value || '').trim();
    }

    return '';
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

// =============================================================================
// INTERACTION ACTIONS
// =============================================================================

async function executeClick(params, context) {
    const { selector, description, text: textParam, index, ref } = params;
    // MCP tool sends "text" but legacy code uses "description" — support both
    const descriptionText = description || textParam;

    let element;

    if (ref !== undefined) {
        element = getElementByRef(ref);
        if (!element) {
            throw new Error(`Element ref ${ref} not found or stale`);
        }
    } else if (selector) {
        element = document.querySelector(selector);
    } else if (typeof index === 'number') {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a');
        element = buttons[index];
    } else if (descriptionText) {
        const result = findElementByDescription(descriptionText);
        if (result.matches && result.matches.length > 0) {
            element = getElementByRef(result.matches[0].ref);
        }
    }

    if (!element) {
        throw new Error('Element not found');
    }

    await humanClick(element);
    return { clicked: true };
}

async function executeType(params) {
    const { selector, text, clear = true, ref } = params;

    let element;
    if (ref !== undefined) {
        element = getElementByRef(ref);
        if (!element) throw new Error(`Element ref ${ref} not found or stale`);
    } else {
        element = document.querySelector(selector);
    }

    if (!element) {
        throw new Error(`Element not found: ${selector || `ref ${ref}`}`);
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
    const { selector, ref } = params;

    let element;
    if (ref !== undefined) {
        element = getElementByRef(ref);
        if (!element) throw new Error(`Element ref ${ref} not found or stale`);
    } else {
        element = document.querySelector(selector);
    }

    if (!element) {
        throw new Error(`Element not found: ${selector || `ref ${ref}`}`);
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

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
    const { selector, fileBase64, filename, ref } = params;

    let input;
    if (ref !== undefined) {
        input = getElementByRef(ref);
        if (!input) throw new Error(`Element ref ${ref} not found or stale`);
    } else {
        input = document.querySelector(selector);
    }

    if (!input || input.type !== 'file') {
        throw new Error(`File input not found: ${selector || `ref ${ref}`}`);
    }

    // Decode Base64 string into a Uint8Array
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a File object from the decoded bytes
    const file = new File([bytes], filename);

    // Assign the file to the input via DataTransfer
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    input.dispatchEvent(new Event('change', { bubbles: true }));

    return { uploaded: true, filename };
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
// CONTENT EXTRACTION
// =============================================================================

/**
 * Extract cleaned main content text from the page.
 * Uses heuristics to find the primary content area.
 */
function extractMainContent() {
    // Try common content containers
    const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '#content',
        '#main-content',
        '.content',
        '.main-content',
        '.post-content',
        '.article-content',
        '.entry-content',
    ];

    let contentEl = null;
    for (const sel of contentSelectors) {
        contentEl = document.querySelector(sel);
        if (contentEl) break;
    }

    // Fallback to body
    if (!contentEl) contentEl = document.body;

    // Clone and remove noise
    const clone = contentEl.cloneNode(true);
    const noiseSelectors = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .sidebar, .nav, .menu, .ad, .advertisement, script, style, noscript, svg, iframe';
    clone.querySelectorAll(noiseSelectors).forEach(el => el.remove());

    // Get text and clean whitespace
    const text = (clone.innerText || clone.textContent || '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { text, length: text.length };
}

/**
 * Temporarily highlight an element on the page.
 * Useful for human oversight — shows what the AI is about to interact with.
 */
function highlightElement(params) {
    const { selector, ref, duration = 2000 } = params;

    let element;
    if (ref !== undefined) {
        element = getElementByRef(ref);
    } else if (selector) {
        element = document.querySelector(selector);
    }

    if (!element) {
        throw new Error(`Element not found for highlight`);
    }

    // Store original styles
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalTransition = element.style.transition;

    // Apply highlight
    element.style.transition = 'outline 0.15s ease';
    element.style.outline = '3px solid #7c3aed';
    element.style.outlineOffset = '2px';

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove highlight after duration
    setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.outlineOffset = originalOutlineOffset;
        element.style.transition = originalTransition;
    }, duration);

    return { highlighted: true, duration };
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

/**
 * Find elements matching a text description.
 * Searches visible text, aria-label, placeholder, title, alt.
 * Returns array of matches with refs.
 */
function findElementByDescription(description) {
    const query = description.toLowerCase().trim();
    const matches = [];

    // Search through all interactive elements
    const selectors = 'a, button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [contenteditable="true"], [tabindex]';
    const elements = document.querySelectorAll(selectors);

    for (const el of elements) {
        if (!isElementVisible(el)) continue;

        const score = getMatchScore(el, query);
        if (score > 0) {
            const ref = assignRef(el);
            matches.push({
                ref,
                role: getEffectiveRole(el),
                name: getAccessibleName(el),
                selector: getUniqueSelector(el),
                score
            });
        }

        if (matches.length >= 10) break;
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    // Persist updated refs
    persistRefs();

    return { matches };
}

/**
 * Score how well an element matches a text query
 */
function getMatchScore(el, query) {
    let score = 0;

    // Exact text match (highest)
    const text = getText(el).toLowerCase();
    if (text === query) return 100;
    if (text.includes(query)) score = Math.max(score, 80);

    // aria-label match
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel === query) return 95;
    if (ariaLabel.includes(query)) score = Math.max(score, 75);

    // placeholder match
    const placeholder = (el.placeholder || '').toLowerCase();
    if (placeholder.includes(query)) score = Math.max(score, 70);

    // title match
    const title = (el.title || '').toLowerCase();
    if (title.includes(query)) score = Math.max(score, 65);

    // alt text match (for images in buttons/links)
    const img = el.querySelector('img[alt]');
    const alt = img ? img.alt.toLowerCase() : (el.alt || '').toLowerCase();
    if (alt.includes(query)) score = Math.max(score, 60);

    // name/id match (for inputs)
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    if (name.includes(query)) score = Math.max(score, 50);
    if (id.includes(query)) score = Math.max(score, 45);

    return score;
}

