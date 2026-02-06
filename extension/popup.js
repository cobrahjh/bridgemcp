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
const eyeOpen = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
const eyeClosed = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';

document.getElementById('toggleToken').addEventListener('click', () => {
    const tokenInput = document.getElementById('token');
    const eyeIcon = document.getElementById('eyeIcon');
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        eyeIcon.innerHTML = eyeClosed;
    } else {
        tokenInput.type = 'password';
        eyeIcon.innerHTML = eyeOpen;
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
        // Check status after reconnect attempt
        setTimeout(checkStatus, 1000);
        setTimeout(checkStatus, 2000);
        setTimeout(checkStatus, 3000);
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
// Poll status every 2 seconds while popup is open
setInterval(checkStatus, 2000);
