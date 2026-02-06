// Load saved token
chrome.storage.local.get('bridgemcpToken', (data) => {
    const tokenInput = document.getElementById('token');
    if (data.bridgemcpToken) {
        tokenInput.value = data.bridgemcpToken;
    }
});

// Save token
document.getElementById('saveToken').addEventListener('click', () => {
    const token = document.getElementById('token').value.trim();
    chrome.storage.local.set({ bridgemcpToken: token }, () => {
        const savedMsg = document.getElementById('tokenSaved');
        savedMsg.style.display = 'block';
        setTimeout(() => { savedMsg.style.display = 'none'; }, 3000);
    });
});

// Check connection status
chrome.runtime.sendMessage({ type: 'status' }, (response) => {
    const statusEl = document.getElementById('status');
    if (response?.connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = 'Disconnected - Start server with: npx bridgemcp';
        statusEl.className = 'status disconnected';
    }
});
