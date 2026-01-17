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
import { devices } from 'playwright';

import { logUnhandledError } from './log.js';
import { Tab } from './tab.js';
import { EnvironmentIntrospector } from './environmentIntrospection.js';
import { RequestInterceptor, RequestInterceptorOptions } from './requestInterceptor.js';
import { ArtifactManagerRegistry } from './artifactManager.js';

import type { Tool, WebNotification, RTCConnectionData } from './tools/tool.js';
import type { FullConfig } from './config.js';
import type { BrowserContextFactory } from './browserContextFactory.js';
import type { InjectionConfig } from './tools/codeInjection.js';
import { PlaywrightRipgrepEngine } from './filtering/engine.js';
import type { DifferentialFilterParams } from './filtering/models.js';

// Virtual Accessibility Tree for React-style reconciliation
interface AccessibilityNode {
  type: 'interactive' | 'content' | 'navigation' | 'form' | 'error';
  ref?: string;
  text: string;
  role?: string;
  attributes?: Record<string, string>;
  children?: AccessibilityNode[];
}

export interface AccessibilityDiff {
  added: AccessibilityNode[];
  removed: AccessibilityNode[];
  modified: { before: AccessibilityNode; after: AccessibilityNode }[];
}

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
  private _videoRecordingPaused: boolean = false;
  private _pausedPageVideos: Map<playwright.Page, playwright.Video> = new Map();
  private _videoRecordingMode: 'continuous' | 'smart' | 'action-only' | 'segment' = 'smart';
  private _currentVideoSegment: number = 1;
  private _autoRecordingEnabled: boolean = true;
  private _environmentIntrospector: EnvironmentIntrospector;

  private static _allContexts: Set<Context> = new Set();
  private _closeBrowserContextPromise: Promise<void> | undefined;

  // Session isolation properties
  readonly sessionId: string;
  private _sessionStartTime: number;

  // Chrome extension management
  private _installedExtensions: Array<{ path: string; name: string; version?: string }> = [];

  // Request interception for traffic analysis
  private _requestInterceptor: RequestInterceptor | undefined;

  // Differential snapshot tracking
  private _lastSnapshotFingerprint: string | undefined;
  private _lastPageState: { url: string; title: string } | undefined;
  
  // Ripgrep filtering engine for ultra-precision
  private _filteringEngine: PlaywrightRipgrepEngine;
  
  // Memory management constants
  private static readonly MAX_SNAPSHOT_SIZE = 1024 * 1024; // 1MB limit for snapshots
  private static readonly MAX_ACCESSIBILITY_TREE_SIZE = 10000; // Max elements in tree

  // Code injection for debug toolbar and custom scripts
  injectionConfig: InjectionConfig | undefined;

  // Browser notifications storage
  private _notifications: WebNotification[] = [];

  // WebRTC connections storage
  private _rtcConnections: RTCConnectionData[] = [];

  constructor(tools: Tool[], config: FullConfig, browserContextFactory: BrowserContextFactory, environmentIntrospector?: EnvironmentIntrospector) {
    this.tools = tools;
    this.config = config;
    this._browserContextFactory = browserContextFactory;
    this._environmentIntrospector = environmentIntrospector || new EnvironmentIntrospector();

    // Generate unique session ID
    this._sessionStartTime = Date.now();
    this.sessionId = this._generateSessionId();

    // Initialize filtering engine for ultra-precision differential snapshots
    this._filteringEngine = new PlaywrightRipgrepEngine();

    testDebug(`create context with sessionId: ${this.sessionId}`);
    Context._allContexts.add(this);
  }

  static async disposeAll() {
    await Promise.all([...Context._allContexts].map(context => context.dispose()));
  }

  private _generateSessionId(): string {
    // Create a base session ID from timestamp and random
    const baseId = `${this._sessionStartTime}-${Math.random().toString(36).substr(2, 9)}`;

    // If we have client version info, incorporate it
    if (this.clientVersion) {
      const clientInfo = `${this.clientVersion.name || 'unknown'}-${this.clientVersion.version || 'unknown'}`;
      return `${clientInfo}-${baseId}`;
    }

    return baseId;
  }

  updateSessionIdWithClientInfo() {
    if (this.clientVersion) {
      const newSessionId = this._generateSessionId();
      testDebug(`updating sessionId from ${this.sessionId} to ${newSessionId}`);
      // Note: sessionId is readonly, but we can update it during initialization
      (this as any).sessionId = newSessionId;
    }
  }

  updateSessionId(customSessionId: string) {
    testDebug(`updating sessionId from ${this.sessionId} to ${customSessionId}`);
    // Note: sessionId is readonly, but we can update it for artifact management
    (this as any).sessionId = customSessionId;
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

  // Notification management methods
  addNotification(notification: WebNotification): void {
    this._notifications.push(notification);
  }

  notifications(): WebNotification[] {
    return this._notifications;
  }

  getNotification(id: string): WebNotification | undefined {
    return this._notifications.find(n => n.id === id);
  }

  clearNotifications(): void {
    this._notifications.length = 0;
  }

  // WebRTC connection management methods
  addRTCConnection(connection: RTCConnectionData): void {
    this._rtcConnections.push(connection);
  }

  rtcConnections(): RTCConnectionData[] {
    return this._rtcConnections;
  }

  getRTCConnection(id: string): RTCConnectionData | undefined {
    return this._rtcConnections.find(c => c.id === id);
  }

  clearRTCConnections(): void {
    this._rtcConnections.length = 0;

    // Also clear from all tabs
    for (const tab of this.tabs())
      tab.clearRTCConnections();

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
    // Note: page.video() may be null initially, so we track based on config presence
    if (this._videoRecordingConfig) {
      this._activePagesWithVideos.add(page);
      testDebug(`Added page to video tracking. Active recordings: ${this._activePagesWithVideos.size}`);
    }

    // Attach request interceptor to new pages
    if (this._requestInterceptor) {
      void this._requestInterceptor.attach(page);
      testDebug('Request interceptor attached to new page');
    }

    // Auto-inject debug toolbar and custom code
    void this._injectCodeIntoPage(page);
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
    // Clean up request interceptor
    this.stopRequestMonitoring();

    // Clean up any injected code (debug toolbar, custom injections)
    await this._cleanupInjections();

    // Clean up filtering engine and differential state to prevent memory leaks
    await this._cleanupFilteringResources();

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

  /**
   * Clean up all injected code (debug toolbar, custom injections)
   * Prevents memory leaks from intervals and global variables
   */
  private async _cleanupInjections() {
    try {
      // Get all tabs to clean up injections
      const tabs = Array.from(this._tabs.values());

      for (const tab of tabs) {
        if (tab.page && !tab.page.isClosed()) {
          try {
            // Clean up debug toolbar and any custom injections
            await tab.page.evaluate(() => {
              // Cleanup newer themed toolbar
              if ((window as any).playwrightMcpCleanup)
                (window as any).playwrightMcpCleanup();


              // Cleanup older debug toolbar
              const toolbar = document.getElementById('playwright-mcp-debug-toolbar');
              if (toolbar && (toolbar as any).playwrightCleanup)
                (toolbar as any).playwrightCleanup();


              // Clean up any remaining toolbar elements
              const toolbars = document.querySelectorAll('.mcp-toolbar, #playwright-mcp-debug-toolbar');
              toolbars.forEach(el => el.remove());

              // Clean up style elements
              const mcpStyles = document.querySelectorAll('#mcp-toolbar-theme-styles, #mcp-toolbar-base-styles, #mcp-toolbar-hover-styles');
              mcpStyles.forEach(el => el.remove());

              // Clear global variables to prevent references
              delete (window as any).playwrightMcpDebugToolbar;
              delete (window as any).updateToolbarTheme;
              delete (window as any).playwrightMcpCleanup;
            });
          } catch (error) {
            // Page might be closed or navigation in progress, ignore
          }
        }
      }
    } catch (error) {
      // Don't let cleanup errors prevent disposal
      // Silently ignore cleanup errors during disposal
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

  /**
   * Returns the existing browser context if one has been created, or undefined.
   * Does not create a new context - use for operations that need an existing context.
   */
  async existingBrowserContext(): Promise<playwright.BrowserContext | undefined> {
    if (!this._browserContextPromise)
      return undefined;
    const { browserContext } = await this._browserContextPromise;
    return browserContext;
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
      result = await this._browserContextFactory.createContext(this.clientVersion!, this._getExtensionPaths());
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

    // Get environment-specific browser options
    const envOptions = this._environmentIntrospector.getRecommendedBrowserOptions();

    const launchOptions = {
      ...this.config.browser.launchOptions,
      ...envOptions, // Include environment-detected options
      handleSIGINT: false,
      handleSIGTERM: false,
    };

    // Add Chrome extension support for Chromium
    const extensionPaths = this._getExtensionPaths();
    if (this.config.browser.browserName === 'chromium' && extensionPaths.length > 0) {
      testDebug(`Loading ${extensionPaths.length} Chrome extensions in video context: ${extensionPaths.join(', ')}`);
      launchOptions.args = [
        ...(launchOptions.args || []),
        ...extensionPaths.map(path => `--load-extension=${path}`)
      ];
    }

    const browser = await browserType.launch(launchOptions);

    // Use environment-specific video directory if available
    const videoConfig = envOptions.recordVideo ?
      { ...this._videoRecordingConfig, dir: envOptions.recordVideo.dir } :
      this._videoRecordingConfig;

    const contextOptions = {
      ...this.config.browser.contextOptions,
      recordVideo: videoConfig,
      // Force isolated session for video recording with session-specific storage
      storageState: undefined, // Always start fresh for video recording
    };

    const browserContext = await browser.newContext(contextOptions);

    // Apply offline mode if configured
    if ((this.config as any).offline !== undefined)
      await browserContext.setOffline((this.config as any).offline);


    return {
      browserContext,
      close: async () => {
        await browserContext.close();
        await browser.close();
      }
    };
  }

  setVideoRecording(config: { dir: string; size?: { width: number; height: number } }, baseFilename: string) {
    // Clear any existing video recording state first
    this.clearVideoRecordingState();

    this._videoRecordingConfig = config;
    this._videoBaseFilename = baseFilename;

    // Force recreation of browser context to include video recording
    if (this._browserContextPromise) {
      void this.closeBrowserContext().then(() => {
        // The next call to _ensureBrowserContext will create a new context with video recording
      });
    }

    testDebug(`Video recording configured: ${JSON.stringify(config)}, filename: ${baseFilename}`);
  }

  getVideoRecordingInfo() {
    return {
      enabled: !!this._videoRecordingConfig,
      config: this._videoRecordingConfig,
      baseFilename: this._videoBaseFilename,
      activeRecordings: this._activePagesWithVideos.size,
      paused: this._videoRecordingPaused,
      pausedRecordings: this._pausedPageVideos.size,
      mode: this._videoRecordingMode,
      currentSegment: this._currentVideoSegment,
      autoRecordingEnabled: this._autoRecordingEnabled,
    };
  }

  updateEnvironmentRoots(roots: { uri: string; name?: string }[]) {
    this._environmentIntrospector.updateRoots(roots);

    // Log environment change
    const summary = this._environmentIntrospector.getEnvironmentSummary();
    testDebug(`environment updated for session ${this.sessionId}: ${summary}`);

    // If we have an active browser context, we might want to recreate it
    // For now, we'll just log the change - full recreation would close existing tabs
    if (this._browserContextPromise)
      testDebug(`browser context exists - environment changes will apply to new contexts`);

  }

  getEnvironmentIntrospector(): EnvironmentIntrospector {
    return this._environmentIntrospector;
  }

  async updateBrowserConfig(changes: {
    headless?: boolean;
    viewport?: { width: number; height: number };
    userAgent?: string;
    device?: string;
    geolocation?: { latitude: number; longitude: number; accuracy?: number };
    locale?: string;
    timezone?: string;
    colorScheme?: 'light' | 'dark' | 'no-preference';
    permissions?: string[];
    offline?: boolean;

    // Proxy Configuration
    proxyServer?: string;
    proxyBypass?: string;

    // Browser UI Customization
    chromiumSandbox?: boolean;
    slowMo?: number;
    devtools?: boolean;
    args?: string[];
  }): Promise<void> {
    const currentConfig = { ...this.config };

    // Update the configuration
    if (changes.headless !== undefined)
      currentConfig.browser.launchOptions.headless = changes.headless;


    // Handle device emulation - this overrides individual viewport/userAgent settings
    if (changes.device) {
      if (!devices[changes.device])
        throw new Error(`Unknown device: ${changes.device}`);

      const deviceConfig = devices[changes.device];

      // Apply all device properties to context options
      currentConfig.browser.contextOptions = {
        ...currentConfig.browser.contextOptions,
        ...deviceConfig,
      };
    } else {
      // Apply individual settings only if no device is specified
      if (changes.viewport)
        currentConfig.browser.contextOptions.viewport = changes.viewport;

      if (changes.userAgent)
        currentConfig.browser.contextOptions.userAgent = changes.userAgent;

    }

    // Apply additional context options
    if (changes.geolocation) {
      currentConfig.browser.contextOptions.geolocation = {
        latitude: changes.geolocation.latitude,
        longitude: changes.geolocation.longitude,
        accuracy: changes.geolocation.accuracy || 100
      };
    }

    if (changes.locale)
      currentConfig.browser.contextOptions.locale = changes.locale;


    if (changes.timezone)
      currentConfig.browser.contextOptions.timezoneId = changes.timezone;


    if (changes.colorScheme)
      currentConfig.browser.contextOptions.colorScheme = changes.colorScheme;


    if (changes.permissions)
      currentConfig.browser.contextOptions.permissions = changes.permissions;


    if (changes.offline !== undefined)
      (currentConfig.browser as any).offline = changes.offline;

    // Apply proxy configuration
    if (changes.proxyServer !== undefined) {
      if (changes.proxyServer === '' || changes.proxyServer === null) {
        // Clear proxy when empty string or null
        delete currentConfig.browser.launchOptions.proxy;
      } else {
        // Set proxy server
        currentConfig.browser.launchOptions.proxy = {
          server: changes.proxyServer
        };
        if (changes.proxyBypass)
          currentConfig.browser.launchOptions.proxy.bypass = changes.proxyBypass;
      }
    }

    // Apply browser launch options for UI customization
    if (changes.chromiumSandbox !== undefined)
      currentConfig.browser.launchOptions.chromiumSandbox = changes.chromiumSandbox;

    if (changes.slowMo !== undefined)
      currentConfig.browser.launchOptions.slowMo = changes.slowMo;

    if (changes.devtools !== undefined)
      currentConfig.browser.launchOptions.devtools = changes.devtools;

    if (changes.args && Array.isArray(changes.args)) {
      // Merge with existing args, avoiding duplicates
      const existingArgs = currentConfig.browser.launchOptions.args || [];
      const newArgs = [...existingArgs];

      for (const arg of changes.args) {
        if (!existingArgs.includes(arg))
          newArgs.push(arg);

      }

      currentConfig.browser.launchOptions.args = newArgs;
    }

    // Store the modified config
    (this as any).config = currentConfig;

    // Close the current browser context to force recreation with new settings
    await this.closeBrowserContext();

    // Clear tabs since they're attached to the old context
    this._tabs = [];
    this._currentTab = undefined;

    testDebug(`browser config updated for session ${this.sessionId}: headless=${currentConfig.browser.launchOptions.headless}, viewport=${JSON.stringify(currentConfig.browser.contextOptions.viewport)}, slowMo=${currentConfig.browser.launchOptions.slowMo}, devtools=${currentConfig.browser.launchOptions.devtools}`);
  }

  async stopVideoRecording(): Promise<string[]> {
    if (!this._videoRecordingConfig) {
      testDebug('stopVideoRecording called but no recording config found');
      return [];
    }

    testDebug(`stopVideoRecording: ${this._activePagesWithVideos.size} pages tracked for video`);
    const videoPaths: string[] = [];

    // Force navigation on pages that don't have video objects yet
    // This ensures video recording actually starts
    for (const page of this._activePagesWithVideos) {
      try {
        if (!page.isClosed()) {
          const video = page.video();
          if (!video) {
            testDebug('Page has no video object, trying to trigger recording by navigating to about:blank');
            // Navigate to trigger video recording start
            await page.goto('about:blank');
            // Small delay to let video recording initialize
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        testDebug('Error triggering video recording on page:', error);
      }
    }

    // Collect video paths AFTER ensuring recording is active
    for (const page of this._activePagesWithVideos) {
      try {
        if (!page.isClosed()) {
          const video = page.video();
          if (video) {
            // Get the video path before closing
            const videoPath = await video.path();
            videoPaths.push(videoPath);
            testDebug(`Found video path: ${videoPath}`);
          } else {
            testDebug('Page still has no video object after navigation attempt');
          }
        }
      } catch (error) {
        testDebug('Error getting video path:', error);
      }
    }

    // Now close all pages to finalize videos
    for (const page of this._activePagesWithVideos) {
      try {
        if (!page.isClosed()) {
          testDebug(`Closing page for video finalization: ${page.url()}`);
          await page.close();
        }
      } catch (error) {
        testDebug('Error closing page for video recording:', error);
      }
    }

    // Keep recording config available for inspection until explicitly cleared
    // Don't clear it immediately to help with debugging
    testDebug(`stopVideoRecording complete: ${videoPaths.length} videos saved, config preserved for debugging`);

    // Clear the page tracking but keep config for status queries
    this._activePagesWithVideos.clear();

    return videoPaths;
  }

  // Add method to clear video recording state (called by start recording)
  clearVideoRecordingState(): void {
    this._videoRecordingConfig = undefined;
    this._videoBaseFilename = undefined;
    this._activePagesWithVideos.clear();
    this._videoRecordingPaused = false;
    this._pausedPageVideos.clear();
    this._currentVideoSegment = 1;
    this._autoRecordingEnabled = true;
    // Don't reset recording mode - let it persist between sessions
    testDebug('Video recording state cleared');
  }

  async pauseVideoRecording(): Promise<{ paused: number; message: string }> {
    if (!this._videoRecordingConfig) {
      testDebug('pauseVideoRecording called but no recording config found');
      return { paused: 0, message: 'No video recording is active' };
    }

    if (this._videoRecordingPaused) {
      testDebug('Video recording is already paused');
      return { paused: this._pausedPageVideos.size, message: 'Video recording is already paused' };
    }

    testDebug(`pauseVideoRecording: attempting to pause ${this._activePagesWithVideos.size} active recordings`);

    // Store current video objects and close pages to pause recording
    let pausedCount = 0;
    for (const page of this._activePagesWithVideos) {
      try {
        if (!page.isClosed()) {
          const video = page.video();
          if (video) {
            // Store the video object for later resume
            this._pausedPageVideos.set(page, video);
            testDebug(`Stored video object for page: ${page.url()}`);
            pausedCount++;
          }
        }
      } catch (error) {
        testDebug('Error pausing video on page:', error);
      }
    }

    this._videoRecordingPaused = true;
    testDebug(`Video recording paused: ${pausedCount} recordings stored`);

    return {
      paused: pausedCount,
      message: `Video recording paused. ${pausedCount} active recordings stored.`
    };
  }

  async resumeVideoRecording(): Promise<{ resumed: number; message: string }> {
    if (!this._videoRecordingConfig) {
      testDebug('resumeVideoRecording called but no recording config found');
      return { resumed: 0, message: 'No video recording is configured' };
    }

    if (!this._videoRecordingPaused) {
      testDebug('Video recording is not currently paused');
      return { resumed: 0, message: 'Video recording is not currently paused' };
    }

    testDebug(`resumeVideoRecording: attempting to resume ${this._pausedPageVideos.size} paused recordings`);

    // Resume recording by ensuring fresh browser context
    // The paused videos are automatically finalized and new ones will start
    let resumedCount = 0;

    // Force context recreation to start fresh recording
    if (this._browserContextPromise)
      await this.closeBrowserContext();


    // Clear the paused videos map as we'll get new video objects
    const pausedCount = this._pausedPageVideos.size;
    this._pausedPageVideos.clear();
    resumedCount = pausedCount;

    this._videoRecordingPaused = false;
    testDebug(`Video recording resumed: ${resumedCount} recordings will restart on next page creation`);

    return {
      resumed: resumedCount,
      message: `Video recording resumed. ${resumedCount} recordings will restart when pages are created.`
    };
  }

  isVideoRecordingPaused(): boolean {
    return this._videoRecordingPaused;
  }

  // Smart Recording Management
  setVideoRecordingMode(mode: 'continuous' | 'smart' | 'action-only' | 'segment'): void {
    this._videoRecordingMode = mode;
    testDebug(`Video recording mode set to: ${mode}`);
  }

  getVideoRecordingMode(): string {
    return this._videoRecordingMode;
  }

  async beginVideoAction(actionName: string): Promise<void> {
    if (!this._videoRecordingConfig || !this._autoRecordingEnabled)
      return;

    testDebug(`beginVideoAction: ${actionName}, mode: ${this._videoRecordingMode}`);

    switch (this._videoRecordingMode) {
      case 'continuous':
        // Always recording, no action needed
        break;

      case 'smart':
      case 'action-only':
        // Resume recording if paused
        if (this._videoRecordingPaused)
          await this.resumeVideoRecording();

        break;

      case 'segment':
        // Create new segment for this action
        if (this._videoRecordingPaused)
          await this.resumeVideoRecording();

        // Note: Actual segment creation happens in stopVideoRecording
        break;
    }
  }

  async endVideoAction(actionName: string, shouldPause: boolean = true): Promise<void> {
    if (!this._videoRecordingConfig || !this._autoRecordingEnabled)
      return;

    testDebug(`endVideoAction: ${actionName}, shouldPause: ${shouldPause}, mode: ${this._videoRecordingMode}`);

    switch (this._videoRecordingMode) {
      case 'continuous':
        // Never auto-pause in continuous mode
        break;

      case 'smart':
      case 'action-only':
        // Auto-pause after action unless explicitly told not to
        if (shouldPause && !this._videoRecordingPaused)
          await this.pauseVideoRecording();

        break;

      case 'segment':
        // Always end segment after action
        await this.finalizeCurrentVideoSegment();
        break;
    }
  }

  async finalizeCurrentVideoSegment(): Promise<string[]> {
    if (!this._videoRecordingConfig)
      return [];

    testDebug(`Finalizing video segment ${this._currentVideoSegment}`);

    // Get current video paths before creating new segment
    const segmentPaths = await this.stopVideoRecording();

    // Immediately restart recording for next segment
    this._currentVideoSegment++;
    const newFilename = `${this._videoBaseFilename}-segment-${this._currentVideoSegment}`;

    // Restart recording with new segment filename
    this.setVideoRecording(this._videoRecordingConfig, newFilename);

    return segmentPaths;
  }

  // Request Interception and Traffic Analysis

  /**
   * Start comprehensive request monitoring and interception
   */
  async startRequestMonitoring(options: RequestInterceptorOptions = {}): Promise<void> {
    if (this._requestInterceptor) {
      testDebug('Request interceptor already active, stopping previous instance');
      this._requestInterceptor.detach();
    }

    // Use artifact manager for output path if available
    if (!options.outputPath && this.sessionId) {
      const artifactManager = this.getArtifactManager();
      if (artifactManager)
        options.outputPath = artifactManager.getSubdirectory('requests');

    }

    this._requestInterceptor = new RequestInterceptor(options);

    // Attach to current tab if available
    const currentTab = this._currentTab;
    if (currentTab) {
      await this._requestInterceptor.attach(currentTab.page);
      testDebug('Request interceptor attached to current tab');
    }

    testDebug('Request monitoring started with options:', options);
  }

  /**
   * Get the active request interceptor
   */
  getRequestInterceptor(): RequestInterceptor | undefined {
    return this._requestInterceptor;
  }

  /**
   * Get artifact manager for the current session
   */
  getArtifactManager() {
    if (!this.sessionId)
      return undefined;

    const registry = ArtifactManagerRegistry.getInstance();
    return registry.getManager(this.sessionId);
  }

  /**
   * Stop request monitoring and clean up
   */
  stopRequestMonitoring(): void {
    if (this._requestInterceptor) {
      this._requestInterceptor.detach();
      this._requestInterceptor = undefined;
      testDebug('Request monitoring stopped');
    }
  }

  // Chrome Extension Management

  async installExtension(extensionPath: string, extensionName: string): Promise<void> {
    if (this.config.browser.browserName !== 'chromium')
      throw new Error('Chrome extensions are only supported with Chromium browser.');

    // Check if extension is already installed
    const existingExtension = this._installedExtensions.find(ext => ext.path === extensionPath);
    if (existingExtension)
      throw new Error(`Extension is already installed: ${extensionName} (${extensionPath})`);

    // Read extension manifest to get version info
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.join(extensionPath, 'manifest.json');

    let version: string | undefined;
    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      version = manifest.version;
    } catch (error) {
      testDebug('Could not read extension version:', error);
    }

    // Add to installed extensions list
    this._installedExtensions.push({
      path: extensionPath,
      name: extensionName,
      version
    });

    testDebug(`Installing Chrome extension: ${extensionName} from ${extensionPath}`);

    // Restart browser with updated extension list
    await this._restartBrowserWithExtensions();
  }

  getInstalledExtensions(): Array<{ path: string; name: string; version?: string }> {
    return [...this._installedExtensions];
  }

  async uninstallExtension(extensionPath: string): Promise<{ path: string; name: string; version?: string } | null> {
    const extensionIndex = this._installedExtensions.findIndex(ext => ext.path === extensionPath);

    if (extensionIndex === -1)
      return null;

    const removedExtension = this._installedExtensions.splice(extensionIndex, 1)[0];

    testDebug(`Uninstalling Chrome extension: ${removedExtension.name} from ${extensionPath}`);

    // Restart browser with updated extension list
    await this._restartBrowserWithExtensions();

    return removedExtension;
  }

  private async _restartBrowserWithExtensions(): Promise<void> {
    // Close existing browser context if open
    if (this._browserContextPromise) {
      const { close } = await this._browserContextPromise;
      await close();
      this._browserContextPromise = undefined;
    }

    // Clear all tabs as they will be recreated
    this._tabs = [];
    this._currentTab = undefined;

    testDebug(`Restarting browser with ${this._installedExtensions.length} extensions`);
  }

  private _getExtensionPaths(): string[] {
    return this._installedExtensions.map(ext => ext.path);
  }

  // Enhanced differential snapshot methods with React-style reconciliation
  private _lastAccessibilityTree: AccessibilityNode[] = [];
  private _lastRawSnapshot: string = '';

  private generateSimpleTextDiff(oldSnapshot: string, newSnapshot: string): string[] {
    const changes: string[] = [];
    
    // Basic text comparison - count lines added/removed/changed
    const oldLines = oldSnapshot.split('\n').filter(line => line.trim());
    const newLines = newSnapshot.split('\n').filter(line => line.trim());
    
    const addedLines = newLines.length - oldLines.length;
    const similarity = this.calculateSimilarity(oldSnapshot, newSnapshot);
    
    if (Math.abs(addedLines) > 0) {
      if (addedLines > 0) {
        changes.push(`📈 **Content added:** ${addedLines} lines (+${Math.round((addedLines / oldLines.length) * 100)}%)`);
      } else {
        changes.push(`📉 **Content removed:** ${Math.abs(addedLines)} lines (${Math.round((Math.abs(addedLines) / oldLines.length) * 100)}%)`);
      }
    }
    
    if (similarity < 0.9) {
      changes.push(`🔄 **Content modified:** ${Math.round((1 - similarity) * 100)}% different`);
    }
    
    // Simple keyword extraction for changed elements
    const addedKeywords = this.extractKeywords(newSnapshot).filter(k => !this.extractKeywords(oldSnapshot).includes(k));
    if (addedKeywords.length > 0) {
      changes.push(`🆕 **New elements:** ${addedKeywords.slice(0, 5).join(', ')}`);
    }
    
    return changes.length > 0 ? changes : ['🔄 **Page structure changed** (minor text differences)'];
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str1.length][str2.length];
  }

  private extractKeywords(text: string): string[] {
    const matches = text.match(/(?:button|link|input|form|heading|text)[\s"'][^"']*["']/g) || [];
    return matches.map(m => m.replace(/["']/g, '').trim()).slice(0, 10);
  }

  private formatAccessibilityDiff(diff: AccessibilityDiff): string[] {
    const changes: string[] = [];

    try {
      // Summary section (for human understanding)
      const summaryParts: string[] = [];

      if (diff.added.length > 0) {
        const interactive = diff.added.filter(n => n.type === 'interactive' || n.type === 'navigation');
        const errors = diff.added.filter(n => n.type === 'error');
        const content = diff.added.filter(n => n.type === 'content');

        if (interactive.length > 0)
          summaryParts.push(`${interactive.length} interactive`);
        if (errors.length > 0)
          summaryParts.push(`${errors.length} errors`);
        if (content.length > 0)
          summaryParts.push(`${content.length} content`);

        changes.push(`🆕 **Added:** ${summaryParts.join(', ')} elements`);
      }

      if (diff.removed.length > 0)
        changes.push(`❌ **Removed:** ${diff.removed.length} elements`);


      if (diff.modified.length > 0)
        changes.push(`🔄 **Modified:** ${diff.modified.length} elements`);


      // Actionable elements section (for model interaction)
      const actionableElements: string[] = [];

      // New interactive elements that models can click/interact with
      const newInteractive = diff.added.filter(node =>
        (node.type === 'interactive' || node.type === 'navigation') && node.ref
      );

      if (newInteractive.length > 0) {
        actionableElements.push('');
        actionableElements.push('**🎯 New Interactive Elements:**');
        newInteractive.forEach(node => {
          const elementDesc = `${node.role || 'element'} "${node.text}"`;
          actionableElements.push(`- ${elementDesc} <click>ref="${node.ref}"</click>`);
        });
      }

      // New form elements
      const newForms = diff.added.filter(node => node.type === 'form' && node.ref);
      if (newForms.length > 0) {
        actionableElements.push('');
        actionableElements.push('**📝 New Form Elements:**');
        newForms.forEach(node => {
          const elementDesc = `${node.role || 'input'} "${node.text}"`;
          actionableElements.push(`- ${elementDesc} <input>ref="${node.ref}"</input>`);
        });
      }

      // New errors/alerts that need attention
      const newErrors = diff.added.filter(node => node.type === 'error');
      if (newErrors.length > 0) {
        actionableElements.push('');
        actionableElements.push('**⚠️ New Alerts/Errors:**');
        newErrors.forEach(node => {
          actionableElements.push(`- ${node.text}`);
        });
      }

      // Modified interactive elements (state changes)
      const modifiedInteractive = diff.modified.filter(change =>
        (change.after.type === 'interactive' || change.after.type === 'navigation') && change.after.ref
      );

      if (modifiedInteractive.length > 0) {
        actionableElements.push('');
        actionableElements.push('**🔄 Modified Interactive Elements:**');
        modifiedInteractive.forEach(change => {
          const elementDesc = `${change.after.role || 'element'} "${change.after.text}"`;
          const changeDesc = change.before.text !== change.after.text ?
            ` (was "${change.before.text}")` : ' (state changed)';
          actionableElements.push(`- ${elementDesc}${changeDesc} <click>ref="${change.after.ref}"</click>`);
        });
      }

      changes.push(...actionableElements);
      return changes;

    } catch (error) {
      // Fallback to simple change detection
      return ['🔄 **Page structure changed** (parsing error)'];
    }
  }

  private detectChangeType(oldElements: string, newElements: string): string {
    if (!oldElements && newElements)
      return 'appeared';
    if (oldElements && !newElements)
      return 'disappeared';
    if (oldElements.length < newElements.length)
      return 'added';
    if (oldElements.length > newElements.length)
      return 'removed';
    return 'modified';
  }

  private parseAccessibilitySnapshot(snapshot: string): AccessibilityNode[] {
    // Parse accessibility snapshot into structured tree (React-style Virtual DOM)
    const lines = snapshot.split('\n');
    const nodes: AccessibilityNode[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;

      // Extract element information using regex patterns
      const refMatch = trimmed.match(/ref="([^"]+)"/);
      const textMatch = trimmed.match(/text:\s*"?([^"]+)"?/) || trimmed.match(/"([^"]+)"/);
      const roleMatch = trimmed.match(/(\w+)\s+"/); // button "text", link "text", etc.

      if (refMatch || textMatch) {
        const node: AccessibilityNode = {
          type: this.categorizeElementType(trimmed),
          ref: refMatch?.[1],
          text: textMatch?.[1] || trimmed.substring(0, 100),
          role: roleMatch?.[1],
          attributes: this.extractAttributes(trimmed)
        };
        nodes.push(node);
      }
    }

    return nodes;
  }

  private categorizeElementType(line: string): AccessibilityNode['type'] {
    if (line.includes('error') || line.includes('Error') || line.includes('alert'))
      return 'error';
    if (line.includes('button') || line.includes('clickable'))
      return 'interactive';
    if (line.includes('link') || line.includes('navigation') || line.includes('nav'))
      return 'navigation';
    if (line.includes('form') || line.includes('input') || line.includes('textbox'))
      return 'form';
    return 'content';
  }

  private extractAttributes(line: string): Record<string, string> {
    const attributes: Record<string, string> = {};

    // Extract common attributes like disabled, checked, etc.
    if (line.includes('disabled'))
      attributes.disabled = 'true';
    if (line.includes('checked'))
      attributes.checked = 'true';
    if (line.includes('expanded'))
      attributes.expanded = 'true';

    return attributes;
  }

  private computeAccessibilityDiff(oldTree: AccessibilityNode[], newTree: AccessibilityNode[]): AccessibilityDiff {
    // React-style reconciliation algorithm
    const diff: AccessibilityDiff = {
      added: [],
      removed: [],
      modified: []
    };

    // Create maps for efficient lookup (like React's key-based reconciliation)
    const oldMap = new Map<string, AccessibilityNode>();
    const newMap = new Map<string, AccessibilityNode>();

    // Use ref as key, fallback to text for nodes without refs
    oldTree.forEach(node => {
      const key = node.ref || `${node.type}:${node.text}`;
      oldMap.set(key, node);
    });

    newTree.forEach(node => {
      const key = node.ref || `${node.type}:${node.text}`;
      newMap.set(key, node);
    });

    // Find added nodes (in new but not in old)
    for (const [key, node] of newMap) {
      if (!oldMap.has(key))
        diff.added.push(node);

    }

    // Find removed nodes (in old but not in new)
    for (const [key, node] of oldMap) {
      if (!newMap.has(key))
        diff.removed.push(node);

    }

    // Find modified nodes (in both but different)
    for (const [key, newNode] of newMap) {
      const oldNode = oldMap.get(key);
      if (oldNode && this.nodesDiffer(oldNode, newNode))
        diff.modified.push({ before: oldNode, after: newNode });

    }

    return diff;
  }

  private nodesDiffer(oldNode: AccessibilityNode, newNode: AccessibilityNode): boolean {
    return oldNode.text !== newNode.text ||
           oldNode.role !== newNode.role ||
           JSON.stringify(oldNode.attributes) !== JSON.stringify(newNode.attributes);
  }

  private createSnapshotFingerprint(snapshot: string): string {
    // Create lightweight fingerprint for change detection
    const tree = this.parseAccessibilitySnapshot(snapshot);
    return JSON.stringify(tree.map(node => ({
      type: node.type,
      ref: node.ref,
      text: node.text.substring(0, 50), // Truncate for fingerprint
      role: node.role
    }))).substring(0, 2000);
  }

  async generateDifferentialSnapshot(): Promise<string> {
    if (!this.config.differentialSnapshots || !this.currentTab())
      return '';


    const currentTab = this.currentTabOrDie();
    const currentUrl = currentTab.page.url();
    const currentTitle = await currentTab.page.title();
    const rawSnapshot = await currentTab.captureSnapshot();
    const currentFingerprint = this.createSnapshotFingerprint(rawSnapshot);

    // First time or no previous state
    if (!this._lastSnapshotFingerprint || !this._lastPageState) {
      this._lastSnapshotFingerprint = currentFingerprint;
      this._lastPageState = { url: currentUrl, title: currentTitle };
      this._lastAccessibilityTree = this.parseAccessibilitySnapshotSafe(rawSnapshot);
      this._lastRawSnapshot = this.truncateSnapshotSafe(rawSnapshot);

      return `### 🔄 Differential Snapshot Mode (ACTIVE)
      
**📊 Performance Optimization:** You're receiving change summaries + actionable elements instead of full page snapshots.

✓ **Initial page state captured:**
- URL: ${currentUrl}
- Title: ${currentTitle}
- Elements tracked: ${this._lastAccessibilityTree.length} interactive/content items

**🔄 Next Operations:** Will show only what changes between interactions + specific element refs for interaction

**⚙️ To get full page snapshots instead:**
- Use \`browser_snapshot\` tool for complete page details anytime
- Disable differential mode: \`browser_configure_snapshots {"differentialSnapshots": false}\`
- CLI flag: \`--no-differential-snapshots\``;
    }

    // Compare with previous state
    const changes: string[] = [];
    let hasSignificantChanges = false;

    if (this._lastPageState.url !== currentUrl) {
      changes.push(`📍 **URL changed:** ${this._lastPageState.url} → ${currentUrl}`);
      hasSignificantChanges = true;
    }

    if (this._lastPageState.title !== currentTitle) {
      changes.push(`📝 **Title changed:** "${this._lastPageState.title}" → "${currentTitle}"`);
      hasSignificantChanges = true;
    }

    // Enhanced change detection with multiple diff modes
    if (this._lastSnapshotFingerprint !== currentFingerprint) {
      const mode = this.config.differentialMode || 'semantic';
      
      if (mode === 'semantic' || mode === 'both') {
        const currentTree = this.parseAccessibilitySnapshotSafe(rawSnapshot);
        const diff = this.computeAccessibilityDiff(this._lastAccessibilityTree, currentTree);
        this._lastAccessibilityTree = currentTree;
        
        // Apply ultra-precision ripgrep filtering if configured
        if ((this.config as any).filterPattern) {
          const filterParams: DifferentialFilterParams = {
            filter_pattern: (this.config as any).filterPattern,
            filter_fields: (this.config as any).filterFields,
            filter_mode: (this.config as any).filterMode || 'content',
            case_sensitive: (this.config as any).caseSensitive !== false,
            whole_words: (this.config as any).wholeWords || false,
            context_lines: (this.config as any).contextLines,
            invert_match: (this.config as any).invertMatch || false,
            max_matches: (this.config as any).maxMatches
          };
          
          try {
            const filteredResult = await this._filteringEngine.filterDifferentialChanges(
              diff,
              filterParams,
              this._lastRawSnapshot
            );
            
            const filteredChanges = this.formatFilteredDifferentialSnapshot(filteredResult);
            if (mode === 'both') {
              changes.push('**🔍 Filtered Semantic Analysis (Ultra-Precision):**');
            }
            changes.push(...filteredChanges);
          } catch (error) {
            // Fallback to unfiltered changes if filtering fails
            console.warn('Filtering failed, using unfiltered differential:', error);
            const semanticChanges = this.formatAccessibilityDiff(diff);
            if (mode === 'both') {
              changes.push('**🧠 Semantic Analysis (React-style):**');
            }
            changes.push(...semanticChanges);
          }
        } else {
          const semanticChanges = this.formatAccessibilityDiff(diff);
          if (mode === 'both') {
            changes.push('**🧠 Semantic Analysis (React-style):**');
          }
          changes.push(...semanticChanges);
        }
      }
      
      if (mode === 'simple' || mode === 'both') {
        const simpleChanges = this.generateSimpleTextDiff(this._lastRawSnapshot, rawSnapshot);
        if (mode === 'both') {
          changes.push('', '**📝 Simple Text Diff:**');
        }
        changes.push(...simpleChanges);
      }
      
      // Update raw snapshot tracking with memory-safe storage
      this._lastRawSnapshot = this.truncateSnapshotSafe(rawSnapshot);
      hasSignificantChanges = true;
    }

    // Check for console messages or errors
    const recentConsole = (currentTab as any)._takeRecentConsoleMarkdown?.() || [];
    if (recentConsole.length > 0) {
      changes.push(`🔍 **New console activity** (${recentConsole.length} messages)`);
      hasSignificantChanges = true;
    }

    // Update tracking
    this._lastSnapshotFingerprint = currentFingerprint;
    this._lastPageState = { url: currentUrl, title: currentTitle };

    if (!hasSignificantChanges) {
      return `### 🔄 Differential Snapshot (No Changes)

**📊 Performance Mode:** Showing change summary instead of full page snapshot

✓ **Status:** No significant changes detected since last action
- Same URL: ${currentUrl}
- Same title: "${currentTitle}"
- DOM structure: unchanged  
- Console activity: none

**⚙️ Need full page details?**
- Use \`browser_snapshot\` tool for complete accessibility snapshot
- Disable differential mode: \`browser_configure_snapshots {"differentialSnapshots": false}\``;
    }


    const result = [
      '### 🔄 Differential Snapshot (Changes Detected)',
      '',
      '**📊 Performance Mode:** Showing only what changed since last action',
      '',
      '🆕 **Changes detected:**',
      ...changes.map(change => `- ${change}`),
      '',
      '**⚙️ Need full page details?**',
      '- Use `browser_snapshot` tool for complete accessibility snapshot',
      '- Disable differential mode: `browser_configure_snapshots {"differentialSnapshots": false}`'
    ];

    return result.join('\n');
  }

  resetDifferentialSnapshot(): void {
    this._lastSnapshotFingerprint = undefined;
    this._lastPageState = undefined;
    this._lastAccessibilityTree = [];
    this._lastRawSnapshot = '';
  }

  /**
   * Memory-safe snapshot truncation to prevent unbounded growth
   */
  private truncateSnapshotSafe(snapshot: string): string {
    if (snapshot.length > Context.MAX_SNAPSHOT_SIZE) {
      const truncated = snapshot.substring(0, Context.MAX_SNAPSHOT_SIZE);
      console.warn(`Snapshot truncated to ${Context.MAX_SNAPSHOT_SIZE} bytes to prevent memory issues`);
      return truncated + '\n... [TRUNCATED FOR MEMORY SAFETY]';
    }
    return snapshot;
  }

  /**
   * Memory-safe accessibility tree parsing with size limits
   */
  private parseAccessibilitySnapshotSafe(snapshot: string): AccessibilityNode[] {
    try {
      const tree = this.parseAccessibilitySnapshot(snapshot);
      
      // Limit tree size to prevent memory issues
      if (tree.length > Context.MAX_ACCESSIBILITY_TREE_SIZE) {
        console.warn(`Accessibility tree truncated from ${tree.length} to ${Context.MAX_ACCESSIBILITY_TREE_SIZE} elements`);
        return tree.slice(0, Context.MAX_ACCESSIBILITY_TREE_SIZE);
      }
      
      return tree;
    } catch (error) {
      console.warn('Error parsing accessibility snapshot, returning empty tree:', error);
      return [];
    }
  }

  /**
   * Clean up filtering resources to prevent memory leaks
   */
  private async _cleanupFilteringResources(): Promise<void> {
    try {
      // Clear differential state to free memory
      this._lastSnapshotFingerprint = undefined;
      this._lastPageState = undefined;
      this._lastAccessibilityTree = [];
      this._lastRawSnapshot = '';
      
      // Clean up filtering engine temporary files
      if (this._filteringEngine) {
        // The engine's temp directory cleanup is handled by the engine itself
        // But we can explicitly trigger cleanup here if needed
        await this._filteringEngine.cleanup?.();
      }
      
      testDebug(`Cleaned up filtering resources for session: ${this.sessionId}`);
    } catch (error) {
      // Log but don't throw - disposal should continue
      console.warn('Error during filtering resource cleanup:', error);
    }
  }

  /**
   * Format filtered differential snapshot results with ultra-precision metrics
   */
  private formatFilteredDifferentialSnapshot(filterResult: any): string[] {
    const lines: string[] = [];
    
    if (filterResult.match_count === 0) {
      lines.push('🚫 **No matches found in differential changes**');
      lines.push(`- Pattern: "${filterResult.pattern_used}"`);
      lines.push(`- Fields searched: [${filterResult.fields_searched.join(', ')}]`);
      lines.push(`- Total changes available: ${filterResult.total_items}`);
      return lines;
    }
    
    lines.push(`🔍 **Filtered Differential Changes (${filterResult.match_count} matches found)**`);
    
    // Show performance metrics
    if (filterResult.differential_performance) {
      const perf = filterResult.differential_performance;
      lines.push(`📊 **Ultra-Precision Performance:**`);
      lines.push(`- Differential reduction: ${perf.size_reduction_percent}%`);
      lines.push(`- Filter reduction: ${perf.filter_reduction_percent}%`);
      lines.push(`- **Total precision: ${perf.total_reduction_percent}%**`);
      lines.push('');
    }
    
    // Show change breakdown if available
    if (filterResult.change_breakdown) {
      const breakdown = filterResult.change_breakdown;
      if (breakdown.elements_added_matches > 0) {
        lines.push(`🆕 **Added elements matching pattern:** ${breakdown.elements_added_matches}`);
      }
      if (breakdown.elements_removed_matches > 0) {
        lines.push(`❌ **Removed elements matching pattern:** ${breakdown.elements_removed_matches}`);
      }
      if (breakdown.elements_modified_matches > 0) {
        lines.push(`🔄 **Modified elements matching pattern:** ${breakdown.elements_modified_matches}`);
      }
      if (breakdown.console_activity_matches > 0) {
        lines.push(`🔍 **Console activity matching pattern:** ${breakdown.console_activity_matches}`);
      }
    }
    
    // Show filter metadata
    lines.push('');
    lines.push('**🎯 Filter Applied:**');
    lines.push(`- Pattern: "${filterResult.pattern_used}"`);
    lines.push(`- Fields: [${filterResult.fields_searched.join(', ')}]`);
    lines.push(`- Execution time: ${filterResult.execution_time_ms}ms`);
    lines.push(`- Match efficiency: ${Math.round((filterResult.match_count / filterResult.total_items) * 100)}%`);
    
    return lines;
  }

  updateSnapshotConfig(updates: {
    includeSnapshots?: boolean;
    maxSnapshotTokens?: number;
    differentialSnapshots?: boolean;
    differentialMode?: 'semantic' | 'simple' | 'both';
    consoleOutputFile?: string;
    // Universal Ripgrep Filtering Parameters
    filterPattern?: string;
    filterFields?: string[];
    filterMode?: 'content' | 'count' | 'files';
    caseSensitive?: boolean;
    wholeWords?: boolean;
    contextLines?: number;
    invertMatch?: boolean;
    maxMatches?: number;
  }): void {
    // Update configuration at runtime
    if (updates.includeSnapshots !== undefined)
      (this.config as any).includeSnapshots = updates.includeSnapshots;


    if (updates.maxSnapshotTokens !== undefined)
      (this.config as any).maxSnapshotTokens = updates.maxSnapshotTokens;


    if (updates.differentialSnapshots !== undefined) {
      (this.config as any).differentialSnapshots = updates.differentialSnapshots;

      // Reset differential state when toggling
      if (updates.differentialSnapshots)
        this.resetDifferentialSnapshot();

    }
    if (updates.differentialMode !== undefined)
      (this.config as any).differentialMode = updates.differentialMode;

    if (updates.consoleOutputFile !== undefined)
      (this.config as any).consoleOutputFile = updates.consoleOutputFile === '' ? undefined : updates.consoleOutputFile;

    // Process ripgrep filtering parameters
    if (updates.filterPattern !== undefined)
      (this.config as any).filterPattern = updates.filterPattern;

    if (updates.filterFields !== undefined)
      (this.config as any).filterFields = updates.filterFields;

    if (updates.filterMode !== undefined)
      (this.config as any).filterMode = updates.filterMode;

    if (updates.caseSensitive !== undefined)
      (this.config as any).caseSensitive = updates.caseSensitive;

    if (updates.wholeWords !== undefined)
      (this.config as any).wholeWords = updates.wholeWords;

    if (updates.contextLines !== undefined)
      (this.config as any).contextLines = updates.contextLines;

    if (updates.invertMatch !== undefined)
      (this.config as any).invertMatch = updates.invertMatch;

    if (updates.maxMatches !== undefined)
      (this.config as any).maxMatches = updates.maxMatches;

  }

  /**
   * Auto-inject debug toolbar and custom code into a new page
   */
  private async _injectCodeIntoPage(page: playwright.Page): Promise<void> {
    if (!this.injectionConfig || !this.injectionConfig.enabled)
      return;


    try {
      // Import the injection functions (dynamic import to avoid circular deps)
      const { generateDebugToolbarScript, wrapInjectedCode, generateInjectionScript } = await import('./tools/codeInjection.js');

      // Inject debug toolbar if enabled
      if (this.injectionConfig.debugToolbar.enabled) {
        const toolbarScript = generateDebugToolbarScript(
            this.injectionConfig.debugToolbar,
            this.sessionId,
            this.clientVersion,
            this._sessionStartTime
        );

        // Add to page init script for future navigations
        await page.addInitScript(toolbarScript);

        // Execute immediately if page is already loaded
        if (page.url() && page.url() !== 'about:blank') {
          await page.evaluate(toolbarScript).catch(error => {
            testDebug('Error executing debug toolbar script on existing page:', error);
          });
        }

        testDebug(`Debug toolbar auto-injected into page: ${page.url()}`);
      }

      // Inject custom code
      for (const injection of this.injectionConfig.customInjections) {
        if (!injection.enabled || !injection.autoInject)
          continue;


        try {
          const wrappedCode = wrapInjectedCode(
              injection,
              this.sessionId,
              this.injectionConfig.debugToolbar.projectName
          );
          const injectionScript = generateInjectionScript(wrappedCode);

          // Add to page init script
          await page.addInitScript(injectionScript);

          // Execute immediately if page is already loaded
          if (page.url() && page.url() !== 'about:blank') {
            await page.evaluate(injectionScript).catch(error => {
              testDebug(`Error executing custom injection "${injection.name}" on existing page:`, error);
            });
          }

          testDebug(`Custom injection "${injection.name}" auto-injected into page: ${page.url()}`);
        } catch (error) {
          testDebug(`Error injecting custom code "${injection.name}":`, error);
        }
      }
    } catch (error) {
      testDebug('Error in code injection system:', error);
    }
  }
}
