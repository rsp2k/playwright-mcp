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
import * as javascript from '../javascript.js';
import { outputFile } from '../config.js';
import { generateLocator } from './utils.js';
import { ArtifactManagerRegistry } from '../artifactManager.js';

import type * as playwright from 'playwright';

// Helper function to get image dimensions from buffer
function getImageDimensions(buffer: Buffer): { width: number, height: number } {
  // PNG format check (starts with PNG signature)
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG format check (starts with FF D8)
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    // Look for SOF0 marker (Start of Frame)
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] === 0xFF) {
        const marker = buffer[offset + 1];
        if (marker >= 0xC0 && marker <= 0xC3) { // SOF markers
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        offset++;
      }
    }
  }

  // Fallback - couldn't parse dimensions
  throw new Error('Unable to determine image dimensions');
}

const screenshotSchema = z.object({
  raw: z.boolean().optional().describe('Whether to return without compression (in PNG format). Default is false, which returns a JPEG image.'),
  filename: z.string().optional().describe('File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to screenshot the element. If not provided, the screenshot will be taken of viewport. If element is provided, ref must be provided too.'),
  ref: z.string().optional().describe('Exact target element reference from the page snapshot. If not provided, the screenshot will be taken of viewport. If ref is provided, element must be provided too.'),
  fullPage: z.boolean().optional().describe('When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots. WARNING: Full page screenshots may exceed API size limits on long pages.'),
  allowLargeImages: z.boolean().optional().describe('Allow images with dimensions exceeding 8000 pixels (API limit). Default false - will error if image is too large to prevent API failures.'),
}).refine(data => {
  return !!data.element === !!data.ref;
}, {
  message: 'Both element and ref must be provided or neither.',
  path: ['ref', 'element']
}).refine(data => {
  return !(data.fullPage && (data.element || data.ref));
}, {
  message: 'fullPage cannot be used with element screenshots.',
  path: ['fullPage']
});

const screenshot = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_take_screenshot',
    title: 'Take a screenshot',
    description: `Take a screenshot of the current page. Images exceeding 8000 pixels in either dimension will be rejected unless allowLargeImages=true. You can't perform actions based on the screenshot, use browser_snapshot for actions.`,
    inputSchema: screenshotSchema,
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const fileType = params.raw ? 'png' : 'jpeg';

    // Use centralized artifact storage if configured
    let fileName: string;
    const registry = ArtifactManagerRegistry.getInstance();
    const artifactManager = tab.context.sessionId ? registry.getManager(tab.context.sessionId) : undefined;

    if (artifactManager) {
      const defaultName = params.filename ?? `page-${new Date().toISOString()}.${fileType}`;
      fileName = artifactManager.getArtifactPath(defaultName);
    } else {
      fileName = await outputFile(tab.context.config, params.filename ?? `page-${new Date().toISOString()}.${fileType}`);
    }

    const options: playwright.PageScreenshotOptions = {
      type: fileType,
      quality: fileType === 'png' ? undefined : 50,
      scale: 'css',
      path: fileName,
      ...(params.fullPage !== undefined && { fullPage: params.fullPage })
    };
    const isElementScreenshot = params.element && params.ref;

    const screenshotTarget = isElementScreenshot ? params.element : (params.fullPage ? 'full page' : 'viewport');
    response.addCode(`// Screenshot ${screenshotTarget} and save it as ${fileName}`);

    // Only get snapshot when element screenshot is needed
    const locator = params.ref ? await tab.refLocator({ element: params.element || '', ref: params.ref }) : null;

    if (locator)
      response.addCode(`await page.${await generateLocator(locator)}.screenshot(${javascript.formatObject(options)});`);
    else
      response.addCode(`await page.screenshot(${javascript.formatObject(options)});`);

    const buffer = locator ? await locator.screenshot(options) : await tab.page.screenshot(options);

    // Validate image dimensions unless allowLargeImages is true
    if (!params.allowLargeImages) {
      try {
        const { width, height } = getImageDimensions(buffer);
        const maxDimension = 8000;

        if (width > maxDimension || height > maxDimension) {
          throw new Error(
              `Screenshot dimensions (${width}x${height}) exceed maximum allowed size of ${maxDimension} pixels.\n\n` +
            `**Solutions:**\n` +
            `1. Use viewport screenshot: Remove "fullPage": true\n` +
            `2. Allow large images: Add "allowLargeImages": true\n` +
            `3. Reduce viewport size: browser_configure {"viewport": {"width": 1280, "height": 800}}\n` +
            `4. Screenshot specific element: Use "element" and "ref" parameters\n\n` +
            `**Example fixes:**\n` +
            `browser_take_screenshot {"filename": "${params.filename || 'screenshot.png'}"}  // viewport only\n` +
            `browser_take_screenshot {"fullPage": true, "allowLargeImages": true, "filename": "${params.filename || 'screenshot.png'}"}  // allow large`
          );
        }
      } catch (dimensionError) {
        // If we can't parse dimensions, continue without validation
        // This shouldn't happen with standard PNG/JPEG images
      }
    }

    let resultMessage = `Took the ${screenshotTarget} screenshot and saved it as ${fileName}`;

    if (params.allowLargeImages) {
      try {
        const { width, height } = getImageDimensions(buffer);
        resultMessage += `\n\n⚠️  **Large image warning:** Screenshot is ${width}x${height} pixels (may exceed API limits)`;
      } catch (dimensionError) {
        resultMessage += `\n\n⚠️  **Large image warning:** Size validation disabled (allowLargeImages=true)`;
      }
    }

    response.addResult(resultMessage);
    
    // Only add image to response if dimensions are safe or explicitly allowed
    let addImageToResponse = true;
    if (!params.allowLargeImages) {
      try {
        const { width, height } = getImageDimensions(buffer);
        const maxDimension = 8000;
        if (width > maxDimension || height > maxDimension) {
          addImageToResponse = false;
        }
      } catch (dimensionError) {
        // If we can't parse dimensions, continue and add the image
      }
    }
    
    if (addImageToResponse) {
      response.addImage({
        contentType: fileType === 'png' ? 'image/png' : 'image/jpeg',
        data: buffer
      });
    } else {
      response.addResult(`\n\n🚫 **Image not included in response**: Screenshot exceeds API size limits (8000px). Image saved to file only.`);
    }
  }
});

export default [
  screenshot,
];
