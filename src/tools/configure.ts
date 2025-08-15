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
  permissions: z.array(z.string()).optional().describe('Permissions to grant (e.g., ["geolocation", "notifications", "camera", "microphone"])')
});

const listDevicesSchema = z.object({});

const configureArtifactsSchema = z.object({
  enabled: z.boolean().optional().describe('Enable or disable centralized artifact storage for this session'),
  directory: z.string().optional().describe('Directory path for artifact storage (if different from server default)'),
  sessionId: z.string().optional().describe('Custom session ID for artifact organization (auto-generated if not provided)')
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
];
