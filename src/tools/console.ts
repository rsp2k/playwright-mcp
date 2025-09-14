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
import { paginationParamsSchema, withPagination } from '../pagination.js';
import type { Context } from '../context.js';
import type { Response } from '../response.js';
import type { ConsoleMessage } from '../tab.js';

const consoleMessagesSchema = paginationParamsSchema.extend({
  level_filter: z.enum(['all', 'error', 'warning', 'info', 'debug', 'log']).optional().default('all').describe('Filter messages by level'),
  source_filter: z.enum(['all', 'console', 'javascript', 'network']).optional().default('all').describe('Filter messages by source'),
  search: z.string().optional().describe('Search text within console messages'),
});

const console = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_console_messages',
    title: 'Get console messages',
    description: 'Returns console messages with pagination support. Large message lists are automatically paginated for better performance.',
    inputSchema: consoleMessagesSchema,
    type: 'readOnly',
  },
  handle: async (context: Context, params: z.output<typeof consoleMessagesSchema>, response: Response) => {
    const tab = context.currentTabOrDie();
    
    await withPagination(
      'browser_console_messages',
      params,
      context,
      response,
      {
        maxResponseTokens: 8000,
        defaultPageSize: 50,
        dataExtractor: async () => {
          const allMessages = tab.consoleMessages();
          
          // Apply filters
          let filteredMessages = allMessages;
          
          if (params.level_filter !== 'all') {
            filteredMessages = filteredMessages.filter((msg: ConsoleMessage) => {
              if (!msg.type) return params.level_filter === 'log'; // Default to 'log' for undefined types
              return msg.type === params.level_filter || 
                     (params.level_filter === 'log' && msg.type === 'info');
            });
          }
          
          if (params.source_filter !== 'all') {
            filteredMessages = filteredMessages.filter((msg: ConsoleMessage) => {
              const msgStr = msg.toString().toLowerCase();
              switch (params.source_filter) {
                case 'console': return msgStr.includes('console') || msgStr.includes('[log]');
                case 'javascript': return msgStr.includes('javascript') || msgStr.includes('js');
                case 'network': return msgStr.includes('network') || msgStr.includes('security');
                default: return true;
              }
            });
          }
          
          if (params.search) {
            const searchTerm = params.search.toLowerCase();
            filteredMessages = filteredMessages.filter((msg: ConsoleMessage) => 
              msg.toString().toLowerCase().includes(searchTerm) ||
              msg.text.toLowerCase().includes(searchTerm)
            );
          }
          
          return filteredMessages;
        },
        itemFormatter: (message: ConsoleMessage) => {
          const timestamp = new Date().toISOString();
          return `[${timestamp}] ${message.toString()}`;
        },
        sessionIdExtractor: () => context.sessionId,
        positionCalculator: (items, lastIndex) => ({
          lastIndex,
          totalItems: items.length,
          timestamp: Date.now()
        })
      }
    );
  },
});

export default [
  console,
];
