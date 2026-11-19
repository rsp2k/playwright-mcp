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
import { defineTool } from './tool.js';
import type { Context } from '../context.js';
import type { Response } from '../response.js';

// Discoverable facade tools for runtime network-behavior manipulation.
// Each delegates to Context.updateBrowserConfig, which triggers a browser
// restart with the new chromium args / Playwright context options.
// The same capabilities are reachable via browser_configure, but a named
// tool in the catalog is what an agent typically finds first.

const hostMappingsSchema = z.object({
  mappings: z.array(z.object({
    hostname: z.string().describe('Hostname to override. Wildcards supported: "foo.example.com" or "*.internal.example"'),
    target: z.string().describe('IP or hostname the browser should actually connect to'),
    port: z.coerce.number().optional().describe('Destination port override (omit to keep the original URL\'s port)'),
  })).describe('Complete list of MAP rules. Each call replaces all prior mappings (sticky semantics). Pass [] to clear.'),
  excludes: z.array(z.string()).optional().describe('Hostnames to bypass mapping (e.g. ["localhost"])'),
});

const setHostMappings = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_host_mappings',
    title: 'Override DNS to simulate a custom Host header',
    description: 'Make the browser connect to <target> while still sending <hostname> in the Host header, TLS SNI, and URL bar. Use this when you need the effect of a custom Host header, since Chromium does not let the Host header be set directly via page.setExtraHTTPHeaders or route.continue (it is on the reserved-header list). Common use: hitting a vhost at a backend IP instead of its public FQDN. Triggers a browser restart. Each call replaces all prior mappings.',
    inputSchema: hostMappingsSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof hostMappingsSchema>, response: Response) => {
    await context.updateBrowserConfig({
      hostMappings: params.mappings,
      hostExcludes: params.excludes ?? [],
    });

    const lines: string[] = [];
    if (params.mappings.length === 0 && (!params.excludes || params.excludes.length === 0)) {
      lines.push('✅ Host mappings cleared. Browser restarted with default DNS resolution.');
    } else {
      lines.push(`✅ Host mappings applied (${params.mappings.length} MAP + ${params.excludes?.length ?? 0} EXCLUDE). Browser restarted.`);
      lines.push('');
      for (const m of params.mappings) {
        const tgt = m.port !== undefined ? `${m.target}:${m.port}` : m.target;
        lines.push(`  • ${m.hostname} → ${tgt}`);
      }
      for (const e of params.excludes ?? [])
        lines.push(`  • EXCLUDE ${e}`);
    }
    response.addResult(lines.join('\n'));
  },
});

const proxySchema = z.object({
  server: z.string().describe('Proxy server URL, e.g. "http://proxy.example.com:3128" or "socks5://127.0.0.1:1080". Empty string clears the proxy.'),
  bypass: z.string().optional().describe('Comma-separated hostnames to bypass the proxy (e.g. ".example.com,localhost")'),
});

const setProxy = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_proxy',
    title: 'Route browser traffic through an HTTP/SOCKS proxy',
    description: 'Configure an outbound proxy for all browser requests. Supports HTTP and SOCKS. Triggers a browser restart. Pass an empty server string to clear.',
    inputSchema: proxySchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof proxySchema>, response: Response) => {
    await context.updateBrowserConfig({
      proxyServer: params.server,
      proxyBypass: params.bypass,
    });
    response.addResult(
      params.server
          ? `✅ Proxy set: ${params.server}${params.bypass ? ` (bypass: ${params.bypass})` : ''}. Browser restarted.`
          : '✅ Proxy cleared. Browser restarted.'
    );
  },
});

const certValidationSchema = z.object({
  enabled: z.boolean().describe('true: validate HTTPS certificates (default, secure). false: accept self-signed and otherwise invalid certs.'),
});

const setCertificateValidation = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_certificate_validation',
    title: 'Accept or reject invalid HTTPS certificates',
    description: 'Toggle whether the browser rejects self-signed or otherwise invalid HTTPS certificates. Routes through Playwright\'s native context.ignoreHTTPSErrors (cleaner than chromium\'s --ignore-certificate-errors flag). Triggers a browser restart.',
    inputSchema: certValidationSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof certValidationSchema>, response: Response) => {
    await context.updateBrowserConfig({ ignoreHttpsErrors: !params.enabled });
    response.addResult(
      params.enabled
          ? '✅ HTTPS certificate validation ENABLED. Browser rejects invalid certificates.'
          : '⚠️  HTTPS certificate validation DISABLED. Browser now accepts self-signed and invalid certificates. Browser restarted.'
    );
  },
});

const webSecuritySchema = z.object({
  enabled: z.boolean().describe('true: enforce same-origin policy (default, secure). false: disable, allowing cross-origin fetches/iframes to bypass CORS and site isolation.'),
});

const setWebSecurity = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_web_security',
    title: 'Enforce or bypass same-origin policy',
    description: 'Toggle the browser\'s same-origin policy and related web-platform security checks. Disabling allows cross-origin requests without CORS, cross-frame scripting, and similar. Equivalent to chromium --disable-web-security + --disable-site-isolation-trials. May require isolated/incognito mode to take effect. Triggers a browser restart. Only for controlled testing — leaves the browser open to any site\'s JS.',
    inputSchema: webSecuritySchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof webSecuritySchema>, response: Response) => {
    await context.updateBrowserConfig({ disableWebSecurity: !params.enabled });
    response.addResult(
      params.enabled
          ? '✅ Web security ENABLED. Same-origin policy and site isolation enforced. Browser restarted.'
          : '⚠️  Web security DISABLED. Same-origin policy bypassed. Browser restarted.'
    );
  },
});

export default [
  setHostMappings,
  setProxy,
  setCertificateValidation,
  setWebSecurity,
];
