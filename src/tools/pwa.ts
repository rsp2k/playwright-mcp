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

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { defineTabTool } from './tool.js';
import { outputFile } from '../config.js';
import { ArtifactManagerRegistry } from '../artifactManager.js';
import { sanitizeForFilePath } from './utils.js';

// Types for PWA manifest (subset of Web App Manifest spec)
interface PWAIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface PWAManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  scope?: string;
  description?: string;
  icons?: PWAIcon[];
  [key: string]: unknown;
}

interface ServiceWorkerInfo {
  scriptURL: string;
  scope: string;
  state: string;
}

interface CacheInfo {
  name: string;
  itemCount: number;
  urls?: string[];
}

interface PWAInfo {
  isPWA: boolean;
  reason?: string;
  url: string;
  manifest?: PWAManifest;
  manifestUrl?: string;
  serviceWorker?: ServiceWorkerInfo;
  caches?: CacheInfo[];
  errors?: string[];
}

interface CacheResource {
  url: string;
  contentType: string;
  content: string;  // base64 for binary, text for readable
  isBinary: boolean;
  size: number;
}

/**
 * Detect and report PWA metadata for the current page.
 */
const pwaInfo = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_pwa_info',
    title: 'Get PWA information',
    description: 'Detect and report Progressive Web App (PWA) metadata for the current page including manifest, service worker, and cache information.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (tab, _params, response) => {
    const page = tab.page;
    const pageUrl = page.url();

    const info: PWAInfo = {
      isPWA: false,
      url: pageUrl,
      errors: [],
    };

    // Check for manifest link
    const manifestData = await page.evaluate(async () => {
      const result: {
        manifestUrl: string | null;
        manifest: PWAManifest | null;
        error?: string;
      } = {
        manifestUrl: null,
        manifest: null,
      };

      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink?.href) {
        result.error = 'No manifest link found';
        return result;
      }

      result.manifestUrl = manifestLink.href;

      try {
        const resp = await fetch(manifestLink.href);
        if (!resp.ok) {
          result.error = `Failed to fetch manifest: ${resp.status} ${resp.statusText}`;
          return result;
        }
        result.manifest = await resp.json();
      } catch (e) {
        result.error = `Error fetching manifest: ${e}`;
      }

      return result;
    });

    if (manifestData.error)
      info.errors!.push(manifestData.error);

    if (manifestData.manifest) {
      info.manifest = manifestData.manifest;
      info.manifestUrl = manifestData.manifestUrl ?? undefined;
    }

    // Check for service worker
    const swData = await page.evaluate(async () => {
      const result: {
        serviceWorker: ServiceWorkerInfo | null;
        error?: string;
      } = {
        serviceWorker: null,
      };

      if (!('serviceWorker' in navigator)) {
        result.error = 'Service Worker API not supported';
        return result;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          result.error = 'No service worker registered';
          return result;
        }

        const sw = registration.active || registration.waiting || registration.installing;
        if (!sw) {
          result.error = 'No active service worker found';
          return result;
        }

        result.serviceWorker = {
          scriptURL: sw.scriptURL,
          scope: registration.scope,
          state: sw.state,
        };
      } catch (e) {
        result.error = `Error getting service worker: ${e}`;
      }

      return result;
    });

    if (swData.error)
      info.errors!.push(swData.error);

    if (swData.serviceWorker)
      info.serviceWorker = swData.serviceWorker;


    // Get cache information
    const cacheData = await page.evaluate(async () => {
      const result: {
        caches: CacheInfo[];
        error?: string;
      } = {
        caches: [],
      };

      if (!('caches' in window)) {
        result.error = 'CacheStorage API not supported';
        return result;
      }

      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          result.caches.push({
            name,
            itemCount: keys.length,
            urls: keys.map(r => r.url),
          });
        }
      } catch (e) {
        result.error = `Error accessing caches: ${e}`;
      }

      return result;
    });

    if (cacheData.error)
      info.errors!.push(cacheData.error);

    if (cacheData.caches)
      info.caches = cacheData.caches;


    // Determine if this is a PWA
    const hasManifest = !!info.manifest;
    const hasServiceWorker = !!info.serviceWorker;
    info.isPWA = hasManifest && hasServiceWorker;

    if (!info.isPWA) {
      const missing: string[] = [];
      if (!hasManifest)
        missing.push('manifest');
      if (!hasServiceWorker)
        missing.push('service worker');
      info.reason = `Missing: ${missing.join(', ')}`;
    }

    // Clean up empty errors array
    if (info.errors!.length === 0)
      delete info.errors;


    // Build response
    const lines: string[] = [];
    lines.push('### PWA Information\n');
    lines.push(`**URL:** ${info.url}`);
    lines.push(`**Is PWA:** ${info.isPWA ? 'Yes' : 'No'}${info.reason ? ` (${info.reason})` : ''}`);

    if (info.manifest) {
      lines.push('\n#### Manifest');
      lines.push(`- **Name:** ${info.manifest.name || info.manifest.short_name || '(not set)'}`);
      if (info.manifest.description)
        lines.push(`- **Description:** ${info.manifest.description}`);

      lines.push(`- **Start URL:** ${info.manifest.start_url || '(not set)'}`);
      lines.push(`- **Display:** ${info.manifest.display || '(not set)'}`);
      lines.push(`- **Theme Color:** ${info.manifest.theme_color || '(not set)'}`);
      lines.push(`- **Scope:** ${info.manifest.scope || '(not set)'}`);
      if (info.manifest.icons?.length)
        lines.push(`- **Icons:** ${info.manifest.icons.length} defined (${info.manifest.icons.map(i => i.sizes || 'unknown').join(', ')})`);

    }

    if (info.serviceWorker) {
      lines.push('\n#### Service Worker');
      lines.push(`- **Script:** ${info.serviceWorker.scriptURL}`);
      lines.push(`- **Scope:** ${info.serviceWorker.scope}`);
      lines.push(`- **State:** ${info.serviceWorker.state}`);
    }

    if (info.caches && info.caches.length > 0) {
      lines.push('\n#### Caches');
      let totalItems = 0;
      for (const cache of info.caches) {
        lines.push(`- **${cache.name}:** ${cache.itemCount} items`);
        totalItems += cache.itemCount;
      }
      lines.push(`- **Total:** ${info.caches.length} cache(s), ${totalItems} items`);
    }

    if (info.errors && info.errors.length > 0) {
      lines.push('\n#### Errors');
      for (const error of info.errors)
        lines.push(`- ${error}`);

    }

    response.addResult(lines.join('\n'));
  },
});

/**
 * Download complete PWA package to directory.
 */
const pwaDownload = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_pwa_download',
    title: 'Download PWA package',
    description: 'Download complete Progressive Web App (PWA) package including manifest, icons, service worker, and cached resources.',
    inputSchema: z.object({
      outputDir: z.string().optional().describe('Custom output directory path. If not specified, uses default artifact directory.'),
      includeIcons: z.boolean().optional().default(true).describe('Download all icon sizes from manifest (default: true)'),
      includeCache: z.boolean().optional().default(true).describe('Download cached resources from CacheStorage (default: true)'),
      createZip: z.boolean().optional().default(false).describe('Create zip archive of downloaded content (default: false)'),
      maxCacheSize: z.number().optional().default(100).describe('Maximum total cache size to download in MB (default: 100)'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const page = tab.page;
    const pageUrl = page.url();
    const maxCacheSizeBytes = (params.maxCacheSize ?? 100) * 1024 * 1024;

    const errors: string[] = [];

    // First, gather all PWA info
    const manifestData = await page.evaluate(async () => {
      const result: {
        manifestUrl: string | null;
        manifest: PWAManifest | null;
        baseUrl: string;
        error?: string;
      } = {
        manifestUrl: null,
        manifest: null,
        baseUrl: location.origin,
      };

      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink?.href)
        return result;


      result.manifestUrl = manifestLink.href;

      try {
        const resp = await fetch(manifestLink.href);
        if (resp.ok)
          result.manifest = await resp.json();
        else
          result.error = `Failed to fetch manifest: ${resp.status}`;

      } catch (e) {
        result.error = `Error fetching manifest: ${e}`;
      }

      return result;
    });

    if (manifestData.error)
      errors.push(manifestData.error);


    // Get service worker info
    const swData = await page.evaluate(async () => {
      const result: {
        scriptURL: string | null;
        scriptContent: string | null;
        error?: string;
      } = {
        scriptURL: null,
        scriptContent: null,
      };

      if (!('serviceWorker' in navigator))
        return result;


      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration)
          return result;


        const sw = registration.active || registration.waiting || registration.installing;
        if (!sw)
          return result;


        result.scriptURL = sw.scriptURL;

        // Try to fetch the service worker script
        try {
          const resp = await fetch(sw.scriptURL);
          if (resp.ok)
            result.scriptContent = await resp.text();
          else
            result.error = `Failed to fetch SW script: ${resp.status}`;

        } catch (e) {
          result.error = `Error fetching SW script: ${e}`;
        }
      } catch (e) {
        result.error = `Error getting service worker: ${e}`;
      }

      return result;
    });

    if (swData.error)
      errors.push(swData.error);


    // Determine output directory
    let outputBaseDir: string;
    const appName = sanitizeForFilePath(
      manifestData.manifest?.short_name ||
        manifestData.manifest?.name ||
        new URL(pageUrl).hostname
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const packageDirName = `pwa-${appName}-${timestamp}`;

    if (params.outputDir) {
      outputBaseDir = params.outputDir;
    } else {
      const registry = ArtifactManagerRegistry.getInstance();
      const artifactManager = tab.context.sessionId ? registry.getManager(tab.context.sessionId) : undefined;
      if (artifactManager) {
        outputBaseDir = artifactManager.getSubdirectory('pwa');
      } else {
        outputBaseDir = await outputFile(tab.context.config, 'pwa');
        await fs.promises.mkdir(outputBaseDir, { recursive: true });
      }
    }

    const packageDir = path.join(outputBaseDir, packageDirName);
    await fs.promises.mkdir(packageDir, { recursive: true });

    const downloadedFiles: string[] = [];

    // Save manifest
    if (manifestData.manifest) {
      const manifestPath = path.join(packageDir, 'manifest.json');
      await fs.promises.writeFile(manifestPath, JSON.stringify(manifestData.manifest, null, 2));
      downloadedFiles.push('manifest.json');
    }

    // Download icons
    const iconResults: { src: string; path: string; error?: string }[] = [];
    if (params.includeIcons !== false && manifestData.manifest?.icons?.length) {
      const iconsDir = path.join(packageDir, 'icons');
      await fs.promises.mkdir(iconsDir, { recursive: true });

      for (const icon of manifestData.manifest.icons) {
        const iconUrl = new URL(icon.src, manifestData.baseUrl).href;
        const iconFilename = sanitizeForFilePath(path.basename(new URL(iconUrl).pathname)) || `icon-${icon.sizes || 'unknown'}.png`;

        try {
          const iconData = await page.evaluate(async (url: string) => {
            try {
              const resp = await fetch(url);
              if (!resp.ok)
                return { error: `HTTP ${resp.status}` };

              const blob = await resp.blob();
              const reader = new FileReader();
              return new Promise<{ data: string; type: string } | { error: string }>((resolve) => {
                reader.onloadend = () => {
                  const base64 = (reader.result as string).split(',')[1];
                  resolve({ data: base64, type: blob.type });
                };
                reader.onerror = () => resolve({ error: 'FileReader error' });
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              return { error: `${e}` };
            }
          }, iconUrl);

          if ('error' in iconData) {
            iconResults.push({ src: icon.src, path: '', error: iconData.error });
            errors.push(`Icon ${icon.src}: ${iconData.error}`);
          } else {
            const iconPath = path.join(iconsDir, iconFilename);
            await fs.promises.writeFile(iconPath, Buffer.from(iconData.data, 'base64'));
            iconResults.push({ src: icon.src, path: `icons/${iconFilename}` });
            downloadedFiles.push(`icons/${iconFilename}`);
          }
        } catch (e) {
          iconResults.push({ src: icon.src, path: '', error: `${e}` });
          errors.push(`Icon ${icon.src}: ${e}`);
        }
      }
    }

    // Save service worker
    if (swData.scriptContent) {
      const swDir = path.join(packageDir, 'service-worker');
      await fs.promises.mkdir(swDir, { recursive: true });

      const swFilename = path.basename(new URL(swData.scriptURL!).pathname) || 'sw.js';
      const swPath = path.join(swDir, swFilename);
      await fs.promises.writeFile(swPath, swData.scriptContent);
      downloadedFiles.push(`service-worker/${swFilename}`);
    }

    // Download cached resources
    let totalCacheSize = 0;
    let cacheLimitReached = false;
    const cacheResults: { name: string; itemCount: number; downloadedCount: number; error?: string }[] = [];

    if (params.includeCache !== false) {
      const cacheDir = path.join(packageDir, 'cache');

      const cacheNames = await page.evaluate(async () => {
        if (!('caches' in window))
          return [];

        try {
          return await caches.keys();
        } catch {
          return [];
        }
      });

      for (const cacheName of cacheNames) {
        if (cacheLimitReached)
          break;


        const cacheResult: { name: string; itemCount: number; downloadedCount: number; error?: string } = {
          name: cacheName,
          itemCount: 0,
          downloadedCount: 0,
        };

        const sanitizedCacheName = sanitizeForFilePath(cacheName);
        const cacheSubDir = path.join(cacheDir, sanitizedCacheName);
        await fs.promises.mkdir(cacheSubDir, { recursive: true });

        // Get all URLs in this cache
        const cacheUrls = await page.evaluate(async (name: string) => {
          try {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            return requests.map(r => r.url);
          } catch {
            return [];
          }
        }, cacheName);

        cacheResult.itemCount = cacheUrls.length;

        for (const url of cacheUrls) {
          if (cacheLimitReached)
            break;


          // Fetch from cache and download
          const resourceData = await page.evaluate(async (args: { cacheName: string; url: string }) => {
            try {
              const cache = await caches.open(args.cacheName);
              const response = await cache.match(args.url);
              if (!response)
                return { error: 'Not found in cache' };


              const contentType = response.headers.get('content-type') || 'application/octet-stream';
              const isBinary = !contentType.startsWith('text/') &&
                              !contentType.includes('json') &&
                              !contentType.includes('xml') &&
                              !contentType.includes('javascript');

              if (isBinary) {
                const blob = await response.blob();
                const reader = new FileReader();
                return new Promise<CacheResource | { error: string }>((resolve) => {
                  reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1] || '';
                    resolve({
                      url: args.url,
                      contentType,
                      content: base64,
                      isBinary: true,
                      size: blob.size,
                    });
                  };
                  reader.onerror = () => resolve({ error: 'FileReader error' });
                  reader.readAsDataURL(blob);
                });
              } else {
                const text = await response.text();
                return {
                  url: args.url,
                  contentType,
                  content: text,
                  isBinary: false,
                  size: new Blob([text]).size,
                };
              }
            } catch (e) {
              return { error: `${e}` };
            }
          }, { cacheName, url });

          if ('error' in resourceData) {
            errors.push(`Cache resource ${url}: ${resourceData.error}`);
            continue;
          }

          // Check size limit
          if (totalCacheSize + resourceData.size > maxCacheSizeBytes) {
            cacheLimitReached = true;
            errors.push(`Cache size limit (${params.maxCacheSize}MB) reached, stopping cache download`);
            break;
          }

          // Generate filename from URL
          const parsedUrl = new URL(url);
          let resourcePath = parsedUrl.pathname;
          if (resourcePath.endsWith('/'))
            resourcePath += 'index.html';

          if (!path.extname(resourcePath)) {
            // Guess extension from content type
            const extMap: Record<string, string> = {
              'text/html': '.html',
              'text/css': '.css',
              'application/javascript': '.js',
              'text/javascript': '.js',
              'application/json': '.json',
              'image/png': '.png',
              'image/jpeg': '.jpg',
              'image/gif': '.gif',
              'image/svg+xml': '.svg',
              'image/webp': '.webp',
            };
            const ext = Object.entries(extMap).find(([type]) => resourceData.contentType.includes(type))?.[1] || '';
            resourcePath += ext;
          }

          // Sanitize the path
          const sanitizedPath = resourcePath.split('/').filter(Boolean).map(sanitizeForFilePath).join(path.sep);
          const fullPath = path.join(cacheSubDir, sanitizedPath);

          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

          if (resourceData.isBinary) {
            await fs.promises.writeFile(fullPath, Buffer.from(resourceData.content, 'base64'));
          } else {
            await fs.promises.writeFile(fullPath, resourceData.content);
          }

          totalCacheSize += resourceData.size;
          cacheResult.downloadedCount++;
        }

        cacheResults.push(cacheResult);
        downloadedFiles.push(`cache/${sanitizedCacheName}/ (${cacheResult.downloadedCount} files)`);
      }
    }

    // Create pwa-info.json with metadata about the download
    const pwaInfoMetadata = {
      downloadedAt: new Date().toISOString(),
      sourceUrl: pageUrl,
      manifest: manifestData.manifest,
      manifestUrl: manifestData.manifestUrl,
      serviceWorker: swData.scriptURL ? {
        scriptURL: swData.scriptURL,
        downloaded: !!swData.scriptContent,
      } : null,
      icons: iconResults,
      caches: cacheResults,
      totalCacheSize,
      cacheLimitReached,
      errors: errors.length > 0 ? errors : undefined,
    };

    await fs.promises.writeFile(
      path.join(packageDir, 'pwa-info.json'),
      JSON.stringify(pwaInfoMetadata, null, 2)
    );
    downloadedFiles.push('pwa-info.json');

    // Create zip if requested
    let zipPath: string | undefined;
    if (params.createZip) {
      try {
        // Use native zip command if available
        const { execSync } = await import('child_process');
        zipPath = `${packageDir}.zip`;
        execSync(`cd "${outputBaseDir}" && zip -r "${packageDirName}.zip" "${packageDirName}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        downloadedFiles.push(`${packageDirName}.zip`);
      } catch (e) {
        errors.push(`Failed to create zip: ${e}`);
      }
    }

    // Build response
    const lines: string[] = [];
    lines.push('### PWA Download Complete\n');
    lines.push(`**Source:** ${pageUrl}`);
    lines.push(`**Package:** ${packageDir}`);
    if (zipPath)
      lines.push(`**Zip:** ${zipPath}`);


    lines.push('\n#### Downloaded Files');
    for (const file of downloadedFiles)
      lines.push(`- ${file}`);


    if (manifestData.manifest) {
      lines.push('\n#### Manifest');
      lines.push(`- **Name:** ${manifestData.manifest.name || manifestData.manifest.short_name || '(not set)'}`);
      lines.push(`- **Icons:** ${iconResults.filter(i => !i.error).length}/${manifestData.manifest.icons?.length || 0} downloaded`);
    }

    if (swData.scriptContent) {
      lines.push('\n#### Service Worker');
      lines.push(`- **Script:** ${swData.scriptURL}`);
    }

    if (cacheResults.length > 0) {
      lines.push('\n#### Caches');
      for (const cache of cacheResults)
        lines.push(`- **${cache.name}:** ${cache.downloadedCount}/${cache.itemCount} items downloaded`);

      lines.push(`- **Total size:** ${(totalCacheSize / 1024 / 1024).toFixed(2)} MB`);
      if (cacheLimitReached)
        lines.push(`- **Note:** Cache size limit reached, download incomplete`);

    }

    if (errors.length > 0) {
      lines.push('\n#### Errors');
      for (const error of errors.slice(0, 10))
        lines.push(`- ${error}`);

      if (errors.length > 10)
        lines.push(`- ... and ${errors.length - 10} more errors (see pwa-info.json)`);

    }

    response.addResult(lines.join('\n'));
  },
});

export default [
  pwaInfo,
  pwaDownload,
];
