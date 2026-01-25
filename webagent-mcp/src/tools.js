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
            },
            required: ['url'],
        },
    },
    {
        name: 'web_back',
        description: 'Go back in browser history',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'web_forward',
        description: 'Go forward in browser history',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'web_refresh',
        description: 'Refresh the current page',
        inputSchema: {
            type: 'object',
            properties: {},
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
            },
        },
    },

    // Page Reading
    {
        name: 'web_read_page',
        description: 'Read the current page content including URL, title, forms, buttons, and inputs. Use this to understand what is on the page before taking actions.',
        inputSchema: {
            type: 'object',
            properties: {},
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
            },
        },
    },

    // Interactions
    {
        name: 'web_click',
        description: 'Click on an element. Use CSS selector or describe the element by its text.',
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
                text: {
                    type: 'string',
                    description: 'Text to type',
                },
                clear: {
                    type: 'boolean',
                    description: 'Whether to clear existing content first',
                    default: true,
                },
            },
            required: ['selector', 'text'],
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
            },
            required: ['selector'],
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
            },
            required: ['key'],
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
        description: 'Close a browser tab',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: {
                    type: 'number',
                    description: 'ID of tab to close (optional, defaults to current tab)',
                },
            },
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
    'web_screenshot': 'screenshot',
    'web_click': 'click',
    'web_type': 'type',
    'web_select': 'select',
    'web_scroll': 'scroll',
    'web_hover': 'hover',
    'web_press_key': 'press_key',
    'web_analyze_form': 'form.analyze',
    'web_fill_form': 'form.fill',
    'web_upload': 'upload',
    'web_list_tabs': 'tabs.list',
    'web_new_tab': 'tabs.create',
    'web_close_tab': 'tabs.close',
    'web_wait_for_element': 'waitForElement',
    'web_wait_for_navigation': 'waitForNavigation',
};

/**
 * Handle a tool call by delegating to the extension bridge
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
        // Pass data directly
        params.data = args.data || {};
    }

    // Execute via extension bridge
    return await extensionBridge.execute(action, params);
}
