/**
 * BridgeMCP - Browser automation via MCP and HTTP
 *
 * Supports two modes:
 * - MCP Mode: stdio protocol for Claude Desktop, Cursor, VS Code
 * - HTTP Mode: REST API for curl, Python, any HTTP client
 *
 * Both modes communicate with the Chrome extension via WebSocket
 */

const http = require('http');
const WebSocket = require('ws');

const VERSION = '1.0.0';
const HTTP_PORT = process.env.BRIDGEMCP_PORT || 8620;
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Extension connection
let extensionSocket = null;
let pendingRequests = new Map();
let requestId = 0;

// ============================================
// CORE: Extension Communication
// ============================================

function log(...args) {
    if (VERBOSE) console.error('[BridgeMCP]', ...args);
}

function sendToExtension(action, params = {}) {
    return new Promise((resolve, reject) => {
        if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
            reject(new Error('Extension not connected. Install the BridgeMCP Chrome extension.'));
            return;
        }

        const id = ++requestId;
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
        }, 30000);

        pendingRequests.set(id, {
            resolve: (data) => {
                clearTimeout(timeout);
                resolve(data);
            },
            reject
        });

        extensionSocket.send(JSON.stringify({ id, action, params }));
        log(`-> ${action}`, params);
    });
}

// ============================================
// MCP Protocol (stdio)
// ============================================

const MCP_TOOLS = [
    {
        name: 'browser_navigate',
        description: 'Navigate to a URL',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to navigate to' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            },
            required: ['url']
        }
    },
    {
        name: 'browser_back',
        description: 'Go back in browser history',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_forward',
        description: 'Go forward in browser history',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_click',
        description: 'Click an element on the page',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector to click' },
                x: { type: 'number', description: 'X coordinate (alternative to selector)' },
                y: { type: 'number', description: 'Y coordinate (alternative to selector)' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_type',
        description: 'Type text into an element',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to type' },
                selector: { type: 'string', description: 'CSS selector (optional, uses focused element)' },
                submit: { type: 'boolean', description: 'Press Enter after typing' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            },
            required: ['text']
        }
    },
    {
        name: 'browser_hover',
        description: 'Hover over an element',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector to hover' },
                x: { type: 'number', description: 'X coordinate (alternative)' },
                y: { type: 'number', description: 'Y coordinate (alternative)' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_drag',
        description: 'Drag and drop between elements',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Source element selector' },
                to: { type: 'string', description: 'Target element selector' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            },
            required: ['from', 'to']
        }
    },
    {
        name: 'browser_press_key',
        description: 'Press a keyboard key',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Key to press (Enter, Tab, Escape, etc.)' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            },
            required: ['key']
        }
    },
    {
        name: 'browser_select',
        description: 'Select option in a dropdown',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'Select element CSS selector' },
                values: { type: 'array', items: { type: 'string' }, description: 'Values to select' },
                tabId: { type: 'number', description: 'Optional tab ID' }
            },
            required: ['selector', 'values']
        }
    },
    {
        name: 'browser_snapshot',
        description: 'Get accessibility snapshot of the page',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the visible tab',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_console_logs',
        description: 'Get console logs from the page',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Optional tab ID' }
            }
        }
    },
    {
        name: 'browser_tabs',
        description: 'List all open browser tabs',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'browser_new_tab',
        description: 'Open a new browser tab',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to open (optional)' }
            }
        }
    },
    {
        name: 'browser_close_tab',
        description: 'Close a browser tab',
        inputSchema: {
            type: 'object',
            properties: {
                tabId: { type: 'number', description: 'Tab ID to close' }
            },
            required: ['tabId']
        }
    },
    {
        name: 'browser_wait',
        description: 'Wait for specified seconds',
        inputSchema: {
            type: 'object',
            properties: {
                time: { type: 'number', description: 'Seconds to wait' }
            },
            required: ['time']
        }
    }
];

// Map MCP tool names to extension actions
const TOOL_TO_ACTION = {
    browser_navigate: 'navigate',
    browser_back: 'goBack',
    browser_forward: 'goForward',
    browser_click: 'click',
    browser_type: 'type',
    browser_hover: 'hover',
    browser_drag: 'dragDrop',
    browser_press_key: 'pressKey',
    browser_select: 'selectOption',
    browser_snapshot: 'snapshot',
    browser_screenshot: 'screenshot',
    browser_console_logs: 'getConsoleLogs',
    browser_tabs: 'getTabs',
    browser_new_tab: 'newTab',
    browser_close_tab: 'closeTab',
    browser_wait: 'wait'
};

async function handleMcpRequest(request) {
    const { method, params, id } = request;

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'bridgemcp', version: VERSION }
                }
            };

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: { tools: MCP_TOOLS }
            };

        case 'tools/call':
            try {
                const { name, arguments: args } = params;

                // Special case for wait
                if (name === 'browser_wait') {
                    await new Promise(r => setTimeout(r, (args.time || 1) * 1000));
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: { content: [{ type: 'text', text: JSON.stringify({ waited: args.time }) }] }
                    };
                }

                const action = TOOL_TO_ACTION[name];
                if (!action) {
                    throw new Error(`Unknown tool: ${name}`);
                }

                const result = await sendToExtension(action, args || {});
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{
                            type: name === 'browser_screenshot' ? 'image' : 'text',
                            text: JSON.stringify(result.data || result),
                            ...(name === 'browser_screenshot' && result.data?.screenshot ? {
                                data: result.data.screenshot.replace(/^data:image\/png;base64,/, ''),
                                mimeType: 'image/png'
                            } : {})
                        }]
                    }
                };
            } catch (err) {
                return {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32000, message: err.message }
                };
            }

        case 'notifications/initialized':
        case 'notifications/cancelled':
            return null; // No response for notifications

        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` }
            };
    }
}

function startMcpServer() {
    log('Starting MCP server on stdio');

    let buffer = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk) => {
        buffer += chunk;

        // Process complete messages (newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const request = JSON.parse(line);
                log('<- MCP', request.method);

                const response = await handleMcpRequest(request);
                if (response) {
                    const responseStr = JSON.stringify(response);
                    process.stdout.write(responseStr + '\n');
                    log('-> MCP response');
                }
            } catch (err) {
                log('MCP parse error:', err.message);
            }
        }
    });

    process.stdin.on('end', () => {
        log('MCP stdin closed');
        process.exit(0);
    });
}

// ============================================
// HTTP Server
// ============================================

const HTTP_ROUTES = {
    'GET /status': () => ({ connected: extensionSocket?.readyState === WebSocket.OPEN, version: VERSION }),
    'GET /tabs': () => sendToExtension('getTabs'),
    'GET /active': () => sendToExtension('getActiveTab'),
    'GET /groups': () => sendToExtension('listGroups'),
    'GET /console': (params) => sendToExtension('getConsoleLogs', params),

    'POST /navigate': (params) => sendToExtension('navigate', params),
    'POST /back': (params) => sendToExtension('goBack', params),
    'POST /forward': (params) => sendToExtension('goForward', params),
    'POST /newtab': (params) => sendToExtension('newTab', params),
    'POST /close': (params) => sendToExtension('closeTab', params),
    'POST /focus': (params) => sendToExtension('focusTab', params),

    'POST /click': (params) => sendToExtension('click', params),
    'POST /type': (params) => sendToExtension('type', params),
    'POST /hover': (params) => sendToExtension('hover', params),
    'POST /drag': (params) => sendToExtension('dragDrop', params),
    'POST /key': (params) => sendToExtension('pressKey', params),
    'POST /select': (params) => sendToExtension('selectOption', params),
    'POST /input': (params) => sendToExtension('setInputValue', params),

    'POST /read': (params) => sendToExtension('readPage', params),
    'POST /snapshot': (params) => sendToExtension('snapshot', params),
    'POST /screenshot': (params) => sendToExtension('screenshot', params),
    'POST /execute': (params) => sendToExtension('executeScript', params),

    'POST /wait': async (params) => {
        await new Promise(r => setTimeout(r, (params.time || 1) * 1000));
        return { waited: params.time || 1 };
    },

    'POST /group': (params) => sendToExtension('createGroup', params),
    'POST /group/add': (params) => sendToExtension('addToGroup', params),
    'POST /opengroup': (params) => sendToExtension('openUrlsInGroup', params),
    'POST /ungroup': (params) => sendToExtension('ungroupTabs', params),
    'POST /group/collapse': (params) => sendToExtension('collapseGroup', params),
};

function startHttpServer(wss) {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Parse body
        let body = '';
        if (req.method === 'POST') {
            for await (const chunk of req) body += chunk;
        }

        // Parse query params for GET
        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const queryParams = Object.fromEntries(url.searchParams);
        const params = body ? { ...queryParams, ...JSON.parse(body) } : queryParams;

        const routeKey = `${req.method} ${url.pathname}`;
        const handler = HTTP_ROUTES[routeKey];

        if (!handler) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found', availableRoutes: Object.keys(HTTP_ROUTES) }));
            return;
        }

        try {
            const result = await handler(params);
            res.writeHead(200);
            res.end(JSON.stringify(result.data || result));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
    });

    // WebSocket upgrade for extension
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    server.listen(HTTP_PORT, () => {
        console.error(`[BridgeMCP] HTTP server: http://localhost:${HTTP_PORT}`);
        console.error(`[BridgeMCP] WebSocket: ws://localhost:${HTTP_PORT}`);
    });

    return server;
}

// ============================================
// WebSocket Server (Extension Connection)
// ============================================

function startWebSocketServer() {
    const wss = new WebSocket.Server({ noServer: true });

    wss.on('connection', (ws) => {
        log('Extension connected');
        extensionSocket = ws;

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);

                if (msg.type === 'connect') {
                    log(`Agent: ${msg.agent} v${msg.version}`);
                    return;
                }

                if (msg.type === 'response') {
                    const pending = pendingRequests.get(msg.id);
                    if (pending) {
                        pending.resolve(msg);
                        pendingRequests.delete(msg.id);
                    }
                }
            } catch (err) {
                log('Parse error:', err.message);
            }
        });

        ws.on('close', () => {
            log('Extension disconnected');
            extensionSocket = null;
        });
    });

    return wss;
}

// ============================================
// Main
// ============================================

const isMcpMode = !process.stdin.isTTY || process.argv.includes('--mcp');

const wss = startWebSocketServer();
const httpServer = startHttpServer(wss);

if (isMcpMode) {
    startMcpServer();
}

console.error(`[BridgeMCP] v${VERSION} started`);
console.error(`[BridgeMCP] Mode: ${isMcpMode ? 'MCP + HTTP' : 'HTTP only'}`);
console.error('[BridgeMCP] Waiting for extension connection...');
