# BridgeMCP Test Cases

## Setup
- Server: `npx bridgemcp`
- Token: `~/.bridgemcp/token`
- Port: 8620 (default)

---

## 1. Extension Tests

### 1.1 Popup UI
- [ ] Popup opens without errors
- [ ] Port field displays (default 8620)
- [ ] Token field displays with password mask
- [ ] Eye icon toggles token visibility
- [ ] "Save & Connect" button present
- [ ] "npx bridgemcp" command box with Copy button
- [ ] Documentation link works

### 1.2 Connection
- [ ] Status shows "Disconnected" when server not running
- [ ] Status shows "Connected" after entering valid token
- [ ] Status updates in real-time on disconnect
- [ ] Invalid token shows error/stays disconnected
- [ ] Reconnects automatically on server restart (same token)

### 1.3 Token Persistence
- [ ] Token saved in chrome.storage after clicking Save
- [ ] Token persists after browser restart
- [ ] Token persists after extension reload

---

## 2. Server Tests

### 2.1 Startup
```bash
npx bridgemcp
```
- [ ] Prints version number
- [ ] Prints auth token
- [ ] Saves token to ~/.bridgemcp/token
- [ ] HTTP server starts on port 8620
- [ ] WebSocket server starts on port 8620

### 2.2 Status Endpoint (No Auth)
```bash
curl http://localhost:8620/status
```
- [ ] Returns `{"connected": false, "version": "x.x.x"}` before extension connects
- [ ] Returns `{"connected": true, "version": "x.x.x"}` after extension connects

### 2.3 Authentication
```bash
# Header auth
curl -H "Authorization: Bearer TOKEN" http://localhost:8620/tabs

# Query param auth
curl "http://localhost:8620/tabs?token=TOKEN"
```
- [ ] Valid token returns data
- [ ] Invalid token returns 401 Unauthorized
- [ ] Missing token returns 401 Unauthorized

---

## 3. API Endpoint Tests

### 3.1 Navigation
```bash
TOKEN="your-token-here"

# List tabs
curl -H "Authorization: Bearer $TOKEN" http://localhost:8620/tabs

# Active tab
curl -H "Authorization: Bearer $TOKEN" http://localhost:8620/active

# Navigate
curl -X POST http://localhost:8620/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Back/Forward
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8620/back
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8620/forward

# New tab
curl -X POST http://localhost:8620/newtab \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Close tab
curl -X POST http://localhost:8620/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123}'

# Focus tab
curl -X POST http://localhost:8620/focus \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123}'
```

### 3.2 Interaction
```bash
# Click
curl -X POST http://localhost:8620/click \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": "button.submit"}'

# Type
curl -X POST http://localhost:8620/type \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": "input[name=q]", "text": "hello"}'

# Hover
curl -X POST http://localhost:8620/hover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": ".menu-item"}'

# Key press
curl -X POST http://localhost:8620/key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "Enter"}'

# Select dropdown
curl -X POST http://localhost:8620/select \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": "select#country", "value": "US"}'

# Wait
curl -X POST http://localhost:8620/wait \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"time": 2}'
```

### 3.3 Data & Inspection
```bash
# Accessibility snapshot
curl -X POST http://localhost:8620/snapshot \
  -H "Authorization: Bearer $TOKEN"

# Screenshot
curl -X POST http://localhost:8620/screenshot \
  -H "Authorization: Bearer $TOKEN"

# Read element
curl -X POST http://localhost:8620/read \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": "h1"}'

# Console logs
curl -H "Authorization: Bearer $TOKEN" http://localhost:8620/console

# Execute script
curl -X POST http://localhost:8620/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"script": "document.title"}'
```

### 3.4 Tab Groups
```bash
# List groups
curl -H "Authorization: Bearer $TOKEN" http://localhost:8620/groups

# Create group
curl -X POST http://localhost:8620/group \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tabIds": [123, 456], "title": "Research", "color": "blue"}'

# Open URLs in group
curl -X POST http://localhost:8620/opengroup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://a.com", "https://b.com"], "title": "Work"}'
```

---

## 4. CLI Tests

### 4.1 Server Mode
```bash
npx bridgemcp           # Start server
npx bridgemcp --verbose # Verbose logging
npx bridgemcp -v        # Verbose (short)
npx bridgemcp --mcp     # Force MCP mode
```

### 4.2 Client Commands
```bash
# Navigation
npx bridgemcp tabs
npx bridgemcp active
npx bridgemcp groups
npx bridgemcp navigate https://example.com
npx bridgemcp newtab https://example.com
npx bridgemcp back
npx bridgemcp forward
npx bridgemcp close 123
npx bridgemcp focus 123

# Interaction
npx bridgemcp click "button.submit"
npx bridgemcp type "input[name=q]" "hello world"
npx bridgemcp hover ".menu"
npx bridgemcp key Enter
npx bridgemcp select "select#country" "US"
npx bridgemcp wait 2

# Data
npx bridgemcp snapshot
npx bridgemcp screenshot output.png
npx bridgemcp read "h1"
npx bridgemcp execute "document.title"
npx bridgemcp console
```

---

## 5. Error Handling Tests

### 5.1 Server Errors
- [ ] Extension not connected: Returns helpful error
- [ ] Invalid selector: Returns error with details
- [ ] Tab not found: Returns 404-style error
- [ ] Timeout on operation: Returns timeout error

### 5.2 CLI Errors
- [ ] Server not running: "Server not running. Start it with: npx bridgemcp"
- [ ] No token file: "No token found. Start the server first"
- [ ] Invalid command: Shows help

---

## 6. Security Tests

- [ ] Token is 64 hex characters (32 bytes)
- [ ] Token file has restricted permissions (0600 on Unix)
- [ ] WebSocket rejects non-extension origins
- [ ] javascript: URLs blocked in navigate
- [ ] file: URLs blocked in navigate
- [ ] data: URLs blocked in navigate
- [ ] Rate limiting works (100 req/min)

---

## 7. MCP Integration Tests

### 7.1 Claude Desktop
1. Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["bridgemcp"]
    }
  }
}
```
2. Restart Claude Desktop
3. Ask Claude to navigate to a URL
4. Verify browser automation works

### 7.2 Cursor
1. Add MCP config in Settings
2. Use browser tools in chat

---

## 8. Cross-Platform Tests

### Windows
- [ ] Server starts
- [ ] Token saved to %USERPROFILE%\.bridgemcp\token
- [ ] CLI commands work

### macOS
- [ ] Server starts
- [ ] Token saved to ~/.bridgemcp/token
- [ ] CLI commands work

### Linux
- [ ] Server starts
- [ ] Token saved to ~/.bridgemcp/token
- [ ] CLI commands work

---

## Quick Smoke Test Script

```bash
#!/bin/bash
TOKEN=$(cat ~/.bridgemcp/token)
BASE="http://localhost:8620"
TEMP_DIR="${TMPDIR:-/tmp}"

echo "=== BridgeMCP Smoke Test ==="

echo -n "1. Status: "
curl -s $BASE/status | jq -r 'if .connected then "PASS" else "FAIL" end'

echo -n "2. Tabs: "
curl -s -H "Authorization: Bearer $TOKEN" $BASE/tabs | jq 'length | tostring + " tabs"'

echo -n "3. Active: "
curl -s -H "Authorization: Bearer $TOKEN" $BASE/active | jq -r '.title // "FAIL"'

echo -n "4. Navigate: "
curl -s -X POST $BASE/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' | jq -r 'if .navigated then "PASS" else "FAIL" end'

sleep 1

echo -n "5. Click: "
curl -s -X POST $BASE/click \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selector": "h1"}' | jq -r 'if .clicked then "PASS" else "FAIL" end'

echo -n "6. Key: "
curl -s -X POST $BASE/key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "Escape"}' | jq -r 'if .pressed then "PASS" else "FAIL" end'

echo -n "7. Snapshot: "
curl -s -X POST -H "Authorization: Bearer $TOKEN" $BASE/snapshot | jq -r '.title // "FAIL"'

echo -n "8. Screenshot: "
curl -s -X POST -H "Authorization: Bearer $TOKEN" $BASE/screenshot -o "$TEMP_DIR/bridgemcp-test.json"
if [ -s "$TEMP_DIR/bridgemcp-test.json" ]; then
  SIZE=$(stat -f%z "$TEMP_DIR/bridgemcp-test.json" 2>/dev/null || stat -c%s "$TEMP_DIR/bridgemcp-test.json")
  echo "PASS (${SIZE} bytes)"
else
  echo "FAIL"
fi

echo -n "9. Auth (invalid): "
curl -s -H "Authorization: Bearer invalid" $BASE/tabs | jq -r 'if .error then "PASS" else "FAIL" end'

echo "=== Done ==="
```
