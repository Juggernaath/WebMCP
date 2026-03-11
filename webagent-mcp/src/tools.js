/**
 * Webagent MCP Tools
 *
 * Defines all browser automation tools exposed via MCP.
 * These map directly to Webagent extension actions.
 */

// Tool definitions for MCP
export const tools = [
    // Navigation
    {
        name: 'web_navigate',
        description: 'Navigate to a URL in the browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The URL to navigate to',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'web_back',
        description: 'Go back in browser history',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_forward',
        description: 'Go forward in browser history',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_refresh',
        description: 'Refresh the current page',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_wait',
        description: 'Wait for a specified number of milliseconds',
        inputSchema: {
            type: 'object',
            properties: {
                ms: {
                    type: 'number',
                    description: 'Milliseconds to wait',
                    default: 1000,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },

    // Page Reading
    {
        name: 'web_read_page',
        description: 'Read the current page as an accessibility tree. Returns interactive elements (buttons, links, inputs, etc.) with reference numbers, roles, names, and selectors. Use ref numbers with web_click, web_type, and web_hover for reliable element targeting.',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_find_element',
        description: 'Find elements by visible text, aria-label, placeholder, or description. Returns matching elements with reference numbers that can be used with web_click, web_type, etc.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Text to search for (matches element text, aria-label, placeholder, title)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'web_get_page_text',
        description: 'Extract the main content text from the page, with navigation and UI noise removed. Useful for reading articles, docs, or any text-heavy page.',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_screenshot',
        description: 'Capture a screenshot of the current page',
        inputSchema: {
            type: 'object',
            properties: {
                format: {
                    type: 'string',
                    enum: ['png', 'jpeg'],
                    default: 'png',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },

    // Interactions
    {
        name: 'web_click',
        description: 'Click on an element. Use CSS selector, describe the element by its text, or use a ref number from web_read_page.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element to click',
                },
                text: {
                    type: 'string',
                    description: 'Text content of the element to click (alternative to selector)',
                },
                index: {
                    type: 'number',
                    description: 'Index of the button to click (from web_read_page results)',
                },
                ref: {
                    type: 'number',
                    description: 'Element reference number from web_read_page (alternative to selector)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_type',
        description: 'Type text into an input field',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the input field',
                },
                ref: {
                    type: 'number',
                    description: 'Element reference number from web_read_page (alternative to selector)',
                },
                text: {
                    type: 'string',
                    description: 'Text to type',
                },
                clear: {
                    type: 'boolean',
                    description: 'Whether to clear existing content first',
                    default: true,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['text'],
        },
    },
    {
        name: 'web_select',
        description: 'Select an option from a dropdown',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the select element',
                },
                value: {
                    type: 'string',
                    description: 'Value to select',
                },
                text: {
                    type: 'string',
                    description: 'Text of option to select (alternative to value)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'web_scroll',
        description: 'Scroll the page up or down',
        inputSchema: {
            type: 'object',
            properties: {
                direction: {
                    type: 'string',
                    enum: ['up', 'down'],
                    default: 'down',
                },
                pixels: {
                    type: 'number',
                    description: 'Number of pixels to scroll',
                    default: 300,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_hover',
        description: 'Hover over an element',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element to hover over',
                },
                ref: {
                    type: 'number',
                    description: 'Element reference number from web_read_page (alternative to selector)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_press_key',
        description: 'Press a keyboard key',
        inputSchema: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Key to press (e.g., "Enter", "Tab", "Escape")',
                },
                selector: {
                    type: 'string',
                    description: 'CSS selector of element to focus first (optional)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['key'],
        },
    },
    {
        name: 'web_highlight',
        description: 'Temporarily highlight an element on the page with a visible outline. Useful for showing the user which element the AI will interact with next.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element to highlight',
                },
                ref: {
                    type: 'number',
                    description: 'Element reference number from web_read_page (alternative to selector)',
                },
                duration: {
                    type: 'number',
                    description: 'How long to show the highlight in milliseconds',
                    default: 2000,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },

    // Forms
    {
        name: 'web_analyze_form',
        description: 'Analyze a form to understand its fields and structure',
        inputSchema: {
            type: 'object',
            properties: {
                formSelector: {
                    type: 'string',
                    description: 'CSS selector of the form (optional, defaults to first form)',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
    {
        name: 'web_fill_form',
        description: 'Fill form fields with provided data',
        inputSchema: {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    description: 'Key-value pairs of field names/labels to values',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['data'],
        },
    },

    // Files
    {
        name: 'web_upload',
        description: 'Upload a file to a file input',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the file input',
                },
                fileBase64: {
                    type: 'string',
                    description: 'Base64 encoded file content',
                },
                filename: {
                    type: 'string',
                    description: 'Name of the file',
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['selector', 'fileBase64', 'filename'],
        },
    },

    // Tabs
    {
        name: 'web_list_tabs',
        description: 'List all open browser tabs',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'web_new_tab',
        description: 'Open a new browser tab',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL to open in new tab (optional)',
                },
            },
        },
    },
    {
        name: 'web_close_tab',
        description: 'Close a browser tab by its ID. Use web_list_tabs to get available tab IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'ID of the tab to close',
                },
            },
            required: ['tabId'],
        },
    },
    {
        name: 'web_switch_tab',
        description: 'Switch browser focus to a specific tab by its ID. Use web_list_tabs to get available tab IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'ID of the tab to switch to',
                },
            },
            required: ['tabId'],
        },
    },

    // Advanced
    {
        name: 'web_wait_for_element',
        description: 'Wait for an element to appear on the page',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of element to wait for',
                },
                timeout: {
                    type: 'number',
                    description: 'Maximum time to wait in milliseconds',
                    default: 10000,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'web_wait_for_navigation',
        description: 'Wait for a page navigation to complete',
        inputSchema: {
            type: 'object',
            properties: {
                timeout: {
                    type: 'number',
                    description: 'Maximum time to wait in milliseconds',
                    default: 30000,
                },
                tabId: {
                    type: 'number',
                    description: 'Target tab ID (optional, defaults to active tab)',
                },
            },
        },
    },
];

// Map MCP tool names to Webagent actions
const toolToAction = {
    'web_navigate': 'navigate',
    'web_back': 'back',
    'web_forward': 'forward',
    'web_refresh': 'refresh',
    'web_wait': 'wait',
    'web_read_page': 'page.read',
    'web_find_element': 'findElement',
    'web_get_page_text': 'getPageText',
    'web_screenshot': 'screenshot',
    'web_click': 'click',
    'web_type': 'type',
    'web_select': 'select',
    'web_scroll': 'scroll',
    'web_hover': 'hover',
    'web_press_key': 'press_key',
    'web_highlight': 'highlightElement',
    'web_analyze_form': 'form.analyze',
    'web_fill_form': 'form.fill',
    'web_upload': 'upload',
    'web_list_tabs': 'tabs.list',
    'web_new_tab': 'tabs.create',
    'web_close_tab': 'tabs.close',
    'web_switch_tab': 'tabs.switch',
    'web_wait_for_element': 'waitForElement',
    'web_wait_for_navigation': 'waitForNavigation',
};

// Server-side ref→selector cache from most recent page.read/find_element results
// Refs are resolved to CSS selectors here before being sent to the extension,
// so the extension's content script doesn't need to maintain an in-memory Map
const _refCache = {}; // ref (number) → { selector, name, role }

/**
 * Handle a tool call by delegating to the extension bridge
 *
 * @param {string} toolName - The MCP tool name to invoke
 * @param {object} args - Arguments passed from the MCP client
 * @param {object} extensionBridge - The bridge used to execute actions in the extension
 * @returns {Promise<*>} Result from the extension
 */
export async function handleToolCall(toolName, args, extensionBridge) {
    const action = toolToAction[toolName];

    if (!action) {
        throw new Error(`Unknown tool: ${toolName}`);
    }

    // Map MCP arguments to Webagent params
    const params = { ...args };

    // Special handling for some tools
    if (toolName === 'web_scroll') {
        params.direction = args.direction || 'down';
        params.amount = args.pixels || 300;
    }

    if (toolName === 'web_fill_form') {
        params.data = args.data || {};
    }

    if (toolName === 'web_find_element') {
        params.query = args.query;
    }

    // Resolve ref→selector for interaction tools (click, type, hover, highlight)
    // This avoids relying on the content script's in-memory ref Map
    if (args.ref !== undefined) {
        const cached = _refCache[args.ref];
        if (cached && cached.selector) {
            // Send the CSS selector instead of the ref
            params.selector = cached.selector;
            delete params.ref;
        } else {
            // Ref not in cache — pass it through for content script to try
            params.ref = args.ref;
        }
    }

    // Execute via extension bridge
    const result = await extensionBridge.execute(action, params);

    // After page.read or findElement, cache ref→selector mappings
    if (toolName === 'web_read_page' && result && result.elements) {
        // Clear old cache on each new page read
        for (const key of Object.keys(_refCache)) delete _refCache[key];
        for (const el of result.elements) {
            if (el.ref && el.selector) {
                _refCache[el.ref] = { selector: el.selector, name: el.name, role: el.role };
            }
        }
    }

    if (toolName === 'web_find_element' && result && result.matches) {
        for (const match of result.matches) {
            if (match.ref && match.selector) {
                _refCache[match.ref] = { selector: match.selector, name: match.name, role: match.role };
            }
        }
    }

    return result;
}
