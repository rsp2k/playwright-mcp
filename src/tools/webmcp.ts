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

// Character budgets from Chrome's "secure tools / guardrail avoidance" guidance
// (developer.chrome.com/docs/ai/webmcp/secure-tools). Exceeding these does not
// block invocation but lets an agent exhaust prompt context, trip rate limits,
// or paper over oversized fields that upstream clients will truncate silently.
// We render soft warnings so agents and tool authors know.
const BUDGET = {
  toolName: 30,
  toolDescription: 500,
  paramName: 30,
  paramDescription: 150,
  output: 1500,
} as const;

const listSchema = z.object({
  fromOrigins: z.array(z.string()).optional().describe('Also include tools registered by pages at these cross-origins. Default is same-origin only. Both the current origin and listed origins must be secure (HTTPS or localhost); listed origins must have called registerTool with { exposedTo: [<current-origin>] } to opt in.'),
});

const list = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_list',
    title: 'List WebMCP tools exposed by the current page',
    description: 'Returns the tools the current page has registered via document.modelContext.registerTool (imperative) or declared as a tool-annotated HTML form (declarative). Both appear here; declarative tools surface via the same getTools() call. Reads page-side to preserve annotations (Playwright\'s wrapper drops them). Flags consequentialHint tools prominently since those indicate irreversible actions. Soft-warns on tools that exceed Chrome\'s secure-tools character budgets. Requires Chromium 146+ with WebMCP enabled; use browser_status to verify capability.',
    inputSchema: listSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const result = await tab.page.evaluate(async (fromOrigins: string[] | undefined) => {
      const mc = (document as any).modelContext;
      if (!mc || typeof mc.getTools !== 'function')
        return { available: false };
      // getTools({ fromOrigins }) adds cross-origin tools; omit the option
      // to preserve the default same-origin-only behavior. Secure-origin
      // only on both sides, enforced by Chromium itself.
      const tools = fromOrigins && fromOrigins.length > 0
        ? await mc.getTools({ fromOrigins })
        : await mc.getTools();
      return {
        available: true,
        tools: tools.map((t: any) => ({
          name: t.name,
          description: t.description ?? null,
          inputSchema: t.inputSchema ?? null,
          // outputSchema is an optional registration field added in Chrome 159.
          // Surface when present so an agent knows the expected shape.
          outputSchema: t.outputSchema ?? null,
          annotations: t.annotations ?? null,
        })),
      };
    }, params.fromOrigins);

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
      // Four annotations Chrome recognizes (readOnlyHint, untrustedContentHint,
      // consequentialHint, debugging). consequentialHint renders loudly since
      // it signals irreversible actions the agent may want to confirm first.
      const tags: string[] = [];
      if (t.annotations?.consequentialHint)
        tags.push('⚠️ CONSEQUENTIAL');
      if (t.annotations?.readOnlyHint)
        tags.push('read-only');
      if (t.annotations?.untrustedContentHint)
        tags.push('untrusted-content');
      if (t.annotations?.debugging)
        tags.push('debugging');
      const tagStr = tags.length ? ` _(${tags.join(', ')})_` : '';
      lines.push(`${i + 1}. **${t.name}**${tagStr}`);

      if (t.description)
        lines.push(`   ${t.description}`);
      if (t.inputSchema)
        lines.push(`   Input schema: \`${JSON.stringify(t.inputSchema)}\``);
      if (t.outputSchema)
        lines.push(`   Output schema: \`${JSON.stringify(t.outputSchema)}\``);

      // Soft budget lint. Does not block anything, just flags for authors.
      const warns: string[] = [];
      if (typeof t.name === 'string' && t.name.length > BUDGET.toolName)
        warns.push(`name ${t.name.length}>${BUDGET.toolName}`);
      if (typeof t.description === 'string' && t.description.length > BUDGET.toolDescription)
        warns.push(`description ${t.description.length}>${BUDGET.toolDescription}`);
      const props = t.inputSchema && t.inputSchema.properties;
      if (props && typeof props === 'object') {
        for (const [pname, pdef] of Object.entries(props)) {
          if (pname.length > BUDGET.paramName)
            warns.push(`param "${pname}" name ${pname.length}>${BUDGET.paramName}`);
          const pdesc = (pdef as any)?.description;
          if (typeof pdesc === 'string' && pdesc.length > BUDGET.paramDescription)
            warns.push(`param "${pname}" description ${pdesc.length}>${BUDGET.paramDescription}`);
        }
      }
      if (warns.length)
        lines.push(`   📏 Budget lint: ${warns.join('; ')}`);

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

    // executeTool resolves to null when the tool triggered a navigation,
    // per the WebMCP spec. Distinct from an empty result — this tells the
    // agent "I went somewhere" so a follow-up status/evaluate makes sense
    // rather than retrying the same call expecting data.
    if (result.raw === null) {
      response.addResult(
          `🧭 **${params.name}** triggered a navigation. executeTool resolved to null, per the WebMCP spec, which means the tool navigated the page. ` +
        `Check \`browser_status\` for the new URL and re-run \`browser_webmcp_list\` since the page's tool set may have changed.`
      );
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

    // Soft budget lint on output. Measures the raw executeTool return
    // string (what Chrome hands the agent, which is compact JSON per the
    // WebMCP spec), NOT our pretty-printed display body. Peer caught that
    // JSON.stringify(v, null, 2) inflates by ~1.3x via indentation and
    // newlines, so a pretty-measured lint false-positives on tools whose
    // actual agent-facing output is within budget. Chrome's 1500-char
    // guidance counts agent-facing bytes.
    const measured = typeof result.raw === 'string'
      ? result.raw.length
      : JSON.stringify(parsed ?? '').length;
    const budgetNote = measured > BUDGET.output
      ? `\n\n📏 Agent-facing output ${measured} chars exceeds Chrome's ${BUDGET.output}-char guidance for individual tool output.`
      : '';

    response.addResult(`${header}\n\n${body}${budgetNote}`);
  },
});

const watchSchema = z.object({});

const watch = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_webmcp_watch',
    title: 'Start watching WebMCP toolchange and toolactivated events',
    description: 'Installs a listener on document.modelContext that buffers toolchange (tools registered/unregistered), toolactivated (tool invoked), and toolcancel (invocation cancelled mid-flight) events to window.__webmcpEvents. Covers all three events Chrome 156 exposes via ontoolchange/ontoolactivated/ontoolcancel. Idempotent — calling twice does not install twice. Drain the buffer with browser_webmcp_events. Makes WebMCP demos self-evidencing by proving tool calls really happened.',
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
      // toolcancel fires when an executeTool invocation is cancelled
      // mid-flight (user-aborted, page-aborted, or UA-aborted). Discovered
      // via prototype inspection: Chrome 156's ModelContext exposes
      // ontoolchange, ontoolactivated, and ontoolcancel as IDL accessors,
      // which is the authoritative signal for which events it fires.
      // The DevTools WebMCP pane also surfaces "Canceled" as a status.
      mc.addEventListener('toolcancel', push('toolcancel'));
      return { ok: true, already: false };
    });

    if (!result.ok) {
      response.addResult(`⚠️ ${SHAPE.missing}`);
      return;
    }
    response.addResult(result.already
      ? `Already watching. ${result.bufferedCount} event(s) buffered — drain with browser_webmcp_events.`
      : '✅ Watching toolactivated, toolchange, and toolcancel. Drain with browser_webmcp_events.');
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
