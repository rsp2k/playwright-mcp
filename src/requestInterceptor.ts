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

import * as fs from 'fs/promises';
import * as path from 'path';
import debug from 'debug';
import * as playwright from 'playwright';

const interceptDebug = debug('pw:mcp:intercept');

export interface InterceptedRequest {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  resourceType: string;
  postData?: string;
  startTime: number;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    fromCache: boolean;
    timing: any;
    duration: number;
    body?: any;
    bodyType?: 'json' | 'text' | 'base64';
    bodySize?: number;
    bodyTruncated?: boolean;
    bodyError?: string;
  };
  failed?: boolean;
  failure?: any;
  duration?: number;
}

export interface RequestInterceptorOptions {
  // Filter which URLs to capture
  urlFilter?: string | RegExp | ((url: string) => boolean);
  // Where to save the data
  outputPath?: string;
  // Whether to save after each request
  autoSave?: boolean;
  // Maximum body size to store (to avoid memory issues)
  maxBodySize?: number;
  // Whether to capture request/response bodies
  captureBody?: boolean;
  // Custom filename generator
  filename?: () => string;
}

export interface RequestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorResponses: number;
  averageResponseTime: number;
  requestsByMethod: Record<string, number>;
  requestsByStatus: Record<string, number>;
  requestsByDomain: Record<string, number>;
  slowRequests: number;
  fastRequests: number;
}

/**
 * Comprehensive request interceptor for capturing and analyzing HTTP traffic
 * during browser automation sessions
 */
export class RequestInterceptor {
  private requests: InterceptedRequest[] = [];
  private options: Required<RequestInterceptorOptions>;
  private page?: playwright.Page;
  private isAttached: boolean = false;

  constructor(options: RequestInterceptorOptions = {}) {
    this.options = {
      urlFilter: options.urlFilter || (() => true),
      outputPath: options.outputPath || './api-logs',
      autoSave: options.autoSave || false,
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024, // 10MB default
      captureBody: options.captureBody !== false,
      filename: options.filename || (() => `api-log-${Date.now()}.json`)
    };

    void this.ensureOutputDir();
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.options.outputPath, { recursive: true });
    } catch (error) {
      interceptDebug('Failed to create output directory:', error);
    }
  }

  /**
   * Attach request interception to a Playwright page
   */
  async attach(page: playwright.Page): Promise<void> {
    if (this.isAttached && this.page === page) {
      interceptDebug('Already attached to this page');
      return;
    }

    // Detach from previous page if needed
    if (this.isAttached && this.page !== page)
      this.detach();


    this.page = page;
    this.isAttached = true;

    // Attach event listeners
    page.on('request', this.handleRequest.bind(this));
    page.on('response', this.handleResponse.bind(this));
    page.on('requestfailed', this.handleRequestFailed.bind(this));

    interceptDebug(`Request interceptor attached to page: ${page.url()}`);
  }

  /**
   * Detach request interception from the current page
   */
  detach(): void {
    if (!this.isAttached || !this.page)
      return;

    this.page.off('request', this.handleRequest.bind(this));
    this.page.off('response', this.handleResponse.bind(this));
    this.page.off('requestfailed', this.handleRequestFailed.bind(this));

    this.isAttached = false;
    this.page = undefined;

    interceptDebug('Request interceptor detached');
  }

  private handleRequest(request: playwright.Request): void {
    // Check if we should capture this request
    if (!this.shouldCapture(request.url()))
      return;

    const requestData: InterceptedRequest = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      resourceType: request.resourceType(),
      postData: this.options.captureBody ? (request.postData() || undefined) : undefined,
      startTime: Date.now()
    };

    this.requests.push(requestData);
    interceptDebug(`Captured request: ${requestData.method} ${requestData.url}`);

    // Auto-save if enabled
    if (this.options.autoSave)
      void this.save().catch(error => interceptDebug('Auto-save failed:', error));

  }

  private async handleResponse(response: playwright.Response): Promise<void> {
    const request = response.request();

    // Find matching request
    const requestData = this.findRequest(request.url(), request.method());
    if (!requestData)
      return;

    try {
      requestData.response = {
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        fromCache: (response as any).fromCache?.() || false,
        timing: await response.finished() ? null : (response as any).timing?.(),
        duration: Date.now() - requestData.startTime
      };

      // Capture response body if enabled and size is reasonable
      if (this.options.captureBody) {
        try {
          const body = await response.body();
          if (body.length <= this.options.maxBodySize) {
            // Try to parse based on content-type
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              try {
                requestData.response.body = JSON.parse(body.toString());
                requestData.response.bodyType = 'json';
              } catch {
                requestData.response.body = body.toString();
                requestData.response.bodyType = 'text';
              }
            } else if (contentType.includes('text') || contentType.includes('javascript')) {
              requestData.response.body = body.toString();
              requestData.response.bodyType = 'text';
            } else {
              // Store as base64 for binary content
              requestData.response.body = body.toString('base64');
              requestData.response.bodyType = 'base64';
            }
            requestData.response.bodySize = body.length;
          } else {
            requestData.response.bodyTruncated = true;
            requestData.response.bodySize = body.length;
          }
        } catch (error: any) {
          requestData.response.bodyError = error.message;
        }
      }

      requestData.duration = requestData.response.duration;
      interceptDebug(`Response captured: ${requestData.response.status} ${requestData.url} (${requestData.duration}ms)`);

      // Auto-save if enabled
      if (this.options.autoSave)
        void this.save().catch(error => interceptDebug('Auto-save failed:', error));

    } catch (error: any) {
      interceptDebug('Error handling response:', error);
      requestData.response = {
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        fromCache: (response as any).fromCache?.() || false,
        timing: null,
        duration: Date.now() - requestData.startTime,
        bodyError: `Failed to capture response: ${error.message}`
      };
    }
  }

  private handleRequestFailed(request: playwright.Request): void {
    const requestData = this.findRequest(request.url(), request.method());
    if (!requestData)
      return;

    requestData.failed = true;
    requestData.failure = request.failure();
    requestData.duration = Date.now() - requestData.startTime;

    interceptDebug(`Request failed: ${requestData.method} ${requestData.url}`);

    if (this.options.autoSave)
      void this.save().catch(error => interceptDebug('Auto-save failed:', error));

  }

  private findRequest(url: string, method: string): InterceptedRequest | null {
    // Find the most recent matching request without a response
    for (let i = this.requests.length - 1; i >= 0; i--) {
      const req = this.requests[i];
      if (req.url === url && req.method === method && !req.response && !req.failed)
        return req;

    }
    return null;
  }

  private shouldCapture(url: string): boolean {
    const filter = this.options.urlFilter;

    if (typeof filter === 'function')
      return filter(url);

    if (filter instanceof RegExp)
      return filter.test(url);

    if (typeof filter === 'string')
      return url.includes(filter);

    return true;
  }

  /**
   * Get all captured requests
   */
  getData(): InterceptedRequest[] {
    return this.requests;
  }

  /**
   * Get requests filtered by predicate
   */
  filter(predicate: (req: InterceptedRequest) => boolean): InterceptedRequest[] {
    return this.requests.filter(predicate);
  }

  /**
   * Get failed requests (network failures or HTTP errors)
   */
  getFailedRequests(): InterceptedRequest[] {
    return this.requests.filter(r => r.failed || (r.response && r.response.status >= 400));
  }

  /**
   * Get slow requests above threshold
   */
  getSlowRequests(thresholdMs: number = 1000): InterceptedRequest[] {
    return this.requests.filter(r => r.duration && r.duration > thresholdMs);
  }

  /**
   * Get requests by domain
   */
  getRequestsByDomain(domain: string): InterceptedRequest[] {
    return this.requests.filter(r => {
      try {
        return new URL(r.url).hostname === domain;
      } catch {
        return false;
      }
    });
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): RequestStats {
    const stats: RequestStats = {
      totalRequests: this.requests.length,
      successfulRequests: 0,
      failedRequests: 0,
      errorResponses: 0,
      averageResponseTime: 0,
      requestsByMethod: {},
      requestsByStatus: {},
      requestsByDomain: {},
      slowRequests: 0,
      fastRequests: 0
    };

    let totalTime = 0;
    let timeCount = 0;

    this.requests.forEach(req => {
      // Count successful/failed
      if (req.failed) {
        stats.failedRequests++;
      } else if (req.response) {
        if (req.response.status < 400)
          stats.successfulRequests++;
        else
          stats.errorResponses++;

      }

      // Response time stats
      if (req.duration) {
        totalTime += req.duration;
        timeCount++;

        if (req.duration > 1000)
          stats.slowRequests++;
        else
          stats.fastRequests++;

      }

      // Method stats
      stats.requestsByMethod[req.method] = (stats.requestsByMethod[req.method] || 0) + 1;

      // Status stats
      if (req.response) {
        const status = req.response.status.toString();
        stats.requestsByStatus[status] = (stats.requestsByStatus[status] || 0) + 1;
      }

      // Domain stats
      try {
        const domain = new URL(req.url).hostname;
        stats.requestsByDomain[domain] = (stats.requestsByDomain[domain] || 0) + 1;
      } catch {
        // Ignore invalid URLs
      }
    });

    stats.averageResponseTime = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;
    return stats;
  }

  /**
   * Save captured data to file
   */
  async save(filename?: string): Promise<string> {
    const file = filename || this.options.filename();
    const filepath = path.join(this.options.outputPath, file);

    const data = {
      metadata: {
        capturedAt: new Date().toISOString(),
        totalRequests: this.requests.length,
        stats: this.getStats(),
        options: {
          captureBody: this.options.captureBody,
          maxBodySize: this.options.maxBodySize
        }
      },
      requests: this.requests
    };

    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    interceptDebug(`Saved ${this.requests.length} API calls to ${filepath}`);
    return filepath;
  }

  /**
   * Export data in HAR (HTTP Archive) format
   */
  async exportHAR(filename?: string): Promise<string> {
    const file = filename || `har-export-${Date.now()}.har`;
    const filepath = path.join(this.options.outputPath, file);

    // Convert to HAR format
    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'Playwright MCP Request Interceptor',
          version: '1.0.0'
        },
        entries: this.requests.map(req => ({
          startedDateTime: req.timestamp,
          time: req.duration || 0,
          request: {
            method: req.method,
            url: req.url,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(req.headers).map(([name, value]) => ({ name, value })),
            queryString: [],
            postData: req.postData ? {
              mimeType: 'application/x-www-form-urlencoded',
              text: req.postData
            } : undefined,
            headersSize: -1,
            bodySize: req.postData?.length || 0
          },
          response: req.response ? {
            status: req.response.status,
            statusText: req.response.statusText,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(req.response.headers).map(([name, value]) => ({ name, value })),
            content: {
              size: req.response.bodySize || 0,
              mimeType: req.response.headers['content-type'] || 'text/plain',
              text: req.response.bodyType === 'text' || req.response.bodyType === 'json'
                ? (typeof req.response.body === 'string' ? req.response.body : JSON.stringify(req.response.body))
                : undefined,
              encoding: req.response.bodyType === 'base64' ? 'base64' : undefined
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: req.response.bodySize || 0
          } : {
            status: 0,
            statusText: 'Failed',
            httpVersion: 'HTTP/1.1',
            headers: [],
            content: { size: 0, mimeType: 'text/plain' },
            redirectURL: '',
            headersSize: -1,
            bodySize: 0
          },
          cache: {},
          timings: req.response?.timing || {
            send: 0,
            wait: req.duration || 0,
            receive: 0
          }
        }))
      }
    };

    await fs.writeFile(filepath, JSON.stringify(har, null, 2));
    interceptDebug(`Exported ${this.requests.length} requests to HAR format: ${filepath}`);
    return filepath;
  }

  /**
   * Clear all captured data
   */
  clear(): number {
    const count = this.requests.length;
    this.requests = [];
    interceptDebug(`Cleared ${count} captured requests`);
    return count;
  }

  /**
   * Get current capture status
   */
  getStatus(): {
    isAttached: boolean;
    requestCount: number;
    pageUrl?: string;
    options: RequestInterceptorOptions;
    } {
    return {
      isAttached: this.isAttached,
      requestCount: this.requests.length,
      pageUrl: this.page?.url(),
      options: this.options
    };
  }
}
