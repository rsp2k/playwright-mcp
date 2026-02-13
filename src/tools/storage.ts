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
 * Get all cookies for the current browser context.
 * Uses browserContext.cookies() to retrieve cookie data.
 */
const getCookies = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_get_cookies',
    title: 'Get browser cookies',
    description: 'List all cookies for the current browser context. Optionally filter by domain or URL.',
    inputSchema: z.object({
      urls: z.array(z.string()).optional().describe('Filter cookies by specific URLs. If not provided, returns all cookies.'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    const cookies = params.urls && params.urls.length > 0
      ? await browserContext.cookies(params.urls)
      : await browserContext.cookies();

    if (cookies.length === 0) {
      response.addResult('No cookies found.');
      return;
    }

    const result = ['### Browser Cookies', ''];
    for (const cookie of cookies) {
      result.push(`- **${cookie.name}**`);
      result.push(`  - Value: \`${cookie.value.substring(0, 100)}${cookie.value.length > 100 ? '...' : ''}\``);
      result.push(`  - Domain: ${cookie.domain}`);
      result.push(`  - Path: ${cookie.path}`);
      result.push(`  - Expires: ${cookie.expires === -1 ? 'Session' : new Date(cookie.expires * 1000).toISOString()}`);
      result.push(`  - HttpOnly: ${cookie.httpOnly}`);
      result.push(`  - Secure: ${cookie.secure}`);
      result.push(`  - SameSite: ${cookie.sameSite}`);
      result.push('');
    }

    result.push(`**Total:** ${cookies.length} cookie(s)`);
    response.addResult(result.join('\n'));
  },
});

/**
 * Set a cookie in the browser context.
 * Uses browserContext.addCookies() to add cookie data.
 */
const setCookie = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_set_cookie',
    title: 'Set a browser cookie',
    description: 'Set a cookie with specified name, value, and optional attributes. Requires either url or domain+path.',
    inputSchema: z.object({
      name: z.string().describe('Cookie name'),
      value: z.string().describe('Cookie value'),
      url: z.string().optional().describe('URL to associate with the cookie. Either url or domain must be specified.'),
      domain: z.string().optional().describe('Cookie domain. Either url or domain must be specified.'),
      path: z.string().optional().describe('Cookie path (default: "/")'),
      expires: z.coerce.number().optional().describe('Unix timestamp in seconds for cookie expiration. -1 for session cookie.'),
      httpOnly: z.boolean().optional().describe('Whether the cookie is HTTP only (default: false)'),
      secure: z.boolean().optional().describe('Whether the cookie is secure (default: false)'),
      sameSite: z.enum(['Strict', 'Lax', 'None']).optional().describe('SameSite attribute (default: "Lax")'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    if (!params.url && !params.domain)
      throw new Error('Either "url" or "domain" must be specified.');

    const cookie: {
      name: string;
      value: string;
      url?: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    } = {
      name: params.name,
      value: params.value,
    };

    if (params.url)
      cookie.url = params.url;
    if (params.domain)
      cookie.domain = params.domain;
    if (params.path)
      cookie.path = params.path;
    if (params.expires !== undefined)
      cookie.expires = params.expires;
    if (params.httpOnly !== undefined)
      cookie.httpOnly = params.httpOnly;
    if (params.secure !== undefined)
      cookie.secure = params.secure;
    if (params.sameSite)
      cookie.sameSite = params.sameSite;

    await browserContext.addCookies([cookie]);

    const location = params.url || `${params.domain}${params.path || '/'}`;
    response.addResult(`Cookie "${params.name}" set successfully for ${location}`);
  },
});

/**
 * Delete cookies from the browser context.
 * Uses browserContext.clearCookies() with optional filters.
 */
const deleteCookies = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_delete_cookies',
    title: 'Delete browser cookies',
    description: 'Delete cookies by name, domain, or path. If no filters provided, clears all cookies.',
    inputSchema: z.object({
      name: z.string().optional().describe('Delete cookies with this name'),
      domain: z.string().optional().describe('Delete cookies for this domain'),
      path: z.string().optional().describe('Delete cookies with this path'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const browserContext = await context.existingBrowserContext();
    if (!browserContext)
      throw new Error('No browser context available. Navigate to a page first.');

    const hasFilters = params.name || params.domain || params.path;

    if (hasFilters) {
      // Build filter object for clearCookies
      const filter: { name?: string; domain?: string; path?: string } = {};
      if (params.name)
        filter.name = params.name;
      if (params.domain)
        filter.domain = params.domain;
      if (params.path)
        filter.path = params.path;

      await browserContext.clearCookies(filter);

      const filterParts: string[] = [];
      if (params.name)
        filterParts.push(`name="${params.name}"`);
      if (params.domain)
        filterParts.push(`domain="${params.domain}"`);
      if (params.path)
        filterParts.push(`path="${params.path}"`);

      response.addResult(`Cookies deleted matching: ${filterParts.join(', ')}`);
    } else {
      await browserContext.clearCookies();
      response.addResult('All cookies have been cleared.');
    }
  },
});

/**
 * Get localStorage or sessionStorage contents.
 * Uses page.evaluate() to access web storage APIs.
 */
const getStorage = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_get_storage',
    title: 'Get web storage contents',
    description: 'Get all key-value pairs from localStorage or sessionStorage for the current page.',
    inputSchema: z.object({
      type: z.enum(['local', 'session']).describe('Storage type: "local" for localStorage, "session" for sessionStorage'),
      key: z.string().optional().describe('Get a specific key value instead of all items'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const storageType = params.type === 'local' ? 'localStorage' : 'sessionStorage';

    if (params.key) {
      // Get a specific key
      const value = await tab.page.evaluate(
        ([type, key]) => {
          const storage = type === 'local' ? localStorage : sessionStorage;
          return storage.getItem(key);
        },
        [params.type, params.key] as const
      );

      if (value === null) {
        response.addResult(`Key "${params.key}" not found in ${storageType}.`);
      } else {
        response.addResult(`**${storageType}["${params.key}"]:**\n\`\`\`\n${value}\n\`\`\``);
      }
      return;
    }

    // Get all items
    const items = await tab.page.evaluate(
      (type) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        const result: Record<string, string> = {};
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key !== null)
            result[key] = storage.getItem(key) || '';
        }
        return result;
      },
      params.type
    );

    const keys = Object.keys(items);
    if (keys.length === 0) {
      response.addResult(`${storageType} is empty.`);
      return;
    }

    const result = [`### ${storageType} Contents`, ''];
    for (const key of keys) {
      const value = items[key];
      const truncatedValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
      result.push(`- **${key}:**`);
      result.push(`  \`\`\`${truncatedValue}\`\`\``);
      result.push('');
    }

    result.push(`**Total:** ${keys.length} item(s)`);
    response.addResult(result.join('\n'));
  },
});

/**
 * Set a key-value pair in localStorage or sessionStorage.
 * Uses page.evaluate() to access web storage APIs.
 */
const setStorage = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_set_storage',
    title: 'Set web storage item',
    description: 'Set a key-value pair in localStorage or sessionStorage for the current page.',
    inputSchema: z.object({
      type: z.enum(['local', 'session']).describe('Storage type: "local" for localStorage, "session" for sessionStorage'),
      key: z.string().describe('Storage key'),
      value: z.string().describe('Storage value (will be stored as string)'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const storageType = params.type === 'local' ? 'localStorage' : 'sessionStorage';

    await tab.page.evaluate(
      ([type, key, value]) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        storage.setItem(key, value);
      },
      [params.type, params.key, params.value] as const
    );

    response.addResult(`Set ${storageType}["${params.key}"] successfully.`);
  },
});

/**
 * Clear localStorage, sessionStorage, or both.
 * Uses page.evaluate() to access web storage APIs.
 */
const clearStorage = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_storage',
    title: 'Clear web storage',
    description: 'Clear localStorage, sessionStorage, or both for the current page.',
    inputSchema: z.object({
      type: z.enum(['local', 'session', 'both']).describe('Storage type to clear: "local", "session", or "both"'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const clearLocal = params.type === 'local' || params.type === 'both';
    const clearSession = params.type === 'session' || params.type === 'both';

    await tab.page.evaluate(
      ([doLocal, doSession]) => {
        if (doLocal)
          localStorage.clear();
        if (doSession)
          sessionStorage.clear();
      },
      [clearLocal, clearSession] as const
    );

    if (params.type === 'both') {
      response.addResult('Both localStorage and sessionStorage have been cleared.');
    } else {
      const storageType = params.type === 'local' ? 'localStorage' : 'sessionStorage';
      response.addResult(`${storageType} has been cleared.`);
    }
  },
});

export default [
  getCookies,
  setCookie,
  deleteCookies,
  getStorage,
  setStorage,
  clearStorage,
];
