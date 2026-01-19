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
import { defineTool } from './tool.js';

import type { Context } from '../context.js';
import type { Response } from '../response.js';

// Network condition type for mutable use
interface NetworkConditions {
  offline: boolean;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;
  connectionType: string;
  description: string;
}

// Network condition presets based on Chrome DevTools throttling profiles
const networkPresets: Record<string, NetworkConditions> = {
  'offline': {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none',
    description: 'No network connectivity - all requests will fail'
  },
  'slow-3g': {
    offline: false,
    latency: 2000,
    downloadThroughput: 50000,  // 50 KB/s (400 kbps)
    uploadThroughput: 50000,    // 50 KB/s (400 kbps)
    connectionType: 'cellular3g',
    description: 'Slow 3G: ~400 kbps, 2000ms latency - typical for poor mobile coverage'
  },
  'fast-3g': {
    offline: false,
    latency: 563,
    downloadThroughput: 180000,  // ~180 KB/s (1.44 Mbps)
    uploadThroughput: 84375,     // ~84 KB/s (675 kbps)
    connectionType: 'cellular3g',
    description: 'Fast 3G: ~1.5 Mbps down, 563ms latency - typical 3G connection'
  },
  'regular-4g': {
    offline: false,
    latency: 170,
    downloadThroughput: 1500000,  // ~1.5 MB/s (12 Mbps)
    uploadThroughput: 750000,     // ~750 KB/s (6 Mbps)
    connectionType: 'cellular4g',
    description: 'Regular 4G/LTE: ~12 Mbps down, 170ms latency - typical 4G connection'
  },
  'wifi': {
    offline: false,
    latency: 28,
    downloadThroughput: 3000000,  // ~3 MB/s (24 Mbps)
    uploadThroughput: 1500000,    // ~1.5 MB/s (12 Mbps)
    connectionType: 'wifi',
    description: 'WiFi: ~24 Mbps down, 28ms latency - typical home WiFi'
  },
  'no-throttle': {
    offline: false,
    latency: 0,
    downloadThroughput: -1,  // -1 means no throttling
    uploadThroughput: -1,
    connectionType: 'none',
    description: 'No throttling - use full network speed'
  }
};

type NetworkPreset = 'offline' | 'slow-3g' | 'fast-3g' | 'regular-4g' | 'wifi' | 'no-throttle';

// Store current network conditions per context
const currentNetworkConditions = new WeakMap<Context, {
  preset?: NetworkPreset;
  custom?: {
    offline: boolean;
    latency: number;
    downloadThroughput: number;
    uploadThroughput: number;
  };
}>();

const setNetworkConditionsSchema = z.object({
  preset: z.enum(['offline', 'slow-3g', 'fast-3g', 'regular-4g', 'wifi', 'no-throttle']).optional()
    .describe('Network condition preset. Use "offline" to block all requests, "slow-3g" for poor mobile, "fast-3g" for typical mobile, "regular-4g" for LTE, "wifi" for home WiFi, or "no-throttle" to remove throttling.'),
  downloadThroughput: z.number().min(-1).optional()
    .describe('Custom download speed in bytes/second. Use -1 for no throttling. Overrides preset if specified.'),
  uploadThroughput: z.number().min(-1).optional()
    .describe('Custom upload speed in bytes/second. Use -1 for no throttling. Overrides preset if specified.'),
  latency: z.number().min(0).optional()
    .describe('Custom latency in milliseconds to add to each request. Overrides preset if specified.'),
  offline: z.boolean().optional()
    .describe('Set to true to simulate offline mode. Overrides preset if specified.')
});

const getNetworkConditionsSchema = z.object({});

const clearNetworkConditionsSchema = z.object({});

const setNetworkConditions = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_network_conditions',
    title: 'Set network throttling conditions',
    description: `Simulate slow network conditions using Chrome DevTools Protocol. Choose from presets or specify custom values.

**Presets:**
- offline: Block all network requests
- slow-3g: ~400 kbps, 2s latency (poor mobile)
- fast-3g: ~1.5 Mbps, 563ms latency (typical 3G)
- regular-4g: ~12 Mbps, 170ms latency (LTE)
- wifi: ~24 Mbps, 28ms latency (home WiFi)
- no-throttle: Remove all throttling

**Note:** This feature requires a Chromium-based browser (Chrome, Edge). Firefox and WebKit are not supported.`,
    inputSchema: setNetworkConditionsSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof setNetworkConditionsSchema>, response: Response) => {
    const tab = context.currentTab();
    if (!tab)
      throw new Error('No active browser tab. Navigate to a page first.');

    // Check if we're using Chromium
    if (context.config.browser.browserName !== 'chromium')
      throw new Error('Network throttling requires a Chromium-based browser (Chrome, Edge). Firefox and WebKit do not support CDP network emulation.');

    // Validate that at least one parameter is provided
    if (!params.preset && params.downloadThroughput === undefined && params.uploadThroughput === undefined && params.latency === undefined && params.offline === undefined)
      throw new Error('Please specify a preset or at least one custom network condition (downloadThroughput, uploadThroughput, latency, or offline).');

    try {
      // Create CDP session
      const cdpSession = await tab.page.context().newCDPSession(tab.page);

      // Start with preset values if specified, otherwise use no-throttle as base
      let conditions = params.preset
        ? { ...networkPresets[params.preset] }
        : { ...networkPresets['no-throttle'] };

      // Override with any custom values
      if (params.offline !== undefined)
        conditions.offline = params.offline;
      if (params.latency !== undefined)
        conditions.latency = params.latency;
      if (params.downloadThroughput !== undefined)
        conditions.downloadThroughput = params.downloadThroughput;
      if (params.uploadThroughput !== undefined)
        conditions.uploadThroughput = params.uploadThroughput;

      // Apply network conditions via CDP
      // Cast connectionType to the expected CDP Protocol enum type
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: conditions.offline,
        latency: conditions.latency,
        downloadThroughput: conditions.downloadThroughput,
        uploadThroughput: conditions.uploadThroughput,
        connectionType: (conditions.connectionType || 'none') as 'none' | 'cellular2g' | 'cellular3g' | 'cellular4g' | 'bluetooth' | 'ethernet' | 'wifi' | 'wimax' | 'other'
      });

      // Store current conditions for later retrieval
      const conditionsToStore: {
        preset?: NetworkPreset;
        custom?: {
          offline: boolean;
          latency: number;
          downloadThroughput: number;
          uploadThroughput: number;
        };
      } = {};

      if (params.preset && !params.downloadThroughput && !params.uploadThroughput && !params.latency && params.offline === undefined) {
        conditionsToStore.preset = params.preset;
      } else {
        conditionsToStore.custom = {
          offline: conditions.offline,
          latency: conditions.latency,
          downloadThroughput: conditions.downloadThroughput,
          uploadThroughput: conditions.uploadThroughput
        };
        if (params.preset)
          conditionsToStore.preset = params.preset;
      }

      currentNetworkConditions.set(context, conditionsToStore);

      // Build response message
      const lines: string[] = [];

      if (conditions.offline) {
        lines.push('**Network Status:** OFFLINE');
        lines.push('All network requests will be blocked.');
      } else if (conditions.downloadThroughput === -1 && conditions.uploadThroughput === -1 && conditions.latency === 0) {
        lines.push('**Network Status:** No throttling');
        lines.push('Network requests will use full available bandwidth.');
      } else {
        lines.push('**Network Throttling Active**');
        lines.push('');

        if (params.preset) {
          const presetInfo = networkPresets[params.preset];
          lines.push(`Preset: **${params.preset}**`);
          lines.push(`${presetInfo.description}`);
          lines.push('');
        }

        lines.push('**Current Settings:**');
        lines.push(`- Download: ${formatThroughput(conditions.downloadThroughput)}`);
        lines.push(`- Upload: ${formatThroughput(conditions.uploadThroughput)}`);
        lines.push(`- Latency: ${conditions.latency}ms added to each request`);
      }

      response.addResult(lines.join('\n'));

    } catch (error) {
      if (error instanceof Error && error.message.includes('Target closed'))
        throw new Error('Browser connection lost. Please navigate to a page first.');
      throw new Error(`Failed to set network conditions: ${error}`);
    }
  },
});

const getNetworkConditions = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_get_network_conditions',
    title: 'Get current network throttling settings',
    description: 'Get the current network throttling configuration. Returns preset name if using a preset, or custom values if manually configured.',
    inputSchema: getNetworkConditionsSchema,
    type: 'readOnly',
  },
  handle: async (context: Context, _params: z.output<typeof getNetworkConditionsSchema>, response: Response) => {
    const tab = context.currentTab();
    if (!tab)
      throw new Error('No active browser tab. Navigate to a page first.');

    // Check if we're using Chromium
    if (context.config.browser.browserName !== 'chromium') {
      response.addResult('Network throttling is only available for Chromium-based browsers (Chrome, Edge).\n\nCurrent browser: ' + context.config.browser.browserName);
      return;
    }

    const conditions = currentNetworkConditions.get(context);

    if (!conditions) {
      response.addResult(
        '**Network Throttling:** Not configured\n\n' +
        'Network requests are using full available bandwidth.\n\n' +
        'Use `browser_set_network_conditions` to simulate slow network conditions.'
      );
      return;
    }

    const lines: string[] = ['**Current Network Conditions:**', ''];

    if (conditions.preset) {
      const presetInfo = networkPresets[conditions.preset];
      lines.push(`Preset: **${conditions.preset}**`);
      lines.push(`${presetInfo.description}`);
      lines.push('');
    }

    if (conditions.custom) {
      if (conditions.custom.offline) {
        lines.push('**Status:** OFFLINE');
        lines.push('All network requests are being blocked.');
      } else {
        lines.push('**Settings:**');
        lines.push(`- Download: ${formatThroughput(conditions.custom.downloadThroughput)}`);
        lines.push(`- Upload: ${formatThroughput(conditions.custom.uploadThroughput)}`);
        lines.push(`- Latency: ${conditions.custom.latency}ms`);
      }
    } else if (conditions.preset) {
      const preset = networkPresets[conditions.preset];
      if (preset.offline) {
        lines.push('**Status:** OFFLINE');
      } else if (preset.downloadThroughput === -1) {
        lines.push('**Status:** No throttling');
      } else {
        lines.push('**Settings:**');
        lines.push(`- Download: ${formatThroughput(preset.downloadThroughput)}`);
        lines.push(`- Upload: ${formatThroughput(preset.uploadThroughput)}`);
        lines.push(`- Latency: ${preset.latency}ms`);
      }
    }

    response.addResult(lines.join('\n'));
  },
});

const clearNetworkConditions = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_clear_network_conditions',
    title: 'Remove network throttling',
    description: 'Remove all network throttling and restore full network speed. Equivalent to setting preset "no-throttle".',
    inputSchema: clearNetworkConditionsSchema,
    type: 'destructive',
  },
  handle: async (context: Context, _params: z.output<typeof clearNetworkConditionsSchema>, response: Response) => {
    const tab = context.currentTab();
    if (!tab)
      throw new Error('No active browser tab. Navigate to a page first.');

    // Check if we're using Chromium
    if (context.config.browser.browserName !== 'chromium')
      throw new Error('Network throttling requires a Chromium-based browser (Chrome, Edge).');

    try {
      // Create CDP session and disable throttling
      const cdpSession = await tab.page.context().newCDPSession(tab.page);

      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: 'none'
      });

      // Clear stored conditions
      currentNetworkConditions.delete(context);

      response.addResult(
        '**Network Throttling Removed**\n\n' +
        'Network requests will now use full available bandwidth.\n\n' +
        'Use `browser_set_network_conditions` to re-enable throttling.'
      );

    } catch (error) {
      if (error instanceof Error && error.message.includes('Target closed'))
        throw new Error('Browser connection lost. Please navigate to a page first.');
      throw new Error(`Failed to clear network conditions: ${error}`);
    }
  },
});

/**
 * Format throughput value for display
 */
function formatThroughput(bytesPerSecond: number): string {
  if (bytesPerSecond === -1)
    return 'No limit';
  if (bytesPerSecond === 0)
    return 'Blocked';

  if (bytesPerSecond >= 1000000)
    return `${(bytesPerSecond / 1000000).toFixed(1)} MB/s (${(bytesPerSecond * 8 / 1000000).toFixed(1)} Mbps)`;

  if (bytesPerSecond >= 1000)
    return `${(bytesPerSecond / 1000).toFixed(1)} KB/s (${(bytesPerSecond * 8 / 1000).toFixed(1)} kbps)`;

  return `${bytesPerSecond} B/s`;
}

export default [
  setNetworkConditions,
  getNetworkConditions,
  clearNetworkConditions,
];
