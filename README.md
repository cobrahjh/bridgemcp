# BridgeMCP

Browser automation for AI tools. Control Chrome from Claude Desktop, Cursor, VS Code, or any HTTP client.

## Features

- **MCP Protocol** - Native integration with Claude Desktop, Cursor, Windsurf
- **HTTP API** - Universal REST API for any tool (curl, Python, etc.)
- **Your Browser** - Uses your existing Chrome profile with logged-in sessions
- **Local & Private** - All automation happens on your machine
- **Tab Groups** - Organize tabs (not available in other tools)

## Quick Start

### 1. Install the Server

```bash
npm install -g bridgemcp
```

### 2. Install the Extension

1. Download the `extension` folder from this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension` folder

### 3. Start the Server

```bash
bridgemcp
```

### 4. Configure Your AI Tool

**Claude Desktop** (`claude_desktop_config.json`):
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

**Cursor** (Settings → MCP):
```json
{
  "browser": {
    "command": "npx",
    "args": ["bridgemcp"]
  }
}
```

## CLI Mode

Run commands directly from terminal (requires running server):

```bash
# Start server in one terminal
bridgemcp

# Run commands in another terminal
bridgemcp tabs                        # List all tabs
bridgemcp active                      # Get active tab
bridgemcp navigate https://example.com  # Navigate to URL
bridgemcp click "#submit"             # Click element
bridgemcp type "#input" "hello"       # Type text
bridgemcp snapshot                    # Get accessibility tree
bridgemcp screenshot output.png       # Take screenshot
bridgemcp key Enter                   # Press key
bridgemcp wait 2                      # Wait 2 seconds
bridgemcp back                        # Go back
bridgemcp forward                     # Go forward
```

### All CLI Commands

| Command | Description |
|---------|-------------|
| `tabs` | List all open tabs |
| `active` | Get active tab info |
| `groups` | List tab groups |
| `navigate <url>` | Navigate to URL |
| `newtab <url>` | Open new tab |
| `close [tabId]` | Close tab |
| `focus [tabId]` | Focus tab |
| `back` | Go back |
| `forward` | Go forward |
| `click <selector>` | Click element |
| `type <selector> <text>` | Type text into element |
| `hover <selector>` | Hover over element |
| `key <key>` | Press keyboard key |
| `select <selector> <value>` | Select dropdown option |
| `snapshot` | Get accessibility tree |
| `screenshot [file]` | Take screenshot (default: screenshot.png) |
| `read <selector>` | Read element content |
| `execute <script>` | Run JavaScript |
| `wait <seconds>` | Wait seconds |
| `console [tabId]` | Get console logs |

## MCP Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_click` | Click an element |
| `browser_type` | Type text |
| `browser_hover` | Hover over element |
| `browser_drag` | Drag and drop |
| `browser_press_key` | Press keyboard key |
| `browser_select` | Select dropdown option |
| `browser_snapshot` | Get accessibility tree |
| `browser_screenshot` | Take screenshot |
| `browser_console_logs` | Get console output |
| `browser_tabs` | List open tabs |
| `browser_new_tab` | Open new tab |
| `browser_close_tab` | Close tab |
| `browser_wait` | Wait seconds |

## HTTP API

The server also exposes a REST API on port 8620:

```bash
# Check status
curl http://localhost:8620/status

# List tabs
curl http://localhost:8620/tabs

# Navigate
curl -X POST http://localhost:8620/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Click
curl -X POST http://localhost:8620/click \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123, "selector": "button.submit"}'

# Type
curl -X POST http://localhost:8620/type \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123, "text": "Hello", "submit": true}'

# Screenshot
curl -X POST http://localhost:8620/screenshot \
  -d '{"tabId": 123}'

# Accessibility snapshot
curl -X POST http://localhost:8620/snapshot
```

### All HTTP Endpoints

**Navigation:**
- `GET /status` - Connection status
- `GET /tabs` - List all tabs
- `GET /active` - Get active tab
- `POST /navigate` - Navigate to URL
- `POST /back` - Go back
- `POST /forward` - Go forward
- `POST /newtab` - Open new tab
- `POST /close` - Close tab
- `POST /focus` - Focus tab

**Interaction:**
- `POST /click` - Click element
- `POST /type` - Type text
- `POST /hover` - Hover element
- `POST /drag` - Drag and drop
- `POST /key` - Press key
- `POST /select` - Select option

**Data:**
- `POST /read` - Read page content
- `POST /snapshot` - Accessibility snapshot
- `POST /screenshot` - Visual screenshot
- `GET /console` - Console logs
- `POST /execute` - Run JavaScript

**Timing:**
- `POST /wait` - Wait seconds

**Tab Groups:**
- `GET /groups` - List groups
- `POST /group` - Create group
- `POST /opengroup` - Open URLs in group
- `POST /ungroup` - Ungroup tabs

## Configuration

Environment variables:
- `BRIDGEMCP_PORT` - HTTP/WebSocket port (default: 8620)

CLI flags:
- `--verbose` or `-v` - Enable debug logging
- `--mcp` - Force MCP mode

## How It Works

```
Claude / Cursor / curl
         │
         │ MCP (stdio) or HTTP
         ▼
    BridgeMCP Server
         │
         │ WebSocket
         ▼
    Chrome Extension
         │
         │ chrome.* APIs
         ▼
    Your Browser
```

The Chrome extension connects to the local BridgeMCP server via WebSocket. The server exposes both MCP protocol (for AI tools) and HTTP API (for any client).

## License

MIT
