#!/usr/bin/env node

/**
 * BridgeMCP CLI
 *
 * Server mode:
 *   npx bridgemcp              # Start server
 *   npx bridgemcp --mcp        # Force MCP mode
 *   npx bridgemcp -v           # Verbose logging
 *
 * Client mode (requires running server):
 *   npx bridgemcp tabs                    # List tabs
 *   npx bridgemcp active                  # Get active tab
 *   npx bridgemcp navigate <url>          # Navigate to URL
 *   npx bridgemcp click <selector>        # Click element
 *   npx bridgemcp type <selector> <text>  # Type text
 *   npx bridgemcp snapshot                # Get accessibility snapshot
 *   npx bridgemcp screenshot [file]       # Take screenshot
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TOKEN_FILE = path.join(os.homedir(), '.bridgemcp', 'token');
const DEFAULT_PORT = process.env.BRIDGEMCP_PORT || 8620;
const DEFAULT_HOST = process.env.BRIDGEMCP_HOST || 'localhost';

// CLI commands that trigger client mode
const CLIENT_COMMANDS = [
    'tabs', 'active', 'groups', 'console',
    'navigate', 'back', 'forward', 'newtab', 'close', 'focus',
    'click', 'type', 'hover', 'drag', 'key', 'select', 'input',
    'read', 'snapshot', 'screenshot', 'execute', 'wait'
];

const args = process.argv.slice(2);
const command = args[0];

// Check if this is a client command
if (command && CLIENT_COMMANDS.includes(command)) {
    runClientCommand(command, args.slice(1));
} else {
    // Server mode - run the server
    require('./index.js');
}

async function runClientCommand(cmd, cmdArgs) {
    // Load token
    let token;
    try {
        token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    } catch (err) {
        console.error('Error: No token found. Start the server first: npx bridgemcp');
        console.error(`Token file: ${TOKEN_FILE}`);
        process.exit(1);
    }

    // Build request
    const method = getMethod(cmd);
    const urlPath = `/${cmd}`;
    const params = buildParams(cmd, cmdArgs);

    try {
        const result = await httpRequest(method, urlPath, params, token);

        // Handle screenshot specially - save to file
        if (cmd === 'screenshot' && result.screenshot) {
            const filename = cmdArgs[0] || 'screenshot.png';
            const base64 = result.screenshot.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(filename, Buffer.from(base64, 'base64'));
            console.log(`Screenshot saved: ${filename}`);
        } else {
            // Pretty print JSON
            console.log(JSON.stringify(result, null, 2));
        }
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

function getMethod(cmd) {
    const getMethods = ['tabs', 'active', 'groups', 'console'];
    return getMethods.includes(cmd) ? 'GET' : 'POST';
}

function buildParams(cmd, args) {
    const params = {};

    switch (cmd) {
        case 'navigate':
        case 'newtab':
            params.url = args[0];
            break;
        case 'click':
        case 'hover':
        case 'read':
            params.selector = args[0];
            break;
        case 'type':
            params.selector = args[0];
            params.text = args[1];
            break;
        case 'input':
            params.selector = args[0];
            params.value = args[1];
            break;
        case 'key':
            params.key = args[0];
            break;
        case 'select':
            params.selector = args[0];
            params.value = args[1];
            break;
        case 'focus':
        case 'close':
            if (args[0]) params.tabId = parseInt(args[0]);
            break;
        case 'wait':
            params.time = parseInt(args[0]) || 1;
            break;
        case 'execute':
            params.script = args[0];
            break;
        case 'drag':
            params.from = args[0];
            params.to = args[1];
            break;
        case 'console':
            if (args[0]) params.tabId = parseInt(args[0]);
            break;
    }

    return params;
}

function httpRequest(method, urlPath, params, token) {
    return new Promise((resolve, reject) => {
        let body = '';
        let reqPath = urlPath;

        if (method === 'GET') {
            const query = new URLSearchParams(params).toString();
            if (query) reqPath += '?' + query;
        } else {
            body = JSON.stringify(params);
        }

        const options = {
            hostname: DEFAULT_HOST,
            port: DEFAULT_PORT,
            path: reqPath,
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(json.error));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Invalid response: ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                reject(new Error('Server not running. Start it with: npx bridgemcp'));
            } else {
                reject(err);
            }
        });

        if (body) req.write(body);
        req.end();
    });
}
