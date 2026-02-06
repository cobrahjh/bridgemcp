/**
 * BridgeMCP - Background Service Worker
 * Connects to local BridgeMCP server and executes browser commands
 */

const BRIDGE_PORT = 8620;
const BRIDGE_HOST = 'localhost';
let ws = null;
let reconnectTimer = null;
let keepaliveTimer = null;
let isConnected = false;

// Per-tab console storage keys
const consoleKeys = new Map();

// URL scheme blocklist
const BLOCKED_SCHEMES = ['javascript', 'file', 'data', 'vbscript'];

function validateUrl(url) {
    if (!url) return;
    const scheme = url.split(':')[0].toLowerCase();
    if (BLOCKED_SCHEMES.includes(scheme)) {
        throw new Error(`Blocked URL scheme: ${scheme}. Only http/https URLs are allowed.`);
    }
}

// Read auth token from storage
async function getToken() {
    return new Promise(resolve => {
        chrome.storage.local.get('bridgemcpToken', (data) => {
            resolve(data.bridgemcpToken || '');
        });
    });
}

// Keepalive with Chrome alarms (survives service worker termination)
chrome.alarms.create('keepalive', { periodInMinutes: 0.25 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') {
        chrome.storage.local.set({ lastKeepalive: Date.now() });
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connect();
        }
    }
});

function startKeepalive() {
    stopKeepalive();
    keepaliveTimer = setInterval(() => {
        chrome.storage.local.set({ lastPing: Date.now() });
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        } else {
            connect();
        }
    }, 10000);
}

function stopKeepalive() {
    if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
    }
}

chrome.storage.onChanged.addListener(() => {});

async function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const token = await getToken();
    if (!token) {
        console.log('[BridgeMCP] No auth token configured. Set token in extension popup.');
        scheduleReconnect();
        return;
    }

    try {
        ws = new WebSocket(`ws://${BRIDGE_HOST}:${BRIDGE_PORT}?token=${encodeURIComponent(token)}`);

        ws.onopen = () => {
            console.log('[BridgeMCP] Connected');
            isConnected = true;
            clearTimeout(reconnectTimer);
            startKeepalive();

            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'connect',
                        agent: 'bridgemcp-extension',
                        version: '1.0.0'
                    }));
                }
            }, 50);
        };

        ws.onmessage = async (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
                const result = await handleCommand(msg);

                ws.send(JSON.stringify({
                    type: 'response',
                    id: msg.id,
                    success: true,
                    data: result
                }));
            } catch (err) {
                console.error('[BridgeMCP] Error:', err);
                ws.send(JSON.stringify({
                    type: 'response',
                    id: msg?.id,
                    success: false,
                    error: err.message
                }));
            }
        };

        ws.onclose = () => {
            console.log('[BridgeMCP] Disconnected');
            isConnected = false;
            stopKeepalive();
            scheduleReconnect();
        };

        ws.onerror = () => {
            isConnected = false;
        };

    } catch (err) {
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
}

// Command handlers
async function handleCommand(msg) {
    const { action, params } = msg;

    switch (action) {
        case 'ping':
            return { pong: true, timestamp: Date.now() };

        case 'getTabs':
            return await chrome.tabs.query({});

        case 'getActiveTab':
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab;

        case 'navigate':
            validateUrl(params.url);
            return await navigateTab(params.tabId, params.url);

        case 'goBack':
            return await goBack(params.tabId);

        case 'goForward':
            return await goForward(params.tabId);

        case 'newTab':
            if (params.url) validateUrl(params.url);
            return await chrome.tabs.create({ url: params.url || 'about:blank' });

        case 'closeTab':
            await chrome.tabs.remove(params.tabId);
            return { closed: true };

        case 'focusTab':
            await chrome.tabs.update(params.tabId, { active: true });
            const focusedTab = await chrome.tabs.get(params.tabId);
            await chrome.windows.update(focusedTab.windowId, { focused: true });
            return { focused: true, tabId: params.tabId };

        case 'click':
            return await clickInTab(params.tabId, params.selector, params.x, params.y);

        case 'type':
            return await typeInTab(params.tabId, params.selector, params.text, params.submit);

        case 'hover':
            return await hoverInTab(params.tabId, params.selector, params.x, params.y);

        case 'dragDrop':
            return await dragDropInTab(params.tabId, params.from, params.to);

        case 'pressKey':
            return await pressKeyInTab(params.tabId, params.key);

        case 'selectOption':
            return await selectOptionInTab(params.tabId, params.selector, params.values);

        case 'setInputValue':
            return await setInputValue(params.tabId, params.selector, params.value);

        case 'readPage':
            return await readPageContent(params.tabId, params.selector);

        case 'snapshot':
            return await getAccessibilitySnapshot(params.tabId);

        case 'executeScript':
            return await executeInTab(params.tabId, params.code);

        case 'screenshot':
            return await captureTab(params.tabId);

        case 'getConsoleLogs':
            return await getConsoleLogs(params.tabId);

        case 'createGroup':
            return await createTabGroup(params.tabIds, params.title, params.color);

        case 'addToGroup':
            return await addTabsToGroup(params.groupId, params.tabIds);

        case 'openUrlsInGroup':
            if (params.urls) params.urls.forEach(validateUrl);
            return await openUrlsInGroup(params.urls, params.title, params.color);

        case 'listGroups':
            return await listTabGroups();

        case 'ungroupTabs':
            return await ungroupTabs(params.tabIds);

        case 'collapseGroup':
            return await collapseGroup(params.groupId, params.collapsed);

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

// Navigation
async function navigateTab(tabId, url) {
    if (tabId) {
        await chrome.tabs.update(tabId, { url });
        return { navigated: true, tabId, url };
    } else {
        const tab = await chrome.tabs.create({ url });
        return { navigated: true, tabId: tab.id, url };
    }
}

async function goBack(tabId) {
    const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!targetTabId) throw new Error('No tab');
    await chrome.tabs.goBack(targetTabId);
    return { back: true, tabId: targetTabId };
}

async function goForward(tabId) {
    const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!targetTabId) throw new Error('No tab');
    await chrome.tabs.goForward(targetTabId);
    return { forward: true, tabId: targetTabId };
}

// Interaction
async function executeInTab(tabId, code) {
    const wrappedCode = code.trim().startsWith('return ') ? code : `return (${code})`;
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: new Function(wrappedCode),
        world: 'MAIN'
    });
    return results[0]?.result;
}

async function clickInTab(tabId, selector, x, y) {
    if (selector) {
        return await chrome.scripting.executeScript({
            target: { tabId },
            func: (sel) => {
                const el = document.querySelector(sel);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.click();
                    return { clicked: true, selector: sel };
                }
                return { clicked: false, error: 'Element not found' };
            },
            args: [selector]
        }).then(r => r[0]?.result);
    } else if (x !== undefined && y !== undefined) {
        return await chrome.scripting.executeScript({
            target: { tabId },
            func: (px, py) => {
                const el = document.elementFromPoint(px, py);
                if (el) {
                    el.click();
                    return { clicked: true, x: px, y: py, element: el.tagName };
                }
                return { clicked: false, error: 'No element at coordinates' };
            },
            args: [x, y]
        }).then(r => r[0]?.result);
    }
    throw new Error('Provide selector or x,y coordinates');
}

async function typeInTab(tabId, selector, text, submit = false) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, txt, shouldSubmit) => {
            const el = sel ? document.querySelector(sel) : document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                el.focus();

                if (el.isContentEditable) {
                    document.execCommand('insertText', false, txt);
                } else {
                    el.value = txt;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }

                if (shouldSubmit) {
                    el.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                    }));
                    const form = el.closest('form');
                    if (form) form.submit();
                }

                return { typed: true, selector: sel, submitted: shouldSubmit };
            }
            return { typed: false, error: 'No editable element found' };
        },
        args: [selector, text, submit]
    }).then(r => r[0]?.result);
}

async function hoverInTab(tabId, selector, x, y) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, px, py) => {
            let el = sel ? document.querySelector(sel) : (px != null ? document.elementFromPoint(px, py) : null);
            if (el) {
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: centerX, clientY: centerY }));
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: centerX, clientY: centerY }));
                el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: centerX, clientY: centerY }));
                return { hovered: true, selector: sel, element: el.tagName };
            }
            return { hovered: false, error: 'Element not found' };
        },
        args: [selector || null, x ?? null, y ?? null]
    }).then(r => r[0]?.result);
}

async function dragDropInTab(tabId, from, to) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (fromSel, toSel) => {
            const fromEl = document.querySelector(fromSel);
            const toEl = document.querySelector(toSel);
            if (!fromEl) return { dragged: false, error: 'Source not found' };
            if (!toEl) return { dragged: false, error: 'Target not found' };

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const dataTransfer = new DataTransfer();

            fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer, clientX: fromRect.left, clientY: fromRect.top }));
            toEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer, clientX: toRect.left, clientY: toRect.top }));
            toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer, clientX: toRect.left, clientY: toRect.top }));
            fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));

            return { dragged: true, from: fromSel, to: toSel };
        },
        args: [from, to]
    }).then(r => r[0]?.result);
}

async function pressKeyInTab(tabId, key) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (keyName) => {
            const el = document.activeElement || document.body;
            const keyMap = {
                'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
                'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
                'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
                'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
                'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
                'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
                'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
                'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
                'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
                'Space': { key: ' ', code: 'Space', keyCode: 32 },
            };
            const keyInfo = keyMap[keyName] || { key: keyName, code: `Key${keyName.toUpperCase()}`, keyCode: keyName.charCodeAt(0) };
            const eventInit = { key: keyInfo.key, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.keyCode, bubbles: true };

            el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            el.dispatchEvent(new KeyboardEvent('keyup', eventInit));

            return { pressed: true, key: keyName };
        },
        args: [key]
    }).then(r => r[0]?.result);
}

async function selectOptionInTab(tabId, selector, values) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, vals) => {
            const select = document.querySelector(sel);
            if (!select || select.tagName !== 'SELECT') return { selected: false, error: 'Select not found' };

            const selectedValues = [];
            Array.from(select.options).forEach(opt => {
                if (vals.includes(opt.value) || vals.includes(opt.text)) {
                    opt.selected = true;
                    selectedValues.push(opt.value);
                }
            });
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { selected: true, values: selectedValues };
        },
        args: [selector, values]
    }).then(r => r[0]?.result);
}

async function setInputValue(tabId, selector, value) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, val) => {
            const el = document.querySelector(sel);
            if (el) {
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { set: true };
            }
            return { set: false, error: 'Element not found' };
        },
        args: [selector, value]
    }).then(r => r[0]?.result);
}

// Data & Inspection
async function readPageContent(tabId, selector) {
    return await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => {
            if (sel) {
                const el = document.querySelector(sel);
                return el ? { text: el.textContent, html: el.innerHTML } : null;
            }
            return { title: document.title, url: location.href, text: document.body.textContent.substring(0, 10000) };
        },
        args: [selector]
    }).then(r => r[0]?.result);
}

async function getAccessibilitySnapshot(tabId) {
    const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    return await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
            function getRole(el) {
                const explicit = el.getAttribute('role');
                if (explicit) return explicit;
                const tagRoles = { 'A': 'link', 'BUTTON': 'button', 'INPUT': 'textbox', 'SELECT': 'combobox', 'TEXTAREA': 'textbox', 'IMG': 'img', 'H1': 'heading', 'H2': 'heading', 'H3': 'heading', 'NAV': 'navigation', 'MAIN': 'main', 'FORM': 'form' };
                return tagRoles[el.tagName] || 'generic';
            }
            function getName(el) {
                return el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || el.textContent?.trim().substring(0, 80) || '';
            }
            function build(el, depth = 0, ref = { n: 0 }) {
                if (depth > 8 || !el || el.nodeType !== 1) return null;
                const style = getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return null;
                const node = { ref: `e${ref.n++}`, role: getRole(el), name: getName(el) || undefined };
                if (el.disabled) node.disabled = true;
                if (el.checked) node.checked = true;
                const children = Array.from(el.children).map(c => build(c, depth + 1, ref)).filter(Boolean);
                if (children.length) node.children = children;
                return node;
            }
            return { url: location.href, title: document.title, snapshot: build(document.body) };
        }
    }).then(r => r[0]?.result);
}

async function captureTab(tabId) {
    if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        await new Promise(r => setTimeout(r, 100));
    }
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return { screenshot: dataUrl };
}

async function getConsoleLogs(tabId) {
    const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

    // Generate or retrieve a unique per-tab storage key
    let storageKey = consoleKeys.get(targetTabId);

    if (!storageKey) {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        storageKey = '_bmc_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        consoleKeys.set(targetTabId, storageKey);

        // Setup console interceptor with non-enumerable, random-keyed storage
        await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: (key) => {
                const logs = [];
                Object.defineProperty(window, key, {
                    get: () => { const copy = [...logs]; logs.length = 0; return copy; },
                    configurable: true,
                    enumerable: false
                });
                ['log', 'warn', 'error', 'info'].forEach(m => {
                    const orig = console[m];
                    console[m] = (...args) => {
                        logs.push({
                            type: m,
                            time: Date.now(),
                            msg: args.map(a => { try { return String(a); } catch (e) { return '[unstringifiable]'; } }).join(' ')
                        });
                        if (logs.length > 100) logs.shift();
                        orig.apply(console, args);
                    };
                });
            },
            args: [storageKey],
            world: 'MAIN'
        });
    }

    // Retrieve logs via the random key
    const result = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (key) => { try { return window[key] || []; } catch (e) { return []; } },
        args: [storageKey],
        world: 'MAIN'
    });
    return { logs: result[0]?.result || [] };
}

// Clean up console keys when tabs are closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
    consoleKeys.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'loading') {
        consoleKeys.delete(tabId);
    }
});

// Tab Grouping
async function createTabGroup(tabIds, title, color) {
    const groupId = await chrome.tabs.group({ tabIds });
    if (title || color) await chrome.tabGroups.update(groupId, { ...(title && { title }), ...(color && { color }) });
    return { groupId, tabIds };
}

async function addTabsToGroup(groupId, tabIds) {
    await chrome.tabs.group({ groupId, tabIds });
    return { groupId, added: tabIds };
}

async function openUrlsInGroup(urls, title, color) {
    const tabs = await Promise.all(urls.map(url => chrome.tabs.create({ url, active: false })));
    const tabIds = tabs.map(t => t.id);
    const groupId = await chrome.tabs.group({ tabIds });
    if (title || color) await chrome.tabGroups.update(groupId, { ...(title && { title }), ...(color && { color }) });
    if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
    return { groupId, tabIds };
}

async function listTabGroups() {
    const groups = await chrome.tabGroups.query({});
    const result = [];
    for (const g of groups) {
        const tabs = await chrome.tabs.query({ groupId: g.id });
        result.push({ id: g.id, title: g.title, color: g.color, collapsed: g.collapsed, tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url })) });
    }
    return result;
}

async function ungroupTabs(tabIds) {
    await chrome.tabs.ungroup(tabIds);
    return { ungrouped: tabIds };
}

async function collapseGroup(groupId, collapsed = true) {
    await chrome.tabGroups.update(groupId, { collapsed });
    return { groupId, collapsed };
}

// Initialize
connect();
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'status') sendResponse({ connected: isConnected });
    return true;
});
