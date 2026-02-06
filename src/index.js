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
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.0.0';
const HTTP_PORT = process.env.BRIDGEMCP_PORT || 8620;
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Security configuration
const AUTH_TOKEN = process.env.BRIDGEMCP_TOKEN || crypto.randomBytes(32).toString('hex');
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_PENDING = 100;
const MAX_WAIT_SECONDS = 300;
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60000;

// Save token to file for clients to read
const TOKEN_DIR = path.join(os.homedir(), '.bridgemcp');
const TOKEN_FILE = path.join(TOKEN_DIR, 'token');
try {
    if (!fs.existsSync(TOKEN_DIR)) fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, AUTH_TOKEN, { mode: 0o600 });
} catch (err) {
    console.error('[BridgeMCP] Warning: Could not save token file:', TOKEN_FILE);
}

// Extension connection
let extensionSocket = null;
let pendingRequests = new Map();

// Rate limiting
const rateLimitMap = new Map();

// ============================================
// CORE: Security & Extension Communication
// ============================================

function log(...args) {
    if (VERBOSE) console.error('[BridgeMCP]', ...args);
}

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW_MS });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT;
}

function authenticate(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${AUTH_TOKEN}`) return true;

    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    if (url.searchParams.get('token') === AUTH_TOKEN) return true;

    return false;
}

function sendToExtension(action, params = {}) {
    return new Promise((resolve, reject) => {
        if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
            reject(new Error('Extension not connected. Install the BridgeMCP Chrome extension.'));
            return;
        }

        if (pendingRequests.size >= MAX_PENDING) {
            reject(new Error('Too many pending requests'));
            return;
        }

        const id = crypto.randomBytes(8).toString('hex');
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
        }, 30000);

        pendingRequests.set(id, {
            resolve: (data) => {
                clearTimeout(timeout);
                resolve(data);
            },
            reject: (err) => {
                clearTimeout(timeout);
                reject(err);
            }
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
        description: 'Wait for specified seconds (max 300)',
        inputSchema: {
            type: 'object',
            properties: {
                time: { type: 'number', description: 'Seconds to wait (max 300)' }
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

                // Special case for wait (capped)
                if (name === 'browser_wait') {
                    const time = Math.min(Math.max(args.time || 1, 0), MAX_WAIT_SECONDS);
                    await new Promise(r => setTimeout(r, time * 1000));
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: { content: [{ type: 'text', text: JSON.stringify({ waited: time }) }] }
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
                error: { code: -32601, message: 'Method not found' }
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
        const time = Math.min(Math.max(params.time || 1, 0), MAX_WAIT_SECONDS);
        await new Promise(r => setTimeout(r, time * 1000));
        return { waited: time };
    },

    'POST /group': (params) => sendToExtension('createGroup', params),
    'POST /group/add': (params) => sendToExtension('addToGroup', params),
    'POST /opengroup': (params) => sendToExtension('openUrlsInGroup', params),
    'POST /ungroup': (params) => sendToExtension('ungroupTabs', params),
    'POST /group/collapse': (params) => sendToExtension('collapseGroup', params),
};

// Routes that don't require authentication
const PUBLIC_ROUTES = new Set(['GET /status']);

function startHttpServer(wss) {
    const server = http.createServer(async (req, res) => {
        // Only allow CORS for the Chrome extension origin, not wildcard
        const origin = req.headers['origin'];
        if (origin && origin.startsWith('chrome-extension://')) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const routeKey = `${req.method} ${url.pathname}`;

        // Rate limiting
        const clientIp = req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            res.writeHead(429);
            res.end(JSON.stringify({ error: 'Too many requests' }));
            return;
        }

        // Authentication (skip for public routes and OPTIONS)
        if (!PUBLIC_ROUTES.has(routeKey) && !authenticate(req)) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Unauthorized. Provide token via Authorization header or ?token= query param.' }));
            return;
        }

        // Parse body with size limit
        let body = '';
        if (req.method === 'POST') {
            let bodySize = 0;
            try {
                for await (const chunk of req) {
                    bodySize += chunk.length;
                    if (bodySize > MAX_BODY_SIZE) {
                        res.writeHead(413);
                        res.end(JSON.stringify({ error: 'Request body too large' }));
                        return;
                    }
                    body += chunk;
                }
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Failed to read request body' }));
                return;
            }
        }

        // Parse params
        const queryParams = Object.fromEntries(url.searchParams);
        delete queryParams.token; // Don't pass auth token as a command param
        // Convert numeric query params (tabId, groupId, x, y, time)
        ['tabId', 'groupId', 'x', 'y', 'time'].forEach(key => {
            if (queryParams[key]) queryParams[key] = Number(queryParams[key]);
        });
        let params;
        try {
            params = body ? { ...queryParams, ...JSON.parse(body) } : queryParams;
        } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
            return;
        }

        const handler = HTTP_ROUTES[routeKey];

        if (!handler) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }

        try {
            const result = await handler(params);
            res.writeHead(200);
            res.end(JSON.stringify(result.data || result));
        } catch (err) {
            log('HTTP error:', err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });

    // WebSocket upgrade with origin validation and auth
    server.on('upgrade', (request, socket, head) => {
        const origin = request.headers['origin'] || '';
        const upgradeUrl = new URL(request.url, `http://localhost:${HTTP_PORT}`);
        const token = upgradeUrl.searchParams.get('token');

        // Validate origin: allow chrome-extension:// and no origin (non-browser clients)
        if (origin && !origin.startsWith('chrome-extension://')) {
            log('WebSocket rejected: invalid origin', origin);
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }

        // Validate token
        if (token !== AUTH_TOKEN) {
            log('WebSocket rejected: invalid token');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

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
        // Reject if an extension is already connected
        if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
            log('Rejecting new connection: extension already connected');
            ws.close(4000, 'Another extension is already connected');
            return;
        }

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
            if (extensionSocket === ws) {
                extensionSocket = null;
            }
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
console.error(`[BridgeMCP] Auth token: ${AUTH_TOKEN}`);
console.error(`[BridgeMCP] Token saved to: ${TOKEN_FILE}`);
console.error('[BridgeMCP] Waiting for extension connection...');
