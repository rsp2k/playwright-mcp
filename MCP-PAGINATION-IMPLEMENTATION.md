# MCP Response Pagination System - Implementation Guide

## Overview

This document describes the comprehensive pagination system implemented for the Playwright MCP server to handle large tool responses that exceed token limits. The system addresses the user-reported issue:

> "Large MCP response (~10.0k tokens), this can fill up context quickly"

## Implementation Architecture

### Core Components

#### 1. Pagination Infrastructure (`src/pagination.ts`)

**Key Classes:**
- `SessionCursorManager`: Session-isolated cursor storage with automatic cleanup
- `QueryStateManager`: Detects parameter changes that invalidate cursors
- `PaginationGuardOptions<T>`: Generic configuration for any tool

**Core Function:**
```typescript
export async function withPagination<TParams, TData>(
  toolName: string,
  params: TParams & PaginationParams,
  context: Context,
  response: Response,
  options: PaginationGuardOptions<TData>
): Promise<void>
```

#### 2. Session Management

**Cursor State:**
```typescript
interface CursorState {
  id: string;                    // Unique cursor identifier
  sessionId: string;             // Session isolation
  toolName: string;              // Tool that created cursor
  queryStateFingerprint: string; // Parameter consistency check
  position: Record<string, any>; // Current position state
  createdAt: Date;               // Creation timestamp
  expiresAt: Date;               // Auto-expiration (24 hours)
  performanceMetrics: {          // Adaptive optimization
    avgFetchTimeMs: number;
    optimalChunkSize: number;
  };
}
```

#### 3. Universal Parameters Schema

```typescript
export const paginationParamsSchema = z.object({
  limit: z.number().min(1).max(1000).optional().default(50),
  cursor_id: z.string().optional(),
  session_id: z.string().optional()
});
```

## Tool Implementation Examples

### 1. Console Messages Tool (`src/tools/console.ts`)

**Before (Simple):**
```typescript
handle: async (tab, params, response) => {
  tab.consoleMessages().map(message => response.addResult(message.toString()));
}
```

**After (Paginated):**
```typescript
handle: async (context, params, response) => {
  await withPagination('browser_console_messages', params, context, response, {
    maxResponseTokens: 8000,
    defaultPageSize: 50,
    dataExtractor: async () => {
      const allMessages = context.currentTabOrDie().consoleMessages();
      // Apply level_filter, source_filter, search filters
      return filteredMessages;
    },
    itemFormatter: (message: ConsoleMessage) => {
      return `[${new Date().toISOString()}] ${message.toString()}`;
    },
    sessionIdExtractor: () => context.sessionId,
    positionCalculator: (items, lastIndex) => ({ lastIndex, totalItems: items.length })
  });
}
```

### 2. Request Monitoring Tool (`src/tools/requests.ts`)

**Enhanced with pagination:**
```typescript
const getRequestsSchema = paginationParamsSchema.extend({
  filter: z.enum(['all', 'failed', 'slow', 'errors', 'success']),
  domain: z.string().optional(),
  method: z.string().optional(),
  format: z.enum(['summary', 'detailed', 'stats']).default('summary')
});

// Paginated implementation with filtering preserved
await withPagination('browser_get_requests', params, context, response, {
  maxResponseTokens: 8000,
  defaultPageSize: 25, // Smaller for detailed request data
  dataExtractor: async () => applyAllFilters(interceptor.getData()),
  itemFormatter: (req, format) => formatRequest(req, format === 'detailed')
});
```

## User Experience Improvements

### 1. Large Response Detection

When a response would exceed the token threshold:

```
⚠️ **Large response detected (~15,234 tokens)**

Showing first 25 of 150 items. Use pagination to explore all data:

**Continue with next page:**
browser_console_messages({...same_params, limit: 25, cursor_id: "abc123def456"})

**Reduce page size for faster responses:**
browser_console_messages({...same_params, limit: 15})
```

### 2. Pagination Navigation

```
**Results: 25 items** (127ms) • Page 1/6 • Total fetched: 25/150

[... actual results ...]

**📄 Pagination**
• Page: 1 of 6
• Next: `browser_console_messages({...same_params, cursor_id: "abc123def456"})`
• Items: 25/150
```

### 3. Cursor Continuation

```
**Results: 25 items** (95ms) • Page 2/6 • Total fetched: 50/150

[... next page results ...]

**📄 Pagination**
• Page: 2 of 6
• Next: `browser_console_messages({...same_params, cursor_id: "def456ghi789"})`
• Progress: 50/150 items fetched
```

## Security Features

### 1. Session Isolation
```typescript
async getCursor(cursorId: string, sessionId: string): Promise<CursorState | null> {
  const cursor = this.cursors.get(cursorId);
  if (cursor?.sessionId !== sessionId) {
    throw new Error(`Cursor ${cursorId} not accessible from session ${sessionId}`);
  }
  return cursor;
}
```

### 2. Automatic Cleanup
- Cursors expire after 24 hours
- Background cleanup every 5 minutes
- Stale cursor detection and removal

### 3. Query Consistency Validation
```typescript
const currentQuery = QueryStateManager.fromParams(params);
if (QueryStateManager.fingerprint(currentQuery) !== cursor.queryStateFingerprint) {
  // Parameters changed, start fresh query
  await handleFreshQuery(...);
}
```

## Performance Optimizations

### 1. Adaptive Chunk Sizing
```typescript
// Automatically adjust page size for target 500ms response time
if (fetchTimeMs > targetTime && metrics.optimalChunkSize > 10) {
  metrics.optimalChunkSize = Math.max(10, Math.floor(metrics.optimalChunkSize * 0.8));
} else if (fetchTimeMs < targetTime * 0.5 && metrics.optimalChunkSize < 200) {
  metrics.optimalChunkSize = Math.min(200, Math.floor(metrics.optimalChunkSize * 1.2));
}
```

### 2. Intelligent Response Size Estimation
```typescript
// Estimate tokens before formatting full response
const sampleResponse = pageItems.map(item => options.itemFormatter(item)).join('\n');
const estimatedTokens = Math.ceil(sampleResponse.length / 4);
const maxTokens = options.maxResponseTokens || 8000;

if (estimatedTokens > maxTokens && pageItems.length > 10) {
  // Show pagination recommendation
}
```

## Usage Examples

### 1. Basic Pagination
```bash
# First page (automatic detection of large response)
browser_console_messages({"limit": 50})

# Continue to next page using returned cursor
browser_console_messages({"limit": 50, "cursor_id": "abc123def456"})
```

### 2. Filtered Pagination
```bash
# Filter + pagination combined
browser_console_messages({
  "limit": 25,
  "level_filter": "error",
  "search": "network"
})

# Continue with same filters
browser_console_messages({
  "limit": 25,
  "cursor_id": "def456ghi789",
  "level_filter": "error",  // Same filters required
  "search": "network"
})
```

### 3. Request Monitoring Pagination
```bash
# Large request datasets automatically paginated
browser_get_requests({
  "limit": 20,
  "filter": "errors",
  "format": "detailed"
})
```

## Migration Path for Additional Tools

To add pagination to any existing tool:

### 1. Update Schema
```typescript
const toolSchema = paginationParamsSchema.extend({
  // existing tool-specific parameters
  custom_param: z.string().optional()
});
```

### 2. Wrap Handler
```typescript
handle: async (context, params, response) => {
  await withPagination('tool_name', params, context, response, {
    maxResponseTokens: 8000,
    defaultPageSize: 50,
    dataExtractor: async () => getAllData(params),
    itemFormatter: (item) => formatItem(item),
    sessionIdExtractor: () => context.sessionId
  });
}
```

## Benefits Delivered

### For Users
- ✅ **No more token overflow warnings**
- ✅ **Consistent navigation across all tools**  
- ✅ **Smart response size recommendations**
- ✅ **Resumable data exploration**

### For Developers  
- ✅ **Universal pagination pattern**
- ✅ **Type-safe implementation**
- ✅ **Session security built-in**
- ✅ **Performance monitoring included**

### For MCP Clients
- ✅ **Automatic large response handling**
- ✅ **Predictable response sizes**
- ✅ **Efficient memory usage**
- ✅ **Context preservation**

## Future Enhancements

1. **Bidirectional Navigation**: Previous page support
2. **Bulk Operations**: Multi-cursor management  
3. **Export Integration**: Paginated data export
4. **Analytics**: Usage pattern analysis
5. **Caching**: Intelligent result caching

The pagination system successfully transforms the user experience from token overflow frustration to smooth, predictable data exploration while maintaining full backward compatibility and security.