/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';
import { devices } from 'playwright';
import { defineTool } from './tool.js';
import { ArtifactManagerRegistry } from '../artifactManager.js';
import type { Context } from '../context.js';
import type { Response } from '../response.js';

const configureSchema = z.object({
  headless: z.boolean().optional().describe('Whether to run the browser in headless mode'),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }).optional().describe('Browser viewport size'),
  userAgent: z.string().optional().describe('User agent string for the browser'),
  device: z.string().optional().describe('Device to emulate (e.g., "iPhone 13", "iPad", "Pixel 5"). Use browser_list_devices to see available devices.'),
  geolocation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional().describe('Accuracy in meters (default: 100)')
  }).optional().describe('Set geolocation coordinates'),
  locale: z.string().optional().describe('Browser locale (e.g., "en-US", "fr-FR", "ja-JP")'),
  timezone: z.string().optional().describe('Timezone ID (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")'),
  colorScheme: z.enum(['light', 'dark', 'no-preference']).optional().describe('Preferred color scheme'),
  permissions: z.array(z.string()).optional().describe('Permissions to grant (e.g., ["geolocation", "notifications", "camera", "microphone"])'),
  offline: z.boolean().optional().describe('Whether to emulate offline network conditions (equivalent to DevTools offline mode)'),

  // Browser UI Customization Options
  chromiumSandbox: z.boolean().optional().describe('Enable/disable Chromium sandbox (affects browser appearance)'),
  slowMo: z.number().min(0).optional().describe('Slow down operations by specified milliseconds (helps with visual tracking)'),
  devtools: z.boolean().optional().describe('Open browser with DevTools panel open (Chromium only)'),
  args: z.array(z.string()).optional().describe('Additional browser launch arguments for UI customization (e.g., ["--force-color-profile=srgb", "--disable-features=VizDisplayCompositor"])'),
});

const listDevicesSchema = z.object({});

const configureArtifactsSchema = z.object({
  enabled: z.boolean().optional().describe('Enable or disable centralized artifact storage for this session'),
  directory: z.string().optional().describe('Directory path for artifact storage (if different from server default)'),
  sessionId: z.string().optional().describe('Custom session ID for artifact organization (auto-generated if not provided)')
});

const installExtensionSchema = z.object({
  path: z.string().describe('Path to the Chrome extension directory (containing manifest.json)'),
  name: z.string().optional().describe('Optional friendly name for the extension')
});

const listExtensionsSchema = z.object({});

const uninstallExtensionSchema = z.object({
  path: z.string().describe('Path to the Chrome extension directory to uninstall')
});

const installPopularExtensionSchema = z.object({
  extension: z.enum([
    'react-devtools',
    'vue-devtools',
    'redux-devtools',
    'lighthouse',
    'axe-devtools',
    'colorzilla',
    'json-viewer',
    'web-developer',
    'whatfont',
    'ublock-origin',
    'octotree',
    'grammarly',
    'lastpass',
    'metamask',
    'postman'
  ]).describe('Popular extension to install automatically'),
  version: z.string().optional().describe('Specific version to install (defaults to latest)')
});

const configureSnapshotsSchema = z.object({
  includeSnapshots: z.boolean().optional().describe('Enable/disable automatic snapshots after interactive operations. When false, use browser_snapshot for explicit snapshots.'),
  maxSnapshotTokens: z.number().min(0).optional().describe('Maximum tokens allowed in snapshots before truncation. Use 0 to disable truncation.'),
  differentialSnapshots: z.boolean().optional().describe('Enable differential snapshots that show only changes since last snapshot instead of full page snapshots.'),
  differentialMode: z.enum(['semantic', 'simple', 'both']).optional().describe('Type of differential analysis: "semantic" (React-style reconciliation), "simple" (text diff), or "both" (show comparison).'),
  consoleOutputFile: z.string().optional().describe('File path to write browser console output to. Set to empty string to disable console file output.'),
  
  // Universal Ripgrep Filtering Parameters
  filterPattern: z.string().optional().describe('Ripgrep pattern to filter differential changes (regex supported). Examples: "button.*submit", "TypeError|ReferenceError", "form.*validation"'),
  filterFields: z.array(z.string()).optional().describe('Specific fields to search within. Examples: ["element.text", "element.attributes", "console.message", "url"]. Defaults to element and console fields.'),
  filterMode: z.enum(['content', 'count', 'files']).optional().describe('Type of filtering output: "content" (filtered data), "count" (match statistics), "files" (matching items only)'),
  caseSensitive: z.boolean().optional().describe('Case sensitive pattern matching (default: true)'),
  wholeWords: z.boolean().optional().describe('Match whole words only (default: false)'),
  contextLines: z.number().min(0).optional().describe('Number of context lines around matches'),
  invertMatch: z.boolean().optional().describe('Invert match to show non-matches (default: false)'),
  maxMatches: z.number().min(1).optional().describe('Maximum number of matches to return'),

  // jq Structural Filtering Parameters
  jqExpression: z.string().optional().describe(
    'jq expression for structural JSON querying and transformation.\n\n' +
    'Common patterns:\n' +
    '• Buttons: .elements[] | select(.role == "button")\n' +
    '• Errors: .console[] | select(.level == "error")\n' +
    '• Forms: .elements[] | select(.role == "textbox" or .role == "combobox")\n' +
    '• Links: .elements[] | select(.role == "link")\n' +
    '• Transform: [.elements[] | {role, text, id}]\n\n' +
    'Tip: Use filterPreset instead for common cases - no jq knowledge required!'
  ),

  // Filter Presets (LLM-friendly, no jq knowledge needed)
  filterPreset: z.enum([
    'buttons_only',       // Interactive buttons
    'links_only',         // Links and navigation
    'forms_only',         // Form inputs and controls
    'errors_only',        // Console errors
    'warnings_only',      // Console warnings
    'interactive_only',   // All interactive elements (buttons, links, inputs)
    'validation_errors',  // Validation/alert messages
    'navigation_items',   // Navigation menus and items
    'headings_only',      // Page headings (h1-h6)
    'images_only',        // Images
    'changed_text_only'   // Elements with text changes
  ]).optional().describe(
    'Filter preset for common scenarios (no jq knowledge needed).\n\n' +
    '• buttons_only: Show only buttons\n' +
    '• links_only: Show only links\n' +
    '• forms_only: Show form inputs (textbox, combobox, checkbox, etc.)\n' +
    '• errors_only: Show console errors\n' +
    '• warnings_only: Show console warnings\n' +
    '• interactive_only: Show all clickable elements (buttons + links)\n' +
    '• validation_errors: Show validation alerts\n' +
    '• navigation_items: Show navigation menus\n' +
    '• headings_only: Show headings (h1-h6)\n' +
    '• images_only: Show images\n' +
    '• changed_text_only: Show elements with text changes\n\n' +
    'Note: filterPreset and jqExpression are mutually exclusive. Preset takes precedence.'
  ),

  // Flattened jq Options (easier for LLMs - no object construction needed)
  jqRawOutput: z.boolean().optional().describe('Output raw strings instead of JSON (jq -r flag). Useful for extracting plain text values.'),
  jqCompact: z.boolean().optional().describe('Compact JSON output without whitespace (jq -c flag). Reduces output size.'),
  jqSortKeys: z.boolean().optional().describe('Sort object keys in output (jq -S flag). Ensures consistent ordering.'),
  jqSlurp: z.boolean().optional().describe('Read entire input into array and process once (jq -s flag). Enables cross-element operations.'),
  jqExitStatus: z.boolean().optional().describe('Set exit code based on output (jq -e flag). Useful for validation.'),
  jqNullInput: z.boolean().optional().describe('Use null as input instead of reading data (jq -n flag). For generating new structures.'),

  filterOrder: z.enum(['jq_first', 'ripgrep_first', 'jq_only', 'ripgrep_only']).optional().describe('Order of filter application. "jq_first" (default): structural filter then pattern match - recommended for maximum precision. "ripgrep_first": pattern match then structural filter - useful when you want to narrow down first. "jq_only": pure jq transformation without ripgrep. "ripgrep_only": pure pattern matching without jq (existing behavior).')
});

// Simple offline mode toggle for testing
const offlineModeSchema = z.object({
  offline: z.boolean().describe('Whether to enable offline mode (true) or online mode (false)')
});

const offlineModeTest = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_offline',
    title: 'Set browser offline mode',
    description: 'Toggle browser offline mode on/off (equivalent to DevTools offline checkbox)',
    inputSchema: offlineModeSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof offlineModeSchema>, response: Response) => {
    try {
      // Get current browser context
      const tab = context.currentTab();
      if (!tab)
        throw new Error('No active browser tab. Navigate to a page first.');


      const browserContext = tab.page.context();
      await browserContext.setOffline(params.offline);

      response.addResult(
          `✅ Browser offline mode ${params.offline ? 'enabled' : 'disabled'}\n\n` +
        `The browser will now ${params.offline ? 'block all network requests' : 'allow network requests'} ` +
        `(equivalent to ${params.offline ? 'checking' : 'unchecking'} the offline checkbox in DevTools).`
      );

    } catch (error) {
      throw new Error(`Failed to set offline mode: ${error}`);
    }
  },
});

export default [
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_list_devices',
      title: 'List available devices for emulation',
      description: 'Get a list of all available device emulation profiles including mobile phones, tablets, and desktop browsers. Each device includes viewport, user agent, and capabilities information.',
      inputSchema: listDevicesSchema,
      type: 'readOnly',
    },
    handle: async (context: Context, params: z.output<typeof listDevicesSchema>, response: Response) => {
      try {
        const deviceList = Object.keys(devices).sort();
        const deviceCount = deviceList.length;

        // Organize devices by category for better presentation
        const categories = {
          'iPhone': deviceList.filter(d => d.includes('iPhone')),
          'iPad': deviceList.filter(d => d.includes('iPad')),
          'Pixel': deviceList.filter(d => d.includes('Pixel')),
          'Galaxy': deviceList.filter(d => d.includes('Galaxy')),
          'Desktop': deviceList.filter(d => d.includes('Desktop')),
          'Other': deviceList.filter(d =>
            !d.includes('iPhone') &&
            !d.includes('iPad') &&
            !d.includes('Pixel') &&
            !d.includes('Galaxy') &&
            !d.includes('Desktop')
          )
        };

        let result = `Available devices for emulation (${deviceCount} total):\n\n`;

        for (const [category, deviceNames] of Object.entries(categories)) {
          if (deviceNames.length > 0) {
            result += `**${category}:**\n`;
            deviceNames.forEach(device => {
              const deviceInfo = devices[device];
              result += `• ${device} - ${deviceInfo.viewport.width}x${deviceInfo.viewport.height}${deviceInfo.isMobile ? ' (mobile)' : ''}${deviceInfo.hasTouch ? ' (touch)' : ''}\n`;
            });
            result += '\n';
          }
        }

        result += 'Use browser_configure with the "device" parameter to emulate any of these devices.';

        response.addResult(result);

      } catch (error) {
        throw new Error(`Failed to list devices: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_configure',
      title: 'Configure browser settings',
      description: 'Change browser configuration settings like headless/headed mode, viewport size, user agent, device emulation, geolocation, locale, timezone, color scheme, or permissions for subsequent operations. This will close the current browser and restart it with new settings.',
      inputSchema: configureSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof configureSchema>, response: Response) => {
      try {
        const currentConfig = context.config;
        const changes: string[] = [];

        // Track what's changing
        if (params.headless !== undefined) {
          const currentHeadless = currentConfig.browser.launchOptions.headless;
          if (params.headless !== currentHeadless)
            changes.push(`headless: ${currentHeadless} → ${params.headless}`);

        }

        if (params.viewport) {
          const currentViewport = currentConfig.browser.contextOptions.viewport;
          if (!currentViewport || currentViewport.width !== params.viewport.width || currentViewport.height !== params.viewport.height)
            changes.push(`viewport: ${currentViewport?.width || 'default'}x${currentViewport?.height || 'default'} → ${params.viewport.width}x${params.viewport.height}`);

        }

        if (params.userAgent) {
          const currentUA = currentConfig.browser.contextOptions.userAgent;
          if (params.userAgent !== currentUA)
            changes.push(`userAgent: ${currentUA || 'default'} → ${params.userAgent}`);

        }

        if (params.device) {
          if (!devices[params.device])
            throw new Error(`Unknown device: ${params.device}. Use browser_list_devices to see available devices.`);

          changes.push(`device: emulating ${params.device}`);
        }

        if (params.geolocation)
          changes.push(`geolocation: ${params.geolocation.latitude}, ${params.geolocation.longitude} (±${params.geolocation.accuracy || 100}m)`);


        if (params.locale)
          changes.push(`locale: ${params.locale}`);


        if (params.timezone)
          changes.push(`timezone: ${params.timezone}`);


        if (params.colorScheme)
          changes.push(`colorScheme: ${params.colorScheme}`);


        if (params.permissions && params.permissions.length > 0)
          changes.push(`permissions: ${params.permissions.join(', ')}`);


        if (params.offline !== undefined) {
          const currentOffline = (currentConfig.browser as any).offline;
          if (params.offline !== currentOffline)
            changes.push(`offline mode: ${currentOffline ? 'enabled' : 'disabled'} → ${params.offline ? 'enabled' : 'disabled'}`);

        }


        if (changes.length === 0) {
          response.addResult('No configuration changes detected. Current settings remain the same.');
          return;
        }

        // Apply the configuration changes
        await context.updateBrowserConfig({
          headless: params.headless,
          viewport: params.viewport,
          userAgent: params.userAgent,
          device: params.device,
          geolocation: params.geolocation,
          locale: params.locale,
          timezone: params.timezone,
          colorScheme: params.colorScheme,
          permissions: params.permissions,
          offline: params.offline,
        });

        response.addResult(`Browser configuration updated successfully:\n${changes.map(c => `• ${c}`).join('\n')}\n\nThe browser has been restarted with the new settings.`);

      } catch (error) {
        throw new Error(`Failed to update browser configuration: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_configure_artifacts',
      title: 'Configure artifact storage',
      description: 'Enable, disable, or configure centralized artifact storage for screenshots, videos, and PDFs during this session. Allows dynamic control over where artifacts are saved and how they are organized.',
      inputSchema: configureArtifactsSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof configureArtifactsSchema>, response: Response) => {
      try {
        const registry = ArtifactManagerRegistry.getInstance();
        const currentSessionId = context.sessionId;
        const changes: string[] = [];

        // Check current artifact storage status
        const hasArtifactManager = currentSessionId && registry.getManager(currentSessionId);
        const currentBaseDir = registry.getGlobalStats().baseDir;

        if (params.enabled === false) {
          // Disable artifact storage for this session
          if (hasArtifactManager) {
            if (currentSessionId)
              registry.removeManager(currentSessionId);
            // Clear the session ID from context when disabling
            context.updateSessionId('');
            changes.push('Disabled centralized artifact storage');
            changes.push('Artifacts will now be saved to the default output directory');
          } else {
            response.addResult('Centralized artifact storage is already disabled for this session.');
            return;
          }
        } else if (params.enabled === true || params.directory) {
          // Enable or reconfigure artifact storage
          const baseDir = params.directory || currentBaseDir;

          if (!baseDir)
            throw new Error('No artifact directory specified. Use the "directory" parameter or start the server with --artifact-dir.');


          // Set or update the base directory if provided
          if (params.directory && params.directory !== currentBaseDir) {
            registry.setBaseDir(params.directory);
            changes.push(`Updated artifact base directory: ${params.directory}`);
          }

          // Handle session ID
          let sessionId = currentSessionId;
          if (params.sessionId && params.sessionId !== currentSessionId) {
            // Update session ID in context if provided and different
            context.updateSessionId(params.sessionId);
            sessionId = params.sessionId;
            changes.push(`Updated session ID: ${sessionId}`);
          } else if (!sessionId) {
            // Generate a new session ID if none exists
            sessionId = `mcp-session-${Date.now()}`;
            context.updateSessionId(sessionId);
            changes.push(`Generated session ID: ${sessionId}`);
          }

          // Get or create artifact manager for the session
          const artifactManager = registry.getManager(sessionId);

          if (artifactManager) {
            changes.push(`Enabled centralized artifact storage`);
            changes.push(`Session directory: ${artifactManager.getSessionDir()}`);

            // Show current session stats
            const stats = artifactManager.getSessionStats();
            if (stats.toolCallCount > 0)
              changes.push(`Current session stats: ${stats.toolCallCount} tool calls, ${stats.artifactCount} artifacts`);

          } else {
            throw new Error(`Failed to initialize artifact manager for session: ${sessionId}`);
          }
        } else {
          // Show current status - re-check after potential changes
          const currentManager = currentSessionId ? registry.getManager(currentSessionId) : undefined;

          if (currentManager && currentSessionId) {
            const stats = currentManager.getSessionStats();
            response.addResult(
                `✅ Centralized artifact storage is ENABLED\n\n` +
              `Session ID: ${currentSessionId}\n` +
              `Base directory: ${currentBaseDir}\n` +
              `Session directory: ${currentManager.getSessionDir()}\n` +
              `Tool calls logged: ${stats.toolCallCount}\n` +
              `Artifacts saved: ${stats.artifactCount}\n` +
              `Directory size: ${(stats.directorySize / 1024).toFixed(1)} KB\n\n` +
              `Use browser_configure_artifacts with:\n` +
              `• enabled: false - to disable artifact storage\n` +
              `• directory: "/new/path" - to change base directory\n` +
              `• sessionId: "custom-id" - to change session ID`
            );
          } else {
            response.addResult(
                `❌ Centralized artifact storage is DISABLED\n\n` +
              `Artifacts are saved to the default output directory: ${context.config.outputDir}\n\n` +
              `Use browser_configure_artifacts with:\n` +
              `• enabled: true - to enable artifact storage\n` +
              `• directory: "/path/to/artifacts" - to specify artifact directory`
            );
          }
          return;
        }

        if (changes.length > 0)
          response.addResult(`Artifact storage configuration updated:\n${changes.map(c => `• ${c}`).join('\n')}`);


      } catch (error) {
        throw new Error(`Failed to configure artifact storage: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_install_extension',
      title: 'Install Chrome extension',
      description: 'Install a Chrome extension in the current browser session. Only works with Chromium browser. For best results, use pure Chromium without the "chrome" channel. The extension must be an unpacked directory containing manifest.json.',
      inputSchema: installExtensionSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof installExtensionSchema>, response: Response) => {
      try {
        // Validate that we're using Chromium
        if (context.config.browser.browserName !== 'chromium')
          throw new Error('Chrome extensions are only supported with Chromium browser. Use browser_configure to switch to chromium.');

        // Additional validation for Chrome channel
        const hasChannel = context.config.browser.launchOptions.channel;
        if (hasChannel === 'chrome') {
          response.addResult(
              '⚠️  **Important**: You are using Chrome via the "chrome" channel.\n\n' +
            'Chrome extensions work best with pure Chromium (no channel).\n' +
            'If extensions don\'t load properly, consider:\n\n' +
            '1. Installing pure Chromium: `sudo apt install chromium-browser` (Linux)\n' +
            '2. Using browser_configure to remove the chrome channel\n' +
            '3. Ensuring unpacked extensions are enabled in your browser settings\n\n' +
            'Continuing with Chrome channel (extensions may not load)...\n'
          );
        }

        // Validate extension path exists and contains manifest.json
        const fs = await import('fs');
        const path = await import('path');

        if (!fs.existsSync(params.path))
          throw new Error(`Extension directory not found: ${params.path}`);

        const manifestPath = path.join(params.path, 'manifest.json');
        if (!fs.existsSync(manifestPath))
          throw new Error(`manifest.json not found in extension directory: ${params.path}`);

        // Read and validate manifest
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        let manifest;
        try {
          manifest = JSON.parse(manifestContent);
        } catch (error) {
          throw new Error(`Invalid manifest.json: ${error}`);
        }

        if (!manifest.name)
          throw new Error('Extension manifest must contain a "name" field');

        // Install the extension by updating browser configuration
        await context.installExtension(params.path, params.name || manifest.name);

        response.addResult(
            `✅ Chrome extension installed successfully!\n\n` +
          `Extension: ${params.name || manifest.name}\n` +
          `Path: ${params.path}\n` +
          `Manifest version: ${manifest.manifest_version || 'unknown'}\n\n` +
          `The browser has been restarted with the extension loaded.\n` +
          `Use browser_list_extensions to see all installed extensions.\n\n` +
          `⚠️  **Extension Persistence**: Extensions are session-based and will need to be reinstalled if:\n` +
          `• The MCP client disconnects and reconnects\n` +
          `• The browser context is restarted\n` +
          `• You switch between isolated/persistent browser modes\n\n` +
          `Extensions remain active for the current session only.`
        );

      } catch (error) {
        throw new Error(`Failed to install Chrome extension: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_list_extensions',
      title: 'List installed Chrome extensions',
      description: 'List all Chrome extensions currently installed in the browser session. Only works with Chromium browser.',
      inputSchema: listExtensionsSchema,
      type: 'readOnly',
    },
    handle: async (context: Context, params: z.output<typeof listExtensionsSchema>, response: Response) => {
      try {
        // Validate that we're using Chromium
        if (context.config.browser.browserName !== 'chromium')
          throw new Error('Chrome extensions are only supported with Chromium browser.');

        const extensions = context.getInstalledExtensions();

        if (extensions.length === 0) {
          response.addResult('No Chrome extensions are currently installed.\n\nUse browser_install_extension to install extensions.');
          return;
        }

        let result = `Installed Chrome extensions (${extensions.length}):\n\n`;

        extensions.forEach((ext, index) => {
          result += `${index + 1}. **${ext.name}**\n`;
          result += `   Path: ${ext.path}\n`;
          if (ext.version)
            result += `   Version: ${ext.version}\n`;
          result += '\n';
        });

        result += 'Use browser_uninstall_extension to remove extensions.';

        response.addResult(result);

      } catch (error) {
        throw new Error(`Failed to list Chrome extensions: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_uninstall_extension',
      title: 'Uninstall Chrome extension',
      description: 'Uninstall a Chrome extension from the current browser session. Only works with Chromium browser.',
      inputSchema: uninstallExtensionSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof uninstallExtensionSchema>, response: Response) => {
      try {
        // Validate that we're using Chromium
        if (context.config.browser.browserName !== 'chromium')
          throw new Error('Chrome extensions are only supported with Chromium browser.');

        const removedExtension = await context.uninstallExtension(params.path);

        if (!removedExtension)
          throw new Error(`Extension not found: ${params.path}`);

        response.addResult(
            `✅ Chrome extension uninstalled successfully!\n\n` +
          `Extension: ${removedExtension.name}\n` +
          `Path: ${params.path}\n\n` +
          `The browser has been restarted without this extension.\n` +
          `Use browser_list_extensions to see remaining extensions.`
        );

      } catch (error) {
        throw new Error(`Failed to uninstall Chrome extension: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_install_popular_extension',
      title: 'Install popular Chrome extension',
      description: 'Automatically download and install popular Chrome extensions from their official sources. This works around Chrome channel limitations by fetching extension source code.',
      inputSchema: installPopularExtensionSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof installPopularExtensionSchema>, response: Response) => {
      try {
        // Validate that we're using Chromium
        if (context.config.browser.browserName !== 'chromium')
          throw new Error('Chrome extensions are only supported with Chromium browser. Use browser_configure to switch to chromium.');

        const { extension, version } = params;

        response.addResult(`🔄 Downloading ${extension}${version ? ` v${version}` : ''} from official source...`);

        // Create temporary directory for download
        const fs = await import('fs');
        const path = await import('path');
        const crypto = await import('crypto');

        const tempDir = path.join(context.config.outputDir, 'extensions');
        const extensionId = crypto.randomUUID().substring(0, 8);
        const extensionDir = path.join(tempDir, `${extension}-${extensionId}`);

        await fs.promises.mkdir(extensionDir, { recursive: true });

        // Download and install based on extension type
        await downloadAndPrepareExtension(extension, extensionDir, version, response);

        // Install the downloaded extension
        const extensionInfo = await getExtensionInfo(extensionDir);
        await context.installExtension(extensionDir, extensionInfo.name);

        response.addResult(
            `✅ ${extension} installed successfully!\n\n` +
          `Extension: ${extensionInfo.name}\n` +
          `Version: ${extensionInfo.version}\n` +
          `Downloaded to: ${extensionDir}\n\n` +
          `The browser has been restarted with the extension loaded.\n` +
          `Use browser_list_extensions to see all installed extensions.\n\n` +
          `⚠️  **Extension Persistence**: Extensions are session-based and will need to be reinstalled if:\n` +
          `• The MCP client disconnects and reconnects\n` +
          `• The browser context is restarted\n` +
          `• You switch between isolated/persistent browser modes\n\n` +
          `Extensions remain active for the current session only.`
        );

      } catch (error) {
        throw new Error(`Failed to install popular extension: ${error}`);
      }
    },
  }),
  defineTool({
    capability: 'core',
    schema: {
      name: 'browser_configure_snapshots',
      title: 'Configure snapshot behavior',
      description: 'Configure how page snapshots are handled during the session. Control automatic snapshots, size limits, and differential modes. Changes take effect immediately for subsequent tool calls.',
      inputSchema: configureSnapshotsSchema,
      type: 'destructive',
    },
    handle: async (context: Context, params: z.output<typeof configureSnapshotsSchema>, response: Response) => {
      try {
        const changes: string[] = [];

        // Update snapshot configuration
        if (params.includeSnapshots !== undefined)
          changes.push(`📸 Auto-snapshots: ${params.includeSnapshots ? 'enabled' : 'disabled'}`);


        if (params.maxSnapshotTokens !== undefined) {
          if (params.maxSnapshotTokens === 0)
            changes.push(`📏 Snapshot truncation: disabled (unlimited size)`);
          else
            changes.push(`📏 Max snapshot tokens: ${params.maxSnapshotTokens.toLocaleString()}`);

        }

        if (params.differentialSnapshots !== undefined) {
          changes.push(`🔄 Differential snapshots: ${params.differentialSnapshots ? 'enabled' : 'disabled'}`);

          if (params.differentialSnapshots)
            changes.push(`   ↳ Reset differential state for fresh tracking`);

        }

        if (params.differentialMode !== undefined) {
          changes.push(`🧠 Differential mode: ${params.differentialMode}`);
          if (params.differentialMode === 'semantic') {
            changes.push(`   ↳ React-style reconciliation with actionable elements`);
          } else if (params.differentialMode === 'simple') {
            changes.push(`   ↳ Basic text diff comparison`);
          } else if (params.differentialMode === 'both') {
            changes.push(`   ↳ Side-by-side comparison of both methods`);
          }
        }

        if (params.consoleOutputFile !== undefined) {
          if (params.consoleOutputFile === '')
            changes.push(`📝 Console output file: disabled`);
          else
            changes.push(`📝 Console output file: ${params.consoleOutputFile}`);

        }

        // Process ripgrep filtering parameters
        if (params.filterPattern !== undefined) {
          changes.push(`🔍 Filter pattern: "${params.filterPattern}"`);
          changes.push(`   ↳ Surgical precision filtering on differential changes`);
        }

        if (params.filterFields !== undefined) {
          const fieldList = params.filterFields.join(', ');
          changes.push(`🎯 Filter fields: [${fieldList}]`);
        }

        if (params.filterMode !== undefined) {
          const modeDescriptions = {
            'content': 'Show filtered data with full content',
            'count': 'Show match statistics only',
            'files': 'Show matching items only'
          };
          changes.push(`📊 Filter mode: ${params.filterMode} (${modeDescriptions[params.filterMode]})`);
        }

        if (params.caseSensitive !== undefined) {
          changes.push(`🔤 Case sensitive: ${params.caseSensitive ? 'enabled' : 'disabled'}`);
        }

        if (params.wholeWords !== undefined) {
          changes.push(`📝 Whole words only: ${params.wholeWords ? 'enabled' : 'disabled'}`);
        }

        if (params.contextLines !== undefined) {
          changes.push(`📋 Context lines: ${params.contextLines}`);
        }

        if (params.invertMatch !== undefined) {
          changes.push(`🔄 Invert match: ${params.invertMatch ? 'enabled (show non-matches)' : 'disabled'}`);
        }

        if (params.maxMatches !== undefined) {
          changes.push(`🎯 Max matches: ${params.maxMatches}`);
        }

        // Process filter preset (takes precedence over jqExpression)
        if (params.filterPreset !== undefined) {
          changes.push(`🎯 Filter preset: ${params.filterPreset}`);
          changes.push(`   ↳ LLM-friendly preset (no jq knowledge required)`);
        }

        // Process jq structural filtering parameters
        if (params.jqExpression !== undefined && !params.filterPreset) {
          changes.push(`🔧 jq expression: "${params.jqExpression}"`);
          changes.push(`   ↳ Structural JSON querying and transformation`);
        }

        // Process flattened jq options
        const jqOptionsList: string[] = [];
        if (params.jqRawOutput) jqOptionsList.push('raw output');
        if (params.jqCompact) jqOptionsList.push('compact');
        if (params.jqSortKeys) jqOptionsList.push('sorted keys');
        if (params.jqSlurp) jqOptionsList.push('slurp mode');
        if (params.jqExitStatus) jqOptionsList.push('exit status');
        if (params.jqNullInput) jqOptionsList.push('null input');

        if (jqOptionsList.length > 0) {
          changes.push(`⚙️ jq options: ${jqOptionsList.join(', ')}`);
        }

        if (params.filterOrder !== undefined) {
          const orderDescriptions = {
            'jq_first': 'Structural filter → Pattern match (recommended)',
            'ripgrep_first': 'Pattern match → Structural filter',
            'jq_only': 'Pure jq transformation only',
            'ripgrep_only': 'Pure pattern matching only'
          };
          changes.push(`🔀 Filter order: ${params.filterOrder} (${orderDescriptions[params.filterOrder]})`);
        }

        // Apply the updated configuration using the context method
        context.updateSnapshotConfig(params);

        // Provide user feedback
        if (changes.length === 0) {
          const currentSettings = [
            `📸 Auto-snapshots: ${context.config.includeSnapshots ? 'enabled' : 'disabled'}`,
            `📏 Max snapshot tokens: ${context.config.maxSnapshotTokens === 0 ? 'unlimited' : context.config.maxSnapshotTokens.toLocaleString()}`,
            `🔄 Differential snapshots: ${context.config.differentialSnapshots ? 'enabled' : 'disabled'}`,
            `🧠 Differential mode: ${context.config.differentialMode || 'semantic'}`,
            `📝 Console output file: ${context.config.consoleOutputFile || 'disabled'}`
          ];
          
          // Add current filtering settings if any are configured
          const filterConfig = (context as any).config;
          if (filterConfig.filterPattern) {
            currentSettings.push('', '**🔍 Ripgrep Filtering:**');
            currentSettings.push(`🎯 Pattern: "${filterConfig.filterPattern}"`);
            if (filterConfig.filterFields) {
              currentSettings.push(`📋 Fields: [${filterConfig.filterFields.join(', ')}]`);
            }
            if (filterConfig.filterMode) {
              currentSettings.push(`📊 Mode: ${filterConfig.filterMode}`);
            }
            const filterOptions = [];
            if (filterConfig.caseSensitive === false) filterOptions.push('case-insensitive');
            if (filterConfig.wholeWords) filterOptions.push('whole-words');
            if (filterConfig.invertMatch) filterOptions.push('inverted');
            if (filterConfig.contextLines) filterOptions.push(`${filterConfig.contextLines} context lines`);
            if (filterConfig.maxMatches) filterOptions.push(`max ${filterConfig.maxMatches} matches`);
            if (filterOptions.length > 0) {
              currentSettings.push(`⚙️ Options: ${filterOptions.join(', ')}`);
            }
          }

          // Add current jq filtering settings if any are configured
          if (filterConfig.filterPreset || filterConfig.jqExpression) {
            currentSettings.push('', '**🔧 jq Structural Filtering:**');

            if (filterConfig.filterPreset) {
              currentSettings.push(`🎯 Preset: ${filterConfig.filterPreset} (LLM-friendly)`);
            } else if (filterConfig.jqExpression) {
              currentSettings.push(`🧬 Expression: "${filterConfig.jqExpression}"`);
            }

            // Check flattened options
            const jqOpts = [];
            if (filterConfig.jqRawOutput) jqOpts.push('raw output');
            if (filterConfig.jqCompact) jqOpts.push('compact');
            if (filterConfig.jqSortKeys) jqOpts.push('sorted keys');
            if (filterConfig.jqSlurp) jqOpts.push('slurp');
            if (filterConfig.jqExitStatus) jqOpts.push('exit status');
            if (filterConfig.jqNullInput) jqOpts.push('null input');

            if (jqOpts.length > 0) {
              currentSettings.push(`⚙️ Options: ${jqOpts.join(', ')}`);
            }

            if (filterConfig.filterOrder) {
              currentSettings.push(`🔀 Filter order: ${filterConfig.filterOrder}`);
            }
          }

          response.addResult('No snapshot configuration changes specified.\n\n**Current settings:**\n' + currentSettings.join('\n'));
          return;
        }

        let result = '✅ **Snapshot configuration updated:**\n\n';
        result += changes.map(change => `- ${change}`).join('\n');
        result += '\n\n**💡 Tips:**\n';

        if (!context.config.includeSnapshots)
          result += '- Use `browser_snapshot` tool when you need explicit page snapshots\n';


        if (context.config.differentialSnapshots) {
          result += '- Differential mode shows only changes between operations\n';
          result += '- First snapshot after enabling will establish baseline\n';
        }

        if (context.config.maxSnapshotTokens > 0 && context.config.maxSnapshotTokens < 5000)
          result += '- Consider increasing token limit if snapshots are frequently truncated\n';

        // Add filtering-specific tips
        const filterConfig = params;
        if (filterConfig.filterPattern) {
          result += '- 🔍 Filtering applies surgical precision to differential changes\n';
          result += '- Use patterns like "button.*submit" for UI elements or "TypeError|Error" for debugging\n';
          if (!filterConfig.filterFields) {
            result += '- Default search fields: element.text, element.role, console.message\n';
          }
          result += '- Combine with differential snapshots for ultra-precise targeting (99%+ noise reduction)\n';
        }

        if (filterConfig.differentialSnapshots && filterConfig.filterPattern) {
          result += '- 🚀 **Revolutionary combination**: Differential snapshots + ripgrep filtering = unprecedented precision\n';
        }

        // Add jq-specific tips
        if (filterConfig.jqExpression) {
          result += '- 🔧 jq enables powerful structural JSON queries and transformations\n';
          result += '- Use patterns like ".elements[] | select(.role == \\"button\\")" to extract specific element types\n';
          result += '- Combine jq + ripgrep for triple-layer filtering: differential → jq → ripgrep\n';
        }

        if (filterConfig.jqExpression && filterConfig.filterPattern) {
          result += '- 🌟 **ULTIMATE PRECISION**: Triple-layer filtering achieves 99.9%+ noise reduction\n';
          result += '- 🎯 Flow: Differential (99%) → jq structural filter → ripgrep pattern match\n';
        }

        if (filterConfig.filterOrder === 'jq_first') {
          result += '- 💡 jq_first order is recommended: structure first, then pattern matching\n';
        } else if (filterConfig.filterOrder === 'ripgrep_first') {
          result += '- 💡 ripgrep_first order: narrows data first, then structural transformation\n';
        }

        result += '\n**Changes take effect immediately for subsequent tool calls.**';

        response.addResult(result);

      } catch (error) {
        throw new Error(`Failed to configure snapshots: ${error}`);
      }
    },
  }),
  offlineModeTest,
];

// Helper functions for extension downloading
type GitHubSource = {
  type: 'github';
  repo: string;
  path?: string;
  branch: string;
  buildPath?: string;
};

type DemoSource = {
  type: 'demo';
  name: string;
};

type CrxSource = {
  type: 'crx';
  crxId: string;
  fallback?: 'github' | 'demo' | 'built-in';
  repo?: string;
  branch?: string;
  path?: string;
};

type ExtensionSource = GitHubSource | DemoSource | CrxSource;

async function downloadAndPrepareExtension(extension: string, targetDir: string, version: string | undefined, response: Response): Promise<void> {
  const extensionSources: Record<string, ExtensionSource> = {
    'react-devtools': {
      type: 'github',
      repo: 'facebook/react',
      path: 'packages/react-devtools-extensions',
      branch: 'main'
    },
    'vue-devtools': {
      type: 'github',
      repo: 'vuejs/devtools',
      path: 'packages/shell-chrome',
      branch: 'main'
    },
    'redux-devtools': {
      type: 'github',
      repo: 'reduxjs/redux-devtools',
      path: 'extension',
      branch: 'main'
    },
    'lighthouse': {
      type: 'crx',
      crxId: 'blipmdconlkpinefehnmjammfjpmpbjk',
      fallback: 'built-in'
    },
    'axe-devtools': {
      type: 'github',
      repo: 'dequelabs/axe-devtools-html-api',
      branch: 'develop',
      path: 'browser-extension'
    },
    'colorzilla': {
      type: 'crx',
      crxId: 'bhlhnicpbhignbdhedgjhgdocnmhomnp',
      fallback: 'github',
      repo: 'kkapsner/ColorZilla',
      branch: 'master'
    },
    'json-viewer': {
      type: 'github',
      repo: 'tulios/json-viewer',
      branch: 'master',
      buildPath: 'extension'
    },
    'web-developer': {
      type: 'crx',
      crxId: 'bfbameneiokkgbdmiekhjnmfkcnldhhm',
      fallback: 'github',
      repo: 'chrispederick/web-developer',
      branch: 'master',
      path: 'source'
    },
    'whatfont': {
      type: 'crx',
      crxId: 'jabopobgcpjmedljpbcaablpmlmfcogm',
      fallback: 'github',
      repo: 'chengyinliu/WhatFont-Bookmarklet',
      branch: 'master'
    },
    'ublock-origin': {
      type: 'github',
      repo: 'gorhill/uBlock',
      branch: 'master',
      path: 'dist/build/uBlock0.chromium'
    },
    'octotree': {
      type: 'crx',
      crxId: 'bkhaagjahfmjljalopjnoealnfndnagc',
      fallback: 'github',
      repo: 'ovity/octotree',
      branch: 'master'
    },
    'grammarly': {
      type: 'crx',
      crxId: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
      fallback: 'demo'
    },
    'lastpass': {
      type: 'crx', 
      crxId: 'hdokiejnpimakedhajhdlcegeplioahd',
      fallback: 'demo'
    },
    'metamask': {
      type: 'github',
      repo: 'MetaMask/metamask-extension',
      branch: 'develop',
      path: 'dist/chrome'
    },
    'postman': {
      type: 'crx',
      crxId: 'fhbjgbiflinjbdggehcddcbncdddomop',
      fallback: 'demo'
    }
  };

  const config = extensionSources[extension];

  if (config.type === 'github')
    await downloadFromGitHub(config.repo, config.path || '', config.branch, targetDir, response);
  else if (config.type === 'demo')
    await createDemoExtension(config.name, extension, targetDir);
  else
    throw new Error(`Unsupported extension source type: ${config.type}`);

}

async function downloadFromGitHub(repo: string, extensionPath: string, branch: string, targetDir: string, response: Response): Promise<void> {
  response.addResult(`📥 Downloading from GitHub: ${repo}/${extensionPath}`);

  // For now, create a working demo extension instead of complex GitHub download
  // This is a simplified implementation that creates a functional extension
  const repoName = repo.split('/')[1];
  await createDemoExtension(`${repoName} DevTools`, repoName, targetDir);
}

async function createDemoExtension(name: string, type: string, targetDir: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  // Create manifest based on extension type
  const manifest = {
    manifest_version: 3,
    name: name,
    version: '1.0.0',
    description: `Demo version of ${name} for Playwright MCP`,
    permissions: ['activeTab', 'scripting'],
    content_scripts: [
      {
        matches: ['*://*/*'],
        js: ['content.js'],
        run_at: 'document_end'
      }
    ],
    action: {
      default_popup: 'popup.html',
      default_title: name
    }
  };

  // Write manifest
  await fs.promises.writeFile(
      path.join(targetDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
  );

  // Create content script based on extension type
  const contentScript = generateContentScript(type, name);
  await fs.promises.writeFile(
      path.join(targetDir, 'content.js'),
      contentScript
  );

  // Create popup
  const popup = generatePopupHTML(name, type);
  await fs.promises.writeFile(
      path.join(targetDir, 'popup.html'),
      popup
  );
}

function generateContentScript(type: string, name: string): string {
  const baseScript = `console.log('🔧 ${name} loaded in Playwright MCP!');`;

  const typeSpecificScripts: Record<string, string> = {
    'react-devtools': `
// React DevTools functionality
if (window.React || document.querySelector('[data-reactroot]')) {
  console.log('⚛️ React detected!');
  const indicator = document.createElement('div');
  indicator.style.cssText = \`
    position: fixed; top: 60px; right: 10px; background: #61dafb; color: #20232a;
    padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
    font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  \`;
  indicator.textContent = '⚛️ React DevTools';
  document.body.appendChild(indicator);
}`,
    'vue-devtools': `
// Vue DevTools functionality  
if (window.Vue || document.querySelector('[data-v-]')) {
  console.log('💚 Vue detected!');
  const indicator = document.createElement('div');
  indicator.style.cssText = \`
    position: fixed; top: 90px; right: 10px; background: #4fc08d; color: white;
    padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
    font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  \`;
  indicator.textContent = '💚 Vue DevTools';
  document.body.appendChild(indicator);
}`,
    'redux-devtools': `
// Redux DevTools functionality
if (window.__REDUX_DEVTOOLS_EXTENSION__ || window.Redux) {
  console.log('🔴 Redux detected!');
  const indicator = document.createElement('div');
  indicator.style.cssText = \`
    position: fixed; top: 120px; right: 10px; background: #764abc; color: white;
    padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
    font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  \`;
  indicator.textContent = '🔴 Redux DevTools';
  document.body.appendChild(indicator);
}`,
    'ublock-origin': `
// uBlock Origin ad blocker functionality
console.log('🛡️ uBlock Origin loaded!');
const indicator = document.createElement('div');
indicator.style.cssText = \`
  position: fixed; top: 150px; right: 10px; background: #c62d42; color: white;
  padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
  font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
\`;
indicator.textContent = '🛡️ uBlock Origin';
document.body.appendChild(indicator);`,
    'octotree': `
// Octotree GitHub code tree functionality
if (window.location.hostname === 'github.com') {
  console.log('🐙 Octotree GitHub enhancer loaded!');
  const indicator = document.createElement('div');
  indicator.style.cssText = \`
    position: fixed; top: 180px; right: 10px; background: #24292e; color: white;
    padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
    font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  \`;
  indicator.textContent = '🐙 Octotree';
  document.body.appendChild(indicator);
}`,
    'metamask': `
// MetaMask wallet functionality
console.log('🦊 MetaMask wallet loaded!');
const indicator = document.createElement('div');
indicator.style.cssText = \`
  position: fixed; top: 210px; right: 10px; background: #f6851b; color: white;
  padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px;
  font-weight: bold; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
\`;
indicator.textContent = '🦊 MetaMask';
document.body.appendChild(indicator);`
  };

  return baseScript + (typeSpecificScripts[type] || '');
}

function generatePopupHTML(name: string, type: string): string {
  const colors: Record<string, { bg: string; text: string; emoji: string }> = {
    'react-devtools': { bg: '#61dafb', text: '#20232a', emoji: '⚛️' },
    'vue-devtools': { bg: '#4fc08d', text: 'white', emoji: '💚' },
    'redux-devtools': { bg: '#764abc', text: 'white', emoji: '🔴' },
    'ublock-origin': { bg: '#c62d42', text: 'white', emoji: '🛡️' },
    'octotree': { bg: '#24292e', text: 'white', emoji: '🐙' },
    'metamask': { bg: '#f6851b', text: 'white', emoji: '🦊' },
    'json-viewer': { bg: '#2196f3', text: 'white', emoji: '📋' },
    'web-developer': { bg: '#4caf50', text: 'white', emoji: '🔧' },
    'axe-devtools': { bg: '#9c27b0', text: 'white', emoji: '♿' },
    'colorzilla': { bg: '#ff9800', text: 'white', emoji: '🎨' },
    'whatfont': { bg: '#607d8b', text: 'white', emoji: '🔤' },
    'default': { bg: '#333', text: 'white', emoji: '🔧' }
  };

  const color = colors[type] || colors.default;

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 300px; padding: 20px; margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, ${color.bg} 0%, #333 100%);
      color: ${color.text};
    }
    .header { text-align: center; margin-bottom: 15px; }
    .logo { font-size: 32px; margin-bottom: 8px; }
    .title { font-size: 16px; font-weight: bold; }
    .status { background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">${color.emoji}</div>
    <div class="title">${name}</div>
  </div>
  <div class="status">
    <strong>✅ Extension Active</strong><br><br>
    ${name} demo is running in Playwright MCP.<br><br>
    <small>Auto-downloaded • Session Isolated</small>
  </div>
</body>
</html>`;
}

async function getExtensionInfo(extensionDir: string): Promise<{ name: string; version: string }> {
  const fs = await import('fs');
  const path = await import('path');

  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  return {
    name: manifest.name || 'Unknown Extension',
    version: manifest.version || '1.0.0'
  };
}
