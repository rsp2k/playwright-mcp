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
import { ModalState } from './tools/tool.js';
import { outputFile } from './config.js';

import type { Context } from './context.js';

type PageEx = playwright.Page & {
  _snapshotForAI: () => Promise<string>;
};

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
      const snapshot = await (this.page as PageEx)._snapshotForAI();
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
    const snapshot = await (this.page as PageEx)._snapshotForAI();
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
