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
import { Context } from './context.js';
import type { Tool } from './tools/tool.js';
import type { FullConfig } from './config.js';
import type { BrowserContextFactory } from './browserContextFactory.js';

const sessionDebug = debug('pw:mcp:session');

/**
 * Global session manager that maintains persistent browser contexts
 * keyed by MCP client session IDs
 */
export class SessionManager {
  private static _instance: SessionManager;
  private _sessions: Map<string, Context> = new Map();

  static getInstance(): SessionManager {
    if (!SessionManager._instance) {
      SessionManager._instance = new SessionManager();
    }
    return SessionManager._instance;
  }

  /**
   * Get or create a persistent context for the given session ID
   */
  getOrCreateContext(
    sessionId: string,
    tools: Tool[],
    config: FullConfig,
    browserContextFactory: BrowserContextFactory
  ): Context {
    let context = this._sessions.get(sessionId);

    if (!context) {
      sessionDebug(`creating new persistent context for session: ${sessionId}`);
      context = new Context(tools, config, browserContextFactory);
      // Override the session ID with the client-provided one
      (context as any).sessionId = sessionId;
      this._sessions.set(sessionId, context);

      sessionDebug(`active sessions: ${this._sessions.size}`);
    } else {
      sessionDebug(`reusing existing context for session: ${sessionId}`);
    }

    return context;
  }

  /**
   * Remove a session from the manager
   */
  async removeSession(sessionId: string): Promise<void> {
    const context = this._sessions.get(sessionId);
    if (context) {
      sessionDebug(`disposing context for session: ${sessionId}`);
      await context.dispose();
      this._sessions.delete(sessionId);
      sessionDebug(`active sessions: ${this._sessions.size}`);
    }
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this._sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this._sessions.size;
  }

  /**
   * Clean up all sessions (for shutdown)
   */
  async disposeAll(): Promise<void> {
    sessionDebug(`disposing all ${this._sessions.size} sessions`);
    const contexts = Array.from(this._sessions.values());
    this._sessions.clear();
    await Promise.all(contexts.map(context => context.dispose()));
  }
}