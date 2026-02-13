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
import { defineTool, defineTabTool } from './tool.js';

/**
 * Configure notification permissions for specific origins.
 * Uses browserContext.grantPermissions() to grant or deny notification access.
 */
const configureNotifications = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_configure_notifications',
    title: 'Configure notification permissions',
    description: 'Grant or deny notification permissions for specific origins. This controls whether websites can show browser notifications.',
    inputSchema: z.object({
      origins: z.array(z.object({
        origin: z.string().describe('Origin URL to configure (e.g., "https://example.com")'),
        permission: z.enum(['granted', 'denied']).describe('Permission to set: "granted" allows notifications, "denied" blocks them'),
      })).describe('List of origins and their notification permissions'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    const results: string[] = [];

    for (const { origin, permission } of params.origins) {
      if (permission === 'granted') {
        await browserContext.grantPermissions(['notifications'], { origin });
        results.push(`Granted notification permission to ${origin}`);
      } else {
        // Playwright doesn't have a direct "deny" - we clear permissions instead
        await browserContext.clearPermissions();
        results.push(`Cleared permissions for ${origin} (notifications denied by default)`);
      }
    }

    response.addResult(results.join('\n'));
  },
});

/**
 * List all captured notifications from the current session.
 */
const listNotifications = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_list_notifications',
    title: 'List browser notifications',
    description: 'List all notifications that have been shown during this browser session. Returns notification details including title, body, origin, and status.',
    inputSchema: z.object({
      origin: z.string().optional().describe('Filter notifications by origin URL'),
      includeHandled: z.boolean().optional().describe('Include notifications that have been clicked or closed (default: true)'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    let notifications = context.notifications();

    // Filter by origin if specified
    if (params.origin) {
      const originFilter = params.origin.toLowerCase();
      notifications = notifications.filter(n => n.origin.toLowerCase().includes(originFilter));
    }

    // Filter out handled notifications unless requested
    if (params.includeHandled === false)
      notifications = notifications.filter(n => !n.clicked && !n.closed);

    if (notifications.length === 0) {
      response.addResult('No notifications captured.');
      return;
    }

    const result = ['### Browser Notifications', ''];
    for (const notif of notifications) {
      const status = notif.clicked ? ' (clicked)' : notif.closed ? ' (closed)' : '';
      const hostname = new URL(notif.origin).hostname;
      result.push(`- **${notif.title}**${status}`);
      result.push(`  - ID: \`${notif.id}\``);
      result.push(`  - Body: ${notif.body || '(empty)'}`);
      result.push(`  - Origin: ${hostname}`);
      result.push(`  - Time: ${new Date(notif.timestamp).toISOString()}`);
      if (notif.actions && notif.actions.length > 0)
        result.push(`  - Actions: ${notif.actions.map(a => a.title).join(', ')}`);
      result.push('');
    }

    response.addResult(result.join('\n'));
  },
});

/**
 * Handle a notification by clicking or closing it.
 */
const handleNotification = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_handle_notification',
    title: 'Handle a browser notification',
    description: 'Click or close a browser notification. Use browser_list_notifications to see available notifications and their IDs.',
    inputSchema: z.object({
      notificationId: z.string().describe('The notification ID to handle (from browser_list_notifications)'),
      action: z.enum(['click', 'close']).describe('Action to take: "click" simulates clicking the notification, "close" dismisses it'),
      actionButton: z.string().optional().describe('For notifications with action buttons, specify which action to click'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const notification = tab.getNotification(params.notificationId);
    if (!notification)
      throw new Error(`Notification with ID "${params.notificationId}" not found. Use browser_list_notifications to see available notifications.`);

    if (notification.clicked || notification.closed)
      throw new Error(`Notification "${params.notificationId}" has already been handled.`);

    if (params.action === 'click') {
      tab.markNotificationClicked(params.notificationId);
      response.addResult(`Clicked notification "${notification.title}"`);
    } else {
      tab.markNotificationClosed(params.notificationId);
      response.addResult(`Closed notification "${notification.title}"`);
    }

    response.setIncludeSnapshot();
  },

  clearsModalState: 'notification',
});

/**
 * Wait for a notification to appear matching specified criteria.
 */
const waitForNotification = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_wait_notification',
    title: 'Wait for a notification',
    description: 'Wait for a browser notification to appear, optionally matching specific criteria. Returns when a matching notification is shown or timeout is reached.',
    inputSchema: z.object({
      title: z.string().optional().describe('Wait for notification with this exact title'),
      titleContains: z.string().optional().describe('Wait for notification with title containing this text'),
      origin: z.string().optional().describe('Wait for notification from this origin'),
      timeout: z.coerce.number().optional().describe('Maximum time to wait in milliseconds (default: 30000)'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const timeout = params.timeout || 30000;
    const startTime = Date.now();
    const pollInterval = 500;

    const matches = (notif: { title: string; origin: string; clicked?: boolean; closed?: boolean }) => {
      if (notif.clicked || notif.closed)
        return false;
      if (params.title && notif.title !== params.title)
        return false;
      if (params.titleContains && !notif.title.includes(params.titleContains))
        return false;
      if (params.origin && !notif.origin.includes(params.origin))
        return false;
      return true;
    };

    // Check existing notifications first
    let notification = tab.notifications().find(matches);
    if (notification) {
      response.addResult(`Found existing notification: "${notification.title}" (ID: ${notification.id})`);
      return;
    }

    // Poll for new notifications
    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      notification = tab.notifications().find(matches);
      if (notification) {
        response.addResult(`Notification received: "${notification.title}" (ID: ${notification.id})`);
        return;
      }
    }

    throw new Error(`Timeout waiting for notification after ${timeout}ms`);
  },
});

/**
 * Clear all captured notifications.
 */
const clearNotifications = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_notifications',
    title: 'Clear notification history',
    description: 'Clear all captured notifications from the session history.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const count = context.notifications().length;
    context.clearNotifications();

    // Also clear from all tabs
    for (const tab of context.tabs())
      tab.clearNotifications();

    response.addResult(`Cleared ${count} notification(s) from history.`);
  },
});

// All commonly-used permissions that can be granted
const ALL_PERMISSIONS = [
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'clipboard-read',
  'clipboard-write',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'midi',
  'background-sync',
  'ambient-light-sensor',
  'accessibility-events',
];

/**
 * Grant permissions at runtime without restarting the browser.
 * More flexible than browser_configure which requires a restart.
 */
const grantPermissions = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_grant_permissions',
    title: 'Grant browser permissions at runtime',
    description: `Grant browser permissions at runtime without restarting the browser. This is faster than using browser_configure which requires a browser restart.

**Quick option:** Use \`all: true\` to grant all common permissions at once!

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

**Note:** Some permissions may require user interaction (like camera/microphone device selection) even after being granted.`,
    inputSchema: z.object({
      permissions: z.array(z.string()).optional().describe('List of permissions to grant (e.g., ["geolocation", "camera", "microphone"])'),
      all: z.boolean().optional().describe('Grant ALL common permissions at once (geolocation, notifications, camera, microphone, clipboard, sensors, midi)'),
      origin: z.string().optional().describe('Origin to grant permissions for (e.g., "https://example.com"). If not specified, grants for all origins.'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    // Determine which permissions to grant
    let permissionsToGrant: string[];
    if (params.all) {
      permissionsToGrant = ALL_PERMISSIONS;
    } else if (params.permissions && params.permissions.length > 0) {
      permissionsToGrant = params.permissions;
    } else {
      throw new Error('Either specify "permissions" array or set "all: true" to grant all permissions.');
    }

    const grantOptions = params.origin ? { origin: params.origin } : undefined;

    await browserContext.grantPermissions(permissionsToGrant, grantOptions);

    const scope = params.origin ? `for ${params.origin}` : 'for all origins';
    const header = params.all ? '✅ Granted ALL permissions' : '✅ Granted permissions';
    response.addResult(`${header} ${scope}:\n${permissionsToGrant.map(p => `  • ${p}`).join('\n')}`);
  },
});

/**
 * Clear all granted permissions.
 */
const clearPermissions = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_permissions',
    title: 'Clear all browser permissions',
    description: 'Revoke all previously granted permissions for the current browser context. Sites will need to request permissions again.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context, _params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    await browserContext.clearPermissions();

    response.addResult('✅ All permissions have been cleared. Sites will need to request permissions again.');
  },
});

/**
 * Set geolocation at runtime.
 */
const setGeolocation = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_set_geolocation',
    title: 'Set geolocation at runtime',
    description: 'Set the browser\'s geolocation at runtime without restarting. Automatically grants geolocation permission.',
    inputSchema: z.object({
      latitude: z.coerce.number().min(-90).max(90).describe('Latitude coordinate (-90 to 90)'),
      longitude: z.coerce.number().min(-180).max(180).describe('Longitude coordinate (-180 to 180)'),
      accuracy: z.coerce.number().optional().describe('Accuracy in meters (default: 100)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    // Grant geolocation permission first
    await browserContext.grantPermissions(['geolocation']);

    // Set the geolocation
    await browserContext.setGeolocation({
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: params.accuracy || 100,
    });

    response.addResult(`✅ Geolocation set to:\n  • Latitude: ${params.latitude}\n  • Longitude: ${params.longitude}\n  • Accuracy: ${params.accuracy || 100}m\n\nGeolocation permission has been automatically granted.`);
  },
});

export default [
  configureNotifications,
  listNotifications,
  handleNotification,
  waitForNotification,
  clearNotifications,
  grantPermissions,
  clearPermissions,
  setGeolocation,
];
