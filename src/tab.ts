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

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import * as playwright from 'playwright';
import { callOnPageNoTrace, waitForCompletion } from './tools/utils.js';
import { logUnhandledError } from './log.js';
import { ManualPromise } from './manualPromise.js';
import { ModalState, WebNotification, RTCConnectionData, RTCStatsSnapshot } from './tools/tool.js';
import { outputFile } from './config.js';

import type { Context } from './context.js';

type PageEx = playwright.Page & {
  _snapshotForAI: () => Promise<string>;
};

const SNAPSHOT_TIMEOUT_MS = 10000; // 10 seconds

async function snapshotWithTimeout(page: playwright.Page): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(
        `[Snapshot timed out after ${SNAPSHOT_TIMEOUT_MS / 1000} seconds]\n` +
        `This can happen with complex pages, SVG files, or file:// URLs.\n` +
        `Use browser_take_screenshot to view the page, or disable auto-snapshots with browser_configure_snapshots.`
      );
    }, SNAPSHOT_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      (page as PageEx)._snapshotForAI(),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timeoutId)
      clearTimeout(timeoutId);
  }
}

export const TabEvents = {
  modalState: 'modalState'
};

export type TabEventsInterface = {
  [TabEvents.modalState]: [modalState: ModalState];
};

export class Tab extends EventEmitter<TabEventsInterface> {
  readonly context: Context;
  readonly page: playwright.Page;
  private _consoleMessages: ConsoleMessage[] = [];
  private _recentConsoleMessages: ConsoleMessage[] = [];
  private _requests: Map<playwright.Request, playwright.Response | null> = new Map();
  private _onPageClose: (tab: Tab) => void;
  private _modalStates: ModalState[] = [];
  private _downloads: { download: playwright.Download, finished: boolean, outputFile: string }[] = [];
  private _notifications: WebNotification[] = [];
  private _notificationIdCounter = 0;
  private _rtcConnections: RTCConnectionData[] = [];
  private _rtcConnectionIdCounter = 0;
  private _rtcStatsPollingInterval: NodeJS.Timeout | undefined;
  private _rtcMonitoringEnabled = false;

  constructor(context: Context, page: playwright.Page, onPageClose: (tab: Tab) => void) {
    super();
    this.context = context;
    this.page = page;
    this._onPageClose = onPageClose;
    page.on('console', event => this._handleConsoleMessage(messageToConsoleMessage(event)));
    page.on('pageerror', error => this._handleConsoleMessage(pageErrorToConsoleMessage(error)));
    page.on('request', request => this._requests.set(request, null));
    page.on('response', response => this._requests.set(response.request(), response));
    page.on('close', () => this._onClose());
    page.on('filechooser', chooser => {
      this.setModalState({
        type: 'fileChooser',
        description: 'File chooser',
        fileChooser: chooser,
      });
    });
    page.on('dialog', dialog => this._dialogShown(dialog));
    page.on('download', download => {
      void this._downloadStarted(download);
    });
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(5000);

    // Initialize service worker console capture
    void this._initializeServiceWorkerConsoleCapture();

    // Initialize extension-based console capture
    void this._initializeExtensionConsoleCapture();

    // Initialize notification capture
    void this._initializeNotificationCapture();
  }

  modalStates(): ModalState[] {
    return this._modalStates;
  }

  setModalState(modalState: ModalState) {
    this._modalStates.push(modalState);
    this.emit(TabEvents.modalState, modalState);
  }

  clearModalState(modalState: ModalState) {
    this._modalStates = this._modalStates.filter(state => state !== modalState);
  }

  modalStatesMarkdown(): string[] {
    const result: string[] = ['### Modal state'];
    if (this._modalStates.length === 0)
      result.push('- There is no modal state present');
    for (const state of this._modalStates) {
      const tool = this.context.tools.filter(tool => 'clearsModalState' in tool).find(tool => tool.clearsModalState === state.type);
      result.push(`- [${state.description}]: can be handled by the "${tool?.schema.name}" tool`);
    }
    return result;
  }

  private _dialogShown(dialog: playwright.Dialog) {
    this.setModalState({
      type: 'dialog',
      description: `"${dialog.type()}" dialog with message "${dialog.message()}"`,
      dialog,
    });
  }

  private async _downloadStarted(download: playwright.Download) {
    const entry = {
      download,
      finished: false,
      outputFile: await outputFile(this.context.config, download.suggestedFilename())
    };
    this._downloads.push(entry);
    await download.saveAs(entry.outputFile);
    entry.finished = true;
  }

  private _clearCollectedArtifacts() {
    this._consoleMessages.length = 0;
    this._recentConsoleMessages.length = 0;
    this._requests.clear();
  }

  private _handleConsoleMessage(message: ConsoleMessage) {
    this._consoleMessages.push(message);
    this._recentConsoleMessages.push(message);

    // Write to console output file if configured
    if (this.context.config.consoleOutputFile)
      this._writeConsoleToFile(message);

  }

  private _writeConsoleToFile(message: ConsoleMessage) {
    try {
      const consoleFile = this.context.config.consoleOutputFile!;
      const timestamp = new Date().toISOString();
      const url = this.page.url();
      const sessionId = this.context.sessionId;

      const logEntry = `[${timestamp}] [${sessionId}] [${url}] ${message.toString()}\n`;

      // Ensure directory exists
      const dir = path.dirname(consoleFile);
      if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });


      // Append to file (async to avoid blocking)
      fs.appendFile(consoleFile, logEntry, err => {
        if (err) {
          // Log error but don't fail the operation
          logUnhandledError(err);
        }
      });
    } catch (error) {
      // Silently handle errors to avoid breaking browser functionality
      logUnhandledError(error);
    }
  }

  private async _initializeServiceWorkerConsoleCapture() {
    try {
      // Only attempt CDP console capture for Chromium browsers
      if (this.page.context().browser()?.browserType().name() !== 'chromium')
        return;


      const cdpSession = await this.page.context().newCDPSession(this.page);

      // Enable runtime domain for console API calls
      await cdpSession.send('Runtime.enable');

      // Enable network domain for network-related errors
      await cdpSession.send('Network.enable');

      // Enable security domain for mixed content warnings
      await cdpSession.send('Security.enable');

      // Enable log domain for browser log entries
      await cdpSession.send('Log.enable');

      // Listen for console API calls (includes service worker console messages)
      cdpSession.on('Runtime.consoleAPICalled', (event: any) => {
        this._handleServiceWorkerConsole(event);
      });

      // Listen for runtime exceptions (includes service worker errors)
      cdpSession.on('Runtime.exceptionThrown', (event: any) => {
        this._handleServiceWorkerException(event);
      });

      // Listen for network failed events
      cdpSession.on('Network.loadingFailed', (event: any) => {
        this._handleNetworkError(event);
      });

      // Listen for security state changes (mixed content)
      cdpSession.on('Security.securityStateChanged', (event: any) => {
        this._handleSecurityStateChange(event);
      });

      // Listen for log entries (browser-level logs)
      cdpSession.on('Log.entryAdded', (event: any) => {
        this._handleLogEntry(event);
      });

    } catch (error) {
      // Silently handle CDP errors - not all contexts support CDP
      logUnhandledError(error);
    }
  }

  private _handleServiceWorkerConsole(event: any) {
    try {
      // Check if this console event is from a service worker context
      if (event.executionContextId && event.args && event.args.length > 0) {
        const message = event.args.map((arg: any) => {
          if (arg.value !== undefined)
            return String(arg.value);

          if (arg.unserializableValue)
            return arg.unserializableValue;

          if (arg.objectId)
            return '[object]';

          return '';
        }).join(' ');

        const location = `service-worker:${event.stackTrace?.callFrames?.[0]?.lineNumber || 0}`;

        const consoleMessage: ConsoleMessage = {
          type: event.type || 'log',
          text: message,
          toString: () => `[${(event.type || 'log').toUpperCase()}] ${message} @ ${location}`,
        };

        this._handleConsoleMessage(consoleMessage);
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _handleServiceWorkerException(event: any) {
    try {
      const exception = event.exceptionDetails;
      if (exception) {
        const text = exception.text || exception.exception?.description || 'Service Worker Exception';
        const location = `service-worker:${exception.lineNumber || 0}`;

        const consoleMessage: ConsoleMessage = {
          type: 'error',
          text: text,
          toString: () => `[ERROR] ${text} @ ${location}`,
        };

        this._handleConsoleMessage(consoleMessage);
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _handleNetworkError(event: any) {
    try {
      if (event.errorText && event.requestId) {
        const consoleMessage: ConsoleMessage = {
          type: 'error',
          text: `Network Error: ${event.errorText} (${event.type || 'unknown'})`,
          toString: () => `[NETWORK ERROR] ${event.errorText} @ ${event.type || 'network'}`,
        };

        this._handleConsoleMessage(consoleMessage);
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _handleSecurityStateChange(event: any) {
    try {
      if (event.securityState === 'insecure' && event.explanations) {
        for (const explanation of event.explanations) {
          if (explanation.description && explanation.description.includes('mixed content')) {
            const consoleMessage: ConsoleMessage = {
              type: 'error',
              text: `Security Warning: ${explanation.description}`,
              toString: () => `[SECURITY] ${explanation.description} @ security-layer`,
            };

            this._handleConsoleMessage(consoleMessage);
          }
        }
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _handleLogEntry(event: any) {
    try {
      const entry = event.entry;
      if (entry && entry.text) {
        const consoleMessage: ConsoleMessage = {
          type: entry.level || 'info',
          text: entry.text,
          toString: () => `[${(entry.level || 'info').toUpperCase()}] ${entry.text} @ browser-log`,
        };

        this._handleConsoleMessage(consoleMessage);
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private async _initializeExtensionConsoleCapture() {
    try {
      // Listen for console messages from the extension
      await this.page.evaluate(() => {
        window.addEventListener('message', event => {
          if (event.data && event.data.type === 'PLAYWRIGHT_CONSOLE_CAPTURE') {
            const message = event.data.consoleMessage;

            // Store the message in a global array for Playwright to access
            if (!(window as any)._playwrightExtensionConsoleMessages)
              (window as any)._playwrightExtensionConsoleMessages = [];

            (window as any)._playwrightExtensionConsoleMessages.push(message);
          }
        });
      });

      // Poll for new extension console messages
      setInterval(() => {
        void this._checkForExtensionConsoleMessages();
      }, 1000);

    } catch (error) {
      logUnhandledError(error);
    }
  }

  private async _checkForExtensionConsoleMessages() {
    try {
      const newMessages = await this.page.evaluate(() => {
        if (!(window as any)._playwrightExtensionConsoleMessages)
          return [];

        const messages = (window as any)._playwrightExtensionConsoleMessages;
        (window as any)._playwrightExtensionConsoleMessages = [];
        return messages;
      });

      for (const message of newMessages) {
        const consoleMessage: ConsoleMessage = {
          type: message.type || 'log',
          text: message.text || '',
          toString: () => `[${(message.type || 'log').toUpperCase()}] ${message.text} @ ${message.location || message.source}`,
        };

        this._handleConsoleMessage(consoleMessage);
      }
    } catch (error) {
      logUnhandledError(error);
    }
  }

  private async _initializeNotificationCapture() {
    try {
      // Expose a function that the injected script can call to report notifications
      await this.page.exposeFunction('__playwright_notificationShown', (data: {
        title: string;
        body?: string;
        icon?: string;
        tag?: string;
        requireInteraction?: boolean;
        actions?: Array<{ action: string; title: string; icon?: string }>;
        data?: unknown;
      }) => {
        this._handleNotificationShown(data);
      });

      // Inject the Notification interceptor script
      await this.page.addInitScript(() => {
        // Store original Notification constructor
        const OriginalNotification = window.Notification as any;

        // Create intercepting Notification class
        class InterceptedNotification extends OriginalNotification {
          constructor(title: string, options?: NotificationOptions) {
            super(title, options);

            // Report notification to Playwright
            try {
              const opts = options as any;
              (window as any).__playwright_notificationShown({
                title,
                body: opts?.body,
                icon: opts?.icon,
                tag: opts?.tag,
                requireInteraction: opts?.requireInteraction,
                actions: opts?.actions,
                data: opts?.data,
              });
            } catch (e) {
              // Ignore errors from reporting
            }
          }
        }

        // Copy static properties
        Object.defineProperty(InterceptedNotification, 'permission', {
          get: () => OriginalNotification.permission,
        });
        (InterceptedNotification as any).requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
        if (OriginalNotification.maxActions !== undefined)
          (InterceptedNotification as any).maxActions = OriginalNotification.maxActions;

        // Replace global Notification
        (window as any).Notification = InterceptedNotification;
      });

    } catch (error) {
      // Silently handle errors - page may not support exposeFunction
      logUnhandledError(error);
    }
  }

  async _initializeRTCMonitoring() {
    try {
      // Expose callback for new RTC connections
      await this.page.exposeFunction('__playwright_rtcConnectionCreated', (data: { internalId: string }) => {
        this._handleRTCConnectionCreated(data);
      });

      // Expose callback for state updates
      await this.page.exposeFunction('__playwright_rtcConnectionUpdate', (data: {
        id: string;
        connectionState: RTCPeerConnectionState;
        iceConnectionState: RTCIceConnectionState;
        iceGatheringState: RTCIceGatheringState;
        signalingState: RTCSignalingState;
      }) => {
        this._handleRTCConnectionUpdate(data);
      });

      // Inject RTCPeerConnection interceptor
      await this.page.addInitScript(() => {
        // Store original constructor
        const OriginalRTCPeerConnection = window.RTCPeerConnection;

        // Map to track connections by internal ID
        const rtcConnections = new Map<string, RTCPeerConnection>();
        let connectionCounter = 0;

        // Intercepting RTCPeerConnection class
        class InterceptedRTCPeerConnection extends OriginalRTCPeerConnection {
          private _internalId: string;

          constructor(configuration?: RTCConfiguration) {
            super(configuration);

            // Generate internal ID
            this._internalId = `browser-rtc-${++connectionCounter}-${Date.now()}`;
            rtcConnections.set(this._internalId, this);

            // Report connection creation
            try {
              (window as any).__playwright_rtcConnectionCreated({
                internalId: this._internalId,
              });
            } catch (e) {
              // Ignore
            }

            // Report state changes
            const reportState = () => {
              try {
                (window as any).__playwright_rtcConnectionUpdate({
                  id: this._internalId,
                  connectionState: this.connectionState,
                  iceConnectionState: this.iceConnectionState,
                  iceGatheringState: this.iceGatheringState,
                  signalingState: this.signalingState,
                });
              } catch (e) {
                // Ignore
              }
            };

            // Listen to all state change events
            this.addEventListener('connectionstatechange', reportState);
            this.addEventListener('iceconnectionstatechange', reportState);
            this.addEventListener('icegatheringstatechange', reportState);
            this.addEventListener('signalingstatechange', reportState);

            // Report initial state
            setTimeout(reportState, 0);

            // Clean up on close
            this.addEventListener('connectionstatechange', () => {
              if (this.connectionState === 'closed')
                rtcConnections.delete(this._internalId);

            });
          }
        }

        // Copy static properties and methods
        Object.setPrototypeOf(InterceptedRTCPeerConnection, OriginalRTCPeerConnection);
        Object.setPrototypeOf(InterceptedRTCPeerConnection.prototype, OriginalRTCPeerConnection.prototype);

        // Replace global RTCPeerConnection
        (window as any).RTCPeerConnection = InterceptedRTCPeerConnection;

        // Store connections map globally for stats access
        (window as any).__rtcConnections = rtcConnections;
      });

      this._rtcMonitoringEnabled = true;

    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _handleRTCConnectionCreated(data: { internalId: string }) {
    const connection: RTCConnectionData & { _internalId: string } = {
      id: `rtc-${++this._rtcConnectionIdCounter}-${Date.now()}`,
      origin: this.page.url(),
      timestamp: Date.now(),
      connectionState: 'new',
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      signalingState: 'stable',
      stateHistory: [],
      _internalId: data.internalId,
    };

    this._rtcConnections.push(connection as any);
    this.context.addRTCConnection(connection);
  }

  private _handleRTCConnectionUpdate(data: {
    id: string;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    iceGatheringState: RTCIceGatheringState;
    signalingState: RTCSignalingState;
  }) {
    const connection = this._rtcConnections.find(c => (c as any)._internalId === data.id);
    if (!connection) return;

    connection.connectionState = data.connectionState;
    connection.iceConnectionState = data.iceConnectionState;
    connection.iceGatheringState = data.iceGatheringState;
    connection.signalingState = data.signalingState;

    connection.stateHistory.push({
      timestamp: Date.now(),
      connectionState: data.connectionState,
      iceConnectionState: data.iceConnectionState,
    });

    // Limit history size
    if (connection.stateHistory.length > 100)
      connection.stateHistory.shift();

  }

  private async _requestRTCStats(internalId: string): Promise<void> {
    try {
      // Execute in page context to get stats
      const rawStats = await this.page.evaluate(async (id) => {
        const rtcConnections = (window as any).__rtcConnections;
        const pc = rtcConnections?.get(id);
        if (!pc) return null;

        const stats = await pc.getStats();
        const result: any = {};

        stats.forEach((report: any) => {
          if (!result[report.type])
            result[report.type] = [];

          // Convert to plain object
          const obj: any = { id: report.id, timestamp: report.timestamp, type: report.type };
          for (const key in report) {
            if (typeof report[key] !== 'function')
              obj[key] = report[key];

          }
          result[report.type].push(obj);
        });

        return result;
      }, internalId);

      if (!rawStats) return;

      // Find our connection
      const connection = this._rtcConnections.find(c => (c as any)._internalId === internalId);
      if (!connection) return;

      // Parse stats into our structured format
      connection.lastStats = this._parseRTCStats(rawStats);
      connection.lastStatsTimestamp = Date.now();

    } catch (error) {
      logUnhandledError(error);
    }
  }

  private _parseRTCStats(rawStats: any): RTCStatsSnapshot {
    const snapshot: RTCStatsSnapshot = {};

    // Parse inbound-rtp for video
    const inboundVideo = rawStats['inbound-rtp']?.find((r: any) => r.kind === 'video');
    if (inboundVideo) {
      const packetLossRate = inboundVideo.packetsReceived > 0
        ? (inboundVideo.packetsLost / inboundVideo.packetsReceived) * 100
        : 0;

      snapshot.inboundVideo = {
        packetsReceived: inboundVideo.packetsReceived || 0,
        packetsLost: inboundVideo.packetsLost || 0,
        packetLossRate: Math.round(packetLossRate * 100) / 100,
        jitter: (inboundVideo.jitter || 0) * 1000, // Convert to ms
        bytesReceived: inboundVideo.bytesReceived || 0,
        bitrate: 0, // Will be calculated from deltas in polling
        framesPerSecond: inboundVideo.framesPerSecond,
        framesDecoded: inboundVideo.framesDecoded,
        frameWidth: inboundVideo.frameWidth,
        frameHeight: inboundVideo.frameHeight,
        freezeCount: inboundVideo.freezeCount,
        totalFreezesDuration: inboundVideo.totalFreezesDuration,
      };
    }

    // Parse inbound-rtp for audio
    const inboundAudio = rawStats['inbound-rtp']?.find((r: any) => r.kind === 'audio');
    if (inboundAudio) {
      const packetLossRate = inboundAudio.packetsReceived > 0
        ? (inboundAudio.packetsLost / inboundAudio.packetsReceived) * 100
        : 0;

      snapshot.inboundAudio = {
        packetsReceived: inboundAudio.packetsReceived || 0,
        packetsLost: inboundAudio.packetsLost || 0,
        packetLossRate: Math.round(packetLossRate * 100) / 100,
        jitter: (inboundAudio.jitter || 0) * 1000,
        bytesReceived: inboundAudio.bytesReceived || 0,
        bitrate: 0,
        audioLevel: inboundAudio.audioLevel,
        concealedSamples: inboundAudio.concealedSamples,
      };
    }

    // Parse outbound-rtp for video
    const outboundVideo = rawStats['outbound-rtp']?.find((r: any) => r.kind === 'video');
    if (outboundVideo) {
      snapshot.outboundVideo = {
        packetsSent: outboundVideo.packetsSent || 0,
        bytesSent: outboundVideo.bytesSent || 0,
        bitrate: 0,
        framesPerSecond: outboundVideo.framesPerSecond,
        framesEncoded: outboundVideo.framesEncoded,
        frameWidth: outboundVideo.frameWidth,
        frameHeight: outboundVideo.frameHeight,
        qualityLimitationReason: outboundVideo.qualityLimitationReason,
      };
    }

    // Parse outbound-rtp for audio
    const outboundAudio = rawStats['outbound-rtp']?.find((r: any) => r.kind === 'audio');
    if (outboundAudio) {
      snapshot.outboundAudio = {
        packetsSent: outboundAudio.packetsSent || 0,
        bytesSent: outboundAudio.bytesSent || 0,
        bitrate: 0,
      };
    }

    // Parse candidate-pair (get the selected/active pair)
    const candidatePairs = rawStats['candidate-pair'] || [];
    const activePair = candidatePairs.find((p: any) => p.state === 'succeeded') || candidatePairs[0];
    if (activePair) {
      snapshot.candidatePair = {
        state: activePair.state,
        localCandidateType: activePair.localCandidateType || 'unknown',
        remoteCandidateType: activePair.remoteCandidateType || 'unknown',
        currentRoundTripTime: activePair.currentRoundTripTime,
        availableOutgoingBitrate: activePair.availableOutgoingBitrate,
      };
    }

    return snapshot;
  }

  enableRTCStatsPolling(intervalMs: number = 1000) {
    if (this._rtcStatsPollingInterval)
      clearInterval(this._rtcStatsPollingInterval);


    this._rtcStatsPollingInterval = setInterval(async () => {
      // Poll stats for all active connections
      for (const connection of this._rtcConnections) {
        if (connection.connectionState !== 'closed')
          await this._requestRTCStats((connection as any)._internalId);

      }
    }, intervalMs);
  }

  disableRTCStatsPolling() {
    if (this._rtcStatsPollingInterval) {
      clearInterval(this._rtcStatsPollingInterval);
      this._rtcStatsPollingInterval = undefined;
    }
  }

  rtcConnections(): RTCConnectionData[] {
    return this._rtcConnections;
  }

  getRTCConnection(id: string): RTCConnectionData | undefined {
    return this._rtcConnections.find(c => c.id === id);
  }

  clearRTCConnections() {
    this.disableRTCStatsPolling();
    this._rtcConnections.length = 0;
    this._rtcConnectionIdCounter = 0;
  }

  isRTCMonitoringEnabled(): boolean {
    return this._rtcMonitoringEnabled;
  }

  private _handleNotificationShown(data: {
    title: string;
    body?: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
    actions?: Array<{ action: string; title: string; icon?: string }>;
    data?: unknown;
  }) {
    const notification: WebNotification = {
      id: `notif-${++this._notificationIdCounter}-${Date.now()}`,
      title: data.title,
      body: data.body || '',
      icon: data.icon,
      tag: data.tag,
      origin: this.page.url(),
      timestamp: Date.now(),
      requireInteraction: data.requireInteraction,
      actions: data.actions,
      data: data.data,
      clicked: false,
      closed: false,
    };

    this._notifications.push(notification);

    // Set modal state so tools know there's a notification to handle
    this.setModalState({
      type: 'notification',
      description: `Notification "${notification.title}" from ${new URL(notification.origin).hostname}`,
      notification,
    });

    // Also notify context for aggregation
    this.context.addNotification(notification);
  }

  notifications(): WebNotification[] {
    return this._notifications;
  }

  getNotification(id: string): WebNotification | undefined {
    return this._notifications.find(n => n.id === id);
  }

  markNotificationClicked(id: string) {
    const notification = this._notifications.find(n => n.id === id);
    if (notification) {
      notification.clicked = true;
      // Clear modal state for this notification
      const modalState = this._modalStates.find(s => s.type === 'notification' && s.notification.id === id);
      if (modalState)
        this.clearModalState(modalState);
    }
  }

  markNotificationClosed(id: string) {
    const notification = this._notifications.find(n => n.id === id);
    if (notification) {
      notification.closed = true;
      // Clear modal state for this notification
      const modalState = this._modalStates.find(s => s.type === 'notification' && s.notification.id === id);
      if (modalState)
        this.clearModalState(modalState);
    }
  }

  clearNotifications() {
    // Clear notification modal states
    this._modalStates = this._modalStates.filter(s => s.type !== 'notification');
    this._notifications.length = 0;
  }

  private _onClose() {
    this._clearCollectedArtifacts();
    this._onPageClose(this);
  }

  async title(): Promise<string> {
    return await callOnPageNoTrace(this.page, page => page.title());
  }

  async waitForLoadState(state: 'load', options?: { timeout?: number }): Promise<void> {
    await callOnPageNoTrace(this.page, page => page.waitForLoadState(state, options).catch(logUnhandledError));
  }

  async navigate(url: string) {
    this._clearCollectedArtifacts();

    const downloadEvent = callOnPageNoTrace(this.page, page => page.waitForEvent('download').catch(logUnhandledError));
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (_e: unknown) {
      const e = _e as Error;
      const mightBeDownload =
        e.message.includes('net::ERR_ABORTED') // chromium
        || e.message.includes('Download is starting'); // firefox + webkit
      if (!mightBeDownload)
        throw e;
      // on chromium, the download event is fired *after* page.goto rejects, so we wait a lil bit
      const download = await Promise.race([
        downloadEvent,
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
      if (!download)
        throw e;
      // Make sure other "download" listeners are notified first.
      await new Promise(resolve => setTimeout(resolve, 500));
      return;
    }

    // Cap load event to 5 seconds, the page is operational at this point.
    await this.waitForLoadState('load', { timeout: 5000 });
  }

  consoleMessages(): ConsoleMessage[] {
    return this._consoleMessages;
  }

  requests(): Map<playwright.Request, playwright.Response | null> {
    return this._requests;
  }

  private _takeRecentConsoleMarkdown(): string[] {
    if (!this._recentConsoleMessages.length)
      return [];
    const result = this._recentConsoleMessages.map(message => {
      return `- ${trim(message.toString(), 100)}`;
    });
    return [`### New console messages`, ...result, ''];
  }

  private _listDownloadsMarkdown(): string[] {
    if (!this._downloads.length)
      return [];

    const result: string[] = ['### Downloads'];
    for (const entry of this._downloads) {
      if (entry.finished)
        result.push(`- Downloaded file ${entry.download.suggestedFilename()} to ${entry.outputFile}`);
      else
        result.push(`- Downloading file ${entry.download.suggestedFilename()} ...`);
    }
    result.push('');
    return result;
  }

  async captureSnapshot(): Promise<string> {
    const result: string[] = [];
    if (this.modalStates().length) {
      result.push(...this.modalStatesMarkdown());
      return result.join('\n');
    }

    result.push(...this._takeRecentConsoleMarkdown());
    result.push(...this._listDownloadsMarkdown());

    await this._raceAgainstModalStates(async () => {
      const snapshot = await snapshotWithTimeout(this.page);
      result.push(
          `### Page state`,
          `- Page URL: ${this.page.url()}`,
          `- Page Title: ${await this.page.title()}`,
          `- Page Snapshot:`,
          '```yaml',
          snapshot,
          '```',
      );
    });
    return result.join('\n');
  }

  private _javaScriptBlocked(): boolean {
    return this._modalStates.some(state => state.type === 'dialog');
  }

  private async _raceAgainstModalStates(action: () => Promise<void>): Promise<ModalState | undefined> {
    if (this.modalStates().length)
      return this.modalStates()[0];

    const promise = new ManualPromise<ModalState>();
    const listener = (modalState: ModalState) => promise.resolve(modalState);
    this.once(TabEvents.modalState, listener);

    return await Promise.race([
      action().then(() => {
        this.off(TabEvents.modalState, listener);
        return undefined;
      }),
      promise,
    ]);
  }

  async waitForCompletion(callback: () => Promise<void>) {
    await this._raceAgainstModalStates(() => waitForCompletion(this, callback));
  }

  async refLocator(params: { element: string, ref: string }): Promise<playwright.Locator> {
    return (await this.refLocators([params]))[0];
  }

  async refLocators(params: { element: string, ref: string }[]): Promise<playwright.Locator[]> {
    const snapshot = await snapshotWithTimeout(this.page);
    return params.map(param => {
      if (!snapshot.includes(`[ref=${param.ref}]`))
        throw new Error(`Ref ${param.ref} not found in the current page snapshot. Try capturing new snapshot.`);
      return this.page.locator(`aria-ref=${param.ref}`).describe(param.element);
    });
  }

  async waitForTimeout(time: number) {
    if (this._javaScriptBlocked()) {
      await new Promise(f => setTimeout(f, time));
      return;
    }

    await callOnPageNoTrace(this.page, page => {
      return page.evaluate(() => new Promise(f => setTimeout(f, 1000)));
    });
  }
}

export type ConsoleMessage = {
  type: ReturnType<playwright.ConsoleMessage['type']> | undefined;
  text: string;
  toString(): string;
};

function messageToConsoleMessage(message: playwright.ConsoleMessage): ConsoleMessage {
  return {
    type: message.type(),
    text: message.text(),
    toString: () => `[${message.type().toUpperCase()}] ${message.text()} @ ${message.location().url}:${message.location().lineNumber}`,
  };
}

function pageErrorToConsoleMessage(errorOrValue: Error | any): ConsoleMessage {
  if (errorOrValue instanceof Error) {
    return {
      type: undefined,
      text: errorOrValue.message,
      toString: () => errorOrValue.stack || errorOrValue.message,
    };
  }
  return {
    type: undefined,
    text: String(errorOrValue),
    toString: () => String(errorOrValue),
  };
}

function trim(text: string, maxLength: number) {
  if (text.length <= maxLength)
    return text;
  return text.slice(0, maxLength) + '...';
}
