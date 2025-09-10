# MCP Client Identification System - Demo Guide

## Overview

This system solves the problem: *"I'm running many different 'mcp clients' in parallel on the same machine. It's sometimes hard to figure out what client a playwright window belongs to."*

## Quick Demo

### 1. Enable Debug Toolbar

```bash
# Use MCP tool to enable debug toolbar with project identification
{
  "method": "tools/call",
  "params": {
    "name": "browser_enable_debug_toolbar",
    "arguments": {
      "projectName": "My E-commerce Project",
      "position": "top-right",
      "theme": "dark",
      "minimized": false,
      "showDetails": true,
      "opacity": 0.9
    }
  }
}
```

**Result:** A draggable debug toolbar appears in the top-right corner showing:
- ✅ Project name: "My E-commerce Project" 
- ✅ Live session ID (first 12 chars)
- ✅ Client information and version
- ✅ Session uptime counter
- ✅ Current hostname
- ✅ Green status indicator

### 2. Add Custom Identification Code

```bash
# Inject custom JavaScript for additional identification
{
  "method": "tools/call", 
  "params": {
    "name": "browser_inject_custom_code",
    "arguments": {
      "name": "project-banner",
      "type": "javascript",
      "code": "document.title = '[E-COMMERCE] ' + document.title; console.log('🛍️ E-commerce MCP Client Active');"
    }
  }
}
```

**Result:** 
- ✅ Page title prefixed with "[E-COMMERCE]"
- ✅ Console message identifies the project
- ✅ Auto-injects on all new pages in this session

### 3. Multiple Client Scenario

**Client A (E-commerce):**
- Debug toolbar shows: "My E-commerce Project"
- Page titles: "[E-COMMERCE] Amazon.com", "[E-COMMERCE] Product Page"

**Client B (Analytics):**
- Debug toolbar shows: "Analytics Dashboard" 
- Page titles: "[ANALYTICS] Google Analytics", "[ANALYTICS] Reports"

**Client C (Testing):**
- Debug toolbar shows: "Automated Testing"
- Console logs: "🧪 Test Suite Running - Session XYZ"

## Available Tools

| Tool | Purpose |
|------|---------|
| `browser_enable_debug_toolbar` | Show project identification overlay |
| `browser_inject_custom_code` | Add custom JS/CSS to all pages |
| `browser_list_injections` | View current injection configuration |
| `browser_disable_debug_toolbar` | Remove debug toolbar |
| `browser_clear_injections` | Clean up all custom injections |

## Features

### Debug Toolbar
- **Draggable & Minimizable** - Move anywhere on screen, collapse to save space
- **Live Updates** - Session uptime, current URL hostname
- **Configurable** - Light/dark/transparent themes, multiple positions
- **LLM-Safe** - Wrapped in HTML comments, won't confuse automated testing

### Custom Code Injection
- **Session Persistent** - Survives page navigation and refreshes
- **Auto-Injection** - Automatically applies to all new pages
- **Type Support** - JavaScript and CSS injection
- **Safe Wrapping** - Clear HTML comment boundaries for LLM safety

### Session Management
- **Unique Session IDs** - Each MCP client gets distinct identifier
- **Auto-Detection** - System detects client information when available
- **Persistent Configuration** - Settings survive across page navigations

## Use Cases

1. **Multi-Project Development** - Distinguish between different project browser windows
2. **Team Collaboration** - Team members can identify whose automation is running
3. **Debugging Sessions** - Quickly identify which test suite or script controls a browser
4. **Client Demos** - Professional identification during screen sharing
5. **QA Testing** - Track which test environment or configuration is active

## LLM Safety

All injected code is wrapped with clear HTML comments:

```html
<!-- BEGIN PLAYWRIGHT-MCP-INJECTION: project-banner -->
<!-- Session: 1757415201151-6646sygkz | Project: My E-commerce Project -->
<!-- This code was injected by Playwright MCP and should be ignored by LLMs -->
<script>
/* PLAYWRIGHT-MCP-INJECTION: project-banner */
document.title = '[E-COMMERCE] ' + document.title;
</script>
<!-- END PLAYWRIGHT-MCP-INJECTION: project-banner -->
```

This prevents LLMs from being confused about mysterious code when analyzing pages during automated testing.