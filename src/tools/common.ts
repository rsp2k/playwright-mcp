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
import { defineTabTool, defineTool } from './tool.js';

const close = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_close',
    title: 'Close browser',
    description: 'Close the page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    await context.closeBrowserContext();
    response.setIncludeTabs();
    response.addCode(`await page.close()`);
  },
});

const resize = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_resize',
    title: 'Resize browser window',
    description: 'Resize the browser viewport to the specified width and height in pixels. Common sizes: 1920x1080 (Full HD), 1440x900 (laptop), 1280x720 (HD), 390x844 (mobile).',
    inputSchema: z.object({
      width: z.coerce.number().describe('Viewport width in pixels'),
      height: z.coerce.number().describe('Viewport height in pixels'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    response.addCode(`// Resize browser window to ${params.width}x${params.height}`);
    response.addCode(`await page.setViewportSize({ width: ${params.width}, height: ${params.height} });`);

    await tab.waitForCompletion(async () => {
      await tab.page.setViewportSize({ width: params.width, height: params.height });
    });
  },
});

export default [
  close,
  resize
];
