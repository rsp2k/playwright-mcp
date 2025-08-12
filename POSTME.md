# Workspace-Aware Browser Automation with MCP Roots

Hi Playwright and Playwright-MCP teams,

I wanted to share an architecture I've developed that might be interesting for both the core Playwright project and the MCP server implementation.

## The Use Case

I'm running multiple MCP clients, each working on different codebases. Each client needs isolated Playwright sessions where:
- Browser windows display on the client's desktop context
- Screenshots and videos save to the client's project directory  
- Sessions remain completely isolated from each other

This is common when you have AI agents working on multiple projects simultaneously.

## The MCP Roots Approach

Instead of traditional configuration, I'm using MCP's "roots" capability to declare execution environments. Each client exposes system files that define their workspace:

- `file:///path/to/their/project` - artifact save location
- `file:///tmp/.X11-unix` - available X11 displays
- `file:///dev/dri` - GPU capabilities

The Playwright MCP server reads these exposed files to automatically configure browser contexts with the right display, output directories, and system capabilities.

## Implementation Benefits

**For Playwright:** This showcases the flexibility of programmatic browser context configuration - being able to dynamically set displays, recording paths, and isolation boundaries based on runtime environment detection.

**For Playwright-MCP:** This demonstrates how MCP's roots system can extend beyond file access to environment declaration. Tool descriptions can educate clients about what system files to expose for optimal browser automation.

## Technical Details

The server uses MCP's `notifications/roots/list_changed` to detect when clients update their workspace context. When roots change, it re-scans the exposed system files and updates browser launch configurations accordingly.

This creates truly dynamic workspace switching - clients can move between projects just by updating their exposed roots, and browser automation automatically follows their context.

## Why This Matters

This architecture eliminates the configuration burden while maintaining strong isolation. The workspace context is inherent to the MCP connection rather than requiring manual setup calls.

It also follows UNIX principles nicely - reading actual system files (X11 sockets, DRI devices) gives real information about available capabilities rather than abstract configuration.

## Current Status

I have this working with session isolation, video recording, and multi-display support. Each client gets their own isolated browser environment that automatically adapts to their declared workspace.

Would love to contribute this back or discuss how it might fit into the official Playwright-MCP implementation.

---

Thanks for the great tools that made this architecture possible!