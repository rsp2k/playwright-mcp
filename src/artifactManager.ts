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
import debug from 'debug';
import { sanitizeForFilePath } from './tools/utils.js';

const artifactDebug = debug('pw:mcp:artifacts');

export interface ArtifactEntry {
  timestamp: string;
  toolName: string;
  parameters: any;
  result: 'success' | 'error';
  artifactPath?: string;
  error?: string;
}

/**
 * Manages centralized artifact storage with session-specific directories and tool call logging
 */
export class ArtifactManager {
  private _baseDir: string;
  private _sessionId: string;
  private _sessionDir: string;
  private _logFile: string;
  private _logEntries: ArtifactEntry[] = [];

  constructor(baseDir: string, sessionId: string) {
    this._baseDir = baseDir;
    this._sessionId = sessionId;
    this._sessionDir = path.join(baseDir, sanitizeForFilePath(sessionId));
    this._logFile = path.join(this._sessionDir, 'tool-calls.json');

    // Ensure session directory exists
    this._ensureSessionDirectory();

    // Load existing log if it exists
    this._loadExistingLog();

    artifactDebug(`artifact manager initialized for session ${sessionId} in ${this._sessionDir}`);
  }

  /**
   * Get the session-specific directory for artifacts
   */
  getSessionDir(): string {
    return this._sessionDir;
  }

  /**
   * Get a full path for an artifact file in the session directory
   */
  getArtifactPath(filename: string): string {
    return path.join(this._sessionDir, sanitizeForFilePath(filename));
  }

  /**
   * Create a subdirectory within the session directory
   */
  getSubdirectory(subdir: string): string {
    const subdirPath = path.join(this._sessionDir, sanitizeForFilePath(subdir));
    fs.mkdirSync(subdirPath, { recursive: true });
    return subdirPath;
  }

  /**
   * Log a tool call with optional artifact path
   */
  logToolCall(toolName: string, parameters: any, result: 'success' | 'error', artifactPath?: string, error?: string): void {
    const entry: ArtifactEntry = {
      timestamp: new Date().toISOString(),
      toolName,
      parameters,
      result,
      artifactPath: artifactPath ? path.relative(this._sessionDir, artifactPath) : undefined,
      error
    };

    this._logEntries.push(entry);
    this._saveLog();

    artifactDebug(`logged tool call: ${toolName} -> ${result} ${artifactPath ? `(${entry.artifactPath})` : ''}`);
  }

  /**
   * Get all logged tool calls for this session
   */
  getToolCallLog(): ArtifactEntry[] {
    return [...this._logEntries];
  }

  /**
   * Get statistics about this session's artifacts
   */
  getSessionStats(): {
    sessionId: string;
    sessionDir: string;
    toolCallCount: number;
    successCount: number;
    errorCount: number;
    artifactCount: number;
    directorySize: number;
    } {
    const successCount = this._logEntries.filter(e => e.result === 'success').length;
    const errorCount = this._logEntries.filter(e => e.result === 'error').length;
    const artifactCount = this._logEntries.filter(e => e.artifactPath).length;

    return {
      sessionId: this._sessionId,
      sessionDir: this._sessionDir,
      toolCallCount: this._logEntries.length,
      successCount,
      errorCount,
      artifactCount,
      directorySize: this._getDirectorySize(this._sessionDir)
    };
  }

  private _ensureSessionDirectory(): void {
    try {
      fs.mkdirSync(this._sessionDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create session directory ${this._sessionDir}: ${error}`);
    }
  }

  private _loadExistingLog(): void {
    try {
      if (fs.existsSync(this._logFile)) {
        const logData = fs.readFileSync(this._logFile, 'utf8');
        this._logEntries = JSON.parse(logData);
        artifactDebug(`loaded ${this._logEntries.length} existing log entries`);
      }
    } catch (error) {
      artifactDebug(`failed to load existing log: ${error}`);
      this._logEntries = [];
    }
  }

  private _saveLog(): void {
    try {
      fs.writeFileSync(this._logFile, JSON.stringify(this._logEntries, null, 2));
    } catch (error) {
      artifactDebug(`failed to save log: ${error}`);
    }
  }

  private _getDirectorySize(dirPath: string): number {
    let size = 0;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory())
          size += this._getDirectorySize(filePath);
        else
          size += stats.size;

      }
    } catch (error) {
      // Ignore errors
    }
    return size;
  }
}

/**
 * Global artifact manager instances keyed by session ID
 */
export class ArtifactManagerRegistry {
  private static _instance: ArtifactManagerRegistry;
  private _managers: Map<string, ArtifactManager> = new Map();
  private _baseDir: string | undefined;

  static getInstance(): ArtifactManagerRegistry {
    if (!ArtifactManagerRegistry._instance)
      ArtifactManagerRegistry._instance = new ArtifactManagerRegistry();

    return ArtifactManagerRegistry._instance;
  }

  /**
   * Set the base directory for all artifact storage
   */
  setBaseDir(baseDir: string): void {
    this._baseDir = baseDir;
    artifactDebug(`artifact registry base directory set to: ${baseDir}`);
  }

  /**
   * Get or create an artifact manager for a session
   */
  getManager(sessionId: string): ArtifactManager | undefined {
    if (!this._baseDir)
      return undefined; // Artifact storage not configured


    let manager = this._managers.get(sessionId);
    if (!manager) {
      manager = new ArtifactManager(this._baseDir, sessionId);
      this._managers.set(sessionId, manager);
    }
    return manager;
  }

  /**
   * Remove a session's artifact manager
   */
  removeManager(sessionId: string): void {
    this._managers.delete(sessionId);
  }

  /**
   * Get all active session managers
   */
  getAllManagers(): Map<string, ArtifactManager> {
    return new Map(this._managers);
  }

  /**
   * Get summary statistics across all sessions
   */
  getGlobalStats(): {
    baseDir: string | undefined;
    activeSessions: number;
    totalToolCalls: number;
    totalArtifacts: number;
    } {
    const managers = Array.from(this._managers.values());
    const totalToolCalls = managers.reduce((sum, m) => sum + m.getSessionStats().toolCallCount, 0);
    const totalArtifacts = managers.reduce((sum, m) => sum + m.getSessionStats().artifactCount, 0);

    return {
      baseDir: this._baseDir,
      activeSessions: this._managers.size,
      totalToolCalls,
      totalArtifacts
    };
  }
}
