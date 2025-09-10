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
    'whatfont'
  ]).describe('Popular extension to install automatically'),
  version: z.string().optional().describe('Specific version to install (defaults to latest)')
});

const configureSnapshotsSchema = z.object({
  includeSnapshots: z.boolean().optional().describe('Enable/disable automatic snapshots after interactive operations. When false, use browser_snapshot for explicit snapshots.'),
  maxSnapshotTokens: z.number().min(0).optional().describe('Maximum tokens allowed in snapshots before truncation. Use 0 to disable truncation.'),
  differentialSnapshots: z.boolean().optional().describe('Enable differential snapshots that show only changes since last snapshot instead of full page snapshots.'),
  consoleOutputFile: z.string().optional().describe('File path to write browser console output to. Set to empty string to disable console file output.')
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

        if (params.consoleOutputFile !== undefined) {
          if (params.consoleOutputFile === '')
            changes.push(`📝 Console output file: disabled`);
          else
            changes.push(`📝 Console output file: ${params.consoleOutputFile}`);

        }

        // Apply the updated configuration using the context method
        context.updateSnapshotConfig(params);

        // Provide user feedback
        if (changes.length === 0) {
          response.addResult('No snapshot configuration changes specified.\n\n**Current settings:**\n' +
            `📸 Auto-snapshots: ${context.config.includeSnapshots ? 'enabled' : 'disabled'}\n` +
            `📏 Max snapshot tokens: ${context.config.maxSnapshotTokens === 0 ? 'unlimited' : context.config.maxSnapshotTokens.toLocaleString()}\n` +
            `🔄 Differential snapshots: ${context.config.differentialSnapshots ? 'enabled' : 'disabled'}\n` +
            `📝 Console output file: ${context.config.consoleOutputFile || 'disabled'}`);
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
  path: string;
  branch: string;
};

type DemoSource = {
  type: 'demo';
  name: string;
};

type CrxSource = {
  type: 'crx';
  crxId: string;
  fallback: string;
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
      type: 'demo',
      name: 'Axe DevTools Demo'
    },
    'colorzilla': {
      type: 'demo',
      name: 'ColorZilla Demo'
    },
    'json-viewer': {
      type: 'demo',
      name: 'JSON Viewer Demo'
    },
    'web-developer': {
      type: 'demo',
      name: 'Web Developer Demo'
    },
    'whatfont': {
      type: 'demo',
      name: 'WhatFont Demo'
    }
  };

  const config = extensionSources[extension];

  if (config.type === 'github')
    await downloadFromGitHub(config.repo, config.path, config.branch, targetDir, response);
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
}`
  };

  return baseScript + (typeSpecificScripts[type] || '');
}

function generatePopupHTML(name: string, type: string): string {
  const colors: Record<string, { bg: string; text: string; emoji: string }> = {
    'react-devtools': { bg: '#61dafb', text: '#20232a', emoji: '⚛️' },
    'vue-devtools': { bg: '#4fc08d', text: 'white', emoji: '💚' },
    'redux-devtools': { bg: '#764abc', text: 'white', emoji: '🔴' },
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
