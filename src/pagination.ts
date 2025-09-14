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
import { randomUUID } from 'crypto';
import type { Context } from './context.js';
import type { Response } from './response.js';

export const paginationParamsSchema = z.object({
  limit: z.number().min(1).max(1000).optional().default(50).describe('Maximum items per page (1-1000)'),
  cursor_id: z.string().optional().describe('Continue from previous page using cursor ID'),
  session_id: z.string().optional().describe('Session identifier for cursor isolation'),
  return_all: z.boolean().optional().default(false).describe('Return entire response bypassing pagination (WARNING: may produce very large responses)'),
});

export type PaginationParams = z.infer<typeof paginationParamsSchema>;

export interface CursorState {
  id: string;
  sessionId: string;
  toolName: string;
  queryStateFingerprint: string;
  position: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  resultCount: number;
  performanceMetrics: {
    avgFetchTimeMs: number;
    totalFetches: number;
    optimalChunkSize: number;
  };
}

export interface QueryState {
  filters: Record<string, any>;
  parameters: Record<string, any>;
}

export class QueryStateManager {
  static fromParams(params: any, excludeKeys: string[] = ['limit', 'cursor_id', 'session_id']): QueryState {
    const filters: Record<string, any> = {};
    const parameters: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (excludeKeys.includes(key)) continue;
      
      if (key.includes('filter') || key.includes('Filter')) {
        filters[key] = value;
      } else {
        parameters[key] = value;
      }
    }
    
    return { filters, parameters };
  }
  
  static fingerprint(queryState: QueryState): string {
    const combined = { ...queryState.filters, ...queryState.parameters };
    const sorted = Object.keys(combined)
      .sort()
      .reduce((result: Record<string, any>, key) => {
        result[key] = combined[key];
        return result;
      }, {});
    
    return JSON.stringify(sorted);
  }
}

export interface PaginatedData<T> {
  items: T[];
  totalCount?: number;
  hasMore: boolean;
  cursor?: string;
  metadata: {
    pageSize: number;
    fetchTimeMs: number;
    isFreshQuery: boolean;
    totalFetched?: number;
    estimatedTotal?: number;
  };
}

export class SessionCursorManager {
  private cursors: Map<string, CursorState> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startCleanupTask();
  }
  
  private startCleanupTask() {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredCursors();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
  
  private cleanupExpiredCursors() {
    const now = new Date();
    for (const [cursorId, cursor] of this.cursors.entries()) {
      if (cursor.expiresAt < now) {
        this.cursors.delete(cursorId);
      }
    }
  }
  
  async createCursor(
    sessionId: string,
    toolName: string, 
    queryState: QueryState,
    initialPosition: Record<string, any>
  ): Promise<string> {
    const cursorId = randomUUID().substring(0, 12);
    const now = new Date();
    
    const cursor: CursorState = {
      id: cursorId,
      sessionId,
      toolName,
      queryStateFingerprint: QueryStateManager.fingerprint(queryState),
      position: initialPosition,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
      lastAccessedAt: now,
      resultCount: 0,
      performanceMetrics: {
        avgFetchTimeMs: 0,
        totalFetches: 0,
        optimalChunkSize: 50
      }
    };
    
    this.cursors.set(cursorId, cursor);
    return cursorId;
  }
  
  async getCursor(cursorId: string, sessionId: string): Promise<CursorState | null> {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return null;
    
    if (cursor.sessionId !== sessionId) {
      throw new Error(`Cursor ${cursorId} not accessible from session ${sessionId}`);
    }
    
    if (cursor.expiresAt < new Date()) {
      this.cursors.delete(cursorId);
      return null;
    }
    
    cursor.lastAccessedAt = new Date();
    return cursor;
  }
  
  async updateCursorPosition(cursorId: string, newPosition: Record<string, any>, itemCount: number) {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;
    
    cursor.position = newPosition;
    cursor.resultCount += itemCount;
    cursor.lastAccessedAt = new Date();
  }
  
  async recordPerformance(cursorId: string, fetchTimeMs: number) {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;
    
    const metrics = cursor.performanceMetrics;
    metrics.totalFetches++;
    metrics.avgFetchTimeMs = (metrics.avgFetchTimeMs * (metrics.totalFetches - 1) + fetchTimeMs) / metrics.totalFetches;
    
    // Adaptive chunk sizing: adjust for target 500ms response time
    const targetTime = 500;
    if (fetchTimeMs > targetTime && metrics.optimalChunkSize > 10) {
      metrics.optimalChunkSize = Math.max(10, Math.floor(metrics.optimalChunkSize * 0.8));
    } else if (fetchTimeMs < targetTime * 0.5 && metrics.optimalChunkSize < 200) {
      metrics.optimalChunkSize = Math.min(200, Math.floor(metrics.optimalChunkSize * 1.2));
    }
  }
  
  async invalidateCursor(cursorId: string) {
    this.cursors.delete(cursorId);
  }
  
  destroy() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.cursors.clear();
  }
}

// Global cursor manager instance
export const globalCursorManager = new SessionCursorManager();

export interface PaginationGuardOptions<T> {
  maxResponseTokens?: number;
  defaultPageSize?: number;
  dataExtractor: (context: Context, params: any) => Promise<T[]> | T[];
  itemFormatter: (item: T, format?: string) => string;
  sessionIdExtractor?: (params: any) => string;
  positionCalculator?: (items: T[], startIndex: number) => Record<string, any>;
}

export async function withPagination<TParams extends Record<string, any>, TData>(
  toolName: string,
  params: TParams & PaginationParams,
  context: Context,
  response: Response,
  options: PaginationGuardOptions<TData>
): Promise<void> {
  const startTime = Date.now();
  const sessionId = options.sessionIdExtractor?.(params) || context.sessionId || 'default';
  
  // Extract all data
  const allData = await options.dataExtractor(context, params);
  
  // Check for bypass option - return complete dataset with warnings
  if (params.return_all) {
    return await handleBypassPagination(toolName, params, allData, options, startTime, response);
  }
  
  // Detect if this is a fresh query or cursor continuation
  const isFreshQuery = !params.cursor_id;
  
  if (isFreshQuery) {
    await handleFreshQuery(toolName, params, context, response, allData, options, sessionId, startTime);
  } else {
    await handleCursorContinuation(toolName, params, context, response, allData, options, sessionId, startTime);
  }
}

async function handleFreshQuery<TParams extends Record<string, any>, TData>(
  toolName: string,
  params: TParams & PaginationParams,
  context: Context,
  response: Response,
  allData: TData[],
  options: PaginationGuardOptions<TData>,
  sessionId: string,
  startTime: number
): Promise<void> {
  const limit = params.limit || options.defaultPageSize || 50;
  const pageItems = allData.slice(0, limit);
  
  // Check if response would be too large
  const sampleResponse = pageItems.map(item => options.itemFormatter(item)).join('\n');
  const estimatedTokens = Math.ceil(sampleResponse.length / 4);
  const maxTokens = options.maxResponseTokens || 8000;
  
  let cursorId: string | undefined;
  
  if (allData.length > limit) {
    // Create cursor for continuation
    const queryState = QueryStateManager.fromParams(params);
    const initialPosition = options.positionCalculator?.(allData, limit - 1) || { 
      lastIndex: limit - 1,
      totalItems: allData.length 
    };
    
    cursorId = await globalCursorManager.createCursor(
      sessionId,
      toolName,
      queryState,
      initialPosition
    );
  }
  
  const fetchTimeMs = Date.now() - startTime;
  
  // Format response
  if (estimatedTokens > maxTokens && pageItems.length > 10) {
    // Response is too large, recommend pagination
    const recommendedLimit = Math.max(10, Math.floor(limit * maxTokens / estimatedTokens));
    
    response.addResult(
      `⚠️ **Large response detected (~${estimatedTokens.toLocaleString()} tokens)**\n\n` +
      `Showing first ${pageItems.length} of ${allData.length} items. ` +
      `Use pagination to explore all data:\n\n` +
      `**Continue with next page:**\n` +
      `${toolName}({...same_params, limit: ${limit}, cursor_id: "${cursorId}"})\n\n` +
      `**Reduce page size for faster responses:**\n` +
      `${toolName}({...same_params, limit: ${recommendedLimit}})\n\n` +
      `**First ${pageItems.length} items:**`
    );
  } else {
    if (cursorId) {
      response.addResult(
        `**Results: ${pageItems.length} of ${allData.length} items** ` +
        `(${fetchTimeMs}ms) • [Next page available]\n`
      );
    } else {
      response.addResult(
        `**Results: ${pageItems.length} items** (${fetchTimeMs}ms)\n`
      );
    }
  }
  
  // Add formatted items
  pageItems.forEach(item => {
    response.addResult(options.itemFormatter(item, (params as any).format));
  });
  
  // Add pagination footer
  if (cursorId) {
    response.addResult(
      `\n**📄 Pagination**\n` +
      `• Page: 1 of ${Math.ceil(allData.length / limit)}\n` +
      `• Next: \`${toolName}({...same_params, cursor_id: "${cursorId}"})\`\n` +
      `• Items: ${pageItems.length}/${allData.length}`
    );
  }
}

async function handleCursorContinuation<TParams extends Record<string, any>, TData>(
  toolName: string,
  params: TParams & PaginationParams,
  context: Context,
  response: Response,
  allData: TData[],
  options: PaginationGuardOptions<TData>,
  sessionId: string,
  startTime: number
): Promise<void> {
  try {
    const cursor = await globalCursorManager.getCursor(params.cursor_id!, sessionId);
    if (!cursor) {
      response.addResult(`⚠️ Cursor expired or invalid. Starting fresh query...\n`);
      await handleFreshQuery(toolName, params, context, response, allData, options, sessionId, startTime);
      return;
    }
    
    // Verify query consistency
    const currentQuery = QueryStateManager.fromParams(params);
    if (QueryStateManager.fingerprint(currentQuery) !== cursor.queryStateFingerprint) {
      response.addResult(`⚠️ Query parameters changed. Starting fresh with new filters...\n`);
      await handleFreshQuery(toolName, params, context, response, allData, options, sessionId, startTime);
      return;
    }
    
    const limit = params.limit || options.defaultPageSize || 50;
    const startIndex = cursor.position.lastIndex + 1;
    const pageItems = allData.slice(startIndex, startIndex + limit);
    
    let newCursorId: string | undefined;
    if (startIndex + limit < allData.length) {
      const newPosition = options.positionCalculator?.(allData, startIndex + limit - 1) || {
        lastIndex: startIndex + limit - 1,
        totalItems: allData.length
      };
      
      await globalCursorManager.updateCursorPosition(cursor.id, newPosition, pageItems.length);
      newCursorId = cursor.id;
    } else {
      await globalCursorManager.invalidateCursor(cursor.id);
    }
    
    const fetchTimeMs = Date.now() - startTime;
    await globalCursorManager.recordPerformance(cursor.id, fetchTimeMs);
    
    const currentPage = Math.floor(startIndex / limit) + 1;
    const totalPages = Math.ceil(allData.length / limit);
    
    response.addResult(
      `**Results: ${pageItems.length} items** (${fetchTimeMs}ms) • ` +
      `Page ${currentPage}/${totalPages} • Total fetched: ${cursor.resultCount + pageItems.length}/${allData.length}\n`
    );
    
    // Add formatted items
    pageItems.forEach(item => {
      response.addResult(options.itemFormatter(item, (params as any).format));
    });
    
    // Add pagination footer
    response.addResult(
      `\n**📄 Pagination**\n` +
      `• Page: ${currentPage} of ${totalPages}\n` +
      (newCursorId ? 
        `• Next: \`${toolName}({...same_params, cursor_id: "${newCursorId}"})\`` :
        `• ✅ End of results`) +
      `\n• Progress: ${cursor.resultCount + pageItems.length}/${allData.length} items fetched`
    );
    
  } catch (error) {
    response.addResult(`⚠️ Pagination error: ${error}. Starting fresh query...\n`);
    await handleFreshQuery(toolName, params, context, response, allData, options, sessionId, startTime);
  }
}

async function handleBypassPagination<TParams extends Record<string, any>, TData>(
  toolName: string,
  params: TParams & PaginationParams,
  allData: TData[],
  options: PaginationGuardOptions<TData>,
  startTime: number,
  response: Response
): Promise<void> {
  const fetchTimeMs = Date.now() - startTime;
  
  // Format all items for token estimation
  const formattedItems = allData.map(item => options.itemFormatter(item, (params as any).format));
  const fullResponse = formattedItems.join('\n');
  const estimatedTokens = Math.ceil(fullResponse.length / 4);
  
  // Create comprehensive warning based on response size
  let warningLevel = '💡';
  let warningText = 'Large response';
  
  if (estimatedTokens > 50000) {
    warningLevel = '🚨';
    warningText = 'EXTREMELY LARGE response';
  } else if (estimatedTokens > 20000) {
    warningLevel = '⚠️';
    warningText = 'VERY LARGE response';
  } else if (estimatedTokens > 8000) {
    warningLevel = '⚠️';
    warningText = 'Large response';
  }
  
  const maxTokens = options.maxResponseTokens || 8000;
  const exceedsThreshold = estimatedTokens > maxTokens;
  
  // Build warning message
  const warningMessage = 
    `${warningLevel} **PAGINATION BYPASSED** - ${warningText} (~${estimatedTokens.toLocaleString()} tokens)\n\n` +
    `**⚠️ WARNING: This response may:**\n` +
    `• Fill up context rapidly (${Math.ceil(estimatedTokens / 1000)}k+ tokens)\n` +
    `• Cause client performance issues\n` +
    `• Be truncated by MCP client limits\n` +
    `• Impact subsequent conversation quality\n\n` +
    (exceedsThreshold ? 
      `**💡 RECOMMENDATION:**\n` +
      `• Use pagination: \`${toolName}({...same_params, return_all: false, limit: ${Math.min(50, Math.floor(maxTokens * 50 / estimatedTokens))}})\`\n` +
      `• Apply filters to reduce dataset size\n` +
      `• Consider using cursor navigation for exploration\n\n` :
      `This response size is manageable but still large.\n\n`) +
    `**📊 Dataset: ${allData.length} items** (${fetchTimeMs}ms fetch time)\n`;
  
  
  // Add warning header
  response.addResult(warningMessage);
  
  // Add all formatted items
  formattedItems.forEach(item => {
    response.addResult(item);
  });
  
  // Add summary footer
  response.addResult(
    `\n**📋 COMPLETE DATASET DELIVERED**\n` +
    `• Items: ${allData.length} (all)\n` +
    `• Tokens: ~${estimatedTokens.toLocaleString()}\n` +
    `• Fetch Time: ${fetchTimeMs}ms\n` +
    `• Status: ✅ No pagination applied\n\n` +
    `💡 **Next time**: Use \`return_all: false\` for paginated navigation`
  );
}