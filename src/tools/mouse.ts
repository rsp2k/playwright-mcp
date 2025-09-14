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
import { defineTabTool } from './tool.js';

const elementSchema = z.object({
  element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
});

const coordinateSchema = z.object({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
});

const advancedCoordinateSchema = coordinateSchema.extend({
  precision: z.enum(['pixel', 'subpixel']).optional().default('pixel').describe('Coordinate precision level'),
  delay: z.number().min(0).max(5000).optional().describe('Delay in milliseconds before action'),
});

const mouseMove = defineTabTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_move_xy',
    title: 'Move mouse',
    description: 'Move mouse to a given position with optional precision and timing control',
    inputSchema: elementSchema.extend(advancedCoordinateSchema.shape),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { x, y, precision, delay } = params;
    const coords = precision === 'subpixel' ? `${x.toFixed(2)}, ${y.toFixed(2)}` : `${Math.round(x)}, ${Math.round(y)}`;
    
    response.addCode(`// Move mouse to (${coords})${precision === 'subpixel' ? ' with subpixel precision' : ''}`);
    if (delay) response.addCode(`await page.waitForTimeout(${delay});`);
    response.addCode(`await page.mouse.move(${x}, ${y});`);

    await tab.waitForCompletion(async () => {
      if (delay) await tab.page.waitForTimeout(delay);
      await tab.page.mouse.move(x, y);
    });
  },
});

const mouseClick = defineTabTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_click_xy',
    title: 'Click',
    description: 'Click mouse button at a given position with advanced options',
    inputSchema: elementSchema.extend(advancedCoordinateSchema.shape).extend({
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('Mouse button to click'),
      clickCount: z.number().min(1).max(3).optional().default(1).describe('Number of clicks (1=single, 2=double, 3=triple)'),
      holdTime: z.number().min(0).max(2000).optional().default(0).describe('How long to hold button down in milliseconds'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    
    const { x, y, precision, delay, button, clickCount, holdTime } = params;
    const coords = precision === 'subpixel' ? `${x.toFixed(2)}, ${y.toFixed(2)}` : `${Math.round(x)}, ${Math.round(y)}`;
    const clickType = clickCount === 1 ? 'click' : clickCount === 2 ? 'double-click' : 'triple-click';
    
    response.addCode(`// ${clickType} ${button} mouse button at (${coords})${precision === 'subpixel' ? ' with subpixel precision' : ''}`);
    if (delay) response.addCode(`await page.waitForTimeout(${delay});`);
    response.addCode(`await page.mouse.move(${x}, ${y});`);
    
    if (clickCount === 1) {
      response.addCode(`await page.mouse.down({ button: '${button}' });`);
      if (holdTime > 0) response.addCode(`await page.waitForTimeout(${holdTime});`);
      response.addCode(`await page.mouse.up({ button: '${button}' });`);
    } else {
      response.addCode(`await page.mouse.click(${x}, ${y}, { button: '${button}', clickCount: ${clickCount} });`);
    }

    await tab.waitForCompletion(async () => {
      if (delay) await tab.page.waitForTimeout(delay);
      await tab.page.mouse.move(x, y);
      
      if (clickCount === 1) {
        await tab.page.mouse.down({ button });
        if (holdTime > 0) await tab.page.waitForTimeout(holdTime);
        await tab.page.mouse.up({ button });
      } else {
        await tab.page.mouse.click(x, y, { button, clickCount });
      }
    });
  },
});

const mouseDrag = defineTabTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_drag_xy',
    title: 'Drag mouse',
    description: 'Drag mouse button from start to end position with advanced drag patterns',
    inputSchema: elementSchema.extend({
      startX: z.number().describe('Start X coordinate'),
      startY: z.number().describe('Start Y coordinate'),
      endX: z.number().describe('End X coordinate'),
      endY: z.number().describe('End Y coordinate'),
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('Mouse button to drag with'),
      precision: z.enum(['pixel', 'subpixel']).optional().default('pixel').describe('Coordinate precision level'),
      pattern: z.enum(['direct', 'smooth', 'bezier']).optional().default('direct').describe('Drag movement pattern'),
      steps: z.number().min(1).max(50).optional().default(10).describe('Number of intermediate steps for smooth/bezier patterns'),
      duration: z.number().min(100).max(10000).optional().describe('Total drag duration in milliseconds'),
      delay: z.number().min(0).max(5000).optional().describe('Delay before starting drag'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const { startX, startY, endX, endY, button, precision, pattern, steps, duration, delay } = params;
    const startCoords = precision === 'subpixel' ? `${startX.toFixed(2)}, ${startY.toFixed(2)}` : `${Math.round(startX)}, ${Math.round(startY)}`;
    const endCoords = precision === 'subpixel' ? `${endX.toFixed(2)}, ${endY.toFixed(2)}` : `${Math.round(endX)}, ${Math.round(endY)}`;
    
    response.addCode(`// Drag ${button} mouse button from (${startCoords}) to (${endCoords}) using ${pattern} pattern`);
    if (delay) response.addCode(`await page.waitForTimeout(${delay});`);
    response.addCode(`await page.mouse.move(${startX}, ${startY});`);
    response.addCode(`await page.mouse.down({ button: '${button}' });`);
    
    if (pattern === 'direct') {
      response.addCode(`await page.mouse.move(${endX}, ${endY});`);
    } else {
      response.addCode(`// ${pattern} drag with ${steps} steps${duration ? `, ${duration}ms duration` : ''}`);
      for (let i = 1; i <= steps; i++) {
        let t = i / steps;
        let x, y;
        
        if (pattern === 'smooth') {
          // Smooth easing function
          t = t * t * (3.0 - 2.0 * t);
        } else if (pattern === 'bezier') {
          // Simple bezier curve with control points
          const controlX = (startX + endX) / 2;
          const controlY = Math.min(startY, endY) - Math.abs(endX - startX) * 0.2;
          t = t * t * t;
        }
        
        x = startX + (endX - startX) * t;
        y = startY + (endY - startY) * t;
        response.addCode(`await page.mouse.move(${x}, ${y});`);
        if (duration) response.addCode(`await page.waitForTimeout(${Math.floor(duration / steps)});`);
      }
    }
    
    response.addCode(`await page.mouse.up({ button: '${button}' });`);

    await tab.waitForCompletion(async () => {
      if (delay) await tab.page.waitForTimeout(delay);
      await tab.page.mouse.move(startX, startY);
      await tab.page.mouse.down({ button });
      
      if (pattern === 'direct') {
        await tab.page.mouse.move(endX, endY);
      } else {
        const stepDelay = duration ? Math.floor(duration / steps) : 50;
        for (let i = 1; i <= steps; i++) {
          let t = i / steps;
          let x, y;
          
          if (pattern === 'smooth') {
            t = t * t * (3.0 - 2.0 * t);
          } else if (pattern === 'bezier') {
            const controlX = (startX + endX) / 2;
            const controlY = Math.min(startY, endY) - Math.abs(endX - startX) * 0.2;
            const u = 1 - t;
            x = u * u * startX + 2 * u * t * controlX + t * t * endX;
            y = u * u * startY + 2 * u * t * controlY + t * t * endY;
          }
          
          if (!x || !y) {
            x = startX + (endX - startX) * t;
            y = startY + (endY - startY) * t;
          }
          
          await tab.page.mouse.move(x, y);
          if (stepDelay > 0) await tab.page.waitForTimeout(stepDelay);
        }
      }
      
      await tab.page.mouse.up({ button });
    });
  },
});

const mouseScroll = defineTabTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_scroll_xy',
    title: 'Scroll at coordinates',
    description: 'Perform scroll action at specific coordinates with precision control',
    inputSchema: elementSchema.extend(advancedCoordinateSchema.shape).extend({
      deltaX: z.number().optional().default(0).describe('Horizontal scroll amount (positive = right, negative = left)'),
      deltaY: z.number().describe('Vertical scroll amount (positive = down, negative = up)'),
      smooth: z.boolean().optional().default(false).describe('Use smooth scrolling animation'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    
    const { x, y, deltaX, deltaY, precision, delay, smooth } = params;
    const coords = precision === 'subpixel' ? `${x.toFixed(2)}, ${y.toFixed(2)}` : `${Math.round(x)}, ${Math.round(y)}`;
    
    response.addCode(`// Scroll at (${coords}): deltaX=${deltaX}, deltaY=${deltaY}${smooth ? ' (smooth)' : ''}`);
    if (delay) response.addCode(`await page.waitForTimeout(${delay});`);
    response.addCode(`await page.mouse.move(${x}, ${y});`);
    response.addCode(`await page.mouse.wheel(${deltaX}, ${deltaY});`);

    await tab.waitForCompletion(async () => {
      if (delay) await tab.page.waitForTimeout(delay);
      await tab.page.mouse.move(x, y);
      
      if (smooth && Math.abs(deltaY) > 100) {
        // Break large scrolls into smooth steps
        const steps = Math.min(10, Math.floor(Math.abs(deltaY) / 50));
        const stepX = deltaX / steps;
        const stepY = deltaY / steps;
        
        for (let i = 0; i < steps; i++) {
          await tab.page.mouse.wheel(stepX, stepY);
          await tab.page.waitForTimeout(50);
        }
      } else {
        await tab.page.mouse.wheel(deltaX, deltaY);
      }
    });
  },
});

const mouseGesture = defineTabTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_gesture_xy',
    title: 'Mouse gesture',
    description: 'Perform complex mouse gestures with multiple waypoints',
    inputSchema: elementSchema.extend({
      points: z.array(z.object({
        x: z.number().describe('X coordinate'),
        y: z.number().describe('Y coordinate'),
        delay: z.number().min(0).max(5000).optional().describe('Delay at this point in milliseconds'),
        action: z.enum(['move', 'click', 'down', 'up']).optional().default('move').describe('Action at this point'),
      })).min(2).describe('Array of points defining the gesture path'),
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('Mouse button for click actions'),
      precision: z.enum(['pixel', 'subpixel']).optional().default('pixel').describe('Coordinate precision level'),
      smoothPath: z.boolean().optional().default(false).describe('Smooth the path between points'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    
    const { points, button, precision, smoothPath } = params;
    
    response.addCode(`// Complex mouse gesture with ${points.length} points${smoothPath ? ' (smooth path)' : ''}`);
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const coords = precision === 'subpixel' ? `${point.x.toFixed(2)}, ${point.y.toFixed(2)}` : `${Math.round(point.x)}, ${Math.round(point.y)}`;
      
      if (point.action === 'move') {
        response.addCode(`// Point ${i + 1}: Move to (${coords})`);
        response.addCode(`await page.mouse.move(${point.x}, ${point.y});`);
      } else if (point.action === 'click') {
        response.addCode(`// Point ${i + 1}: Click at (${coords})`);
        response.addCode(`await page.mouse.move(${point.x}, ${point.y});`);
        response.addCode(`await page.mouse.click(${point.x}, ${point.y}, { button: '${button}' });`);
      } else if (point.action === 'down') {
        response.addCode(`// Point ${i + 1}: Mouse down at (${coords})`);
        response.addCode(`await page.mouse.move(${point.x}, ${point.y});`);
        response.addCode(`await page.mouse.down({ button: '${button}' });`);
      } else if (point.action === 'up') {
        response.addCode(`// Point ${i + 1}: Mouse up at (${coords})`);
        response.addCode(`await page.mouse.move(${point.x}, ${point.y});`);
        response.addCode(`await page.mouse.up({ button: '${button}' });`);
      }
      
      if (point.delay) {
        response.addCode(`await page.waitForTimeout(${point.delay});`);
      }
    }

    await tab.waitForCompletion(async () => {
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        
        if (smoothPath && i > 0) {
          // Smooth path between previous and current point
          const prevPoint = points[i - 1];
          const steps = 5;
          
          for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const x = prevPoint.x + (point.x - prevPoint.x) * t;
            const y = prevPoint.y + (point.y - prevPoint.y) * t;
            await tab.page.mouse.move(x, y);
            await tab.page.waitForTimeout(20);
          }
        } else {
          await tab.page.mouse.move(point.x, point.y);
        }
        
        if (point.action === 'click') {
          await tab.page.mouse.click(point.x, point.y, { button });
        } else if (point.action === 'down') {
          await tab.page.mouse.down({ button });
        } else if (point.action === 'up') {
          await tab.page.mouse.up({ button });
        }
        
        if (point.delay) {
          await tab.page.waitForTimeout(point.delay);
        }
      }
    });
  },
});

export default [
  mouseMove,
  mouseClick,
  mouseDrag,
  mouseScroll,
  mouseGesture,
];
