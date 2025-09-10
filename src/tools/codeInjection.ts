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

const testDebug = debug('pw:mcp:tools:injection');

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
 * Generates the debug toolbar JavaScript code
 */
export function generateDebugToolbarScript(config: DebugToolbarConfig, sessionId: string, clientVersion?: { name: string; version: string }, sessionStartTime?: number): string {
  const projectName = config.projectName || 'MCP Client';
  const clientInfo = clientVersion ? `${clientVersion.name} v${clientVersion.version}` : 'Unknown Client';
  const startTime = sessionStartTime || Date.now();

  return `
/* BEGIN PLAYWRIGHT-MCP-DEBUG-TOOLBAR */
/* This debug toolbar was injected by Playwright MCP server */
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
  
  // Create toolbar container
  const toolbar = document.createElement('div');
  toolbar.id = 'playwright-mcp-debug-toolbar';
  toolbar.className = 'playwright-mcp-debug-toolbar';
  
  // Position styles
  const positions = {
    'top-left': { top: '10px', left: '10px' },
    'top-right': { top: '10px', right: '10px' },
    'bottom-left': { bottom: '10px', left: '10px' },
    'bottom-right': { bottom: '10px', right: '10px' }
  };
  
  const pos = positions[toolbarConfig.position] || positions['top-right'];
  
  // Theme colors
  const themes = {
    light: { bg: 'rgba(255,255,255,0.95)', text: '#333', border: '#ccc' },
    dark: { bg: 'rgba(45,45,45,0.95)', text: '#fff', border: '#666' },
    transparent: { bg: 'rgba(0,0,0,0.7)', text: '#fff', border: 'rgba(255,255,255,0.3)' }
  };
  
  const theme = themes[toolbarConfig.theme] || themes.dark;
  
  // Base styles
  toolbar.style.cssText = \`
    position: fixed;
    \${Object.entries(pos).map(([k,v]) => k + ':' + v).join(';')};
    background: \${theme.bg};
    color: \${theme.text};
    border: 1px solid \${theme.border};
    border-radius: 6px;
    padding: 8px 12px;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.4;
    z-index: 999999;
    opacity: \${toolbarConfig.opacity};
    cursor: move;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    min-width: 150px;
    max-width: 300px;
  \`;
  
  // Create content
  function updateToolbarContent() {
    const uptime = Math.floor((Date.now() - sessionInfo.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeStr = hours > 0 ? 
      \`\${hours}h \${minutes}m \${seconds}s\` : 
      minutes > 0 ? \`\${minutes}m \${seconds}s\` : \`\${seconds}s\`;
    
    if (toolbarConfig.minimized) {
      toolbar.innerHTML = \`
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: bold; color: #4CAF50;">●</span>
          <span style="margin: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            \${sessionInfo.project}
          </span>
          <span style="cursor: pointer; opacity: 0.7; hover: opacity: 1;" onclick="this.parentNode.parentNode.playwrightToggle()">⊞</span>
        </div>
      \`;
    } else {
      toolbar.innerHTML = \`
        <div style="margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center;">
            <span style="color: #4CAF50; margin-right: 6px;">●</span>
            <strong>\${sessionInfo.project}</strong>
          </div>
          <span style="cursor: pointer; opacity: 0.7; hover: opacity: 1;" onclick="this.parentNode.parentNode.playwrightToggle()">⊟</span>
        </div>
        \${toolbarConfig.showDetails ? \`
          <div style="font-size: 10px; opacity: 0.8; line-height: 1.2;">
            <div>Session: \${sessionInfo.id.substring(0, 12)}...</div>
            <div>Client: \${sessionInfo.client}</div>
            <div>Uptime: \${uptimeStr}</div>
            <div>URL: \${window.location.hostname}</div>
          </div>
        \` : ''}
      \`;
    }
  }
  
  // Toggle function
  toolbar.playwrightToggle = function() {
    toolbarConfig.minimized = !toolbarConfig.minimized;
    updateToolbarContent();
  };
  
  // Dragging functionality
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  toolbar.addEventListener('mousedown', function(e) {
    isDragging = true;
    dragOffset.x = e.clientX - toolbar.offsetLeft;
    dragOffset.y = e.clientY - toolbar.offsetTop;
    toolbar.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (isDragging) {
      toolbar.style.left = (e.clientX - dragOffset.x) + 'px';
      toolbar.style.top = (e.clientY - dragOffset.y) + 'px';
      // Remove position properties when dragging
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
    }
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      toolbar.style.cursor = 'move';
    }
  });
  
  // Update content initially and every second
  updateToolbarContent();
  setInterval(updateToolbarContent, 1000);
  
  // Add to page
  document.body.appendChild(toolbar);
  
  console.log(\`[Playwright MCP] Debug toolbar injected - Project: \${sessionInfo.project}, Session: \${sessionInfo.id}\`);
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
  projectName: z.string().optional().describe('Name of your project/client to display in the toolbar'),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().describe('Position of the toolbar on screen'),
  theme: z.enum(['light', 'dark', 'transparent']).optional().describe('Visual theme for the toolbar'),
  minimized: z.boolean().optional().describe('Start toolbar in minimized state'),
  showDetails: z.boolean().optional().describe('Show session details in expanded view'),
  opacity: z.number().min(0.1).max(1.0).optional().describe('Toolbar opacity')
});

const injectCustomCodeSchema = z.object({
  name: z.string().describe('Unique name for this injection'),
  type: z.enum(['javascript', 'css']).describe('Type of code to inject'),
  code: z.string().describe('The JavaScript or CSS code to inject'),
  persistent: z.boolean().optional().describe('Keep injection active across session restarts'),
  autoInject: z.boolean().optional().describe('Automatically inject on every new page')
});

const clearInjectionsSchema = z.object({
  includeToolbar: z.boolean().optional().describe('Also disable debug toolbar')
});

// Tool definitions
const enableDebugToolbar = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_enable_debug_toolbar',
    title: 'Enable Debug Toolbar',
    description: 'Enable the debug toolbar to identify which MCP client is controlling the browser',
    inputSchema: enableDebugToolbarSchema,
    type: 'destructive',
  },
  handle: async (context: Context, params: z.output<typeof enableDebugToolbarSchema>, response: Response) => {
    testDebug('Enabling debug toolbar with params:', params);

    const config: DebugToolbarConfig = {
      enabled: true,
      projectName: params.projectName || 'MCP Client',
      position: params.position || 'top-right',
      theme: params.theme || 'dark',
      minimized: params.minimized || false,
      showDetails: params.showDetails !== false,
      opacity: params.opacity || 0.9
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

    const resultMessage = `Debug toolbar enabled for project "${config.projectName}"`;
    response.addResult(resultMessage);
    response.addResult(`Session ID: ${context.sessionId}`);
    response.addResult(`Auto-injection enabled for new pages`);
  }
});

const injectCustomCode = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_inject_custom_code',
    title: 'Inject Custom Code',
    description: 'Inject custom JavaScript or CSS code into all pages in the current session',
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
  clearInjections,
];
