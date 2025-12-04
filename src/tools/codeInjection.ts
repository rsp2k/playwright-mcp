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
/**
 * Code Injection Tools for MCP Client Identification and Custom Scripts
 *
 * Provides tools for injecting debug toolbars and custom code into browser pages.
 * Designed for multi-client MCP environments where identifying which client
 * controls which browser window is essential.
 */

import debug from 'debug';
import { z } from 'zod';
import { defineTool } from './tool.js';
import type { Context } from '../context.js';
import type { Response } from '../response.js';
import { generateVoiceCollaborationAPI } from '../collaboration/voiceAPI.js';

const testDebug = debug('pw:mcp:tools:injection');

// Direct voice API injection that bypasses wrapper issues
export async function injectVoiceAPIDirectly(context: Context, voiceScript: string): Promise<void> {
  const currentTab = context.currentTab();
  if (!currentTab) return;
  
  // Custom injection that preserves variable scoping and avoids template literal issues
  const wrappedVoiceScript = `
(function() {
  'use strict';
  
  // Prevent double injection
  if (window.mcpVoiceLoaded) {
    console.log('[MCP] Voice API already loaded, skipping');
    return;
  }
  
  try {
    ${voiceScript}
  } catch (error) {
    console.error('[MCP] Voice API injection failed:', error);
    // Provide minimal fallback functions
    window.mcpNotify = {
      info: (msg) => console.log('[MCP Info]', msg || ''),
      success: (msg) => console.log('[MCP Success]', msg || ''),
      warning: (msg) => console.warn('[MCP Warning]', msg || ''),
      error: (msg) => console.error('[MCP Error]', msg || ''),
      speak: () => {}
    };
    window.mcpPrompt = () => Promise.resolve('');
    window.mcpInspector = { active: 0, start: () => {}, stop: () => {} };
  }
})();
`;

  await currentTab.page.addInitScript(wrappedVoiceScript);
}

export interface CustomInjection {
  id: string;
  name: string;
  type: 'javascript' | 'css';
  code: string;
  enabled: boolean;
  persistent: boolean; // survives session restart
  autoInject: boolean; // inject on every new page
}

export interface DebugToolbarConfig {
  enabled: boolean;
  projectName?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  theme: 'light' | 'dark' | 'transparent';
  minimized: boolean;
  showDetails: boolean;
  opacity: number; // 0.1 to 1.0
}

export interface InjectionConfig {
  debugToolbar: DebugToolbarConfig;
  customInjections: CustomInjection[];
  enabled: boolean;
}

/**
 * Generates the debug toolbar JavaScript code with modern floating pill design
 */
export function generateDebugToolbarScript(config: DebugToolbarConfig, sessionId: string, clientVersion?: { name: string; version: string }, sessionStartTime?: number): string {
  const projectName = config.projectName || 'Claude Code MCP';
  const clientInfo = clientVersion ? `${clientVersion.name} v${clientVersion.version}` : 'Claude Code';
  const startTime = sessionStartTime || Date.now();

  return `
/* BEGIN PLAYWRIGHT-MCP-DEBUG-TOOLBAR */
/* Modern floating pill debug toolbar injected by Playwright MCP server */
/* Project: ${projectName} | Session: ${sessionId} */
/* Client: ${clientInfo} */
/* This code should be ignored by LLMs analyzing the page */
(function() {
  'use strict';
  
  // Avoid duplicate toolbars
  if (window.playwrightMcpDebugToolbar) {
    console.log('Playwright MCP Debug Toolbar already exists, skipping injection');
    return;
  }
  
  window.playwrightMcpDebugToolbar = true;
  
  // Toolbar configuration
  const toolbarConfig = ${JSON.stringify(config)};
  const sessionInfo = {
    id: '${sessionId}',
    project: '${projectName}',
    client: '${clientInfo}',
    startTime: ${startTime}
  };
  
  // CSS Variables for theme system
  const cssVariables = \`
    :root {
      --mcp-primary: #2563eb;
      --mcp-primary-hover: #1d4ed8;
      --mcp-success: #10b981;
      --mcp-surface-light: #ffffff;
      --mcp-surface-dark: #1f2937;
      --mcp-text-light: #374151;
      --mcp-text-dark: #f9fafb;
      --mcp-border-light: #e5e7eb;
      --mcp-border-dark: #4b5563;
      --mcp-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      --mcp-shadow-lg: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
  \`;
  
  // Inject CSS variables
  const styleElement = document.createElement('style');
  styleElement.textContent = cssVariables;
  document.head.appendChild(styleElement);
  
  // Create floating pill container
  const toolbar = document.createElement('div');
  toolbar.id = 'playwright-mcp-debug-toolbar';
  toolbar.className = 'playwright-mcp-debug-toolbar';
  
  // Position calculations
  const positions = {
    'top-left': { top: '16px', left: '16px', right: 'auto', bottom: 'auto' },
    'top-right': { top: '16px', right: '16px', left: 'auto', bottom: 'auto' },
    'bottom-left': { bottom: '16px', left: '16px', right: 'auto', top: 'auto' },
    'bottom-right': { bottom: '16px', right: '16px', left: 'auto', top: 'auto' }
  };
  
  const pos = positions[toolbarConfig.position] || positions['top-right'];
  
  // Theme-based styling
  const getThemeStyles = (theme, minimized) => {
    const themes = {
      light: {
        background: 'var(--mcp-surface-light)',
        color: 'var(--mcp-text-light)',
        border: '1px solid var(--mcp-border-light)',
        shadow: 'var(--mcp-shadow)'
      },
      dark: {
        background: 'var(--mcp-surface-dark)',
        color: 'var(--mcp-text-dark)',
        border: '1px solid var(--mcp-border-dark)',
        shadow: 'var(--mcp-shadow)'
      },
      transparent: {
        background: 'rgba(15, 23, 42, 0.95)',
        color: '#f1f5f9',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        shadow: 'var(--mcp-shadow-lg)'
      }
    };
    
    const themeData = themes[theme] || themes.dark;
    
    return \`
      position: fixed;
      \${Object.entries(pos).map(([k,v]) => \`\${k}: \${v}\`).join('; ')};
      background: \${themeData.background};
      color: \${themeData.color};
      border: \${themeData.border};
      border-radius: \${minimized ? '24px' : '12px'};
      padding: \${minimized ? '8px 12px' : '12px 16px'};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: \${minimized ? '12px' : '13px'};
      font-weight: 500;
      line-height: 1.4;
      z-index: 2147483647;
      opacity: \${toolbarConfig.opacity || 0.95};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: \${themeData.shadow};
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      cursor: grab;
      max-width: \${minimized ? '200px' : '320px'};
      min-width: \${minimized ? 'auto' : '240px'};
    \`;
  };
  
  // Hover enhancement styles
  const addHoverStyles = () => {
    const hoverStyleElement = document.createElement('style');
    hoverStyleElement.id = 'mcp-toolbar-hover-styles';
    hoverStyleElement.textContent = \`
      #playwright-mcp-debug-toolbar:hover {
        transform: translateY(-1px);
        box-shadow: var(--mcp-shadow-lg);
        opacity: 1 !important;
      }
      
      #playwright-mcp-debug-toolbar:active {
        cursor: grabbing;
        transform: translateY(0px);
      }
      
      .mcp-toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 12px;
        color: inherit;
        opacity: 0.7;
      }
      
      .mcp-toolbar-btn:hover {
        opacity: 1;
        background: rgba(99, 102, 241, 0.1);
        transform: scale(1.05);
      }
      
      .mcp-status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--mcp-success);
        display: inline-block;
        margin-right: 8px;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
        50% { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1); }
      }
      
      .mcp-session-details {
        font-size: 11px;
        opacity: 0.8;
        line-height: 1.3;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(148, 163, 184, 0.2);
      }
      
      .mcp-session-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3px;
      }
      
      .mcp-session-label {
        opacity: 0.7;
        font-weight: 400;
      }
      
      .mcp-session-value {
        font-weight: 500;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      }
      
      @media (max-width: 768px) {
        #playwright-mcp-debug-toolbar {
          font-size: 11px;
          min-width: 200px;
          max-width: 280px;
        }
        
        .mcp-session-details {
          font-size: 10px;
        }
      }
    \`;
    document.head.appendChild(hoverStyleElement);
  };
  
  // Add hover styles
  addHoverStyles();
  
  // Content generation functions
  function formatUptime(startTime) {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    if (hours > 0) return \`\${hours}h \${minutes}m\`;
    if (minutes > 0) return \`\${minutes}m \${seconds}s\`;
    return \`\${seconds}s\`;
  }
  
  function generateMinimizedContent() {
    return \`
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
          <span class="mcp-status-indicator"></span>
          <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            \${sessionInfo.project}
          </span>
        </div>
        <button class="mcp-toolbar-btn" onclick="this.closest('#playwright-mcp-debug-toolbar').playwrightToggle()" title="Expand details">
          ⊞
        </button>
      </div>
    \`;
  }
  
  function generateExpandedContent() {
    const uptimeStr = formatUptime(sessionInfo.startTime);
    const shortSessionId = sessionInfo.id.substring(0, 8);
    const hostname = window.location.hostname || 'local';
    
    return \`
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: \${toolbarConfig.showDetails ? '0px' : '0px'};">
        <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
          <span class="mcp-status-indicator"></span>
          <span style="font-weight: 600; font-size: 14px;">
            \${sessionInfo.project}
          </span>
        </div>
        <button class="mcp-toolbar-btn" onclick="this.closest('#playwright-mcp-debug-toolbar').playwrightToggle()" title="Minimize">
          ⊟
        </button>
      </div>
      \${toolbarConfig.showDetails ? \`
        <div class="mcp-session-details">
          <div class="mcp-session-row">
            <span class="mcp-session-label">Session:</span>
            <span class="mcp-session-value">\${shortSessionId}</span>
          </div>
          <div class="mcp-session-row">
            <span class="mcp-session-label">Client:</span>
            <span class="mcp-session-value">\${sessionInfo.client}</span>
          </div>
          <div class="mcp-session-row">
            <span class="mcp-session-label">Uptime:</span>
            <span class="mcp-session-value">\${uptimeStr}</span>
          </div>
          <div class="mcp-session-row">
            <span class="mcp-session-label">Host:</span>
            <span class="mcp-session-value">\${hostname}</span>
          </div>
        </div>
      \` : ''}
    \`;
  }
  
  // Update toolbar content and styling
  function updateToolbarContent() {
    const isMinimized = toolbarConfig.minimized;
    toolbar.style.cssText = getThemeStyles(toolbarConfig.theme, isMinimized);
    
    if (isMinimized) {
      toolbar.innerHTML = generateMinimizedContent();
    } else {
      toolbar.innerHTML = generateExpandedContent();
    }
  }
  
  // Toggle function
  toolbar.playwrightToggle = function() {
    toolbarConfig.minimized = !toolbarConfig.minimized;
    updateToolbarContent();
  };
  
  // Enhanced dragging functionality
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let dragStartTime = 0;
  
  toolbar.addEventListener('mousedown', function(e) {
    // Don't drag if clicking on button
    if (e.target.classList.contains('mcp-toolbar-btn')) return;
    
    isDragging = true;
    dragStartTime = Date.now();
    dragOffset.x = e.clientX - toolbar.getBoundingClientRect().left;
    dragOffset.y = e.clientY - toolbar.getBoundingClientRect().top;
    toolbar.style.cursor = 'grabbing';
    toolbar.style.transform = 'translateY(0px)';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (isDragging) {
      const newLeft = e.clientX - dragOffset.x;
      const newTop = e.clientY - dragOffset.y;
      
      // Constrain to viewport
      const maxLeft = window.innerWidth - toolbar.offsetWidth - 16;
      const maxTop = window.innerHeight - toolbar.offsetHeight - 16;
      
      toolbar.style.left = Math.max(16, Math.min(maxLeft, newLeft)) + 'px';
      toolbar.style.top = Math.max(16, Math.min(maxTop, newTop)) + 'px';
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
    }
  });
  
  document.addEventListener('mouseup', function(e) {
    if (isDragging) {
      isDragging = false;
      toolbar.style.cursor = 'grab';
      
      // If it was a quick click (not a drag), treat as toggle
      const dragDuration = Date.now() - dragStartTime;
      const wasQuickClick = dragDuration < 200;
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - (toolbar.getBoundingClientRect().left + dragOffset.x), 2) +
        Math.pow(e.clientY - (toolbar.getBoundingClientRect().top + dragOffset.y), 2)
      );
      
      if (wasQuickClick && dragDistance < 5) {
        toolbar.playwrightToggle();
      }
    }
  });
  
  // Keyboard accessibility
  toolbar.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toolbar.playwrightToggle();
    }
  });
  
  // Make focusable for accessibility
  toolbar.setAttribute('tabindex', '0');
  toolbar.setAttribute('role', 'application');
  toolbar.setAttribute('aria-label', \`MCP Debug Toolbar for \${sessionInfo.project}\`);
  
  // Update content initially and every 30 seconds (reduced frequency)
  updateToolbarContent();
  const updateInterval = setInterval(updateToolbarContent, 30000);
  
  // Cleanup function
  toolbar.playwrightCleanup = function() {
    clearInterval(updateInterval);
    const hoverStyles = document.getElementById('mcp-toolbar-hover-styles');
    if (hoverStyles) hoverStyles.remove();
    toolbar.remove();
  };
  
  // Add to page
  document.body.appendChild(toolbar);
  
  console.log(\`[Playwright MCP] Modern debug toolbar injected - Project: \${sessionInfo.project}, Session: \${sessionInfo.id}\`);
})();
/* END PLAYWRIGHT-MCP-DEBUG-TOOLBAR */
`;
}

/**
 * Wraps custom code with LLM-safe markers
 */
export function wrapInjectedCode(injection: CustomInjection, sessionId: string, projectName?: string): string {
  const projectInfo = projectName ? ` | Project: ${projectName}` : '';
  const header = `<!-- BEGIN PLAYWRIGHT-MCP-INJECTION: ${injection.name} -->
<!-- Session: ${sessionId}${projectInfo} -->
<!-- This code was injected by Playwright MCP and should be ignored by LLMs -->`;
  const footer = `<!-- END PLAYWRIGHT-MCP-INJECTION: ${injection.name} -->`;

  if (injection.type === 'javascript') {
    return `${header}
<script>
/* PLAYWRIGHT-MCP-INJECTION: ${injection.name} */
${injection.code}
</script>
${footer}`;
  } else if (injection.type === 'css') {
    return `${header}
<style>
/* PLAYWRIGHT-MCP-INJECTION: ${injection.name} */
${injection.code}
</style>
${footer}`;
  }

  return `${header}
${injection.code}
${footer}`;
}

/**
 * Generates JavaScript to inject code into the page
 */
export function generateInjectionScript(wrappedCode: string): string {
  return `
(function() {
  try {
    const injectionContainer = document.createElement('div');
    injectionContainer.innerHTML = \`${wrappedCode.replace(/`/g, '\\`')}\`;
    
    // Extract and execute scripts
    const scripts = injectionContainer.querySelectorAll('script');
    scripts.forEach(script => {
      const newScript = document.createElement('script');
      if (script.src) {
        newScript.src = script.src;
      } else {
        newScript.textContent = script.textContent;
      }
      document.head.appendChild(newScript);
    });
    
    // Extract and add styles
    const styles = injectionContainer.querySelectorAll('style');
    styles.forEach(style => {
      document.head.appendChild(style.cloneNode(true));
    });
    
    // Add any remaining content to body
    const remaining = injectionContainer.children;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].tagName !== 'SCRIPT' && remaining[i].tagName !== 'STYLE') {
        document.body.appendChild(remaining[i].cloneNode(true));
      }
    }
  } catch (error) {
    console.error('[Playwright MCP] Injection error:', error);
  }
})();
`;
}

// Tool schemas
const enableDebugToolbarSchema = z.object({
  projectName: z.string().optional().describe('Name of your project/client to display in the floating pill toolbar'),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().describe('Position of the floating pill on screen (default: top-right)'),
  theme: z.enum(['light', 'dark', 'transparent']).optional().describe('Visual theme: light (white), dark (gray), transparent (glass effect)'),
  minimized: z.boolean().optional().describe('Start in compact pill mode (default: false)'),
  showDetails: z.boolean().optional().describe('Show session details when expanded (default: true)'),
  opacity: z.number().min(0.1).max(1.0).optional().describe('Toolbar opacity 0.1-1.0 (default: 0.95)')
});

const injectCustomCodeSchema = z.object({
  name: z.string().describe('Unique name for this injection'),
  type: z.enum(['javascript', 'css']).describe('Type of code to inject'),
  code: z.string().describe('The JavaScript or CSS code to inject'),
  persistent: z.boolean().optional().describe('Keep injection active across session restarts'),
  autoInject: z.boolean().optional().describe('Automatically inject on every new page')
});

const enableVoiceCollaborationSchema = z.object({
  enabled: z.boolean().optional().describe('Enable voice collaboration features (default: true)'),
  autoInitialize: z.boolean().optional().describe('Automatically initialize voice on page load (default: true)'),
  voiceOptions: z.object({
    rate: z.number().min(0.1).max(10).optional().describe('Speech rate (0.1-10, default: 1.0)'),
    pitch: z.number().min(0).max(2).optional().describe('Speech pitch (0-2, default: 1.0)'),
    volume: z.number().min(0).max(1).optional().describe('Speech volume (0-1, default: 1.0)'),
    lang: z.string().optional().describe('Language code (default: en-US)')
  }).optional().describe('Voice synthesis options'),
  listenOptions: z.object({
    timeout: z.number().min(1000).max(60000).optional().describe('Voice input timeout in milliseconds (default: 10000)'),
    lang: z.string().optional().describe('Speech recognition language (default: en-US)'),
    continuous: z.boolean().optional().describe('Keep listening after first result (default: false)')
  }).optional().describe('Voice recognition options')
});

const clearInjectionsSchema = z.object({
  includeToolbar: z.boolean().optional().describe('Also disable debug toolbar')
});

// Tool definitions
const enableDebugToolbar = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_enable_debug_toolbar',
    title: 'Enable Modern Debug Toolbar',
    description: 'Enable a modern floating pill toolbar with excellent contrast and professional design to identify which MCP client controls the browser',
    inputSchema: enableDebugToolbarSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof enableDebugToolbarSchema>, response: Response) => {
    testDebug('Enabling debug toolbar with params:', params);

    const config: DebugToolbarConfig = {
      enabled: true,
      projectName: params.projectName || 'Claude Code MCP',
      position: params.position || 'top-right',
      theme: params.theme || 'dark',
      minimized: params.minimized || false,
      showDetails: params.showDetails !== false,
      opacity: params.opacity || 0.95
    };

    // Store config in context
    if (!context.injectionConfig) {
      context.injectionConfig = {
        debugToolbar: config,
        customInjections: [],
        enabled: true
      };
    } else {
      context.injectionConfig.debugToolbar = config;
      context.injectionConfig.enabled = true;
    }

    // Generate toolbar script
    const toolbarScript = generateDebugToolbarScript(config, context.sessionId, context.clientVersion, (context as any)._sessionStartTime);

    // Inject into current page if available
    const currentTab = context.currentTab();
    if (currentTab) {
      try {
        await currentTab.page.addInitScript(toolbarScript);
        await currentTab.page.evaluate(toolbarScript);
        testDebug('Debug toolbar injected into current page');
      } catch (error) {
        testDebug('Error injecting toolbar into current page:', error);
      }
    }

    const resultMessage = `Modern floating pill toolbar enabled for project "${config.projectName}"`;
    response.addResult(resultMessage);
    response.addResult(`Theme: ${config.theme} | Position: ${config.position} | Opacity: ${config.opacity}`);
    response.addResult(`Session ID: ${context.sessionId}`);
    response.addResult(`Features: Draggable, expandable, high-contrast design with accessibility support`);
  }
});

const injectCustomCode = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_inject_custom_code',
    title: 'Inject Custom Code',
    description: `Inject custom JavaScript or CSS code into all pages in the current session

🤖 COLLABORATION API AVAILABLE:
Models can inject JavaScript that communicates directly with users:
• mcpNotify.info('message') - Send info to user
• mcpNotify.success('completed!') - Show success  
• mcpNotify.warning('be careful') - Display warnings
• mcpNotify.error('something failed') - Show errors
• await mcpPrompt('Shall I proceed?') - Get user confirmation
• mcpInspector.start('Click the login button', callback) - Interactive element selection

When elements are ambiguous or actions need confirmation, use these functions 
to collaborate with the user for better automation results.

Full API: See MODEL-COLLABORATION-API.md`,
    inputSchema: injectCustomCodeSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof injectCustomCodeSchema>, response: Response) => {
    testDebug('Injecting custom code:', { name: params.name, type: params.type });

    if (!context.injectionConfig) {
      context.injectionConfig = {
        debugToolbar: { enabled: false, minimized: false, showDetails: true, position: 'top-right', theme: 'dark', opacity: 0.9 },
        customInjections: [],
        enabled: true
      };
    }

    // Create injection object
    const injection: CustomInjection = {
      id: `${params.name}_${Date.now()}`,
      name: params.name,
      type: params.type,
      code: params.code,
      enabled: true,
      persistent: params.persistent !== false,
      autoInject: params.autoInject !== false
    };

    // Remove any existing injection with the same name
    context.injectionConfig.customInjections = context.injectionConfig.customInjections.filter(
        inj => inj.name !== params.name
    );

    // Add new injection
    context.injectionConfig.customInjections.push(injection);

    // Wrap code with LLM-safe markers
    const wrappedCode = wrapInjectedCode(injection, context.sessionId, context.injectionConfig.debugToolbar.projectName);
    const injectionScript = generateInjectionScript(wrappedCode);

    // Inject into current page if available
    const currentTab = context.currentTab();
    if (currentTab && injection.autoInject) {
      try {
        await currentTab.page.addInitScript(injectionScript);
        await currentTab.page.evaluate(injectionScript);
        testDebug('Custom code injected into current page');
      } catch (error) {
        testDebug('Error injecting custom code into current page:', error);
      }
    }

    response.addResult(`Custom ${params.type} injection "${params.name}" added successfully`);
    response.addResult(`Total injections: ${context.injectionConfig.customInjections.length}`);
    response.addResult(`Auto-inject enabled: ${injection.autoInject}`);
  }
});

const listInjections = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_list_injections',
    title: 'List Injections',
    description: 'List all active code injections for the current session',
    inputSchema: z.object({}),
    type: 'readOnly',
  },
  handle: async (context: Context, params: any, response: Response) => {
    const config = context.injectionConfig;

    if (!config) {
      response.addResult('No injection configuration found');
      return;
    }

    response.addResult(`Session ID: ${context.sessionId}`);
    response.addResult(`\nDebug Toolbar:`);
    response.addResult(`- Enabled: ${config.debugToolbar.enabled}`);
    if (config.debugToolbar.enabled) {
      response.addResult(`- Project: ${config.debugToolbar.projectName}`);
      response.addResult(`- Position: ${config.debugToolbar.position}`);
      response.addResult(`- Theme: ${config.debugToolbar.theme}`);
      response.addResult(`- Minimized: ${config.debugToolbar.minimized}`);
    }

    response.addResult(`\nCustom Injections (${config.customInjections.length}):`);
    if (config.customInjections.length === 0) {
      response.addResult('- None');
    } else {
      config.customInjections.forEach(inj => {
        response.addResult(`- ${inj.name} (${inj.type}): ${inj.enabled ? 'Enabled' : 'Disabled'}`);
        response.addResult(`  Auto-inject: ${inj.autoInject}, Persistent: ${inj.persistent}`);
        response.addResult(`  Code length: ${inj.code.length} characters`);
      });
    }
  }
});

const disableDebugToolbar = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_disable_debug_toolbar',
    title: 'Disable Debug Toolbar',
    description: 'Disable the debug toolbar for the current session',
    inputSchema: z.object({}),
    type: 'destructive',
  },
  handle: async (context: Context, params: any, response: Response) => {
    if (context.injectionConfig)
      context.injectionConfig.debugToolbar.enabled = false;


    // Remove from current page if available
    const currentTab = context.currentTab();
    if (currentTab) {
      try {
        await currentTab.page.evaluate(() => {
          const toolbar = document.getElementById('playwright-mcp-debug-toolbar');
          if (toolbar)
            toolbar.remove();

          (window as any).playwrightMcpDebugToolbar = false;
        });
        testDebug('Debug toolbar removed from current page');
      } catch (error) {
        testDebug('Error removing toolbar from current page:', error);
      }
    }

    response.addResult('Debug toolbar disabled');
  }
});

const enableVoiceCollaboration = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_enable_voice_collaboration',
    title: 'Enable Voice Collaboration',
    description: `🎤 REVOLUTIONARY: Enable conversational browser automation with voice communication!

**Transform browser automation into natural conversation:**
• AI speaks to you in real-time during automation
• Respond with your voice instead of typing
• Interactive decision-making during tasks
• "Hey Claude, what should I click?" → AI guides you with voice

**Features:**
• Native browser Web Speech API (no external services)
• Automatic microphone permission handling  
• Intelligent fallbacks when voice unavailable
• Real-time collaboration during automation tasks

**Example Usage:**
AI: "I found a login form. What credentials should I use?" 🗣️
You: "Use my work email and check password manager" 🎤
AI: "Perfect! Logging you in now..." 🗣️

This is the FIRST conversational browser automation MCP server!`,
    inputSchema: enableVoiceCollaborationSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof enableVoiceCollaborationSchema>, response: Response) => {
    testDebug('Enabling voice collaboration with params:', params);

    const config = {
      enabled: params.enabled !== false,
      autoInitialize: params.autoInitialize !== false,
      voiceOptions: {
        rate: params.voiceOptions?.rate || 1.0,
        pitch: params.voiceOptions?.pitch || 1.0,
        volume: params.voiceOptions?.volume || 1.0,
        lang: params.voiceOptions?.lang || 'en-US'
      },
      listenOptions: {
        timeout: params.listenOptions?.timeout || 10000,
        lang: params.listenOptions?.lang || 'en-US',
        continuous: params.listenOptions?.continuous || false
      }
    };

    // Generate the voice collaboration API injection
    const voiceAPIScript = generateVoiceCollaborationAPI();

    // Create injection object
    const injection: CustomInjection = {
      id: `voice_collaboration_${Date.now()}`,
      name: 'voice-collaboration',
      type: 'javascript',
      code: voiceAPIScript,
      enabled: config.enabled,
      persistent: true,
      autoInject: true
    };

    // Initialize injection config if needed
    if (!context.injectionConfig) {
      context.injectionConfig = {
        debugToolbar: { enabled: false, minimized: false, showDetails: true, position: 'top-right', theme: 'dark', opacity: 0.9 },
        customInjections: [],
        enabled: true
      };
    }

    // Remove any existing voice collaboration injection
    context.injectionConfig.customInjections = context.injectionConfig.customInjections.filter(
        inj => inj.name !== 'voice-collaboration'
    );

    // Add new voice collaboration injection
    context.injectionConfig.customInjections.push(injection);

    // Use direct injection method to avoid template literal and timing issues
    if (config.enabled) {
      try {
        await injectVoiceAPIDirectly(context, voiceAPIScript);
        testDebug('Voice collaboration API injected directly via addInitScript');
      } catch (error) {
        testDebug('Error injecting voice collaboration via direct method:', error);
        
        // Fallback: try basic addInitScript only (no evaluate)
        const currentTab = context.currentTab();
        if (currentTab) {
          try {
            await currentTab.page.addInitScript(`
(function(){
  try {
    ${voiceAPIScript}
  } catch(e) {
    console.warn('[MCP] Voice API fallback failed:', e);
    window.mcpNotify = {info:()=>{}, success:()=>{}, warning:()=>{}, error:()=>{}, speak:()=>{}};
    window.mcpPrompt = () => Promise.resolve('');
    window.mcpInspector = {active:0, start:()=>{}, stop:()=>{}};
  }
})();
            `);
            testDebug('Voice collaboration API injected via fallback method');
          } catch (fallbackError) {
            testDebug('Fallback injection also failed:', fallbackError);
          }
        }
      }
    }

    const resultMessage = `🎤 Voice collaboration enabled! 
• Speech rate: ${config.voiceOptions.rate}x, pitch: ${config.voiceOptions.pitch}
• Recognition timeout: ${config.listenOptions.timeout}ms, language: ${config.voiceOptions.lang}
• Try: mcpNotify.speak("Hello!"), mcpPrompt("Search for?", {useVoice:true})
🚀 First conversational browser automation MCP server is now active!`;
    
    response.addResult(resultMessage);
  }
});

const clearInjections = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_clear_injections',
    title: 'Clear Injections',
    description: 'Remove all custom code injections (keeps debug toolbar)',
    inputSchema: clearInjectionsSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof clearInjectionsSchema>, response: Response) => {
    if (!context.injectionConfig) {
      response.addResult('No injections to clear');
      return;
    }

    const clearedCount = context.injectionConfig.customInjections.length;
    context.injectionConfig.customInjections = [];

    if (params.includeToolbar) {
      context.injectionConfig.debugToolbar.enabled = false;

      // Remove toolbar from current page
      const currentTab = context.currentTab();
      if (currentTab) {
        try {
          await currentTab.page.evaluate(() => {
            const toolbar = document.getElementById('playwright-mcp-debug-toolbar');
            if (toolbar)
              toolbar.remove();

            (window as any).playwrightMcpDebugToolbar = false;
          });
        } catch (error) {
          testDebug('Error removing toolbar from current page:', error);
        }
      }
    }

    response.addResult(`Cleared ${clearedCount} custom injections${params.includeToolbar ? ' and disabled debug toolbar' : ''}`);
  }
});

export default [
  enableDebugToolbar,
  injectCustomCode,
  listInjections,
  disableDebugToolbar,
  enableVoiceCollaboration,
  clearInjections,
];
