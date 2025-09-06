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

  constructor(tools: Tool[], config: FullConfig, browserContextFactory: BrowserContextFactory, environmentIntrospector?: EnvironmentIntrospector) {
    this.tools = tools;
    this.config = config;
    this._browserContextFactory = browserContextFactory;
    this._environmentIntrospector = environmentIntrospector || new EnvironmentIntrospector();

    // Generate unique session ID
    this._sessionStartTime = Date.now();
    this.sessionId = this._generateSessionId();

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
        if (!existingArgs.includes(arg)) {
          newArgs.push(arg);
        }
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
    if (this._browserContextPromise) {
      await this.closeBrowserContext();
    }
    
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
    if (!this._videoRecordingConfig || !this._autoRecordingEnabled) return;

    testDebug(`beginVideoAction: ${actionName}, mode: ${this._videoRecordingMode}`);

    switch (this._videoRecordingMode) {
      case 'continuous':
        // Always recording, no action needed
        break;
        
      case 'smart':
      case 'action-only':
        // Resume recording if paused
        if (this._videoRecordingPaused) {
          await this.resumeVideoRecording();
        }
        break;
        
      case 'segment':
        // Create new segment for this action
        if (this._videoRecordingPaused) {
          await this.resumeVideoRecording();
        }
        // Note: Actual segment creation happens in stopVideoRecording
        break;
    }
  }

  async endVideoAction(actionName: string, shouldPause: boolean = true): Promise<void> {
    if (!this._videoRecordingConfig || !this._autoRecordingEnabled) return;

    testDebug(`endVideoAction: ${actionName}, shouldPause: ${shouldPause}, mode: ${this._videoRecordingMode}`);

    switch (this._videoRecordingMode) {
      case 'continuous':
        // Never auto-pause in continuous mode
        break;
        
      case 'smart':
      case 'action-only':
        // Auto-pause after action unless explicitly told not to
        if (shouldPause && !this._videoRecordingPaused) {
          await this.pauseVideoRecording();
        }
        break;
        
      case 'segment':
        // Always end segment after action
        await this.finalizeCurrentVideoSegment();
        break;
    }
  }

  async finalizeCurrentVideoSegment(): Promise<string[]> {
    if (!this._videoRecordingConfig) return [];

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

  // Differential snapshot methods
  private createSnapshotFingerprint(snapshot: string): string {
    // Create a lightweight fingerprint of the page structure
    // Extract key elements: URL, title, main interactive elements, error states
    const lines = snapshot.split('\n');
    const significantLines: string[] = [];

    for (const line of lines) {
      if (line.includes('Page URL:') ||
          line.includes('Page Title:') ||
          line.includes('error') || line.includes('Error') ||
          line.includes('button') || line.includes('link') ||
          line.includes('tab') || line.includes('navigation') ||
          line.includes('form') || line.includes('input'))
        significantLines.push(line.trim());

    }

    return significantLines.join('|').substring(0, 1000); // Limit size
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
      return `### Page Changes (Differential Mode - First Snapshot)\n✓ Initial page state captured\n- URL: ${currentUrl}\n- Title: ${currentTitle}\n\n**💡 Tip: Subsequent operations will show only changes**`;
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

    if (this._lastSnapshotFingerprint !== currentFingerprint) {
      changes.push(`🔄 **Page structure changed** (DOM elements modified)`);
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

    if (!hasSignificantChanges)
      return `### Page Changes (Differential Mode)\n✓ **No significant changes detected**\n- Same URL: ${currentUrl}\n- Same title: "${currentTitle}"\n- DOM structure: unchanged\n- Console activity: none\n\n**💡 Tip: Use \`browser_snapshot\` for full page view**`;


    const result = [
      '### Page Changes (Differential Mode)',
      `🆕 **Changes detected:**`,
      ...changes.map(change => `- ${change}`),
      '',
      '**💡 Tip: Use `browser_snapshot` for complete page details**'
    ];

    return result.join('\n');
  }

  resetDifferentialSnapshot(): void {
    this._lastSnapshotFingerprint = undefined;
    this._lastPageState = undefined;
  }

  updateSnapshotConfig(updates: {
    includeSnapshots?: boolean;
    maxSnapshotTokens?: number;
    differentialSnapshots?: boolean;
    consoleOutputFile?: string;
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

    if (updates.consoleOutputFile !== undefined)
      (this.config as any).consoleOutputFile = updates.consoleOutputFile === '' ? undefined : updates.consoleOutputFile;

  }
}
