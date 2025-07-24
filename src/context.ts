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

import debug from 'debug';
import * as playwright from 'playwright';

import { logUnhandledError } from './log.js';
import { Tab } from './tab.js';

import type { Tool } from './tools/tool.js';
import type { FullConfig } from './config.js';
import type { BrowserContextFactory } from './browserContextFactory.js';

const testDebug = debug('pw:mcp:test');

export class Context {
  readonly tools: Tool[];
  readonly config: FullConfig;
  private _browserContextPromise: Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> | undefined;
  private _browserContextFactory: BrowserContextFactory;
  private _tabs: Tab[] = [];
  private _currentTab: Tab | undefined;
  clientVersion: { name: string; version: string; } | undefined;
  private _videoRecordingConfig: { dir: string; size?: { width: number; height: number } } | undefined;
  private _videoBaseFilename: string | undefined;
  private _activePagesWithVideos: Set<playwright.Page> = new Set();

  private static _allContexts: Set<Context> = new Set();
  private _closeBrowserContextPromise: Promise<void> | undefined;

  constructor(tools: Tool[], config: FullConfig, browserContextFactory: BrowserContextFactory) {
    this.tools = tools;
    this.config = config;
    this._browserContextFactory = browserContextFactory;
    testDebug('create context');
    Context._allContexts.add(this);
  }

  static async disposeAll() {
    await Promise.all([...Context._allContexts].map(context => context.dispose()));
  }

  tabs(): Tab[] {
    return this._tabs;
  }

  currentTab(): Tab | undefined {
    return this._currentTab;
  }

  currentTabOrDie(): Tab {
    if (!this._currentTab)
      throw new Error('No open pages available. Use the "browser_navigate" tool to navigate to a page first.');
    return this._currentTab;
  }

  async newTab(): Promise<Tab> {
    const { browserContext } = await this._ensureBrowserContext();
    const page = await browserContext.newPage();
    this._currentTab = this._tabs.find(t => t.page === page)!;
    return this._currentTab;
  }

  async selectTab(index: number) {
    const tab = this._tabs[index];
    if (!tab)
      throw new Error(`Tab ${index} not found`);
    await tab.page.bringToFront();
    this._currentTab = tab;
    return tab;
  }

  async ensureTab(): Promise<Tab> {
    const { browserContext } = await this._ensureBrowserContext();
    if (!this._currentTab)
      await browserContext.newPage();
    return this._currentTab!;
  }

  async listTabsMarkdown(force: boolean = false): Promise<string[]> {
    if (this._tabs.length === 1 && !force)
      return [];

    if (!this._tabs.length) {
      return [
        '### No open tabs',
        'Use the "browser_navigate" tool to navigate to a page first.',
        '',
      ];
    }

    const lines: string[] = ['### Open tabs'];
    for (let i = 0; i < this._tabs.length; i++) {
      const tab = this._tabs[i];
      const title = await tab.title();
      const url = tab.page.url();
      const current = tab === this._currentTab ? ' (current)' : '';
      lines.push(`- ${i}:${current} [${title}] (${url})`);
    }
    lines.push('');
    return lines;
  }

  async closeTab(index: number | undefined): Promise<string> {
    const tab = index === undefined ? this._currentTab : this._tabs[index];
    if (!tab)
      throw new Error(`Tab ${index} not found`);
    const url = tab.page.url();
    await tab.page.close();
    return url;
  }

  private _onPageCreated(page: playwright.Page) {
    const tab = new Tab(this, page, tab => this._onPageClosed(tab));
    this._tabs.push(tab);
    if (!this._currentTab)
      this._currentTab = tab;

    // Track pages with video recording
    if (this._videoRecordingConfig && page.video())
      this._activePagesWithVideos.add(page);

  }

  private _onPageClosed(tab: Tab) {
    const index = this._tabs.indexOf(tab);
    if (index === -1)
      return;
    this._tabs.splice(index, 1);

    if (this._currentTab === tab)
      this._currentTab = this._tabs[Math.min(index, this._tabs.length - 1)];
    if (!this._tabs.length)
      void this.closeBrowserContext();
  }

  async closeBrowserContext() {
    if (!this._closeBrowserContextPromise)
      this._closeBrowserContextPromise = this._closeBrowserContextImpl().catch(logUnhandledError);
    await this._closeBrowserContextPromise;
    this._closeBrowserContextPromise = undefined;
  }

  private async _closeBrowserContextImpl() {
    if (!this._browserContextPromise)
      return;

    testDebug('close context');

    const promise = this._browserContextPromise;
    this._browserContextPromise = undefined;

    await promise.then(async ({ browserContext, close }) => {
      if (this.config.saveTrace)
        await browserContext.tracing.stop();
      await close();
    });
  }

  async dispose() {
    await this.closeBrowserContext();
    Context._allContexts.delete(this);
  }

  private async _setupRequestInterception(context: playwright.BrowserContext) {
    if (this.config.network?.allowedOrigins?.length) {
      await context.route('**', route => route.abort('blockedbyclient'));

      for (const origin of this.config.network.allowedOrigins)
        await context.route(`*://${origin}/**`, route => route.continue());
    }

    if (this.config.network?.blockedOrigins?.length) {
      for (const origin of this.config.network.blockedOrigins)
        await context.route(`*://${origin}/**`, route => route.abort('blockedbyclient'));
    }
  }

  private _ensureBrowserContext() {
    if (!this._browserContextPromise) {
      this._browserContextPromise = this._setupBrowserContext();
      this._browserContextPromise.catch(() => {
        this._browserContextPromise = undefined;
      });
    }
    return this._browserContextPromise;
  }

  private async _setupBrowserContext(): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    if (this._closeBrowserContextPromise)
      throw new Error('Another browser context is being closed.');
    
    let result: { browserContext: playwright.BrowserContext, close: () => Promise<void> };
    
    if (this._videoRecordingConfig) {
      // Create a new browser context with video recording enabled
      result = await this._createVideoEnabledContext();
    } else {
      // Use the standard browser context factory
      result = await this._browserContextFactory.createContext(this.clientVersion!);
    }
    const { browserContext } = result;
    await this._setupRequestInterception(browserContext);
    for (const page of browserContext.pages())
      this._onPageCreated(page);
    browserContext.on('page', page => this._onPageCreated(page));
    if (this.config.saveTrace) {
      await browserContext.tracing.start({
        name: 'trace',
        screenshots: false,
        snapshots: true,
        sources: false,
      });
    }
    return result;
  }

  private async _createVideoEnabledContext(): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    // For video recording, we need to create an isolated context
    const browserType = playwright[this.config.browser.browserName];

    const browser = await browserType.launch({
      ...this.config.browser.launchOptions,
      handleSIGINT: false,
      handleSIGTERM: false,
    });

    const contextOptions = {
      ...this.config.browser.contextOptions,
      recordVideo: this._videoRecordingConfig,
    };

    const browserContext = await browser.newContext(contextOptions);

    return {
      browserContext,
      close: async () => {
        await browserContext.close();
        await browser.close();
      }
    };
  }

  setVideoRecording(config: { dir: string; size?: { width: number; height: number } }, baseFilename: string) {
    this._videoRecordingConfig = config;
    this._videoBaseFilename = baseFilename;

    // Force recreation of browser context to include video recording
    if (this._browserContextPromise) {
      void this.close().then(() => {
        // The next call to _ensureBrowserContext will create a new context with video recording
      });
    }
  }

  getVideoRecordingInfo() {
    return {
      enabled: !!this._videoRecordingConfig,
      config: this._videoRecordingConfig,
      baseFilename: this._videoBaseFilename,
      activeRecordings: this._activePagesWithVideos.size,
    };
  }

  async stopVideoRecording(): Promise<string[]> {
    if (!this._videoRecordingConfig)
      return [];


    const videoPaths: string[] = [];

    // Close all pages to save videos
    for (const page of this._activePagesWithVideos) {
      try {
        if (!page.isClosed()) {
          await page.close();
          const video = page.video();
          if (video) {
            const videoPath = await video.path();
            videoPaths.push(videoPath);
          }
        }
      } catch (error) {
        testDebug('Error closing page for video recording:', error);
      }
    }

    this._activePagesWithVideos.clear();
    this._videoRecordingConfig = undefined;
    this._videoBaseFilename = undefined;

    return videoPaths;
  }
}
