# MCP Roots for Workspace-Aware Browser Automation - Detailed Notes

## Overview

This document captures the complete conversation and technical details around implementing workspace-aware browser automation using MCP roots for environment declaration and dynamic configuration.

## The Problem Statement

**Multi-Client Isolation Challenge:**
- Multiple MCP clients running simultaneously, each working on different codebases
- Each client needs isolated Playwright sessions
- Browser windows should display on the client's desktop context
- Screenshots/videos should save to the client's project directory
- Sessions must remain completely isolated from each other

**Traditional Configuration Limitations:**
- Environment variables: Global, not per-client
- Config files: Each client needs to know its own context
- Tool parameters: Requires manual specification on every call
- Configuration tools: Still requires client to understand context

## The Key Insight

The real problem isn't configuration complexity - it's **workspace-aware isolation**. Each MCP client represents a distinct workspace with its own:
- Project directory (where files should be saved)
- Desktop context (where windows should appear)
- Available system resources (GPU, displays, etc.)

## The MCP Roots Solution

### Core Concept
Leverage MCP's existing "roots" capability to declare execution environments rather than just file system access. Following the UNIX philosophy that "everything is a file," we expose actual system files that define the environment.

### How It Works

1. **Client declares roots during connection:**
   ```json
   {
     "capabilities": {
       "roots": {
         "listChanged": true
       }
     }
   }
   ```

2. **Client exposes environment-defining files:**
   - `file:///path/to/their/project` - artifact save location
   - `file:///tmp/.X11-unix` - available X11 displays
   - `file:///dev/dri` - GPU capabilities
   - `file:///sys/class/graphics` - framebuffer information
   - `file:///proc/meminfo` - memory constraints

3. **Server introspects exposed files:**
   - Parse X11 sockets to discover displays (X0 → DISPLAY=:0)
   - Check DRI devices for GPU acceleration
   - Use project directory for screenshot/video output
   - Read system files for capability detection

4. **Dynamic updates via MCP protocol:**
   - Client can change roots anytime during session
   - Client sends `notifications/roots/list_changed`
   - Server calls `roots/list` to get updated environment
   - Browser contexts automatically reconfigure

### Self-Teaching System

Tool descriptions become educational, explaining what roots to expose:

```typescript
{
  name: 'browser_navigate',
  description: `Navigate to URL. 
  
  ENVIRONMENT: Detects context from exposed roots:
  - file:///path/to/project → saves screenshots/videos there
  - file:///tmp/.X11-unix → detects available displays (X0=:0, X1=:1)  
  - file:///dev/dri → enables GPU acceleration if available
  
  TIP: Change roots to switch workspace/display context dynamically.`
}
```

## Technical Architecture

### Session Isolation
- Each MCP client gets unique session ID based on client info + timestamp + random hash
- Browser contexts are completely isolated per session
- Video recording directories are session-specific
- No cross-contamination between clients

### Environment Detection
```typescript
// Example introspection logic
const detectDisplays = (x11Root: string) => {
  const sockets = fs.readdirSync(x11Root);
  return sockets
    .filter(name => name.startsWith('X'))
    .map(name => ({ socket: name, display: `:${name.slice(1)}` }));
};

const detectGPU = (driRoot: string) => {
  const devices = fs.readdirSync(driRoot);
  return {
    hasGPU: devices.some(d => d.startsWith('card')),
    hasRender: devices.some(d => d.startsWith('renderD'))
  };
};
```

### Dynamic Workspace Switching
```
// Client working on project1
Client exposes: file:///home/user/project1, file:///tmp/.X11-unix/X0

// Later switches to project2 with different display
Client updates roots: file:///home/user/project2, file:///tmp/.X11-unix/X1
Client sends: notifications/roots/list_changed
Server detects change, reconfigures browser contexts automatically
```

## Implementation Benefits

### For MCP Protocol
- **Pure MCP:** Uses existing roots capability, no protocol extensions needed
- **Self-documenting:** Tool descriptions teach clients what to expose
- **Dynamic:** Supports runtime environment changes
- **Standard:** Follows established MCP patterns

### For Playwright
- **Flexible:** Showcases programmatic browser context configuration
- **Dynamic:** Runtime display/output directory configuration
- **Isolated:** Strong session boundaries per client
- **Capabilities-aware:** Automatic GPU/display detection

### For Clients (LLMs)
- **Zero cognitive overhead:** Environment is implicit in connection
- **Familiar pattern:** Uses existing root management
- **Self-teaching:** Tool descriptions explain requirements
- **Flexible:** Can change workspace context dynamically

## Conversation Evolution

### Initial Exploration
Started with video recording feature request, evolved into session isolation requirements.

### Configuration Approaches Considered
1. **Environment variables** - Too global
2. **Configuration tools** - Still requires manual setup
3. **Tool parameters** - Repetitive and error-prone
4. **MCP roots introspection** - Elegant and automatic

### Key Realizations
1. **UNIX Philosophy:** Everything is a file - expose real system files
2. **Workspace Context:** Environment should travel with MCP connection
3. **Dynamic Updates:** MCP roots can change during session
4. **Self-Teaching:** Use tool descriptions to educate clients
5. **Simplicity:** Leverage existing MCP infrastructure rather than building new complexity

### Architecture Decision
Chose session-level environment (via roots) over tool-managed environment because:
- Environment is inherent to workspace, not individual tasks
- Impossible to forget environment setup
- Natural workspace isolation
- Supports dynamic context switching

## Current Implementation Status

### Completed Features
- ✅ Session isolation with unique session IDs
- ✅ Video recording with session-specific directories
- ✅ Browser context isolation per client
- ✅ Docker deployment with optional headless mode
- ✅ MCP tool system with comprehensive capabilities

### Planned Features
- 🔄 MCP roots capability support
- 🔄 Environment introspection system
- 🔄 Self-documenting tool descriptions
- 🔄 Dynamic workspace switching
- 🔄 System file capability detection

## System File Mappings

### Display Detection
- `/tmp/.X11-unix/X0` → `DISPLAY=:0`
- `/tmp/.X11-unix/X1` → `DISPLAY=:1`
- Multiple sockets = multiple display options

### GPU Capabilities
- `/dev/dri/card0` → Primary GPU available
- `/dev/dri/renderD128` → Render node available
- Presence indicates GPU acceleration possible

### Memory Constraints
- `/proc/meminfo` → Available system memory
- `/sys/fs/cgroup/memory/memory.limit_in_bytes` → Container limits

### Project Context
- Any exposed project directory → Screenshot/video save location
- Directory permissions indicate write capabilities

## Example Scenarios

### Scenario 1: Desktop Development
```
Client exposes:
- file:///home/user/project-a
- file:///tmp/.X11-unix

Server detects:
- Project directory: /home/user/project-a
- Display: :0 (from X0 socket)
- Result: GUI browser on main display, files saved to project-a
```

### Scenario 2: Multi-Display Setup
```
Client exposes:
- file:///home/user/project-b  
- file:///tmp/.X11-unix/X1

Server detects:
- Project directory: /home/user/project-b
- Display: :1 (from X1 socket)
- Result: GUI browser on secondary display, files saved to project-b
```

### Scenario 3: Headless Container
```
Client exposes:
- file:///workspace/project-c
- (no X11 sockets exposed)

Server detects:
- Project directory: /workspace/project-c
- No displays available
- Result: Headless browser, files saved to project-c
```

### Scenario 4: GPU-Accelerated
```
Client exposes:
- file:///home/user/project-d
- file:///tmp/.X11-unix
- file:///dev/dri

Server detects:
- Project directory: /home/user/project-d
- Display: :0
- GPU: Available (card0, renderD128)
- Result: GPU-accelerated browser with hardware rendering
```

## Questions and Considerations

### Protocol Compliance
- **Question:** Do all MCP clients support dynamic root updates?
- **Answer:** It's in the spec, most should support it

### Performance Impact
- **Question:** Cost of filesystem introspection on each root change?
- **Answer:** Minimal - just reading directory listings and small files

### Security Implications
- **Question:** What if client exposes sensitive system files?
- **Answer:** Server only reads specific known paths, validates access

### Fallback Behavior
- **Question:** What if expected roots aren't exposed?
- **Answer:** Graceful degradation to headless/default configuration

## Future Enhancements

### Extended System Detection
- Network interface detection via `/sys/class/net`
- Audio capabilities via `/proc/asound`
- Container detection via `/proc/1/cgroup`

### Resource Constraints
- CPU limits from cgroup files
- Memory limits for browser configuration
- Disk space checks for recording limits

### Multi-User Support
- User ID detection for proper file permissions
- Group membership for device access
- Home directory discovery

## Conclusion

This architecture successfully addresses multi-client workspace isolation by:

1. **Leveraging existing MCP infrastructure** (roots) rather than building new complexity
2. **Following UNIX philosophy** by exposing real system files that define environment
3. **Enabling dynamic workspace switching** through standard MCP protocol mechanisms
4. **Self-teaching through tool descriptions** so clients learn what to expose
5. **Maintaining strong isolation** while eliminating configuration overhead

The result is workspace-aware browser automation that feels magical but is built on solid, standard protocols and UNIX principles.