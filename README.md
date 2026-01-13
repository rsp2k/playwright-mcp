## Playwright MCP

A Model Context Protocol (MCP) server that provides browser automation capabilities using [Playwright](https://playwright.dev). This server enables LLMs to interact with web pages through structured accessibility snapshots, bypassing the need for screenshots or visually-tuned models.

### Key Features

- **Fast and lightweight**. Uses Playwright's accessibility tree, not pixel-based input.
- **LLM-friendly**. No vision models needed, operates purely on structured data.
- **Deterministic tool application**. Avoids ambiguity common with screenshot-based approaches.
- **🔔 Push Notifications & Permissions**. Full Web Notifications API support with notification capture, plus runtime permission grants for camera, microphone, geolocation, clipboard, and sensors.
- **🤖 AI-Human Collaboration System**. Direct JavaScript communication between models and users with `mcpNotify`, `mcpPrompt`, and interactive element selection via `mcpInspector`.
- **🎯 Multi-client identification**. Professional floating debug toolbar with themes to identify which MCP client controls the browser in multi-client environments.
- **📊 Advanced HTTP monitoring**. Comprehensive request/response interception with headers, bodies, timing analysis, and export to HAR/CSV formats.
- **🎬 Intelligent video recording**. Smart pause/resume modes eliminate dead time for professional demo videos with automatic viewport matching.
- **🎨 Custom code injection**. Inject JavaScript/CSS into pages for enhanced automation, with memory-leak-free cleanup and session persistence.
- **📁 Centralized artifact management**. Session-based organization of screenshots, videos, and PDFs with comprehensive audit logging.
- **🔧 Enterprise-ready**. Memory leak prevention, comprehensive error handling, and production-tested browser automation patterns.

### Requirements
- Node.js 18 or newer
- VS Code, Cursor, Windsurf, Claude Desktop, Goose or any other MCP client

<!--
// Generate using:
node utils/generate-links.js
-->

### Getting started

First, install the Playwright MCP server with your client.

**Standard config** works in most of the tools:

```js
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D)


<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the Playwright MCP server:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```
</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

</details>

<details>
<summary>Cursor</summary>

#### Click the button to install:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=playwright&config=eyJjb21tYW5kIjoibnB4IEBwbGF5d3JpZ2h0L21jcEBsYXRlc3QifQ%3D%3D)

#### Or install manually:

Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Name to your liking, use `command` type with the command `npx @playwright/mcp`. You can also verify config or add command like arguments via clicking `Edit`.

</details>

<details>
<summary>Gemini CLI</summary>

Follow the MCP install [guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#configure-the-mcp-server-in-settingsjson), use the standard config above.

</details>

<details>
<summary>Goose</summary>

#### Click the button to install:

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=%40playwright%2Fmcp%40latest&id=playwright&name=Playwright&description=Interact%20with%20web%20pages%20through%20structured%20accessibility%20snapshots%20using%20Playwright)

#### Or install manually:

Go to `Advanced settings` -> `Extensions` -> `Add custom extension`. Name to your liking, use type `STDIO`, and set the `command` to `npx @playwright/mcp`. Click "Add Extension".
</details>

<details>
<summary>LM Studio</summary>

#### Click the button to install:

[![Add MCP Server playwright to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=playwright&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAcGxheXdyaWdodC9tY3BAbGF0ZXN0Il19)

#### Or install manually:

Go to `Program` in the right sidebar -> `Install` -> `Edit mcp.json`. Use the standard config above.
</details>

<details>
<summary>Qodo Gen</summary>

Open [Qodo Gen](https://docs.qodo.ai/qodo-documentation/qodo-gen) chat panel in VSCode or IntelliJ → Connect more tools → + Add new MCP → Paste the standard config above.

Click <code>Save</code>.
</details>

<details>
<summary>VS Code</summary>

#### Click the button to install:

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522playwright%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540playwright%252Fmcp%2540latest%2522%255D%257D)

#### Or install manually:

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install the Playwright MCP server using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"playwright","command":"npx","args":["@playwright/mcp@latest"]}'
```

After installation, the Playwright MCP server will be available for use with your GitHub Copilot agent in VS Code.
</details>

<details>
<summary>Windsurf</summary>

Follow Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp). Use the standard config above.

</details>

### Configuration

Playwright MCP server supports following arguments. They can be provided in the JSON configuration above, as a part of the `"args"` list:

<!--- Options generated by update-readme.js -->

```
> npx @playwright/mcp@latest --help
  --allowed-origins <origins>     semicolon-separated list of origins to allow
                                  the browser to request. Default is to allow
                                  all.
  --artifact-dir <path>           path to the directory for centralized artifact
                                  storage with session-specific subdirectories.
  --blocked-origins <origins>     semicolon-separated list of origins to block
                                  the browser from requesting. Blocklist is
                                  evaluated before allowlist. If used without
                                  the allowlist, requests not matching the
                                  blocklist are still allowed.
  --block-service-workers         block service workers
  --browser <browser>             browser or chrome channel to use, possible
                                  values: chrome, firefox, webkit, msedge.
  --caps <caps>                   comma-separated list of additional
                                  capabilities to enable, possible values:
                                  vision, pdf.
  --cdp-endpoint <endpoint>       CDP endpoint to connect to.
  --config <path>                 path to the configuration file.
  --console-output-file <path>    file path to write browser console output to
                                  for debugging and monitoring.
  --device <device>               device to emulate, for example: "iPhone 15"
  --executable-path <path>        path to the browser executable.
  --headless                      run browser in headless mode, headed by
                                  default
  --host <host>                   host to bind server to. Default is localhost.
                                  Use 0.0.0.0 to bind to all interfaces.
  --ignore-https-errors           ignore https errors
  --isolated                      keep the browser profile in memory, do not
                                  save it to disk. This is the default.
  --no-isolated                   use a persistent browser profile. Enables
                                  features like Push API that require
                                  non-incognito mode.
  --grant-all-permissions         grant all browser permissions (geolocation,
                                  camera, microphone, clipboard, etc.) at
                                  startup.
  --image-responses <mode>        whether to send image responses to the client.
                                  Can be "allow" or "omit", Defaults to "allow".
  --no-snapshots                  disable automatic page snapshots after
                                  interactive operations like clicks. Use
                                  browser_snapshot tool for explicit snapshots.
  --max-snapshot-tokens <tokens>  maximum number of tokens allowed in page
                                  snapshots before truncation. Use 0 to disable
                                  truncation. Default is 10000.
  --differential-snapshots        enable differential snapshots that only show
                                  changes since the last snapshot instead of
                                  full page snapshots.
  --no-sandbox                    disable the sandbox for all process types that
                                  are normally sandboxed.
  --output-dir <path>             path to the directory for output files.
  --port <port>                   port to listen on for SSE transport.
  --proxy-bypass <bypass>         comma-separated domains to bypass proxy, for
                                  example ".com,chromium.org,.domain.com"
  --proxy-server <proxy>          specify proxy server, for example
                                  "http://myproxy:3128" or
                                  "socks5://myproxy:8080"
  --save-session                  Whether to save the Playwright MCP session
                                  into the output directory.
  --save-trace                    Whether to save the Playwright Trace of the
                                  session into the output directory.
  --storage-state <path>          path to the storage state file for isolated
                                  sessions.
  --user-agent <ua string>        specify user agent string
  --user-data-dir <path>          path to the user data directory. If not
                                  specified, a temporary directory will be
                                  created.
  --viewport-size <size>          specify browser viewport size in pixels, for
                                  example "1280, 720"
```

<!--- End of options generated section -->

### User profile

You can run Playwright MCP with persistent profile like a regular browser (default), or in the isolated contexts for the testing sessions.

**Persistent profile**

All the logged in information will be stored in the persistent profile, you can delete it between sessions if you'd like to clear the offline state.
Persistent profile is located at the following locations and you can override it with the `--user-data-dir` argument.

```bash
# Windows
%USERPROFILE%\AppData\Local\ms-playwright\mcp-{channel}-profile

# macOS
- ~/Library/Caches/ms-playwright/mcp-{channel}-profile

# Linux
- ~/.cache/ms-playwright/mcp-{channel}-profile
```

**Isolated**

In the isolated mode, each session is started in the isolated profile. Every time you ask MCP to close the browser,
the session is closed and all the storage state for this session is lost. You can provide initial storage state
to the browser via the config's `contextOptions` or via the `--storage-state` argument. Learn more about the storage
state [here](https://playwright.dev/docs/auth).

```js
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--isolated",
        "--storage-state={path/to/storage.json}"
      ]
    }
  }
}
```

### Browser Permissions & Push Notifications

The server provides comprehensive permission management for browser automation, including runtime permission grants and push notification support.

#### Quick Start: Grant All Permissions

```bash
# Grant all common permissions at startup
npx @playwright/mcp@latest --grant-all-permissions

# Or via environment variable
PLAYWRIGHT_MCP_GRANT_ALL_PERMISSIONS=true npx @playwright/mcp@latest
```

#### Permission Tools

| Tool | Description |
|------|-------------|
| `browser_grant_permissions` | Grant permissions at runtime (supports `all: true` for all permissions) |
| `browser_clear_permissions` | Revoke all granted permissions |
| `browser_set_geolocation` | Set geolocation coordinates at runtime |
| `browser_configure_notifications` | Configure notification permissions per-origin |
| `browser_list_notifications` | List captured browser notifications |
| `browser_handle_notification` | Click or close a notification |
| `browser_wait_notification` | Wait for a notification to appear |
| `browser_status` | Show current browser mode and capability status |

#### Available Permissions

When using `--grant-all-permissions` or `browser_grant_permissions({ all: true })`:

- `geolocation` - Location access
- `notifications` - Browser notifications
- `camera` - Webcam access
- `microphone` - Audio input
- `clipboard-read` / `clipboard-write` - Clipboard access
- `accelerometer` / `gyroscope` / `magnetometer` - Motion sensors
- `midi` - MIDI device access
- `background-sync` - Background sync API
- `ambient-light-sensor` - Light sensor
- `accessibility-events` - Accessibility automation

#### Push API Support

The Push API requires a persistent browser profile. By default, the server runs in isolated (incognito-like) mode which blocks Push API.

**To enable Push API:**

```bash
# Use persistent profile mode
npx @playwright/mcp@latest --no-isolated

# Or combine with all permissions
npx @playwright/mcp@latest --no-isolated --grant-all-permissions
```

| Mode | Flag | Push API | State Persistence |
|------|------|----------|-------------------|
| Isolated (default) | `--isolated` | ❌ Blocked | ❌ Ephemeral |
| Persistent | `--no-isolated` | ✅ Works | ✅ Retained |

Use `browser_status` tool to check current mode and capabilities at any time.

### Configuration file

The Playwright MCP server can be configured using a JSON configuration file. You can specify the configuration file
using the `--config` command line option:

```bash
npx @playwright/mcp@latest --config path/to/config.json
```

<details>
<summary>Configuration file schema</summary>

```typescript
{
  // Browser configuration
  browser?: {
    // Browser type to use (chromium, firefox, or webkit)
    browserName?: 'chromium' | 'firefox' | 'webkit';

    // Keep the browser profile in memory, do not save it to disk.
    isolated?: boolean;

    // Path to user data directory for browser profile persistence
    userDataDir?: string;

    // Browser launch options (see Playwright docs)
    // @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch
    launchOptions?: {
      channel?: string;        // Browser channel (e.g. 'chrome')
      headless?: boolean;      // Run in headless mode
      executablePath?: string; // Path to browser executable
      // ... other Playwright launch options
    };

    // Browser context options
    // @see https://playwright.dev/docs/api/class-browser#browser-new-context
    contextOptions?: {
      viewport?: { width: number, height: number };
      // ... other Playwright context options
    };

    // CDP endpoint for connecting to existing browser
    cdpEndpoint?: string;

    // Remote Playwright server endpoint
    remoteEndpoint?: string;
  },

  // Server configuration
  server?: {
    port?: number;  // Port to listen on
    host?: string;  // Host to bind to (default: localhost)
  },

  // List of additional capabilities
  capabilities?: Array<
    'tabs' |    // Tab management
    'install' | // Browser installation
    'pdf' |     // PDF generation
    'vision' |  // Coordinate-based interactions
  >;

  // Directory for output files
  outputDir?: string;

  // Directory for centralized artifact storage with session-specific subdirectories
  artifactDir?: string;

  // Network configuration
  network?: {
    // List of origins to allow the browser to request. Default is to allow all. Origins matching both `allowedOrigins` and `blockedOrigins` will be blocked.
    allowedOrigins?: string[];

    // List of origins to block the browser to request. Origins matching both `allowedOrigins` and `blockedOrigins` will be blocked.
    blockedOrigins?: string[];
  };
 
  /**
   * Whether to send image responses to the client. Can be "allow" or "omit". 
   * Defaults to "allow".
   */
  imageResponses?: 'allow' | 'omit';
}
```
</details>

### Centralized Artifact Storage

The Playwright MCP server supports centralized artifact storage for organizing all generated files (screenshots, videos, and PDFs) in session-specific directories with comprehensive logging.

#### Configuration

**Command Line Option:**
```bash
npx @playwright/mcp@latest --artifact-dir /path/to/artifacts
```

**Environment Variable:**
```bash
export PLAYWRIGHT_MCP_ARTIFACT_DIR="/path/to/artifacts"
npx @playwright/mcp@latest
```

**MCP Client Configuration:**
```js
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--artifact-dir",
        "./browser-artifacts"
      ]
    }
  }
}
```

#### Features

When artifact storage is enabled, the server provides:

- **Session Isolation**: Each MCP session gets its own subdirectory
- **Organized Storage**: All artifacts saved to `{artifact-dir}/{session-id}/`
- **Tool Call Logging**: Complete audit trail in `tool-calls.json`
- **Automatic Organization**: Videos saved to `videos/` subdirectory

#### Directory Structure

```
browser-artifacts/
└── mcp-session-abc123/
    ├── tool-calls.json              # Complete log of all tool calls
    ├── page-2024-01-15T10-30-00.png # Screenshots
    ├── document.pdf                 # Generated PDFs
    └── videos/
        └── session-recording.webm   # Video recordings
```

#### Tool Call Log Format

The `tool-calls.json` file contains detailed information about each operation:

```json
[
  {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "toolName": "browser_take_screenshot",
    "parameters": {
      "filename": "login-page.png"
    },
    "result": "success",
    "artifactPath": "login-page.png"
  },
  {
    "timestamp": "2024-01-15T10:31:15.000Z", 
    "toolName": "browser_start_recording",
    "parameters": {
      "filename": "user-journey"
    },
    "result": "success"
  }
]
```

#### Per-Session Control

You can dynamically enable, disable, or configure artifact storage during a session using the `browser_configure_artifacts` tool:

**Check Current Status:**
```
browser_configure_artifacts
```

**Enable Artifact Storage:**
```json
{
  "enabled": true,
  "directory": "./my-artifacts"
}
```

**Disable Artifact Storage:**
```json
{
  "enabled": false
}
```

**Custom Session ID:**
```json
{
  "enabled": true,
  "sessionId": "my-custom-session"
}
```

#### Compatibility

- **Backward Compatible**: When `--artifact-dir` is not specified, all tools work exactly as before
- **Dynamic Control**: Artifact storage can be enabled/disabled per session without server restart
- **Fallback Behavior**: If artifact storage fails, tools fall back to default output directory
- **No Breaking Changes**: Existing configurations continue to work unchanged

### Standalone MCP server

When running headed browser on system w/o display or from worker processes of the IDEs,
run the MCP server from environment with the DISPLAY and pass the `--port` flag to enable HTTP transport.

```bash
npx @playwright/mcp@latest --port 8931
```

And then in MCP client config, set the `url` to the HTTP endpoint:

```js
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

<details>
<summary><b>Docker</b></summary>

**NOTE:** The Docker implementation only supports headless chromium at the moment.

```js
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--init", "--pull=always", "mcr.microsoft.com/playwright/mcp"]
    }
  }
}
```

You can build the Docker image yourself.

```
docker build -t mcr.microsoft.com/playwright/mcp .
```
</details>

<details>
<summary><b>Programmatic usage</b></summary>

```js
import http from 'http';

import { createConnection } from '@playwright/mcp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

http.createServer(async (req, res) => {
  // ...

  // Creates a headless Playwright MCP server with SSE transport
  const connection = await createConnection({ browser: { launchOptions: { headless: true } } });
  const transport = new SSEServerTransport('/messages', res);
  await connection.sever.connect(transport);

  // ...
});
```
</details>

### Tools

<!--- Tools generated by update-readme.js -->

<details>
<summary><b>Core automation</b></summary>

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_device_motion**
  - Title: Clear device motion override
  - Description: Remove the device motion override and stop sending simulated motion events.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_device_orientation**
  - Title: Clear device orientation override
  - Description: Remove the device orientation override and return to default sensor behavior.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_injections**
  - Title: Clear Injections
  - Description: Remove all custom code injections (keeps debug toolbar)
  - Parameters:
    - `includeToolbar` (boolean, optional): Also disable debug toolbar
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_notifications**
  - Title: Clear notification history
  - Description: Clear all captured notifications from the session history.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_permissions**
  - Title: Clear all browser permissions
  - Description: Revoke all previously granted permissions for the current browser context. Sites will need to request permissions again.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_clear_requests**
  - Title: Clear captured requests
  - Description: Clear all captured HTTP request data from memory. Useful for freeing up memory during long sessions or when starting fresh analysis.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_click**
  - Title: Click
  - Description: Perform click on a web page. Returns page snapshot after click (configurable via browser_configure_snapshots). Use browser_snapshot for explicit full snapshots.
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string): Exact target element reference from the page snapshot
    - `doubleClick` (boolean, optional): Whether to perform a double click instead of a single click
    - `button` (string, optional): Button to click, defaults to left
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_close**
  - Title: Close browser
  - Description: Close the page
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_configure**
  - Title: Configure browser settings
  - Description: Change browser configuration settings like headless/headed mode, viewport size, user agent, device emulation, geolocation, locale, timezone, color scheme, or permissions for subsequent operations. This will close the current browser and restart it with new settings.
  - Parameters:
    - `headless` (boolean, optional): Whether to run the browser in headless mode
    - `viewport` (object, optional): Browser viewport size
    - `userAgent` (string, optional): User agent string for the browser
    - `device` (string, optional): Device to emulate (e.g., "iPhone 13", "iPad", "Pixel 5"). Use browser_list_devices to see available devices.
    - `geolocation` (object, optional): Set geolocation coordinates
    - `locale` (string, optional): Browser locale (e.g., "en-US", "fr-FR", "ja-JP")
    - `timezone` (string, optional): Timezone ID (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")
    - `colorScheme` (string, optional): Preferred color scheme
    - `permissions` (array, optional): Permissions to grant (e.g., ["geolocation", "notifications", "camera", "microphone"])
    - `offline` (boolean, optional): Whether to emulate offline network conditions (equivalent to DevTools offline mode)
    - `proxyServer` (string, optional): Proxy server to use for network requests. Examples: "http://myproxy:3128", "socks5://127.0.0.1:1080". Set to null (empty) to clear proxy.
    - `proxyBypass` (string, optional): Comma-separated domains to bypass proxy (e.g., ".com,chromium.org,.domain.com")
    - `chromiumSandbox` (boolean, optional): Enable/disable Chromium sandbox (affects browser appearance)
    - `slowMo` (number, optional): Slow down operations by specified milliseconds (helps with visual tracking)
    - `devtools` (boolean, optional): Open browser with DevTools panel open (Chromium only)
    - `args` (array, optional): Additional browser launch arguments for UI customization (e.g., ["--force-color-profile=srgb", "--disable-features=VizDisplayCompositor"])
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_configure_artifacts**
  - Title: Configure artifact storage
  - Description: Enable, disable, or configure centralized artifact storage for screenshots, videos, and PDFs during this session. Allows dynamic control over where artifacts are saved and how they are organized.
  - Parameters:
    - `enabled` (boolean, optional): Enable or disable centralized artifact storage for this session
    - `directory` (string, optional): Directory path for artifact storage (if different from server default)
    - `sessionId` (string, optional): Custom session ID for artifact organization (auto-generated if not provided)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_configure_notifications**
  - Title: Configure notification permissions
  - Description: Grant or deny notification permissions for specific origins. This controls whether websites can show browser notifications.
  - Parameters:
    - `origins` (array): List of origins and their notification permissions
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_configure_snapshots**
  - Title: Configure snapshot behavior
  - Description: Configure how page snapshots are handled during the session. Control automatic snapshots, size limits, and differential modes. Changes take effect immediately for subsequent tool calls.
  - Parameters:
    - `includeSnapshots` (boolean, optional): Enable/disable automatic snapshots after interactive operations. When false, use browser_snapshot for explicit snapshots.
    - `maxSnapshotTokens` (number, optional): Maximum tokens allowed in snapshots before truncation. Use 0 to disable truncation.
    - `differentialSnapshots` (boolean, optional): Enable differential snapshots that show only changes since last snapshot instead of full page snapshots.
    - `differentialMode` (string, optional): Type of differential analysis: "semantic" (React-style reconciliation), "simple" (text diff), or "both" (show comparison).
    - `consoleOutputFile` (string, optional): File path to write browser console output to. Set to empty string to disable console file output.
    - `filterPattern` (string, optional): Ripgrep pattern to filter differential changes (regex supported). Examples: "button.*submit", "TypeError|ReferenceError", "form.*validation"
    - `filterFields` (array, optional): Specific fields to search within. Examples: ["element.text", "element.attributes", "console.message", "url"]. Defaults to element and console fields.
    - `filterMode` (string, optional): Type of filtering output: "content" (filtered data), "count" (match statistics), "files" (matching items only)
    - `caseSensitive` (boolean, optional): Case sensitive pattern matching (default: true)
    - `wholeWords` (boolean, optional): Match whole words only (default: false)
    - `contextLines` (number, optional): Number of context lines around matches
    - `invertMatch` (boolean, optional): Invert match to show non-matches (default: false)
    - `maxMatches` (number, optional): Maximum number of matches to return
    - `jqExpression` (string, optional): jq expression for structural JSON querying and transformation.

Common patterns:
• Buttons: .elements[] | select(.role == "button")
• Errors: .console[] | select(.level == "error")
• Forms: .elements[] | select(.role == "textbox" or .role == "combobox")
• Links: .elements[] | select(.role == "link")
• Transform: [.elements[] | {role, text, id}]

Tip: Use filterPreset instead for common cases - no jq knowledge required!
    - `filterPreset` (string, optional): Filter preset for common scenarios (no jq knowledge needed).

• buttons_only: Show only buttons
• links_only: Show only links
• forms_only: Show form inputs (textbox, combobox, checkbox, etc.)
• errors_only: Show console errors
• warnings_only: Show console warnings
• interactive_only: Show all clickable elements (buttons + links)
• validation_errors: Show validation alerts
• navigation_items: Show navigation menus
• headings_only: Show headings (h1-h6)
• images_only: Show images
• changed_text_only: Show elements with text changes

Note: filterPreset and jqExpression are mutually exclusive. Preset takes precedence.
    - `jqRawOutput` (boolean, optional): Output raw strings instead of JSON (jq -r flag). Useful for extracting plain text values.
    - `jqCompact` (boolean, optional): Compact JSON output without whitespace (jq -c flag). Reduces output size.
    - `jqSortKeys` (boolean, optional): Sort object keys in output (jq -S flag). Ensures consistent ordering.
    - `jqSlurp` (boolean, optional): Read entire input into array and process once (jq -s flag). Enables cross-element operations.
    - `jqExitStatus` (boolean, optional): Set exit code based on output (jq -e flag). Useful for validation.
    - `jqNullInput` (boolean, optional): Use null as input instead of reading data (jq -n flag). For generating new structures.
    - `filterOrder` (string, optional): Order of filter application. "jq_first" (default): structural filter then pattern match - recommended for maximum precision. "ripgrep_first": pattern match then structural filter - useful when you want to narrow down first. "jq_only": pure jq transformation without ripgrep. "ripgrep_only": pure pattern matching without jq (existing behavior).
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_console_messages**
  - Title: Get console messages
  - Description: Returns console messages with pagination support. Large message lists are automatically paginated for better performance.
  - Parameters:
    - `limit` (number, optional): Maximum items per page (1-1000)
    - `cursor_id` (string, optional): Continue from previous page using cursor ID
    - `session_id` (string, optional): Session identifier for cursor isolation
    - `return_all` (boolean, optional): Return entire response bypassing pagination (WARNING: may produce very large responses)
    - `level_filter` (string, optional): Filter messages by level
    - `source_filter` (string, optional): Filter messages by source
    - `search` (string, optional): Search text within console messages
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_disable_debug_toolbar**
  - Title: Disable Debug Toolbar
  - Description: Disable the debug toolbar for the current session
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_dismiss_all_file_choosers**
  - Title: Dismiss all file choosers
  - Description: Dismiss/cancel all open file chooser dialogs without uploading files. Useful when multiple file choosers are stuck open. Returns page snapshot after dismissal (configurable via browser_configure_snapshots).
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_dismiss_file_chooser**
  - Title: Dismiss file chooser
  - Description: Dismiss/cancel a file chooser dialog without uploading files. Returns page snapshot after dismissal (configurable via browser_configure_snapshots).
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_drag**
  - Title: Drag mouse
  - Description: Perform drag and drop between two elements. Returns page snapshot after drag (configurable via browser_configure_snapshots).
  - Parameters:
    - `startElement` (string): Human-readable source element description used to obtain the permission to interact with the element
    - `startRef` (string): Exact source element reference from the page snapshot
    - `endElement` (string): Human-readable target element description used to obtain the permission to interact with the element
    - `endRef` (string): Exact target element reference from the page snapshot
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_enable_debug_toolbar**
  - Title: Enable Modern Debug Toolbar
  - Description: Enable a modern floating pill toolbar with excellent contrast and professional design to identify which MCP client controls the browser
  - Parameters:
    - `projectName` (string, optional): Name of your project/client to display in the floating pill toolbar
    - `position` (string, optional): Position of the floating pill on screen (default: top-right)
    - `theme` (string, optional): Visual theme: light (white), dark (gray), transparent (glass effect)
    - `minimized` (boolean, optional): Start in compact pill mode (default: false)
    - `showDetails` (boolean, optional): Show session details when expanded (default: true)
    - `opacity` (number, optional): Toolbar opacity 0.1-1.0 (default: 0.95)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_enable_voice_collaboration**
  - Title: Enable Voice Collaboration
  - Description: 🎤 REVOLUTIONARY: Enable conversational browser automation with voice communication!

**Transform browser automation into natural conversation:**
• AI speaks to you in real-time during automation
• Respond with your voice instead of typing
• Interactive decision-making during tasks
• "Hey Claude, what should I click?" → AI guides you with voice

**Features:**
• Native browser Web Speech API (no external services)
• Automatic microphone permission handling  
• Intelligent fallbacks when voice unavailable
• Real-time collaboration during automation tasks

**Example Usage:**
AI: "I found a login form. What credentials should I use?" 🗣️
You: "Use my work email and check password manager" 🎤
AI: "Perfect! Logging you in now..." 🗣️

This is the FIRST conversational browser automation MCP server!
  - Parameters:
    - `enabled` (boolean, optional): Enable voice collaboration features (default: true)
    - `autoInitialize` (boolean, optional): Automatically initialize voice on page load (default: true)
    - `voiceOptions` (object, optional): Voice synthesis options
    - `listenOptions` (object, optional): Voice recognition options
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_evaluate**
  - Title: Evaluate JavaScript
  - Description: Evaluate JavaScript expression on page or element. Returns page snapshot after evaluation (configurable via browser_configure_snapshots).
  - Parameters:
    - `function` (string): () => { /* code */ } or (element) => { /* code */ } when element is provided
    - `element` (string, optional): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string, optional): Exact target element reference from the page snapshot
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_export_requests**
  - Title: Export captured requests
  - Description: Export captured HTTP requests to various formats (JSON, HAR, CSV, or summary report). Perfect for sharing analysis results, importing into other tools, or creating audit reports.
  - Parameters:
    - `format` (string, optional): Export format: json (full data), har (HTTP Archive), csv (spreadsheet), summary (human-readable report)
    - `filename` (string, optional): Custom filename for export. Auto-generated if not specified with timestamp
    - `filter` (string, optional): Filter which requests to export
    - `includeBody` (boolean, optional): Include request/response bodies in export (warning: may create large files)
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_file_upload**
  - Title: Upload files
  - Description: Upload one or multiple files. Returns page snapshot after upload (configurable via browser_configure_snapshots).
  - Parameters:
    - `paths` (array): The absolute paths to the files to upload. Can be a single file or multiple files.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_get_artifact_paths**
  - Title: Get artifact storage paths
  - Description: Reveal the actual filesystem paths where artifacts (screenshots, videos, PDFs) are stored. Useful for locating generated files.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_get_requests**
  - Title: Get captured requests
  - Description: Retrieve and analyze captured HTTP requests with pagination support. Shows timing, status codes, headers, and bodies. Large request lists are automatically paginated for better performance.
  - Parameters:
    - `limit` (number, optional): Maximum items per page (1-1000)
    - `cursor_id` (string, optional): Continue from previous page using cursor ID
    - `session_id` (string, optional): Session identifier for cursor isolation
    - `return_all` (boolean, optional): Return entire response bypassing pagination (WARNING: may produce very large responses)
    - `filter` (string, optional): Filter requests by type: all, failed (network failures), slow (>1s), errors (4xx/5xx), success (2xx/3xx)
    - `domain` (string, optional): Filter requests by domain hostname
    - `method` (string, optional): Filter requests by HTTP method (GET, POST, etc.)
    - `status` (number, optional): Filter requests by HTTP status code
    - `format` (string, optional): Response format: summary (basic info), detailed (full data), stats (statistics only)
    - `slowThreshold` (number, optional): Threshold in milliseconds for considering requests "slow" (default: 1000ms)
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_grant_permissions**
  - Title: Grant browser permissions at runtime
  - Description: Grant browser permissions at runtime without restarting the browser. This is faster than using browser_configure which requires a browser restart.

**Quick option:** Use `all: true` to grant all common permissions at once!

**Available permissions:**
- geolocation - Access user location
- notifications - Show browser notifications
- camera - Access camera/webcam
- microphone - Access microphone
- clipboard-read - Read from clipboard
- clipboard-write - Write to clipboard
- accelerometer - Access motion sensors
- gyroscope - Access orientation sensors
- magnetometer - Access compass
- accessibility-events - Accessibility automation
- midi - MIDI device access
- midi-sysex - MIDI system exclusive messages
- background-sync - Background sync API
- ambient-light-sensor - Light sensor access
- payment-handler - Payment request API
- storage-access - Storage access API

**Note:** Some permissions may require user interaction (like camera/microphone device selection) even after being granted.
  - Parameters:
    - `permissions` (array, optional): List of permissions to grant (e.g., ["geolocation", "camera", "microphone"])
    - `all` (boolean, optional): Grant ALL common permissions at once (geolocation, notifications, camera, microphone, clipboard, sensors, midi)
    - `origin` (string, optional): Origin to grant permissions for (e.g., "https://example.com"). If not specified, grants for all origins.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_handle_dialog**
  - Title: Handle a dialog
  - Description: Handle a dialog. Returns page snapshot after handling dialog (configurable via browser_configure_snapshots).
  - Parameters:
    - `accept` (boolean): Whether to accept the dialog.
    - `promptText` (string, optional): The text of the prompt in case of a prompt dialog.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_handle_notification**
  - Title: Handle a browser notification
  - Description: Click or close a browser notification. Use browser_list_notifications to see available notifications and their IDs.
  - Parameters:
    - `notificationId` (string): The notification ID to handle (from browser_list_notifications)
    - `action` (string): Action to take: "click" simulates clicking the notification, "close" dismisses it
    - `actionButton` (string, optional): For notifications with action buttons, specify which action to click
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_hover**
  - Title: Hover mouse
  - Description: Hover over element on page. Returns page snapshot after hover (configurable via browser_configure_snapshots).
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string): Exact target element reference from the page snapshot
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_inject_custom_code**
  - Title: Inject Custom Code
  - Description: Inject custom JavaScript or CSS code into all pages in the current session

🤖 COLLABORATION API AVAILABLE:
Models can inject JavaScript that communicates directly with users:
• mcpNotify.info('message') - Send info to user
• mcpNotify.success('completed!') - Show success  
• mcpNotify.warning('be careful') - Display warnings
• mcpNotify.error('something failed') - Show errors
• await mcpPrompt('Shall I proceed?') - Get user confirmation
• mcpInspector.start('Click the login button', callback) - Interactive element selection

When elements are ambiguous or actions need confirmation, use these functions 
to collaborate with the user for better automation results.

Full API: See MODEL-COLLABORATION-API.md
  - Parameters:
    - `name` (string): Unique name for this injection
    - `type` (string): Type of code to inject
    - `code` (string): The JavaScript or CSS code to inject
    - `persistent` (boolean, optional): Keep injection active across session restarts
    - `autoInject` (boolean, optional): Automatically inject on every new page
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_install_extension**
  - Title: Install Chrome extension
  - Description: Install a Chrome extension in the current browser session. Only works with Chromium browser. For best results, use pure Chromium without the "chrome" channel. The extension must be an unpacked directory containing manifest.json.
  - Parameters:
    - `path` (string): Path to the Chrome extension directory (containing manifest.json)
    - `name` (string, optional): Optional friendly name for the extension
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_install_popular_extension**
  - Title: Install popular Chrome extension
  - Description: Automatically download and install popular Chrome extensions from their official sources. This works around Chrome channel limitations by fetching extension source code.
  - Parameters:
    - `extension` (string): Popular extension to install automatically
    - `version` (string, optional): Specific version to install (defaults to latest)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_list_devices**
  - Title: List available devices for emulation
  - Description: Get a list of all available device emulation profiles including mobile phones, tablets, and desktop browsers. Each device includes viewport, user agent, and capabilities information.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_list_extensions**
  - Title: List installed Chrome extensions
  - Description: List all Chrome extensions currently installed in the browser session. Only works with Chromium browser.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_list_injections**
  - Title: List Injections
  - Description: List all active code injections for the current session
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_list_notifications**
  - Title: List browser notifications
  - Description: List all notifications that have been shown during this browser session. Returns notification details including title, body, origin, and status.
  - Parameters:
    - `origin` (string, optional): Filter notifications by origin URL
    - `includeHandled` (boolean, optional): Include notifications that have been clicked or closed (default: true)
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mcp_theme_create**
  - Title: Create custom MCP theme
  - Description: Create a new custom theme for MCP client identification
  - Parameters:
    - `id` (string): Unique theme identifier
    - `name` (string): Human-readable theme name
    - `description` (string): Theme description
    - `baseTheme` (string, optional): Base theme to extend
    - `variables` (object, optional): CSS custom properties to override
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mcp_theme_get**
  - Title: Get current MCP theme
  - Description: Get details about the currently active MCP theme
  - Parameters:
    - `includeVariables` (boolean, optional): Include CSS variables in response
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mcp_theme_list**
  - Title: List MCP themes
  - Description: List all available MCP client identification themes
  - Parameters:
    - `filter` (string, optional): Filter themes by type
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mcp_theme_reset**
  - Title: Reset MCP theme
  - Description: Reset MCP client identification to default minimal theme
  - Parameters:
    - `clearStorage` (boolean, optional): Clear stored theme preferences
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mcp_theme_set**
  - Title: Set MCP theme
  - Description: Apply a theme to the MCP client identification toolbar
  - Parameters:
    - `themeId` (string): Theme identifier to apply
    - `persist` (boolean, optional): Whether to persist theme preference
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_navigate**
  - Title: Navigate to a URL
  - Description: Navigate to a URL. Returns page snapshot after navigation (configurable via browser_configure_snapshots).
  - Parameters:
    - `url` (string): The URL to navigate to
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_navigate_back**
  - Title: Go back
  - Description: Go back to the previous page
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_navigate_forward**
  - Title: Go forward
  - Description: Go forward to the next page
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_network_requests**
  - Title: List network requests
  - Description: Returns all network requests since loading the page. For more detailed analysis including timing, headers, and bodies, use the advanced request monitoring tools (browser_start_request_monitoring, browser_get_requests).
  - Parameters:
    - `detailed` (boolean, optional): Show detailed request information if request monitoring is active
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_pause_recording**
  - Title: Pause video recording
  - Description: Manually pause the current video recording to eliminate dead time between actions. Useful for creating professional demo videos. In smart recording mode, pausing happens automatically during waits. Use browser_resume_recording to continue recording.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_press_key**
  - Title: Press a key
  - Description: Press a key on the keyboard. Returns page snapshot after keypress (configurable via browser_configure_snapshots).
  - Parameters:
    - `key` (string): Name of the key to press or a character to generate, such as `ArrowLeft` or `a`
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_recording_status**
  - Title: Get video recording status
  - Description: Check if video recording is currently enabled and get recording details. Use this to verify recording is active before performing actions, or to check output directory and settings.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_request_monitoring_status**
  - Title: Get request monitoring status
  - Description: Check if request monitoring is active and view current configuration. Shows capture statistics, filter settings, and output paths.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_resize**
  - Title: Resize browser window
  - Description: Resize the browser window
  - Parameters:
    - `width` (number): Width of the browser window
    - `height` (number): Height of the browser window
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_resume_recording**
  - Title: Resume video recording
  - Description: Manually resume previously paused video recording. New video segments will capture subsequent browser actions. In smart recording mode, resuming happens automatically when browser actions begin. Useful for precise control over recording timing in demo videos.
  - Parameters: None
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_reveal_artifact_paths**
  - Title: Reveal artifact storage paths
  - Description: Show where artifacts (videos, screenshots, etc.) are stored, including resolved absolute paths. Useful for debugging when you cannot find generated files.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_select_option**
  - Title: Select option
  - Description: Select an option in a dropdown. Returns page snapshot after selection (configurable via browser_configure_snapshots).
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string): Exact target element reference from the page snapshot
    - `values` (array): Array of values to select in the dropdown. This can be a single value or multiple values.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_set_device_motion**
  - Title: Set device motion sensors
  - Description: Override accelerometer and gyroscope sensor values. Affects the DeviceMotionEvent API.

**Acceleration** (m/s²): Linear acceleration excluding gravity
- x: left(-) to right(+)
- y: down(-) to up(+)
- z: backward(-) to forward(+)

**Acceleration Including Gravity** (m/s²): Total acceleration including gravity
- At rest: { x: 0, y: -9.8, z: 0 } (Earth's gravity pulling down)

**Rotation Rate** (deg/s): Angular velocity around each axis
- alpha: rotation around z-axis
- beta: rotation around x-axis
- gamma: rotation around y-axis

**Common scenarios:**
- Device at rest: acceleration={x:0,y:0,z:0}, accelerationIncludingGravity={x:0,y:-9.8,z:0}
- Shaking horizontally: acceleration={x:5,y:0,z:0}
- Free fall: accelerationIncludingGravity={x:0,y:0,z:0}

**Note:** Requires Chromium-based browser.
  - Parameters:
    - `acceleration` (object, optional): Linear acceleration excluding gravity
    - `accelerationIncludingGravity` (object, optional): Total acceleration including gravity
    - `rotationRate` (object, optional): Angular velocity around each axis
    - `interval` (number, optional): Interval between samples in milliseconds (default: 16)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_set_device_orientation**
  - Title: Set device orientation
  - Description: Override device orientation sensor values. Affects the DeviceOrientationEvent API.

**Parameters:**
- **alpha** (0-360): Rotation around the z-axis (compass heading). 0 = North, 90 = East
- **beta** (-180 to 180): Front-to-back tilt. Positive = tilted backward
- **gamma** (-90 to 90): Left-to-right tilt. Positive = tilted right

**Common orientations:**
- Flat on table: alpha=any, beta=0, gamma=0
- Portrait upright: alpha=any, beta=90, gamma=0
- Landscape left: alpha=any, beta=0, gamma=90
- Tilted 45° forward: alpha=any, beta=-45, gamma=0

**Note:** Requires Chromium-based browser. This overrides the DeviceOrientationEvent.
  - Parameters:
    - `alpha` (number): Compass heading (0-360 degrees). 0=North, 90=East, 180=South, 270=West
    - `beta` (number): Front-to-back tilt (-180 to 180 degrees). Positive=tilted backward
    - `gamma` (number): Left-to-right tilt (-90 to 90 degrees). Positive=tilted right
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_set_geolocation**
  - Title: Set geolocation at runtime
  - Description: Set the browser's geolocation at runtime without restarting. Automatically grants geolocation permission.
  - Parameters:
    - `latitude` (number): Latitude coordinate (-90 to 90)
    - `longitude` (number): Longitude coordinate (-180 to 180)
    - `accuracy` (number, optional): Accuracy in meters (default: 100)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_set_offline**
  - Title: Set browser offline mode
  - Description: Toggle browser offline mode on/off (equivalent to DevTools offline checkbox)
  - Parameters:
    - `offline` (boolean): Whether to enable offline mode (true) or online mode (false)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_set_recording_mode**
  - Title: Set video recording mode
  - Description: Configure intelligent video recording behavior for professional demo videos. Choose from continuous recording, smart auto-pause/resume, action-only capture, or segmented recording. Smart mode is recommended for marketing demos as it eliminates dead time automatically.
  - Parameters:
    - `mode` (string): Video recording behavior mode:
• continuous: Record everything continuously including waits (traditional behavior, may have dead time)
• smart: Automatically pause during waits, resume during actions (RECOMMENDED for clean demo videos)
• action-only: Only record during active browser interactions, minimal recording time
• segment: Create separate video files for each action sequence (useful for splitting demos into clips)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_snapshot**
  - Title: Page snapshot
  - Description: Capture complete accessibility snapshot of the current page. Always returns full snapshot regardless of session snapshot configuration. Better than screenshot for understanding page structure.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_start_recording**
  - Title: Start video recording
  - Description: Start recording browser session video with intelligent viewport matching. For best results, the browser viewport size should match the video recording size to avoid gray space around content. Use browser_configure to set viewport size before recording.
  - Parameters:
    - `size` (object, optional): Video recording dimensions. IMPORTANT: Browser viewport should match these dimensions to avoid gray borders around content.
    - `filename` (string, optional): Base filename for video files (default: session-{timestamp}.webm)
    - `autoSetViewport` (boolean, optional): Automatically set browser viewport to match video recording size (recommended for full-frame content)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_start_request_monitoring**
  - Title: Start request monitoring
  - Description: Enable comprehensive HTTP request/response interception and analysis. Captures headers, bodies, timing, and failure information for all browser traffic. Essential for security testing, API analysis, and performance debugging.
  - Parameters:
    - `urlFilter` (optional): Filter URLs to capture. Can be a string (contains match), regex pattern, or custom function. Examples: "/api/", ".*\.json$", or custom logic
    - `captureBody` (boolean, optional): Whether to capture request and response bodies (default: true)
    - `maxBodySize` (number, optional): Maximum body size to capture in bytes (default: 10MB). Larger bodies will be truncated
    - `autoSave` (boolean, optional): Automatically save captured requests after each response (default: false for performance)
    - `outputPath` (string, optional): Custom output directory path. If not specified, uses session artifact directory
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_status**
  - Title: Get browser status and capabilities
  - Description: Get current browser configuration status including mode (isolated/persistent), profile path, and available capabilities like Push API support.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_stop_recording**
  - Title: Stop video recording
  - Description: Finalize video recording session and return paths to all recorded video files (.webm format). Automatically closes browser pages to ensure videos are properly saved and available for use. Essential final step for completing video recording workflows and accessing demo files.
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_take_screenshot**
  - Title: Take a screenshot
  - Description: Take a screenshot of the current page. Images exceeding 8000 pixels in either dimension will be rejected unless allowLargeImages=true. You can't perform actions based on the screenshot, use browser_snapshot for actions.
  - Parameters:
    - `raw` (boolean, optional): Whether to return without compression (in PNG format). Default is false, which returns a JPEG image.
    - `filename` (string, optional): File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.
    - `element` (string, optional): Human-readable element description used to obtain permission to screenshot the element. If not provided, the screenshot will be taken of viewport. If element is provided, ref must be provided too.
    - `ref` (string, optional): Exact target element reference from the page snapshot. If not provided, the screenshot will be taken of viewport. If ref is provided, element must be provided too.
    - `fullPage` (boolean, optional): When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots. WARNING: Full page screenshots may exceed API size limits on long pages.
    - `allowLargeImages` (boolean, optional): Allow images with dimensions exceeding 8000 pixels (API limit). Default false - will error if image is too large to prevent API failures.
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_type**
  - Title: Type text
  - Description: Type text into editable element. Returns page snapshot after typing (configurable via browser_configure_snapshots).
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string): Exact target element reference from the page snapshot
    - `text` (string): Text to type into the element
    - `submit` (boolean, optional): Whether to submit entered text (press Enter after)
    - `slowly` (boolean, optional): Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_uninstall_extension**
  - Title: Uninstall Chrome extension
  - Description: Uninstall a Chrome extension from the current browser session. Only works with Chromium browser.
  - Parameters:
    - `path` (string): Path to the Chrome extension directory to uninstall
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_wait_for**
  - Title: Wait for
  - Description: Wait for text to appear or disappear or a specified time to pass. In smart recording mode, video recording is automatically paused during waits unless recordDuringWait is true.
  - Parameters:
    - `time` (number, optional): The time to wait in seconds
    - `text` (string, optional): The text to wait for
    - `textGone` (string, optional): The text to wait for to disappear
    - `recordDuringWait` (boolean, optional): Whether to keep video recording active during the wait (default: false in smart mode, true in continuous mode)
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_wait_notification**
  - Title: Wait for a notification
  - Description: Wait for a browser notification to appear, optionally matching specific criteria. Returns when a matching notification is shown or timeout is reached.
  - Parameters:
    - `title` (string, optional): Wait for notification with this exact title
    - `titleContains` (string, optional): Wait for notification with title containing this text
    - `origin` (string, optional): Wait for notification from this origin
    - `timeout` (number, optional): Maximum time to wait in milliseconds (default: 30000)
  - Read-only: **true**

</details>

<details>
<summary><b>Tab management</b></summary>

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_tab_close**
  - Title: Close a tab
  - Description: Close a tab. Returns page snapshot after closing tab (configurable via browser_configure_snapshots).
  - Parameters:
    - `index` (number, optional): The index of the tab to close. Closes current tab if not provided.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_tab_list**
  - Title: List tabs
  - Description: List browser tabs
  - Parameters: None
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_tab_new**
  - Title: Open a new tab
  - Description: Open a new tab. Returns page snapshot after opening tab (configurable via browser_configure_snapshots).
  - Parameters:
    - `url` (string, optional): The URL to navigate to in the new tab. If not provided, the new tab will be blank.
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_tab_select**
  - Title: Select a tab
  - Description: Select a tab by index. Returns page snapshot after selecting tab (configurable via browser_configure_snapshots).
  - Parameters:
    - `index` (number): The index of the tab to select
  - Read-only: **true**

</details>

<details>
<summary><b>Browser installation</b></summary>

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_install**
  - Title: Install the browser specified in the config
  - Description: Install the browser specified in the config. Call this if you get an error about the browser not being installed.
  - Parameters: None
  - Read-only: **false**

</details>

<details>
<summary><b>Coordinate-based (opt-in via --caps=vision)</b></summary>

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_click_xy**
  - Title: Click
  - Description: Click mouse button at a given position with advanced options
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `x` (number): X coordinate
    - `y` (number): Y coordinate
    - `precision` (string, optional): Coordinate precision level
    - `delay` (number, optional): Delay in milliseconds before action
    - `button` (string, optional): Mouse button to click
    - `clickCount` (number, optional): Number of clicks (1=single, 2=double, 3=triple)
    - `holdTime` (number, optional): How long to hold button down in milliseconds
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_drag_xy**
  - Title: Drag mouse
  - Description: Drag mouse button from start to end position with advanced drag patterns
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `startX` (number): Start X coordinate
    - `startY` (number): Start Y coordinate
    - `endX` (number): End X coordinate
    - `endY` (number): End Y coordinate
    - `button` (string, optional): Mouse button to drag with
    - `precision` (string, optional): Coordinate precision level
    - `pattern` (string, optional): Drag movement pattern
    - `steps` (number, optional): Number of intermediate steps for smooth/bezier patterns
    - `duration` (number, optional): Total drag duration in milliseconds
    - `delay` (number, optional): Delay before starting drag
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_gesture_xy**
  - Title: Mouse gesture
  - Description: Perform complex mouse gestures with multiple waypoints
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `points` (array): Array of points defining the gesture path
    - `button` (string, optional): Mouse button for click actions
    - `precision` (string, optional): Coordinate precision level
    - `smoothPath` (boolean, optional): Smooth the path between points
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_move_xy**
  - Title: Move mouse
  - Description: Move mouse to a given position with optional precision and timing control
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `x` (number): X coordinate
    - `y` (number): Y coordinate
    - `precision` (string, optional): Coordinate precision level
    - `delay` (number, optional): Delay in milliseconds before action
  - Read-only: **true**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_scroll_xy**
  - Title: Scroll at coordinates
  - Description: Perform scroll action at specific coordinates with precision control
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `x` (number): X coordinate
    - `y` (number): Y coordinate
    - `precision` (string, optional): Coordinate precision level
    - `delay` (number, optional): Delay in milliseconds before action
    - `deltaX` (number, optional): Horizontal scroll amount (positive = right, negative = left)
    - `deltaY` (number): Vertical scroll amount (positive = down, negative = up)
    - `smooth` (boolean, optional): Use smooth scrolling animation
  - Read-only: **false**

</details>

<details>
<summary><b>PDF generation (opt-in via --caps=pdf)</b></summary>

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_pdf_save**
  - Title: Save as PDF
  - Description: Save page as PDF
  - Parameters:
    - `filename` (string, optional): File name to save the pdf to. Defaults to `page-{timestamp}.pdf` if not specified.
  - Read-only: **true**

</details>


<!--- End of tools generated section -->
