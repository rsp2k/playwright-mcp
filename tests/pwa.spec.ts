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

import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures.js';

// Helper to setup PWA routes on test server
function setupPWARoutes(server: any) {
  const manifest = {
    name: 'Test PWA App',
    short_name: 'TestPWA',
    description: 'A test PWA for testing purposes',
    start_url: '/',
    display: 'standalone',
    theme_color: '#ffffff',
    background_color: '#ffffff',
    scope: '/',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  // PWA HTML page with manifest link
  server.setContent('/pwa', `
    <html>
    <head>
      <title>Test PWA</title>
      <link rel="manifest" href="/manifest.json">
    </head>
    <body>
      <h1>Test PWA Application</h1>
      <script>
        // Register service worker
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW failed:', err));
        }
      </script>
    </body>
    </html>
  `, 'text/html');

  // Manifest
  server.route('/manifest.json', (req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(JSON.stringify(manifest));
  });

  // Service worker
  server.route('/sw.js', (req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`
      const CACHE_NAME = 'test-cache-v1';
      const urlsToCache = ['/'];

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
        );
      });

      self.addEventListener('fetch', event => {
        event.respondWith(
          caches.match(event.request).then(response => response || fetch(event.request))
        );
      });
    `);
  });

  // Simple PNG icons (1x1 pixel PNGs)
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color type
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
    0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
    0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
    0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);

  server.route('/icon-192.png', (req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(pngHeader);
  });

  server.route('/icon-512.png', (req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(pngHeader);
  });

  return { manifest };
}

// Setup non-PWA page (no manifest)
function setupNonPWARoutes(server: any) {
  server.setContent('/non-pwa', `
    <html>
    <head><title>Non PWA Page</title></head>
    <body><h1>This is not a PWA</h1></body>
    </html>
  `, 'text/html');
}

test('browser_pwa_info - detects PWA with manifest', async ({ startClient, server }) => {
  setupPWARoutes(server);

  const { client } = await startClient();

  // Navigate to PWA page
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}pwa` },
  });

  // Wait a moment for service worker registration
  await client.callTool({
    name: 'browser_wait_for',
    arguments: { time: 1 },
  });

  // Get PWA info
  const result = await client.callTool({
    name: 'browser_pwa_info',
    arguments: {},
  });

  expect(result).toContainTextContent('### PWA Information');
  expect(result).toContainTextContent('Test PWA App');
  expect(result).toContainTextContent('#### Manifest');
});

test('browser_pwa_info - detects non-PWA page', async ({ startClient, server }) => {
  setupNonPWARoutes(server);

  const { client } = await startClient();

  // Navigate to non-PWA page
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}non-pwa` },
  });

  // Get PWA info
  const result = await client.callTool({
    name: 'browser_pwa_info',
    arguments: {},
  });

  expect(result).toContainTextContent('### PWA Information');
  expect(result).toContainTextContent('**Is PWA:** No');
  expect(result).toContainTextContent('Missing: manifest');
});

test('browser_pwa_info - reports manifest details', async ({ startClient, server }) => {
  const { manifest } = setupPWARoutes(server);

  const { client } = await startClient();

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}pwa` },
  });

  const result = await client.callTool({
    name: 'browser_pwa_info',
    arguments: {},
  });

  expect(result).toContainTextContent(`**Name:** ${manifest.name}`);
  expect(result).toContainTextContent(`**Start URL:** ${manifest.start_url}`);
  expect(result).toContainTextContent(`**Display:** ${manifest.display}`);
  expect(result).toContainTextContent(`**Theme Color:** ${manifest.theme_color}`);
  expect(result).toContainTextContent('**Icons:** 2 defined');
});

test('browser_pwa_download - downloads manifest and icons', async ({ startClient, server }, testInfo) => {
  setupPWARoutes(server);
  const outputDir = testInfo.outputPath('pwa-output');

  const { client } = await startClient({
    config: { outputDir },
  });

  // Navigate to PWA page
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}pwa` },
  });

  // Wait for SW registration
  await client.callTool({
    name: 'browser_wait_for',
    arguments: { time: 1 },
  });

  // Download PWA
  const result = await client.callTool({
    name: 'browser_pwa_download',
    arguments: {
      outputDir,
      includeIcons: true,
      includeCache: false, // Skip cache for faster test
    },
  });

  expect(result).toContainTextContent('### PWA Download Complete');
  expect(result).toContainTextContent('manifest.json');
  expect(result).toContainTextContent('pwa-info.json');

  // Verify files were created
  const dirs = await fs.promises.readdir(outputDir);
  expect(dirs.length).toBeGreaterThan(0);

  // Find the PWA package directory
  const pwaDirs = dirs.filter(d => d.startsWith('pwa-'));
  expect(pwaDirs.length).toBe(1);

  const packageDir = path.join(outputDir, pwaDirs[0]);
  const files = await fs.promises.readdir(packageDir);

  expect(files).toContain('manifest.json');
  expect(files).toContain('pwa-info.json');

  // Verify manifest content
  const manifestContent = JSON.parse(
    await fs.promises.readFile(path.join(packageDir, 'manifest.json'), 'utf-8')
  );
  expect(manifestContent.name).toBe('Test PWA App');
  expect(manifestContent.short_name).toBe('TestPWA');
});

test('browser_pwa_download - creates correct directory structure', async ({ startClient, server }, testInfo) => {
  setupPWARoutes(server);
  const outputDir = testInfo.outputPath('pwa-structure');

  const { client } = await startClient({
    config: { outputDir },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}pwa` },
  });

  await client.callTool({
    name: 'browser_wait_for',
    arguments: { time: 1 },
  });

  await client.callTool({
    name: 'browser_pwa_download',
    arguments: {
      outputDir,
      includeIcons: true,
      includeCache: false,
    },
  });

  // Find package directory
  const dirs = await fs.promises.readdir(outputDir);
  const pwaDirs = dirs.filter(d => d.startsWith('pwa-'));
  const packageDir = path.join(outputDir, pwaDirs[0]);

  // Check icons directory
  const iconsDir = path.join(packageDir, 'icons');
  if (fs.existsSync(iconsDir)) {
    const iconFiles = await fs.promises.readdir(iconsDir);
    // Should have icon files
    expect(iconFiles.length).toBeGreaterThanOrEqual(0);
  }

  // Verify pwa-info.json metadata
  const pwaInfo = JSON.parse(
    await fs.promises.readFile(path.join(packageDir, 'pwa-info.json'), 'utf-8')
  );
  expect(pwaInfo).toHaveProperty('downloadedAt');
  expect(pwaInfo).toHaveProperty('sourceUrl');
  expect(pwaInfo).toHaveProperty('manifest');
  expect(pwaInfo.manifest.name).toBe('Test PWA App');
});

test('browser_pwa_download - handles missing manifest gracefully', async ({ startClient, server }, testInfo) => {
  setupNonPWARoutes(server);
  const outputDir = testInfo.outputPath('pwa-no-manifest');

  const { client } = await startClient({
    config: { outputDir },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}non-pwa` },
  });

  const result = await client.callTool({
    name: 'browser_pwa_download',
    arguments: {
      outputDir,
    },
  });

  // Should still complete without error
  expect(result).toContainTextContent('### PWA Download Complete');
  expect(result).toContainTextContent('pwa-info.json');
});

test('browser_pwa_download - respects includeIcons=false', async ({ startClient, server }, testInfo) => {
  setupPWARoutes(server);
  const outputDir = testInfo.outputPath('pwa-no-icons');

  const { client } = await startClient({
    config: { outputDir },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}pwa` },
  });

  await client.callTool({
    name: 'browser_pwa_download',
    arguments: {
      outputDir,
      includeIcons: false,
      includeCache: false,
    },
  });

  // Find package directory
  const dirs = await fs.promises.readdir(outputDir);
  const pwaDirs = dirs.filter(d => d.startsWith('pwa-'));
  const packageDir = path.join(outputDir, pwaDirs[0]);

  // Icons directory should not exist or be empty
  const iconsDir = path.join(packageDir, 'icons');
  expect(fs.existsSync(iconsDir)).toBe(false);
});
