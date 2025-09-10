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
import { defineTool } from './tool.js';

const wait = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_wait_for',
    title: 'Wait for',
    description: 'Wait for text to appear or disappear or a specified time to pass. In smart recording mode, video recording is automatically paused during waits unless recordDuringWait is true.',
    inputSchema: z.object({
      time: z.number().optional().describe('The time to wait in seconds'),
      text: z.string().optional().describe('The text to wait for'),
      textGone: z.string().optional().describe('The text to wait for to disappear'),
      recordDuringWait: z.boolean().optional().default(false).describe('Whether to keep video recording active during the wait (default: false in smart mode, true in continuous mode)'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    if (!params.text && !params.textGone && !params.time)
      throw new Error('Either time, text or textGone must be provided');

    // Handle smart recording for waits
    const recordingInfo = context.getVideoRecordingInfo();
    const shouldPauseDuringWait = recordingInfo.enabled &&
      recordingInfo.mode !== 'continuous' &&
      !params.recordDuringWait;

    if (shouldPauseDuringWait) {
      await context.endVideoAction('wait', true); // Pause recording for wait
      response.addResult(`⏸️ Video recording paused during wait (mode: ${recordingInfo.mode})`);
    }

    const code: string[] = [];

    if (params.time) {
      code.push(`await new Promise(f => setTimeout(f, ${params.time!} * 1000));`);
      await new Promise(f => setTimeout(f, Math.min(30000, params.time! * 1000)));
    }

    const tab = context.currentTabOrDie();
    const locator = params.text ? tab.page.getByText(params.text).first() : undefined;
    const goneLocator = params.textGone ? tab.page.getByText(params.textGone).first() : undefined;

    if (goneLocator) {
      code.push(`await page.getByText(${JSON.stringify(params.textGone)}).first().waitFor({ state: 'hidden' });`);
      await goneLocator.waitFor({ state: 'hidden' });
    }

    if (locator) {
      code.push(`await page.getByText(${JSON.stringify(params.text)}).first().waitFor({ state: 'visible' });`);
      await locator.waitFor({ state: 'visible' });
    }

    // Resume recording after wait if we paused it
    if (shouldPauseDuringWait) {
      await context.beginVideoAction('post-wait'); // Resume recording after wait
      response.addResult(`▶️ Video recording resumed after wait`);
    }

    response.addResult(`Waited for ${params.text || params.textGone || params.time}`);
    if (params.recordDuringWait && recordingInfo.enabled)
      response.addResult(`🎥 Video recording continued during wait`);

    response.setIncludeSnapshot();
  },
});

export default [
  wait,
];
