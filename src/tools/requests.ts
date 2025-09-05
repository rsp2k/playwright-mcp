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
import { RequestInterceptorOptions } from '../requestInterceptor.js';
import type { Context } from '../context.js';

const startMonitoringSchema = z.object({
  urlFilter: z.union([
    z.string(),
    z.object({
      type: z.enum(['regex', 'function']),
      value: z.string()
    })
  ]).optional().describe('Filter URLs to capture. Can be a string (contains match), regex pattern, or custom function. Examples: "/api/", ".*\\.json$", or custom logic'),

  captureBody: z.boolean().optional().default(true).describe('Whether to capture request and response bodies (default: true)'),

  maxBodySize: z.number().optional().default(10485760).describe('Maximum body size to capture in bytes (default: 10MB). Larger bodies will be truncated'),

  autoSave: z.boolean().optional().default(false).describe('Automatically save captured requests after each response (default: false for performance)'),

  outputPath: z.string().optional().describe('Custom output directory path. If not specified, uses session artifact directory')
});

const getRequestsSchema = z.object({
  filter: z.enum(['all', 'failed', 'slow', 'errors', 'success']).optional().default('all').describe('Filter requests by type: all, failed (network failures), slow (>1s), errors (4xx/5xx), success (2xx/3xx)'),

  domain: z.string().optional().describe('Filter requests by domain hostname'),

  method: z.string().optional().describe('Filter requests by HTTP method (GET, POST, etc.)'),

  status: z.number().optional().describe('Filter requests by HTTP status code'),

  limit: z.number().optional().default(100).describe('Maximum number of requests to return (default: 100)'),

  format: z.enum(['summary', 'detailed', 'stats']).optional().default('summary').describe('Response format: summary (basic info), detailed (full data), stats (statistics only)'),

  slowThreshold: z.number().optional().default(1000).describe('Threshold in milliseconds for considering requests "slow" (default: 1000ms)')
});

const exportRequestsSchema = z.object({
  format: z.enum(['json', 'har', 'csv', 'summary']).optional().default('json').describe('Export format: json (full data), har (HTTP Archive), csv (spreadsheet), summary (human-readable report)'),

  filename: z.string().optional().describe('Custom filename for export. Auto-generated if not specified with timestamp'),

  filter: z.enum(['all', 'failed', 'slow', 'errors', 'success']).optional().default('all').describe('Filter which requests to export'),

  includeBody: z.boolean().optional().default(false).describe('Include request/response bodies in export (warning: may create large files)')
});

/**
 * Start comprehensive request monitoring and interception
 *
 * This tool enables deep HTTP traffic analysis during browser automation.
 * Perfect for API reverse engineering, security testing, and performance analysis.
 *
 * Use Cases:
 * - Security testing: Capture all API calls for vulnerability analysis
 * - Performance monitoring: Identify slow endpoints and optimize
 * - API documentation: Generate comprehensive API usage reports
 * - Debugging: Analyze failed requests and error patterns
 */
const startRequestMonitoring = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_start_request_monitoring',
    title: 'Start request monitoring',
    description: 'Enable comprehensive HTTP request/response interception and analysis. Captures headers, bodies, timing, and failure information for all browser traffic. Essential for security testing, API analysis, and performance debugging.',
    inputSchema: startMonitoringSchema,
    type: 'destructive',
  },

  handle: async (context: Context, params: z.output<typeof startMonitoringSchema>, response) => {
    try {
      await context.ensureTab();

      // Parse URL filter
      let urlFilter: RequestInterceptorOptions['urlFilter'];
      if (params.urlFilter) {
        if (typeof params.urlFilter === 'string') {
          urlFilter = params.urlFilter;
        } else {
          // Handle regex or function
          if (params.urlFilter.type === 'regex') {
            urlFilter = new RegExp(params.urlFilter.value);
          } else {
            // Function - evaluate safely
            try {

              urlFilter = eval(`(${params.urlFilter.value})`);
            } catch (error: any) {
              throw new Error(`Invalid filter function: ${error.message}`);
            }
          }
        }
      }

      // Get output path from artifact manager or use default
      let outputPath = params.outputPath;
      if (!outputPath && context.sessionId) {
        const artifactManager = context.getArtifactManager();
        if (artifactManager)
          outputPath = artifactManager.getSubdirectory('requests');

      }
      if (!outputPath)
        outputPath = context.config.outputDir + '/requests';


      const options: RequestInterceptorOptions = {
        urlFilter,
        captureBody: params.captureBody,
        maxBodySize: params.maxBodySize,
        autoSave: params.autoSave,
        outputPath
      };

      // Start monitoring
      await context.startRequestMonitoring(options);

      response.addResult('✅ **Request monitoring started successfully**');
      response.addResult('');
      response.addResult('📊 **Configuration:**');
      response.addResult(`• URL Filter: ${params.urlFilter || 'All requests'}`);
      response.addResult(`• Capture Bodies: ${params.captureBody ? 'Yes' : 'No'}`);
      response.addResult(`• Max Body Size: ${(params.maxBodySize! / 1024 / 1024).toFixed(1)}MB`);
      response.addResult(`• Auto Save: ${params.autoSave ? 'Yes' : 'No'}`);
      response.addResult(`• Output Path: ${outputPath}`);
      response.addResult('');
      response.addResult('🎯 **Next Steps:**');
      response.addResult('1. Navigate to pages and interact with the application');
      response.addResult('2. Use `browser_get_requests` to view captured traffic');
      response.addResult('3. Use `browser_export_requests` to save analysis results');
      response.addResult('4. Use `browser_clear_requests` to clear captured data');

    } catch (error: any) {
      throw new Error(`Failed to start request monitoring: ${error.message}`);
    }
  },
});

/**
 * Retrieve and analyze captured HTTP requests
 *
 * Access comprehensive request data including timing, headers, bodies,
 * and failure information. Supports advanced filtering and analysis.
 */
const getRequests = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_get_requests',
    title: 'Get captured requests',
    description: 'Retrieve and analyze captured HTTP requests with advanced filtering. Shows timing, status codes, headers, and bodies. Perfect for identifying performance issues, failed requests, or analyzing API usage patterns.',
    inputSchema: getRequestsSchema,
    type: 'readOnly',
  },

  handle: async (context: Context, params: z.output<typeof getRequestsSchema>, response) => {
    try {
      const interceptor = context.getRequestInterceptor();
      if (!interceptor) {
        response.addResult('❌ **Request monitoring not active**');
        response.addResult('');
        response.addResult('💡 Start monitoring first with `browser_start_request_monitoring`');
        return;
      }

      let requests = interceptor.getData();

      // Apply filters
      if (params.filter !== 'all') {
        switch (params.filter) {
          case 'failed':
            requests = interceptor.getFailedRequests();
            break;
          case 'slow':
            requests = interceptor.getSlowRequests(params.slowThreshold);
            break;
          case 'errors':
            requests = requests.filter(r => r.response && r.response.status >= 400);
            break;
          case 'success':
            requests = requests.filter(r => r.response && r.response.status < 400);
            break;
        }
      }

      if (params.domain) {
        requests = requests.filter(r => {
          try {
            return new URL(r.url).hostname === params.domain;
          } catch {
            return false;
          }
        });
      }

      if (params.method)
        requests = requests.filter(r => r.method.toLowerCase() === params.method!.toLowerCase());


      if (params.status)
        requests = requests.filter(r => r.response?.status === params.status);


      // Limit results
      const limitedRequests = requests.slice(0, params.limit);

      if (params.format === 'stats') {
        // Return statistics only
        const stats = interceptor.getStats();
        response.addResult('📊 **Request Statistics**');
        response.addResult('');
        response.addResult(`• Total Requests: ${stats.totalRequests}`);
        response.addResult(`• Successful: ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%)`);
        response.addResult(`• Failed: ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)}%)`);
        response.addResult(`• Errors: ${stats.errorResponses} (${((stats.errorResponses / stats.totalRequests) * 100).toFixed(1)}%)`);
        response.addResult(`• Average Response Time: ${stats.averageResponseTime}ms`);
        response.addResult(`• Slow Requests (>1s): ${stats.slowRequests}`);
        response.addResult('');
        response.addResult('**By Method:**');
        Object.entries(stats.requestsByMethod).forEach(([method, count]) => {
          response.addResult(`  • ${method}: ${count}`);
        });
        response.addResult('');
        response.addResult('**By Status Code:**');
        Object.entries(stats.requestsByStatus).forEach(([status, count]) => {
          response.addResult(`  • ${status}: ${count}`);
        });
        response.addResult('');
        response.addResult('**Top Domains:**');
        const topDomains = Object.entries(stats.requestsByDomain)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
        topDomains.forEach(([domain, count]) => {
          response.addResult(`  • ${domain}: ${count}`);
        });
        return;
      }

      // Return request data
      if (limitedRequests.length === 0) {
        response.addResult('ℹ️ **No requests found matching the criteria**');
        response.addResult('');
        response.addResult('💡 Try different filters or ensure the page has made HTTP requests');
        return;
      }

      response.addResult(`📋 **Captured Requests (${limitedRequests.length} of ${requests.length} total)**`);
      response.addResult('');

      limitedRequests.forEach((req, index) => {
        const duration = req.duration ? `${req.duration}ms` : 'pending';
        const status = req.failed ? 'FAILED' : req.response?.status || 'pending';
        const size = req.response?.bodySize ? ` (${(req.response.bodySize / 1024).toFixed(1)}KB)` : '';

        response.addResult(`**${index + 1}. ${req.method} ${status}** - ${duration}`);
        response.addResult(`   ${req.url}${size}`);

        if (params.format === 'detailed') {
          response.addResult(`   📅 ${req.timestamp}`);
          if (req.response) {
            response.addResult(`   📊 Status: ${req.response.status} ${req.response.statusText}`);
            response.addResult(`   ⏱️  Duration: ${req.response.duration}ms`);
            response.addResult(`   🔄 From Cache: ${req.response.fromCache ? 'Yes' : 'No'}`);

            // Show key headers
            const contentType = req.response.headers['content-type'];
            if (contentType)
              response.addResult(`   📄 Content-Type: ${contentType}`);

          }

          if (req.failed && req.failure)
            response.addResult(`   ❌ Failure: ${req.failure.errorText}`);


          response.addResult('');
        }
      });

      if (requests.length > params.limit)
        response.addResult(`💡 Showing first ${params.limit} results. Use higher limit or specific filters to see more.`);


    } catch (error: any) {
      throw new Error(`Failed to get requests: ${error.message}`);
    }
  },
});

/**
 * Export captured requests to various formats for external analysis
 */
const exportRequests = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_export_requests',
    title: 'Export captured requests',
    description: 'Export captured HTTP requests to various formats (JSON, HAR, CSV, or summary report). Perfect for sharing analysis results, importing into other tools, or creating audit reports.',
    inputSchema: exportRequestsSchema,
    type: 'readOnly',
  },

  handle: async (context: Context, params: z.output<typeof exportRequestsSchema>, response) => {
    try {
      const interceptor = context.getRequestInterceptor();
      if (!interceptor) {
        response.addResult('❌ **Request monitoring not active**');
        response.addResult('');
        response.addResult('💡 Start monitoring first with `browser_start_request_monitoring`');
        return;
      }

      const requests = interceptor.getData();
      if (requests.length === 0) {
        response.addResult('ℹ️ **No requests to export**');
        response.addResult('');
        response.addResult('💡 Navigate to pages and interact with the application first');
        return;
      }

      let exportPath: string;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `requests-${timestamp}`;

      switch (params.format) {
        case 'har':
          exportPath = await interceptor.exportHAR(params.filename || `${defaultFilename}.har`);
          break;

        case 'json':
          exportPath = await interceptor.save(params.filename || `${defaultFilename}.json`);
          break;

        case 'csv':
          // Create CSV export
          const csvData = requests.map(req => ({
            timestamp: req.timestamp,
            method: req.method,
            url: req.url,
            status: req.response?.status || (req.failed ? 'FAILED' : 'PENDING'),
            duration: req.duration || '',
            size: req.response?.bodySize || '',
            contentType: req.response?.headers['content-type'] || '',
            fromCache: req.response?.fromCache || false
          }));

          const csvHeaders = Object.keys(csvData[0]).join(',');
          const csvRows = csvData.map(row => Object.values(row).join(','));
          const csvContent = [csvHeaders, ...csvRows].join('\n');

          const csvFilename = params.filename || `${defaultFilename}.csv`;
          const csvPath = `${interceptor.getStatus().options.outputPath}/${csvFilename}`;
          await require('fs/promises').writeFile(csvPath, csvContent);
          exportPath = csvPath;
          break;

        case 'summary':
          // Create human-readable summary
          const stats = interceptor.getStats();
          const summaryLines = [
            '# HTTP Request Analysis Summary',
            `Generated: ${new Date().toISOString()}`,
            '',
            '## Overview',
            `- Total Requests: ${stats.totalRequests}`,
            `- Successful: ${stats.successfulRequests}`,
            `- Failed: ${stats.failedRequests}`,
            `- Errors: ${stats.errorResponses}`,
            `- Average Response Time: ${stats.averageResponseTime}ms`,
            '',
            '## Performance',
            `- Fast Requests (<1s): ${stats.fastRequests}`,
            `- Slow Requests (>1s): ${stats.slowRequests}`,
            '',
            '## Request Methods',
            ...Object.entries(stats.requestsByMethod).map(([method, count]) => `- ${method}: ${count}`),
            '',
            '## Status Codes',
            ...Object.entries(stats.requestsByStatus).map(([status, count]) => `- ${status}: ${count}`),
            '',
            '## Top Domains',
            ...Object.entries(stats.requestsByDomain)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([domain, count]) => `- ${domain}: ${count}`),
            '',
            '## Slow Requests (>1s)',
            ...interceptor.getSlowRequests().map(req =>
              `- ${req.method} ${req.url} (${req.duration}ms)`
            ),
            '',
            '## Failed Requests',
            ...interceptor.getFailedRequests().map(req =>
              `- ${req.method} ${req.url} (${req.response?.status || 'NETWORK_FAILED'})`
            )
          ];

          const summaryFilename = params.filename || `${defaultFilename}-summary.md`;
          const summaryPath = `${interceptor.getStatus().options.outputPath}/${summaryFilename}`;
          await require('fs/promises').writeFile(summaryPath, summaryLines.join('\n'));
          exportPath = summaryPath;
          break;

        default:
          throw new Error(`Unsupported export format: ${params.format}`);
      }

      response.addResult('✅ **Export completed successfully**');
      response.addResult('');
      response.addResult(`📁 **File saved:** ${exportPath}`);
      response.addResult(`📊 **Exported:** ${requests.length} requests`);
      response.addResult(`🗂️  **Format:** ${params.format.toUpperCase()}`);
      response.addResult('');

      if (params.format === 'har') {
        response.addResult('💡 **HAR files** can be imported into:');
        response.addResult('  • Chrome DevTools (Network tab)');
        response.addResult('  • Insomnia or Postman');
        response.addResult('  • Online HAR viewers');
      } else if (params.format === 'json') {
        response.addResult('💡 **JSON files** contain full request/response data');
        response.addResult('  • Perfect for programmatic analysis');
        response.addResult('  • Includes headers, bodies, timing info');
      }

    } catch (error: any) {
      throw new Error(`Failed to export requests: ${error.message}`);
    }
  },
});

/**
 * Clear all captured request data from memory
 */
const clearRequests = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_requests',
    title: 'Clear captured requests',
    description: 'Clear all captured HTTP request data from memory. Useful for freeing up memory during long sessions or when starting fresh analysis.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context: Context, params, response) => {
    try {
      const interceptor = context.getRequestInterceptor();
      if (!interceptor) {
        response.addResult('ℹ️ **Request monitoring not active**');
        response.addResult('');
        response.addResult('💡 Start monitoring first with `browser_start_request_monitoring`');
        return;
      }

      const clearedCount = interceptor.clear();

      response.addResult('✅ **Request data cleared successfully**');
      response.addResult('');
      response.addResult(`🗑️  **Cleared:** ${clearedCount} captured requests`);
      response.addResult('');
      response.addResult('💡 **Memory freed** - Ready for new monitoring session');

    } catch (error: any) {
      throw new Error(`Failed to clear requests: ${error.message}`);
    }
  },
});

/**
 * Get current request monitoring status and configuration
 */
const getMonitoringStatus = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_request_monitoring_status',
    title: 'Get request monitoring status',
    description: 'Check if request monitoring is active and view current configuration. Shows capture statistics, filter settings, and output paths.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context: Context, params, response) => {
    try {
      const interceptor = context.getRequestInterceptor();

      if (!interceptor) {
        response.addResult('❌ **Request monitoring is not active**');
        response.addResult('');
        response.addResult('💡 **To start monitoring:**');
        response.addResult('1. Use `browser_start_request_monitoring` to enable');
        response.addResult('2. Navigate to pages and perform actions');
        response.addResult('3. Use `browser_get_requests` to view captured data');
        return;
      }

      const status = interceptor.getStatus();
      const stats = interceptor.getStats();

      response.addResult('✅ **Request monitoring is active**');
      response.addResult('');
      response.addResult('📊 **Current Statistics:**');
      response.addResult(`• Total Captured: ${stats.totalRequests} requests`);
      response.addResult(`• Successful: ${stats.successfulRequests}`);
      response.addResult(`• Failed: ${stats.failedRequests}`);
      response.addResult(`• Average Response Time: ${stats.averageResponseTime}ms`);
      response.addResult('');
      response.addResult('⚙️ **Configuration:**');
      response.addResult(`• Attached to Page: ${status.isAttached ? 'Yes' : 'No'}`);
      response.addResult(`• Current Page: ${status.pageUrl || 'None'}`);
      response.addResult(`• Capture Bodies: ${status.options.captureBody ? 'Yes' : 'No'}`);
      response.addResult(`• Max Body Size: ${status.options.maxBodySize ? (status.options.maxBodySize / 1024 / 1024).toFixed(1) + 'MB' : 'Unlimited'}`);
      response.addResult(`• Auto Save: ${status.options.autoSave ? 'Yes' : 'No'}`);
      response.addResult(`• Output Path: ${status.options.outputPath || 'Default'}`);

      if (stats.totalRequests > 0) {
        response.addResult('');
        response.addResult('📈 **Recent Activity:**');
        const recentRequests = interceptor.getData().slice(-3);
        recentRequests.forEach((req, index) => {
          const duration = req.duration ? ` (${req.duration}ms)` : '';
          const status = req.failed ? 'FAILED' : req.response?.status || 'pending';
          response.addResult(`  ${index + 1}. ${req.method} ${status} - ${new URL(req.url).pathname}${duration}`);
        });
      }

    } catch (error: any) {
      throw new Error(`Failed to get monitoring status: ${error.message}`);
    }
  },
});

export default [
  startRequestMonitoring,
  getRequests,
  exportRequests,
  clearRequests,
  getMonitoringStatus,
];
