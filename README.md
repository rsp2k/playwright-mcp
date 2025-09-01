## Playwright MCP

A Model Context Protocol (MCP) server that provides browser automation capabilities using [Playwright](https://playwright.dev). This server enables LLMs to interact with web pages through structured accessibility snapshots, bypassing the need for screenshots or visually-tuned models.

### Key Features

- **Fast and lightweight**. Uses Playwright's accessibility tree, not pixel-based input.
- **LLM-friendly**. No vision models needed, operates purely on structured data.
- **Deterministic tool application**. Avoids ambiguity common with screenshot-based approaches.

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
                                  save it to disk.
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

- **browser_configure_snapshots**
  - Title: Configure snapshot behavior
  - Description: Configure how page snapshots are handled during the session. Control automatic snapshots, size limits, and differential modes. Changes take effect immediately for subsequent tool calls.
  - Parameters:
    - `includeSnapshots` (boolean, optional): Enable/disable automatic snapshots after interactive operations. When false, use browser_snapshot for explicit snapshots.
    - `maxSnapshotTokens` (number, optional): Maximum tokens allowed in snapshots before truncation. Use 0 to disable truncation.
    - `differentialSnapshots` (boolean, optional): Enable differential snapshots that show only changes since last snapshot instead of full page snapshots.
    - `consoleOutputFile` (string, optional): File path to write browser console output to. Set to empty string to disable console file output.
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_console_messages**
  - Title: Get console messages
  - Description: Returns all console messages
  - Parameters: None
  - Read-only: **true**

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

- **browser_evaluate**
  - Title: Evaluate JavaScript
  - Description: Evaluate JavaScript expression on page or element. Returns page snapshot after evaluation (configurable via browser_configure_snapshots).
  - Parameters:
    - `function` (string): () => { /* code */ } or (element) => { /* code */ } when element is provided
    - `element` (string, optional): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string, optional): Exact target element reference from the page snapshot
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_file_upload**
  - Title: Upload files
  - Description: Upload one or multiple files. Returns page snapshot after upload (configurable via browser_configure_snapshots).
  - Parameters:
    - `paths` (array): The absolute paths to the files to upload. Can be a single file or multiple files.
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

- **browser_hover**
  - Title: Hover mouse
  - Description: Hover over element on page. Returns page snapshot after hover (configurable via browser_configure_snapshots).
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `ref` (string): Exact target element reference from the page snapshot
  - Read-only: **true**

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
  - Description: Returns all network requests since loading the page
  - Parameters: None
  - Read-only: **true**

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

- **browser_resize**
  - Title: Resize browser window
  - Description: Resize the browser window
  - Parameters:
    - `width` (number): Width of the browser window
    - `height` (number): Height of the browser window
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

- **browser_set_offline**
  - Title: Set browser offline mode
  - Description: Toggle browser offline mode on/off (equivalent to DevTools offline checkbox)
  - Parameters:
    - `offline` (boolean): Whether to enable offline mode (true) or online mode (false)
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
  - Description: Start recording browser session video. This must be called BEFORE performing browser actions you want to record. New browser contexts will be created with video recording enabled. Videos are automatically saved when pages/contexts close.
  - Parameters:
    - `size` (object, optional): Video recording size
    - `filename` (string, optional): Base filename for video files (default: session-{timestamp}.webm)
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_stop_recording**
  - Title: Stop video recording
  - Description: Stop video recording and return the paths to recorded video files. This closes all active pages to ensure videos are properly saved. Call this when you want to finalize and access the recorded videos.
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
    - `fullPage` (boolean, optional): When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots.
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
  - Description: Wait for text to appear or disappear or a specified time to pass. Returns page snapshot after waiting (configurable via browser_configure_snapshots).
  - Parameters:
    - `time` (number, optional): The time to wait in seconds
    - `text` (string, optional): The text to wait for
    - `textGone` (string, optional): The text to wait for to disappear
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
  - Description: Click left mouse button at a given position
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `x` (number): X coordinate
    - `y` (number): Y coordinate
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_drag_xy**
  - Title: Drag mouse
  - Description: Drag left mouse button to a given position
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `startX` (number): Start X coordinate
    - `startY` (number): Start Y coordinate
    - `endX` (number): End X coordinate
    - `endY` (number): End Y coordinate
  - Read-only: **false**

<!-- NOTE: This has been generated via update-readme.js -->

- **browser_mouse_move_xy**
  - Title: Move mouse
  - Description: Move mouse to a given position
  - Parameters:
    - `element` (string): Human-readable element description used to obtain permission to interact with the element
    - `x` (number): X coordinate
    - `y` (number): Y coordinate
  - Read-only: **true**

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
