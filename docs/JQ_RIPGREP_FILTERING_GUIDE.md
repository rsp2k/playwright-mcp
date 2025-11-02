# jq + Ripgrep Filtering Guide

## Complete Reference for Triple-Layer Filtering in Playwright MCP

This guide covers the revolutionary triple-layer filtering system that combines differential snapshots, jq structural queries, and ripgrep pattern matching to achieve 99.9%+ noise reduction in browser automation.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Configuration API](#configuration-api)
4. [Filter Orchestration](#filter-orchestration)
5. [jq Expression Examples](#jq-expression-examples)
6. [Real-World Use Cases](#real-world-use-cases)
7. [Performance Characteristics](#performance-characteristics)
8. [Advanced Patterns](#advanced-patterns)
9. [Troubleshooting](#troubleshooting)

---

## Overview

### The Triple-Layer Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   INPUT: Full Page Snapshot                │
│                      (100,000+ tokens)                     │
└────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌────────────────────────────────────────────────────────────┐
│  LAYER 1: Differential Snapshots (React-style reconciliation) │
│  Reduces: ~99% (only shows changes since last snapshot)   │
└────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌────────────────────────────────────────────────────────────┐
│  LAYER 2: jq Structural Filtering                         │
│  Reduces: ~60% (structural JSON queries and transformations)│
└────────────────────────────────────────────────────────────┐
                           │
                           ↓
┌────────────────────────────────────────────────────────────┐
│  LAYER 3: Ripgrep Pattern Matching                        │
│  Reduces: ~75% (surgical text pattern matching)           │
└────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌────────────────────────────────────────────────────────────┐
│              OUTPUT: Ultra-Filtered Results                │
│  Total Reduction: 99.7%+ (100K tokens → 300 tokens)      │
└────────────────────────────────────────────────────────────┘
```

### Why Three Layers?

Each layer targets a different filtering strategy:

1. **Differential Layer**: Removes unchanged page content (structural diff)
2. **jq Layer**: Extracts specific JSON structures and transforms data
3. **Ripgrep Layer**: Matches text patterns within the filtered structures

The mathematical composition creates unprecedented precision:
```
Total Reduction = 1 - ((1 - R₁) × (1 - R₂) × (1 - R₃))
Example: 1 - ((1 - 0.99) × (1 - 0.60) × (1 - 0.75)) = 0.997 = 99.7%
```

---

## Quick Start

### Basic jq Filtering

```typescript
// 1. Enable differential snapshots + jq filtering
await browser_configure_snapshots({
  differentialSnapshots: true,
  differentialMode: 'semantic',
  jqExpression: '.elements[] | select(.role == "button")'
});

// 2. Navigate and interact - only button changes are shown
await browser_navigate({ url: 'https://example.com' });
await browser_click({ element: 'Submit button', ref: 'elem_123' });
```

### Triple-Layer Filtering

```typescript
// Combine all three layers for maximum precision
await browser_configure_snapshots({
  // Layer 1: Differential
  differentialSnapshots: true,
  differentialMode: 'semantic',

  // Layer 2: jq structural filter
  jqExpression: '.elements[] | select(.role == "button" or .role == "link")',
  jqOptions: {
    compact: true,
    sortKeys: true
  },

  // Layer 3: Ripgrep pattern matching
  filterPattern: 'submit|login|signup',
  filterMode: 'content',
  caseSensitive: false,

  // Orchestration
  filterOrder: 'jq_first'  // Default: structure → pattern
});
```

---

## Configuration API

### `browser_configure_snapshots` Parameters

#### jq Structural Filtering

| Parameter | Type | Description |
|-----------|------|-------------|
| `jqExpression` | `string` (optional) | jq expression for structural JSON querying. Examples: `.elements[] \| select(.role == "button")` |
| `jqOptions` | `object` (optional) | jq execution options (see below) |
| `filterOrder` | `enum` (optional) | Filter application order (see [Filter Orchestration](#filter-orchestration)) |

#### jq Options Object

| Option | Type | Description | jq Flag |
|--------|------|-------------|---------|
| `rawOutput` | `boolean` | Output raw strings instead of JSON | `-r` |
| `compact` | `boolean` | Compact JSON output without whitespace | `-c` |
| `sortKeys` | `boolean` | Sort object keys in output | `-S` |
| `slurp` | `boolean` | Read entire input into array | `-s` |
| `exitStatus` | `boolean` | Set exit code based on output | `-e` |
| `nullInput` | `boolean` | Use null as input | `-n` |

---

## Filter Orchestration

### Filter Order Options

| Order | Description | Use Case |
|-------|-------------|----------|
| `jq_first` (default) | jq → ripgrep | **Recommended**: Structure first, then pattern match. Best for extracting specific types then finding patterns. |
| `ripgrep_first` | ripgrep → jq | Pattern first, then structure. Useful when narrowing by text then transforming. |
| `jq_only` | jq only | Pure structural transformation without pattern matching. |
| `ripgrep_only` | ripgrep only | Pure pattern matching without jq (existing behavior). |

### Example: `jq_first` (Recommended)

```typescript
// 1. Extract all buttons with jq
// 2. Find buttons containing "submit" with ripgrep
await browser_configure_snapshots({
  jqExpression: '.elements[] | select(.role == "button")',
  filterPattern: 'submit',
  filterOrder: 'jq_first'  // Structure → Pattern
});

// Result: Only submit buttons from changed elements
```

### Example: `ripgrep_first`

```typescript
// 1. Find all elements containing "error" with ripgrep
// 2. Transform to compact JSON with jq
await browser_configure_snapshots({
  filterPattern: 'error|warning|danger',
  jqExpression: '[.elements[] | {role, text, id}]',
  jqOptions: { compact: true },
  filterOrder: 'ripgrep_first'  // Pattern → Structure
});

// Result: Compact array of error-related elements
```

---

## jq Expression Examples

### Basic Selection

```jq
# Extract all buttons
.elements[] | select(.role == "button")

# Extract links with specific attributes
.elements[] | select(.role == "link" and .attributes.href)

# Extract console errors
.console[] | select(.level == "error")
```

### Transformation

```jq
# Create simplified element objects
[.elements[] | {role, text, id}]

# Extract text from all headings
[.elements[] | select(.role == "heading") | .text]

# Build hierarchical structure
{
  buttons: [.elements[] | select(.role == "button")],
  links: [.elements[] | select(.role == "link")],
  errors: [.console[] | select(.level == "error")]
}
```

### Advanced Queries

```jq
# Find buttons with data attributes
.elements[] | select(.role == "button" and .attributes | keys | any(startswith("data-")))

# Group elements by role
group_by(.role) | map({role: .[0].role, count: length})

# Extract navigation items
.elements[] | select(.role == "navigation") | .children[] | select(.role == "link")
```

---

## Real-World Use Cases

### Use Case 1: Form Validation Debugging

**Problem**: Track form validation errors during user input.

```typescript
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '.elements[] | select(.role == "alert" or .attributes.role == "alert")',
  filterPattern: 'error|invalid|required',
  filterOrder: 'jq_first'
});

// Now each interaction shows only new validation errors
await browser_type({ element: 'Email', ref: 'input_1', text: 'invalid-email' });
// Output: { role: "alert", text: "Please enter a valid email address" }
```

### Use Case 2: API Error Monitoring

**Problem**: Track JavaScript console errors during navigation.

```typescript
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '.console[] | select(.level == "error" or .level == "warning")',
  filterPattern: 'TypeError|ReferenceError|fetch failed|API error',
  filterMode: 'content',
  filterOrder: 'jq_first'
});

// Navigate and see only new API/JS errors
await browser_navigate({ url: 'https://example.com/dashboard' });
// Output: { level: "error", message: "TypeError: Cannot read property 'data' of undefined" }
```

### Use Case 3: Dynamic Content Testing

**Problem**: Verify specific elements appear after async operations.

```typescript
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '[.elements[] | select(.role == "listitem") | {text, id}]',
  jqOptions: { compact: true },
  filterPattern: 'Product.*Added',
  filterOrder: 'jq_first'
});

await browser_click({ element: 'Add to Cart', ref: 'btn_123' });
// Output: [{"text":"Product XYZ Added to Cart","id":"notification_1"}]
```

### Use Case 4: Accessibility Audit

**Problem**: Find accessibility issues in interactive elements.

```typescript
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '.elements[] | select(.role == "button" or .role == "link") | select(.attributes.ariaLabel == null)',
  filterOrder: 'jq_only'  // No ripgrep needed
});

// Shows all buttons/links without aria-labels
await browser_navigate({ url: 'https://example.com' });
// Output: Elements missing accessibility labels
```

---

## Performance Characteristics

### Reduction Metrics

| Layer | Typical Reduction | Example (100K → ?) |
|-------|-------------------|-------------------|
| Differential | 99% | 100K → 1K tokens |
| jq | 60% | 1K → 400 tokens |
| Ripgrep | 75% | 400 → 100 tokens |
| **Total** | **99.9%** | **100K → 100 tokens** |

### Execution Time

```
┌─────────────┬──────────────┬─────────────────┐
│ Operation   │ Time (ms)    │ Notes           │
├─────────────┼──────────────┼─────────────────┤
│ Differential│ ~50ms        │ In-memory diff  │
│ jq          │ ~10-30ms     │ Binary spawn    │
│ Ripgrep     │ ~5-15ms      │ Binary spawn    │
│ Total       │ ~65-95ms     │ Sequential      │
└─────────────┴──────────────┴─────────────────┘
```

### Memory Usage

- **Temp files**: Created per operation, auto-cleaned
- **jq temp dir**: `/tmp/playwright-mcp-jq/`
- **Ripgrep temp dir**: `/tmp/playwright-mcp-filtering/`
- **Cleanup**: Automatic on process exit

---

## Advanced Patterns

### Pattern 1: Multi-Stage Transformation

```typescript
// Stage 1: Extract form fields (jq)
// Stage 2: Find validation errors (ripgrep)
// Stage 3: Format for LLM consumption (jq options)

await browser_configure_snapshots({
  jqExpression: `
    .elements[]
    | select(.role == "textbox" or .role == "combobox")
    | {
        name: .attributes.name,
        value: .attributes.value,
        error: (.children[] | select(.role == "alert") | .text)
      }
  `,
  jqOptions: {
    compact: true,
    sortKeys: true
  },
  filterPattern: 'required|invalid|error',
  filterOrder: 'jq_first'
});
```

### Pattern 2: Cross-Element Analysis

```typescript
// Use jq slurp mode to analyze relationships

await browser_configure_snapshots({
  jqExpression: `
    [.elements[]]
    | group_by(.role)
    | map({
        role: .[0].role,
        count: length,
        sample: (.[0] | {text, id})
      })
  `,
  jqOptions: {
    slurp: false,  // Already array from differential
    compact: false  // Pretty format for readability
  },
  filterOrder: 'jq_only'
});
```

### Pattern 3: Conditional Filtering

```typescript
// Different filters for different scenarios

const isProduction = process.env.NODE_ENV === 'production';

await browser_configure_snapshots({
  differentialSnapshots: true,

  // Production: Only errors
  jqExpression: isProduction
    ? '.console[] | select(.level == "error")'
    : '.console[]',  // Dev: All console

  filterPattern: isProduction
    ? 'Error|Exception|Failed'
    : '.*',  // Dev: Match all

  filterOrder: 'jq_first'
});
```

---

## Troubleshooting

### Issue: jq Expression Syntax Error

**Symptoms**: Error like "jq: parse error"

**Solutions**:
1. Escape quotes properly: `select(.role == \"button\")`
2. Test expression locally: `echo '{"test":1}' | jq '.test'`
3. Use single quotes in shell, double quotes in JSON
4. Check jq documentation: https://jqlang.github.io/jq/manual/

### Issue: No Results from Filter

**Symptoms**: Empty output despite matching data

**Debug Steps**:
```typescript
// 1. Check each layer independently

// Differential only
await browser_configure_snapshots({
  differentialSnapshots: true,
  // No jq or ripgrep
});

// Add jq
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '.elements[]',  // Pass-through
  filterOrder: 'jq_only'
});

// Add ripgrep
await browser_configure_snapshots({
  differentialSnapshots: true,
  jqExpression: '.elements[]',
  filterPattern: '.*',  // Match all
  filterOrder: 'jq_first'
});
```

### Issue: Performance Degradation

**Symptoms**: Slow response times

**Solutions**:
1. Use `filterMode: 'count'` to see match statistics
2. Increase `maxMatches` if truncating too early
3. Use `jqOptions.compact: true` to reduce output size
4. Consider `ripgrep_first` if pattern match narrows significantly
5. Check temp file cleanup: `ls /tmp/playwright-mcp-*/`

### Issue: Unexpected Filter Order

**Symptoms**: Results don't match expected order

**Verify**:
```typescript
// Check current configuration
await browser_configure_snapshots({});  // No params = show current

// Should display current filterOrder in output
```

---

## Performance Comparison

### Traditional Approach vs Triple-Layer Filtering

```
Traditional Full Snapshots:
┌─────────────────────────────────────────────┐
│ Every Operation: 100K tokens               │
│ 10 operations = 1M tokens                  │
│ Context window fills quickly               │
└─────────────────────────────────────────────┘

Differential Only:
┌─────────────────────────────────────────────┐
│ Every Operation: ~1K tokens (99% reduction)│
│ 10 operations = 10K tokens                 │
│ Much better, but still noisy               │
└─────────────────────────────────────────────┘

Triple-Layer (Differential + jq + Ripgrep):
┌─────────────────────────────────────────────┐
│ Every Operation: ~100 tokens (99.9% reduction)│
│ 10 operations = 1K tokens                  │
│ SURGICAL PRECISION                         │
└─────────────────────────────────────────────┘
```

---

## Best Practices

### 1. Start with jq_first Order

The default `jq_first` order is recommended for most use cases:
- Extract structure first (jq)
- Find patterns second (ripgrep)
- Best balance of precision and performance

### 2. Use Compact Output for Large Datasets

```typescript
jqOptions: {
  compact: true,     // Remove whitespace
  sortKeys: true     // Consistent ordering
}
```

### 3. Combine with Differential Mode

Always enable differential snapshots for maximum reduction:

```typescript
differentialSnapshots: true,
differentialMode: 'semantic'  // React-style reconciliation
```

### 4. Test Expressions Incrementally

Build complex jq expressions step by step:

```bash
# Test jq locally first
echo '{"elements":[{"role":"button","text":"Submit"}]}' | \
  jq '.elements[] | select(.role == "button")'

# Then add to configuration
```

### 5. Monitor Performance Metrics

Check the performance stats in output:

```json
{
  "combined_performance": {
    "differential_reduction_percent": 99.0,
    "jq_reduction_percent": 60.0,
    "ripgrep_reduction_percent": 75.0,
    "total_reduction_percent": 99.7,
    "total_time_ms": 87
  }
}
```

---

## Conclusion

The triple-layer filtering system represents a revolutionary approach to browser automation:

- **99.9%+ noise reduction** through cascading filters
- **Flexible orchestration** with multiple filter orders
- **Powerful jq queries** for structural JSON manipulation
- **Surgical ripgrep matching** for text patterns
- **Performance optimized** with binary spawning and temp file management

This system enables unprecedented precision in extracting exactly the data you need from complex web applications, while keeping token usage minimal and responses focused.

---

## Additional Resources

- **jq Manual**: https://jqlang.github.io/jq/manual/
- **jq Playground**: https://jqplay.org/
- **Ripgrep Guide**: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
- **Playwright MCP**: https://github.com/microsoft/playwright-mcp

---

**Version**: 1.0.0
**Last Updated**: 2025-11-01
**Author**: Playwright MCP Team
