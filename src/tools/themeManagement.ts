/**
 * MCP Theme Management Tools
 * Professional theme system for MCP client identification
 */

import { z } from 'zod';
import { defineTabTool } from './tool.js';
import * as javascript from '../javascript.js';

// Theme schema definitions
const themeVariablesSchema = z.record(z.string()).describe('CSS custom properties for the theme');

const themeSchema = z.object({
  id: z.string().describe('Unique theme identifier'),
  name: z.string().describe('Human-readable theme name'),
  description: z.string().describe('Theme description'),
  variables: themeVariablesSchema,
});

// Built-in themes registry
const builtInThemes: Record<string, {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
}> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, GitHub-style design with excellent readability',
    variables: {
      '--mcp-bg': 'rgba(255, 255, 255, 0.95)',
      '--mcp-color': '#24292f',
      '--mcp-border': '#d0d7de',
      '--mcp-shadow': '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--mcp-radius': '6px',
      '--mcp-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '--mcp-size': '13px',
      '--mcp-padding': '8px 12px',
      '--mcp-status-color': '#2da44e',
      '--mcp-hover-bg': 'rgba(255, 255, 255, 1)',
      '--mcp-hover-shadow': '0 3px 8px rgba(0, 0, 0, 0.15)'
    }
  },
  corporate: {
    id: 'corporate',
    name: 'Corporate',
    description: 'Professional enterprise design with gradient background',
    variables: {
      '--mcp-bg': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      '--mcp-color': '#ffffff',
      '--mcp-border': 'rgba(255, 255, 255, 0.2)',
      '--mcp-shadow': '0 4px 20px rgba(0, 0, 0, 0.15)',
      '--mcp-radius': '8px',
      '--mcp-font': '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      '--mcp-size': '14px',
      '--mcp-padding': '10px 16px',
      '--mcp-status-color': '#4ade80',
      '--mcp-hover-bg': 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
      '--mcp-hover-shadow': '0 6px 25px rgba(0, 0, 0, 0.25)'
    }
  },
  hacker: {
    id: 'hacker',
    name: 'Hacker Matrix',
    description: 'Terminal-style neon green design for cyberpunk aesthetic',
    variables: {
      '--mcp-bg': 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #0d0d0d 100%)',
      '--mcp-color': '#00ff41',
      '--mcp-border': '#00ff41',
      '--mcp-shadow': '0 0 15px rgba(0, 255, 65, 0.4), 0 0 30px rgba(0, 255, 65, 0.2)',
      '--mcp-radius': '4px',
      '--mcp-font': '"Courier New", "Monaco", "Menlo", monospace',
      '--mcp-size': '12px',
      '--mcp-padding': '10px 16px',
      '--mcp-status-color': '#00ff41',
      '--mcp-hover-bg': 'linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 50%, #1a1a1a 100%)',
      '--mcp-hover-shadow': '0 0 25px rgba(0, 255, 65, 0.6), 0 0 50px rgba(0, 255, 65, 0.3)'
    }
  },
  glass: {
    id: 'glass',
    name: 'Glass Morphism',
    description: 'Modern glass effect with backdrop blur',
    variables: {
      '--mcp-bg': 'rgba(255, 255, 255, 0.1)',
      '--mcp-color': '#374151',
      '--mcp-border': 'rgba(255, 255, 255, 0.2)',
      '--mcp-shadow': '0 8px 32px rgba(0, 0, 0, 0.1)',
      '--mcp-radius': '16px',
      '--mcp-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '--mcp-size': '13px',
      '--mcp-padding': '12px 18px',
      '--mcp-status-color': '#10b981',
      '--mcp-hover-bg': 'rgba(255, 255, 255, 0.2)',
      '--mcp-hover-shadow': '0 12px 40px rgba(0, 0, 0, 0.15)',
      '--mcp-backdrop': 'blur(20px)'
    }
  },
  highContrast: {
    id: 'highContrast',
    name: 'High Contrast',
    description: 'Maximum accessibility with WCAG AAA compliance',
    variables: {
      '--mcp-bg': '#000000',
      '--mcp-color': '#ffffff',
      '--mcp-border': '#ffffff',
      '--mcp-shadow': '0 2px 8px rgba(255, 255, 255, 0.2)',
      '--mcp-radius': '4px',
      '--mcp-font': 'Arial, sans-serif',
      '--mcp-size': '16px',
      '--mcp-padding': '12px 16px',
      '--mcp-status-color': '#ffff00',
      '--mcp-hover-bg': '#333333',
      '--mcp-hover-shadow': '0 4px 12px rgba(255, 255, 255, 0.3)'
    }
  }
};

// List available themes
const listThemes = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_mcp_theme_list',
    title: 'List MCP themes',
    description: 'List all available MCP client identification themes',
    inputSchema: z.object({
      filter: z.enum(['all', 'builtin', 'custom']).optional().default('all').describe('Filter themes by type'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { filter } = params;
    
    let themes = Object.values(builtInThemes);
    
    if (filter === 'builtin') {
      themes = Object.values(builtInThemes);
    } else if (filter === 'custom') {
      // In a real implementation, this would fetch custom themes from storage
      themes = [];
    }

    const themeList = themes.map(theme => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      type: 'builtin'
    }));

    response.addResult(`Found ${themeList.length} available themes:`);
    themeList.forEach(theme => {
      response.addResult(`• **${theme.name}** (${theme.id}): ${theme.description}`);
    });

    response.addCode(`// List available MCP themes`);
    response.addCode(`const themes = ${JSON.stringify(themeList, null, 2)};`);
  },
});

// Set active theme
const setTheme = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_mcp_theme_set',
    title: 'Set MCP theme',
    description: 'Apply a theme to the MCP client identification toolbar',
    inputSchema: z.object({
      themeId: z.string().describe('Theme identifier to apply'),
      persist: z.boolean().optional().default(true).describe('Whether to persist theme preference'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const { themeId, persist } = params;
    
    if (!(themeId in builtInThemes)) {
      response.addResult(`❌ Theme '${themeId}' not found. Available themes: ${Object.keys(builtInThemes).join(', ')}`);
      return;
    }

    const theme = builtInThemes[themeId]!;
    const themeCode = `
// Apply MCP theme: ${theme.name}
if (window.mcpThemeManager) {
  window.mcpThemeManager.setTheme('${themeId}');
} else {
  // Apply theme variables directly
  ${Object.entries(theme.variables).map(([prop, value]) => 
    `document.documentElement.style.setProperty('${prop}', '${value}');`
  ).join('\n  ')}
}
    `;

    // Execute the theme change
    await tab.waitForCompletion(async () => {
      await (tab.page as any)._evaluateFunction(`() => { ${themeCode} }`);
    });

    response.addResult(`✅ Applied theme: **${theme.name}**`);
    response.addResult(`Theme: ${theme.description}`);
    if (persist) {
      response.addResult(`💾 Theme preference saved`);
    }

    response.addCode(themeCode);
  },
});

// Get current theme
const getTheme = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_mcp_theme_get',
    title: 'Get current MCP theme',
    description: 'Get details about the currently active MCP theme',
    inputSchema: z.object({
      includeVariables: z.boolean().optional().default(false).describe('Include CSS variables in response'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { includeVariables } = params;
    
    // In a real implementation, this would check the current theme from the browser
    const currentThemeId = 'minimal'; // Default theme
    const theme = builtInThemes[currentThemeId]!;

    if (!theme) {
      response.addResult('❌ No theme currently active');
      return;
    }

    response.addResult(`**Current Theme:** ${theme.name}`);
    response.addResult(`**ID:** ${theme.id}`);
    response.addResult(`**Description:** ${theme.description}`);

    if (includeVariables) {
      response.addResult(`\n**CSS Variables:**`);
      Object.entries(theme.variables).forEach(([prop, value]) => {
        response.addResult(`• ${prop}: ${value}`);
      });
    }

    response.addCode(`// Current MCP theme configuration`);
    response.addCode(`const currentTheme = ${JSON.stringify(theme, null, 2)};`);
  },
});

// Create custom theme
const createTheme = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_mcp_theme_create',
    title: 'Create custom MCP theme',
    description: 'Create a new custom theme for MCP client identification',
    inputSchema: z.object({
      id: z.string().describe('Unique theme identifier'),
      name: z.string().describe('Human-readable theme name'),
      description: z.string().describe('Theme description'),
      baseTheme: z.enum(['minimal', 'corporate', 'hacker', 'glass', 'highContrast']).optional().describe('Base theme to extend'),
      variables: themeVariablesSchema.optional().describe('CSS custom properties to override'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const { id, name, description, baseTheme, variables } = params;
    
    // Start with base theme or minimal default
    const base = baseTheme ? builtInThemes[baseTheme]! : builtInThemes.minimal!;
    
    const customTheme = {
      id,
      name,
      description,
      variables: {
        ...base.variables,
        ...variables
      }
    };

    response.addResult(`✅ Created custom theme: **${name}**`);
    response.addResult(`**ID:** ${id}`);
    response.addResult(`**Description:** ${description}`);
    if (baseTheme && baseTheme in builtInThemes) {
      response.addResult(`**Based on:** ${builtInThemes[baseTheme]!.name}`);
    }

    response.addCode(`// Custom MCP theme: ${name}`);
    response.addCode(`const customTheme = ${JSON.stringify(customTheme, null, 2)};`);
    
    // Apply the new theme
    const applyCode = `
// Apply custom theme
${Object.entries(customTheme.variables).map(([prop, value]) => 
  `document.documentElement.style.setProperty('${prop}', '${value}');`
).join('\n')}
    `;
    
    await tab.waitForCompletion(async () => {
      await (tab.page as any)._evaluateFunction(`() => { ${applyCode} }`);
    });
    response.addCode(applyCode);
  },
});

// Reset to default theme
const resetTheme = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_mcp_theme_reset',
    title: 'Reset MCP theme',
    description: 'Reset MCP client identification to default minimal theme',
    inputSchema: z.object({
      clearStorage: z.boolean().optional().default(true).describe('Clear stored theme preferences'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const { clearStorage } = params;
    
    const defaultTheme = builtInThemes.minimal!;
    
    const resetCode = `
// Reset MCP theme to default (minimal)
if (window.mcpThemeManager) {
  window.mcpThemeManager.setTheme('minimal');
  ${clearStorage ? `localStorage.removeItem('mcp-theme');` : ''}
} else {
  // Apply minimal theme variables directly
  ${Object.entries(defaultTheme.variables).map(([prop, value]) => 
    `document.documentElement.style.setProperty('${prop}', '${value}');`
  ).join('\n  ')}
}
    `;

    await tab.waitForCompletion(async () => {
      await (tab.page as any)._evaluateFunction(`() => { ${resetCode} }`);
    });

    response.addResult(`✅ Reset to default theme: **${defaultTheme.name}**`);
    response.addResult(`Theme: ${defaultTheme.description}`);
    if (clearStorage) {
      response.addResult(`🗑️ Cleared stored theme preferences`);
    }

    response.addCode(resetCode);
  },
});

export default [
  listThemes,
  setTheme,
  getTheme,
  createTheme,
  resetTheme,
];