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

import type  { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from './context.js';
import type { FullConfig } from './config.js';

export class Response {
  private _result: string[] = [];
  private _code: string[] = [];
  private _images: { contentType: string, data: Buffer }[] = [];
  private _context: Context;
  private _includeSnapshot = false;
  private _includeTabs = false;
  private _snapshot: string | undefined;
  private _config: FullConfig;

  readonly toolName: string;
  readonly toolArgs: Record<string, any>;

  constructor(context: Context, toolName: string, toolArgs: Record<string, any>, config: FullConfig) {
    this._context = context;
    this.toolName = toolName;
    this.toolArgs = toolArgs;
    this._config = config;
  }

  addResult(result: string) {
    this._result.push(result);
  }

  result() {
    return this._result.join('\n');
  }

  addCode(code: string) {
    this._code.push(code);
  }

  code() {
    return this._code.join('\n');
  }

  addImage(image: { contentType: string, data: Buffer }) {
    this._images.push(image);
  }

  images() {
    return this._images;
  }

  setIncludeSnapshot() {
    // Only enable snapshots if configured to do so
    this._includeSnapshot = this._config.includeSnapshots;
  }

  setForceIncludeSnapshot() {
    // Force snapshot regardless of config (for explicit snapshot tools)
    this._includeSnapshot = true;
  }

  setIncludeTabs() {
    this._includeTabs = true;
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a conservative estimate that works well for accessibility snapshots
    return Math.ceil(text.length / 4);
  }

  private truncateSnapshot(snapshot: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokenCount(snapshot);

    if (maxTokens <= 0 || estimatedTokens <= maxTokens)
      return snapshot;


    // Calculate how much text to keep (leave room for truncation message)
    const truncationMessageTokens = 200; // Reserve space for helpful message
    const keepTokens = Math.max(100, maxTokens - truncationMessageTokens);
    const keepChars = keepTokens * 4;

    const lines = snapshot.split('\n');
    let truncatedSnapshot = '';
    let currentLength = 0;

    // Extract essential info first (URL, title, errors)
    const essentialLines: string[] = [];
    const contentLines: string[] = [];

    for (const line of lines) {
      if (line.includes('Page URL:') || line.includes('Page Title:') ||
          line.includes('### Page state') || line.includes('error') || line.includes('Error'))
        essentialLines.push(line);
      else
        contentLines.push(line);

    }

    // Always include essential info
    for (const line of essentialLines) {
      if (currentLength + line.length < keepChars) {
        truncatedSnapshot += line + '\n';
        currentLength += line.length + 1;
      }
    }

    // Add as much content as possible
    for (const line of contentLines) {
      if (currentLength + line.length < keepChars) {
        truncatedSnapshot += line + '\n';
        currentLength += line.length + 1;
      } else {
        break;
      }
    }

    // Add truncation message with helpful suggestions
    const truncationMessage = `\n**⚠️ Snapshot truncated: showing ${this.estimateTokenCount(truncatedSnapshot).toLocaleString()} of ${estimatedTokens.toLocaleString()} tokens**\n\n**Options to see full snapshot:**\n- Use \`browser_snapshot\` tool for complete page snapshot\n- Increase limit: \`--max-snapshot-tokens ${Math.ceil(estimatedTokens * 1.2)}\`\n- Enable differential mode: \`--differential-snapshots\`\n- Disable auto-snapshots: \`--no-snapshots\`\n`;

    return truncatedSnapshot + truncationMessage;
  }

  async snapshot(): Promise<string> {
    if (this._snapshot !== undefined)
      return this._snapshot;

    if (this._includeSnapshot && this._context.currentTab()) {
      let rawSnapshot: string;

      // Use differential snapshots if enabled
      if (this._config.differentialSnapshots)
        rawSnapshot = await this._context.generateDifferentialSnapshot();
      else
        rawSnapshot = await this._context.currentTabOrDie().captureSnapshot();


      // Apply truncation if maxSnapshotTokens is configured (but not for differential snapshots which are already small)
      if (this._config.maxSnapshotTokens > 0 && !this._config.differentialSnapshots)
        this._snapshot = this.truncateSnapshot(rawSnapshot, this._config.maxSnapshotTokens);
      else
        this._snapshot = rawSnapshot;

    } else {
      this._snapshot = '';
    }
    return this._snapshot;
  }

  async serialize(): Promise<{ content: (TextContent | ImageContent)[] }> {
    const response: string[] = [];

    // Start with command result.
    if (this._result.length) {
      response.push('### Result');
      response.push(this._result.join('\n'));
      response.push('');
    }

    // Add code if it exists.
    if (this._code.length) {
      response.push(`### Ran Playwright code
\`\`\`js
${this._code.join('\n')}
\`\`\``);
      response.push('');
    }

    // List browser tabs.
    if (this._includeSnapshot || this._includeTabs)
      response.push(...(await this._context.listTabsMarkdown(this._includeTabs)));

    // Add snapshot if provided.
    const snapshot = await this.snapshot();
    if (snapshot)
      response.push(snapshot, '');

    // Main response part
    const content: (TextContent | ImageContent)[] = [
      { type: 'text', text: response.join('\n') },
    ];

    // Image attachments.
    if (this._context.config.imageResponses !== 'omit') {
      for (const image of this._images)
        content.push({ type: 'image', data: image.data.toString('base64'), mimeType: image.contentType });
    }

    return { content };
  }
}
