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

import { fork, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { testDebug } from './log.js';

import type { FullConfig } from './config.js';

// Cache installs per-process so repeated launches don't re-run the installer.
const installedBrowsers = new Set<string>();
const inflightInstalls = new Map<string, Promise<void>>();

function browserTarget(browserConfig: FullConfig['browser']): string {
  return browserConfig.launchOptions?.channel
    ?? browserConfig.browserName
    ?? 'chrome';
}

/**
 * Runs `playwright install <target>` in a forked child process.
 * Safe to call concurrently — in-flight installs are deduplicated per target.
 */
export async function installBrowser(browserConfig: FullConfig['browser']): Promise<void> {
  const target = browserTarget(browserConfig);

  if (installedBrowsers.has(target))
    return;

  const existing = inflightInstalls.get(target);
  if (existing)
    return existing;

  const promise = runInstall(target).then(() => {
    installedBrowsers.add(target);
  }).finally(() => {
    inflightInstalls.delete(target);
  });

  inflightInstalls.set(target, promise);
  return promise;
}

async function runInstall(target: string): Promise<void> {
  testDebug(`auto-installing browser: ${target}`);
  const cliPath = resolvePlaywrightCli();

  await runPlaywrightCli(cliPath, ['install', target]);

  // macOS: strip Gatekeeper quarantine attribute from freshly downloaded
  // browser binaries. Without this, the first launch is silently blocked
  // by macOS on a fresh install.
  if (process.platform === 'darwin')
    await stripDarwinQuarantine();

  // Best-effort system-deps install. Only runs when we're already root,
  // otherwise skipped silently — users will see Playwright's own missing-lib
  // error on the next launch, which tells them exactly what to apt install.
  if (process.getuid && process.getuid() === 0) {
    try {
      await runPlaywrightCli(cliPath, ['install-deps', target]);
    } catch (e) {
      testDebug(`install-deps failed (non-fatal): ${e}`);
    }
  }
}

/**
 * Removes the `com.apple.quarantine` extended attribute from Playwright's
 * browser cache directory. macOS sets this on anything downloaded from the
 * network; on Tahoe and later it causes Gatekeeper to silently block launch.
 *
 * Best-effort: errors are logged but never thrown. If `xattr` doesn't exist,
 * the cache dir is missing, or the attribute isn't present, we just move on.
 */
async function stripDarwinQuarantine(): Promise<void> {
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH
    || path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');

  // PLAYWRIGHT_BROWSERS_PATH=0 means "install into node_modules" — skip,
  // since those binaries weren't downloaded with quarantine in that flow.
  if (cacheDir === '0')
    return;

  testDebug(`stripping quarantine attribute from ${cacheDir}`);
  await new Promise<void>(resolve => {
    const child = spawn('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', cacheDir], {
      stdio: 'pipe',
    });
    child.on('close', code => {
      if (code !== 0)
        testDebug(`xattr exited ${code} (non-fatal)`);
      resolve();
    });
    child.on('error', err => {
      testDebug(`xattr spawn failed (non-fatal): ${err.message}`);
      resolve();
    });
  });
}

function resolvePlaywrightCli(): string {
  try {
    const cliUrl = import.meta.resolve('playwright/package.json');
    return path.join(fileURLToPath(cliUrl), '..', 'cli.js');
  } catch (e) {
    throw new Error(
        'Playwright package not found. Install it with: npm install playwright\n' +
      `Original error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function runPlaywrightCli(cliPath: string, args: string[]): Promise<void> {
  const child = fork(cliPath, args, { stdio: 'pipe' });
  const output: string[] = [];
  child.stdout?.on('data', data => output.push(data.toString()));
  child.stderr?.on('data', data => output.push(data.toString()));

  return new Promise<void>((resolve, reject) => {
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`playwright ${args.join(' ')} failed (exit ${code}):\n${output.join('')}`));
    });
    child.on('error', reject);
  });
}

/**
 * Returns true if the given error indicates the browser executable is missing
 * and needs to be downloaded via `playwright install`.
 */
export function isMissingBrowserError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false;
  const msg = error.message;
  return msg.includes("Executable doesn't exist")
    || msg.includes('please run the following command')
    || msg.includes('npx playwright install');
}
