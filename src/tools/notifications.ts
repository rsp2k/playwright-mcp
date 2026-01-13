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
      timeout: z.number().optional().describe('Maximum time to wait in milliseconds (default: 30000)'),
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

export default [
  configureNotifications,
  listNotifications,
  handleNotification,
  waitForNotification,
  clearNotifications,
];
