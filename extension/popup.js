// Update command text based on port
function updateCmdText() {
    const port = document.getElementById('port').value.trim() || '8620';
    const cmdEl = document.getElementById('cmdText');
    cmdEl.textContent = port === '8620' ? 'npx bridgemcp' : `BRIDGEMCP_PORT=${port} npx bridgemcp`;
}

// Load saved settings
chrome.storage.local.get(['bridgemcpToken', 'bridgemcpPort'], (data) => {
    if (data.bridgemcpToken) {
        document.getElementById('token').value = data.bridgemcpToken;
    }
    document.getElementById('port').value = data.bridgemcpPort || '8620';
    updateCmdText();
});

// Update command when port changes
document.getElementById('port').addEventListener('input', updateCmdText);

// Toggle token visibility
document.getElementById('toggleToken').addEventListener('click', () => {
    const tokenInput = document.getElementById('token');
    const btn = document.getElementById('toggleToken');
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        btn.textContent = '🙈';
    } else {
        tokenInput.type = 'password';
        btn.textContent = '👁';
    }
});

// Save settings
document.getElementById('saveToken').addEventListener('click', () => {
    const token = document.getElementById('token').value.trim();
    const port = document.getElementById('port').value.trim() || '8620';

    chrome.storage.local.set({ bridgemcpToken: token, bridgemcpPort: port }, () => {
        const savedMsg = document.getElementById('tokenSaved');
        savedMsg.style.display = 'block';
        setTimeout(() => { savedMsg.style.display = 'none'; }, 3000);
        // Trigger reconnect with new settings
        chrome.runtime.sendMessage({ type: 'reconnect' });
    });
});

// Copy server command
document.getElementById('copyCmd').addEventListener('click', () => {
    const port = document.getElementById('port').value.trim() || '8620';
    const cmd = port === '8620' ? 'npx bridgemcp' : `BRIDGEMCP_PORT=${port} npx bridgemcp`;
    navigator.clipboard.writeText(cmd).then(() => {
        const btn = document.getElementById('copyCmd');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
});

// Check connection status
function checkStatus() {
    chrome.runtime.sendMessage({ type: 'status' }, (response) => {
        const statusEl = document.getElementById('status');
        if (response?.connected) {
            statusEl.textContent = 'Connected';
            statusEl.className = 'status connected';
        } else {
            statusEl.textContent = 'Disconnected';
            statusEl.className = 'status disconnected';
        }
    });
}

checkStatus();
