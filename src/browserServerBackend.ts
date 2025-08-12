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

import { FullConfig } from './config.js';
import { Context } from './context.js';
import { logUnhandledError } from './log.js';
import { Response } from './response.js';
import { SessionLog } from './sessionLog.js';
import { filteredTools } from './tools.js';
import { packageJSON } from './package.js';
import { SessionManager } from './sessionManager.js';
import { EnvironmentIntrospector } from './environmentIntrospection.js';

import type { BrowserContextFactory } from './browserContextFactory.js';
import type * as mcpServer from './mcp/server.js';
import type { ServerBackend } from './mcp/server.js';
import type { Tool } from './tools/tool.js';

export class BrowserServerBackend implements ServerBackend {
  name = 'Playwright';
  version = packageJSON.version;
  private _tools: Tool[];
  private _context: Context;
  private _sessionLog: SessionLog | undefined;
  private _config: FullConfig;
  private _browserContextFactory: BrowserContextFactory;
  private _sessionId: string | undefined;
  private _environmentIntrospector: EnvironmentIntrospector;

  constructor(config: FullConfig, browserContextFactory: BrowserContextFactory) {
    this._tools = filteredTools(config);
    this._config = config;
    this._browserContextFactory = browserContextFactory;
    this._environmentIntrospector = new EnvironmentIntrospector();
    
    // Create a default context - will be replaced when session ID is set
    this._context = new Context(this._tools, config, browserContextFactory, this._environmentIntrospector);
  }

  async initialize() {
    this._sessionLog = this._context.config.saveSession ? await SessionLog.create(this._context.config) : undefined;
  }

  setSessionId(sessionId: string): void {
    if (this._sessionId === sessionId) {
      return; // Already using this session
    }

    this._sessionId = sessionId;
    
    // Get or create persistent context for this session
    const sessionManager = SessionManager.getInstance();
    this._context = sessionManager.getOrCreateContext(
      sessionId,
      this._tools,
      this._config,
      this._browserContextFactory
    );
    
    // Update environment introspector reference
    this._environmentIntrospector = this._context.getEnvironmentIntrospector();
  }

  tools(): mcpServer.ToolSchema<any>[] {
    return this._tools.map(tool => tool.schema);
  }

  async callTool(schema: mcpServer.ToolSchema<any>, parsedArguments: any) {
    const response = new Response(this._context, schema.name, parsedArguments);
    const tool = this._tools.find(tool => tool.schema.name === schema.name)!;
    await tool.handle(this._context, parsedArguments, response);
    if (this._sessionLog)
      await this._sessionLog.log(response);
    return await response.serialize();
  }

  async listRoots(): Promise<{ uri: string; name?: string }[]> {
    // We don't expose roots ourselves, but we can list what we expect
    // This is mainly for documentation purposes
    return [
      {
        uri: 'file:///tmp/.X11-unix',
        name: 'X11 Display Sockets - Expose to enable GUI browser windows on available displays'
      },
      {
        uri: 'file:///dev/dri',
        name: 'GPU Devices - Expose to enable hardware acceleration'
      },
      {
        uri: 'file:///proc/meminfo',
        name: 'Memory Information - Expose for memory-aware browser configuration'
      },
      {
        uri: 'file:///path/to/your/project',
        name: 'Project Directory - Expose your project directory for screenshot/video storage'
      }
    ];
  }

  async rootsListChanged(): Promise<void> {
    // For now, we can't directly access the client's exposed roots
    // This would need MCP SDK enhancement to get the current roots list
    // Client roots changed - environment capabilities may have updated
    
    // In a full implementation, we would:
    // 1. Get the updated roots list from the MCP client
    // 2. Update our environment introspector  
    // 3. Reconfigure browser contexts if needed
    
    // For demonstration, we'll simulate some common root updates
    // In practice, this would come from the MCP client
    
    // Example: Update context with hypothetical root changes
    // this._context.updateEnvironmentRoots([
    //   { uri: 'file:///tmp/.X11-unix', name: 'X11 Sockets' },
    //   { uri: 'file:///home/user/project', name: 'Project Directory' }
    // ]);
    
    // const summary = this._environmentIntrospector.getEnvironmentSummary();
    // Current environment would be logged here if needed
  }

  getEnvironmentIntrospector(): EnvironmentIntrospector {
    return this._environmentIntrospector;
  }

  serverInitialized(version: mcpServer.ClientVersion | undefined) {
    this._context.clientVersion = version;
    this._context.updateSessionIdWithClientInfo();
  }

  serverClosed() {
    // Don't dispose the context immediately - it should persist for session reuse
    // The session manager will handle cleanup when appropriate
    if (this._sessionId) {
      // For now, we'll keep the session alive
      // In production, you might want to implement session timeouts
    } else {
      // Only dispose if no session ID (fallback case)
      void this._context.dispose().catch(logUnhandledError);
    }
  }
}
