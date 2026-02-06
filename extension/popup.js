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
