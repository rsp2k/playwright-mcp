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

import { z } from 'zod';
import { defineTabTool } from './tool.js';

// WebMCP bridge tools.
//
// WebMCP (Chromium 146+, stable API on 153+) lets a web page expose MCP
// tools through document.modelContext. These tools reflect that capability
// into our own MCP interface so any client (stdio or HTTP) can discover
// and invoke a page's tools without ever speaking the WebMCP wire protocol
// itself.
//
// We read page-side via page.evaluate rather than through Playwright's
// page.webmcp.* wrappers because Playwright's abstraction has drifted
// from Chromium's shape in two known ways: it returns `annotations` as
// undefined even when Chromium holds them, and Playwright docs reference
// annotation keys (`readOnly`/`untrustedContent`) that Chromium silently
// ignores — Chromium wants `readOnlyHint`/`untrustedContentHint`.
//
// If `document.modelContext` is missing, the tools report what to do
// (newer executablePath via browser_configure, or --enable-features=WebMCP)
// rather than silently failing.

// Shared page-side helper — small enough to inline into every evaluate.
const SHAPE = {
  missing: 'document.modelContext not available. Check browser_status for Chrome version and WebMCP capability.',
};

const listSchema = z.object({});

const list = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_list',
    title: 'List WebMCP tools exposed by the current page',
    description: 'Returns the tools the current page has registered via document.modelContext.registerTool. Reads page-side to preserve annotations (Playwright\'s wrapper drops them). Requires Chromium 146+ with WebMCP enabled; use browser_status to verify capability.',
    inputSchema: listSchema,
    type: 'readOnly',
  },
  handle: async (tab, _params, response) => {
    const result = await tab.page.evaluate(async () => {
      const mc = (document as any).modelContext;
      if (!mc || typeof mc.getTools !== 'function')
        return { available: false };
      const tools = await mc.getTools();
      return {
        available: true,
        tools: tools.map((t: any) => ({
          name: t.name,
          description: t.description ?? null,
          inputSchema: t.inputSchema ?? null,
          annotations: t.annotations ?? null,
        })),
      };
    });

    if (!result.available) {
      response.addResult(`⚠️ ${SHAPE.missing}`);
      return;
    }

    if (result.tools.length === 0) {
      response.addResult('ℹ️ Current page registers 0 WebMCP tools.');
      return;
    }

    const lines: string[] = [`Found **${result.tools.length}** WebMCP tool(s) on this page:`, ''];
    result.tools.forEach((t: any, i: number) => {
      const readOnly = t.annotations?.readOnlyHint ? ' _(read-only)_' : '';
      const untrusted = t.annotations?.untrustedContentHint ? ' _(untrusted-content)_' : '';
      lines.push(`${i + 1}. **${t.name}**${readOnly}${untrusted}`);
      if (t.description)
        lines.push(`   ${t.description}`);
      if (t.inputSchema)
        lines.push(`   Input schema: \`${JSON.stringify(t.inputSchema)}\``);
      lines.push('');
    });
    lines.push('Invoke with `browser_webmcp_call`.');
    response.addResult(lines.join('\n'));
  },
});

const callSchema = z.object({
  name: z.string().describe('Tool name as returned by browser_webmcp_list'),
  input: z.record(z.any()).optional().describe('Tool input payload matching the tool\'s inputSchema. Omit or pass {} for parameter-less tools.'),
});

const call = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_call',
    title: 'Invoke a WebMCP tool on the current page',
    description: 'Looks up the named tool via document.modelContext.getTools(), then invokes it with document.modelContext.executeTool(tool, input). Chromium\'s executeTool takes the tool OBJECT, not its name; we handle that lookup page-side so the caller passes just the name. Returns the tool\'s raw result (usually a JSON string, parsed if possible).',
    inputSchema: callSchema,
    type: 'destructive',
  },
  handle: async (tab, params, response) => {
    const result = await tab.page.evaluate(async ({ name, input }) => {
      const mc = (document as any).modelContext;
      if (!mc || typeof mc.getTools !== 'function')
        return { error: 'document.modelContext not available.' };
      const tools = await mc.getTools();
      const tool = tools.find((t: any) => t.name === name);
      if (!tool) {
        return {
          error: `No WebMCP tool named "${name}" on this page.`,
          available: tools.map((t: any) => t.name),
        };
      }
      try {
        const raw = await mc.executeTool(tool, input || {});
        return { success: true, raw };
      } catch (e: any) {
        return { error: `executeTool threw: ${e?.message || String(e)}` };
      }
    }, { name: params.name, input: params.input });

    if (result.error) {
      const lines: string[] = [`❌ ${result.error}`];
      if (result.available && result.available.length > 0)
        lines.push(`Available: ${result.available.join(', ')}`);
      response.addResult(lines.join('\n'));
      return;
    }

    // raw is typically a JSON string per the WebMCP spec; parse for display.
    let parsed: any = result.raw;
    if (typeof result.raw === 'string') {
      try {
        parsed = JSON.parse(result.raw);
      } catch {
        // Not JSON, keep as-is.
      }
    }

    // Honesty about error results: MCP ToolResult carries isError:true for
    // invocation-level failures (e.g. validation rejection, guard trip).
    // A ✅ header on an error result is misleading — peer caught this when
    // get_listing("../admin") returned isError with our guard text and the
    // tool still printed ✅ returned.
    const isObj = parsed && typeof parsed === 'object';
    const isError = isObj && parsed.isError === true;
    const header = isError
      ? `⚠️ **${params.name}** returned an error result (\`isError: true\`):`
      : `✅ **${params.name}** returned:`;

    // When structuredContent is present, content[].text typically duplicates
    // it as a JSON string — showing both doubles the output. Prefer the
    // structured form, fall back to the raw/content shape when it is absent.
    // For error results we also surface the content text since tools usually
    // put the human-readable error message there, not in structuredContent.
    let body: string;
    const hasStructured = isObj && parsed.structuredContent !== undefined;
    const errText = isError && Array.isArray(parsed.content)
      ? parsed.content.map((c: any) => c?.text ?? '').filter(Boolean).join('\n')
      : '';
    if (hasStructured && errText)
      body = `${errText}\n\n\`\`\`json\n${JSON.stringify(parsed.structuredContent, null, 2)}\n\`\`\``;
    else if (hasStructured)
      body = '```json\n' + JSON.stringify(parsed.structuredContent, null, 2) + '\n```';
    else if (errText)
      body = errText;
    else
      body = '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';

    response.addResult(`${header}\n\n${body}`);
  },
});

const watchSchema = z.object({});

const watch = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_watch',
    title: 'Start watching WebMCP toolchange and toolactivated events',
    description: 'Installs a listener on document.modelContext that buffers toolchange (tools registered/unregistered) and toolactivated (tool invoked) events to window.__webmcpEvents. Idempotent — calling twice does not install twice. Drain the buffer with browser_webmcp_events. Makes WebMCP demos self-evidencing by proving tool calls really happened.',
    inputSchema: watchSchema,
    type: 'destructive',
  },
  handle: async (tab, _params, response) => {
    const result = await tab.page.evaluate(() => {
      const mc = (document as any).modelContext;
      if (!mc)
        return { ok: false };
      const w = window as any;
      if (w.__webmcpWatching)
        return { ok: true, already: true, bufferedCount: (w.__webmcpEvents || []).length };
      w.__webmcpEvents = [];
      w.__webmcpWatching = true;
      const push = (type: string) => (e: any) => {
        w.__webmcpEvents.push({
          type,
          timestamp: Date.now(),
          toolName: e.toolName ?? null,
          // isTrusted is true for events the user agent dispatched (real
          // tool invocations) and false if page script synthesized the event
          // itself. It is the specific property that proves the tool call
          // wasn't faked by overlay markup.
          isTrusted: typeof e.isTrusted === 'boolean' ? e.isTrusted : null,
        });
      };
      mc.addEventListener('toolactivated', push('toolactivated'));
      mc.addEventListener('toolchange', push('toolchange'));
      return { ok: true, already: false };
    });

    if (!result.ok) {
      response.addResult(`⚠️ ${SHAPE.missing}`);
      return;
    }
    response.addResult(result.already
      ? `Already watching. ${result.bufferedCount} event(s) buffered — drain with browser_webmcp_events.`
      : '✅ Watching toolactivated and toolchange. Drain with browser_webmcp_events.');
  },
});

const eventsSchema = z.object({
  clear: z.boolean().default(true).describe('Clear the buffer after reading (default true)'),
});

const events = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_events',
    title: 'Read buffered WebMCP events',
    description: 'Returns events captured since browser_webmcp_watch was called. Call browser_webmcp_watch first. Events outlive page reloads only if you re-watch after navigation (window globals reset on cross-document nav).',
    inputSchema: eventsSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const result = await tab.page.evaluate((clear: boolean) => {
      const w = window as any;
      if (!w.__webmcpWatching)
        return { watching: false, events: [] as any[] };
      const evts = [...(w.__webmcpEvents || [])];
      if (clear)
        w.__webmcpEvents = [];
      return { watching: true, events: evts };
    }, params.clear);

    if (!result.watching) {
      response.addResult('⚠️ Not watching. Call browser_webmcp_watch first. (A page reload also drops the listener; re-watch after nav.)');
      return;
    }
    if (result.events.length === 0) {
      response.addResult('ℹ️ No events since last read.');
      return;
    }
    const lines: string[] = [`${result.events.length} event(s)${params.clear ? ' (buffer cleared)' : ''}:`, ''];
    result.events.forEach((e: any, i: number) => {
      const t = new Date(e.timestamp).toISOString().split('T')[1].replace('Z', '');
      const trust = e.isTrusted === true ? ' ✓trusted' : e.isTrusted === false ? ' ✗synthetic' : '';
      lines.push(`${i + 1}. [${t}] \`${e.type}\`${e.toolName ? ` → **${e.toolName}**` : ''}${trust}`);
    });
    response.addResult(lines.join('\n'));
  },
});

export default [
  list,
  call,
  watch,
  events,
];
