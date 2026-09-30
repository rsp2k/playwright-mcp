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

  private omitLargeSnapshotBody(snapshot: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokenCount(snapshot);

    if (maxTokens <= 0 || estimatedTokens <= maxTokens)
      return snapshot;

    const notice =
      `**⚠️ Snapshot omitted: ~${estimatedTokens.toLocaleString()} tokens exceeds limit of ${maxTokens.toLocaleString()}**\n\n` +
      `The accessibility tree was skipped to protect the context window. The header above still shows the page URL, title, console output, and downloads.\n\n` +
      `**To get the full snapshot:**\n` +
      `- Call \`browser_snapshot\` (always returns full page regardless of limit)\n` +
      `- Or raise the limit: \`browser_configure_snapshots {"maxSnapshotTokens": ${Math.ceil(estimatedTokens * 1.2)}}\`\n` +
      `- Or enable differential mode for delta-only updates: \`browser_configure_snapshots {"differentialSnapshots": true}\`\n`;

    // Preserve the header (console, downloads, Page URL, Page Title) but drop
    // the YAML a11y tree, which is the bulk. Truncating the tree mid-node
    // yields invalid YAML and orphan ref numbers that break browser_click.
    const yamlStart = snapshot.indexOf('```yaml');
    if (yamlStart === -1)
      return notice;

    return snapshot.substring(0, yamlStart) + notice;
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


      // Omit the a11y tree if the snapshot exceeds maxSnapshotTokens (skipped
      // for differential snapshots, which are already small by construction).
      if (this._config.maxSnapshotTokens > 0 && !this._config.differentialSnapshots)
        this._snapshot = this.omitLargeSnapshotBody(rawSnapshot, this._config.maxSnapshotTokens);
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
