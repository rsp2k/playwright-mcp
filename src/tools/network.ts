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

import type * as playwright from 'playwright';

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns all network requests since loading the page. For more detailed analysis including timing, headers, and bodies, use the advanced request monitoring tools (browser_start_request_monitoring, browser_get_requests).',
    inputSchema: z.object({
      detailed: z.boolean().optional().default(false).describe('Show detailed request information if request monitoring is active')
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    // Check if request interceptor is active and can provide richer data
    const interceptor = tab.context.getRequestInterceptor();

    if (params.detailed && interceptor) {
      // Use rich intercepted data
      const interceptedRequests = interceptor.getData();

      if (interceptedRequests.length > 0) {
        response.addResult('📊 **Network Requests (Enhanced)**');
        response.addResult('');

        interceptedRequests.forEach((req, index) => {
          const duration = req.duration ? ` (${req.duration}ms)` : '';
          const status = req.failed ? 'FAILED' : req.response?.status || 'pending';
          const size = req.response?.bodySize ? ` - ${(req.response.bodySize / 1024).toFixed(1)}KB` : '';

          response.addResult(`${index + 1}. **${req.method} ${status}**${duration}`);
          response.addResult(`   ${req.url}${size}`);

          if (req.response) {
            const contentType = req.response.headers['content-type'];
            if (contentType)
              response.addResult(`   📄 ${contentType}`);

          }

          if (req.failed && req.failure)
            response.addResult(`   ❌ ${req.failure.errorText}`);


          response.addResult('');
        });

        const stats = interceptor.getStats();
        response.addResult('📈 **Summary:**');
        response.addResult(`• Total: ${stats.totalRequests} | Success: ${stats.successfulRequests} | Failed: ${stats.failedRequests}`);
        response.addResult(`• Average Response Time: ${stats.averageResponseTime}ms`);
        return;
      }
    }

    // Fall back to basic playwright request data
    const basicRequests = tab.requests();
    if (basicRequests.size === 0) {
      response.addResult('ℹ️ **No network requests found**');
      response.addResult('');
      response.addResult('💡 For comprehensive request monitoring, use:');
      response.addResult('   • `browser_start_request_monitoring` - Enable detailed capture');
      response.addResult('   • `browser_get_requests` - View captured data with analysis');
      return;
    }

    response.addResult('📋 **Network Requests (Basic)**');
    response.addResult('');
    [...basicRequests.entries()].forEach(([req, res], index) => {
      response.addResult(`${index + 1}. ${renderRequest(req, res)}`);
    });

    response.addResult('');
    response.addResult('💡 **For detailed analysis** including timing, headers, and bodies:');
    response.addResult('   • Use `browser_start_request_monitoring` to enable advanced capture');
    response.addResult('   • Then use `browser_get_requests` for comprehensive analysis');
  },
});

function renderRequest(request: playwright.Request, response: playwright.Response | null) {
  const result: string[] = [];
  result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
  if (response)
    result.push(`=> [${response.status()}] ${response.statusText()}`);
  return result.join(' ');
}

export default [
  requests,
];
