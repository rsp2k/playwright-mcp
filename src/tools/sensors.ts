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

/**
 * Set device orientation via CDP.
 * This overrides the values returned by the DeviceOrientationEvent API.
 */
const setDeviceOrientation = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_set_device_orientation',
    title: 'Set device orientation',
    description: `Override device orientation sensor values. Affects the DeviceOrientationEvent API.

**Parameters:**
- **alpha** (0-360): Rotation around the z-axis (compass heading). 0 = North, 90 = East
- **beta** (-180 to 180): Front-to-back tilt. Positive = tilted backward
- **gamma** (-90 to 90): Left-to-right tilt. Positive = tilted right

**Common orientations:**
- Flat on table: alpha=any, beta=0, gamma=0
- Portrait upright: alpha=any, beta=90, gamma=0
- Landscape left: alpha=any, beta=0, gamma=90
- Tilted 45° forward: alpha=any, beta=-45, gamma=0

**Note:** Requires Chromium-based browser. This overrides the DeviceOrientationEvent.`,
    inputSchema: z.object({
      alpha: z.number().min(0).max(360).describe('Compass heading (0-360 degrees). 0=North, 90=East, 180=South, 270=West'),
      beta: z.number().min(-180).max(180).describe('Front-to-back tilt (-180 to 180 degrees). Positive=tilted backward'),
      gamma: z.number().min(-90).max(90).describe('Left-to-right tilt (-90 to 90 degrees). Positive=tilted right'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const page = tab.page;
    const browserType = page.context().browser()?.browserType().name();

    if (browserType !== 'chromium')
      throw new Error(`Device orientation override requires Chromium browser. Current browser: ${browserType}`);

    const cdpSession = await page.context().newCDPSession(page);

    try {
      // Cast to any because Playwright's types don't include all CDP commands
      await (cdpSession as any).send('Emulation.setDeviceOrientationOverride', {
        alpha: params.alpha,
        beta: params.beta,
        gamma: params.gamma,
      });

      response.addResult(`✅ Device orientation set:
  • Alpha (compass): ${params.alpha}° (${getCompassDirection(params.alpha)})
  • Beta (front-back tilt): ${params.beta}°
  • Gamma (left-right tilt): ${params.gamma}°

Pages listening to DeviceOrientationEvent will now receive these values.`);
    } finally {
      await cdpSession.detach();
    }
  },
});

/**
 * Clear device orientation override.
 */
const clearDeviceOrientation = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_device_orientation',
    title: 'Clear device orientation override',
    description: 'Remove the device orientation override and return to default sensor behavior.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (tab, _params, response) => {
    const page = tab.page;
    const browserType = page.context().browser()?.browserType().name();

    if (browserType !== 'chromium')
      throw new Error(`Device orientation override requires Chromium browser. Current browser: ${browserType}`);

    const cdpSession = await page.context().newCDPSession(page);

    try {
      // Cast to any because Playwright's types don't include all CDP commands
      await (cdpSession as any).send('Emulation.clearDeviceOrientationOverride');
      response.addResult('✅ Device orientation override cleared. Sensor will return to default behavior.');
    } finally {
      await cdpSession.detach();
    }
  },
});

/**
 * Set device motion (accelerometer + gyroscope) via CDP.
 * This uses the generic sensor override API.
 */
const setDeviceMotion = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_set_device_motion',
    title: 'Set device motion sensors',
    description: `Override accelerometer and gyroscope sensor values. Affects the DeviceMotionEvent API.

**Acceleration** (m/s²): Linear acceleration excluding gravity
- x: left(-) to right(+)
- y: down(-) to up(+)
- z: backward(-) to forward(+)

**Acceleration Including Gravity** (m/s²): Total acceleration including gravity
- At rest: { x: 0, y: -9.8, z: 0 } (Earth's gravity pulling down)

**Rotation Rate** (deg/s): Angular velocity around each axis
- alpha: rotation around z-axis
- beta: rotation around x-axis
- gamma: rotation around y-axis

**Common scenarios:**
- Device at rest: acceleration={x:0,y:0,z:0}, accelerationIncludingGravity={x:0,y:-9.8,z:0}
- Shaking horizontally: acceleration={x:5,y:0,z:0}
- Free fall: accelerationIncludingGravity={x:0,y:0,z:0}

**Note:** Requires Chromium-based browser.`,
    inputSchema: z.object({
      acceleration: z.object({
        x: z.number().describe('Acceleration on x-axis (m/s²)'),
        y: z.number().describe('Acceleration on y-axis (m/s²)'),
        z: z.number().describe('Acceleration on z-axis (m/s²)'),
      }).optional().describe('Linear acceleration excluding gravity'),
      accelerationIncludingGravity: z.object({
        x: z.number().describe('Acceleration on x-axis including gravity (m/s²)'),
        y: z.number().describe('Acceleration on y-axis including gravity (m/s²)'),
        z: z.number().describe('Acceleration on z-axis including gravity (m/s²)'),
      }).optional().describe('Total acceleration including gravity'),
      rotationRate: z.object({
        alpha: z.number().describe('Rotation rate around z-axis (deg/s)'),
        beta: z.number().describe('Rotation rate around x-axis (deg/s)'),
        gamma: z.number().describe('Rotation rate around y-axis (deg/s)'),
      }).optional().describe('Angular velocity around each axis'),
      interval: z.number().optional().describe('Interval between samples in milliseconds (default: 16)'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    const page = tab.page;
    const browserType = page.context().browser()?.browserType().name();

    if (browserType !== 'chromium')
      throw new Error(`Device motion override requires Chromium browser. Current browser: ${browserType}`);

    // We need to inject a script to override the DeviceMotionEvent since CDP
    // doesn't have a direct DeviceMotion override like it does for orientation.
    // We'll create a mock that fires DeviceMotionEvent with our values.

    const acceleration = params.acceleration || { x: 0, y: 0, z: 0 };
    const accelerationIncludingGravity = params.accelerationIncludingGravity || { x: 0, y: -9.8, z: 0 };
    const rotationRate = params.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    const interval = params.interval || 16;

    await page.evaluate(({ acceleration, accelerationIncludingGravity, rotationRate, interval }) => {
      // Store cleanup function globally
      const win = window as Window & { __mcpDeviceMotionCleanup?: () => void };

      // Clean up any existing override
      if (win.__mcpDeviceMotionCleanup)
        win.__mcpDeviceMotionCleanup();

      // Create the mock DeviceMotionEvent data
      const motionData = {
        acceleration,
        accelerationIncludingGravity,
        rotationRate,
        interval,
      };

      // Override the DeviceMotionEvent by dispatching custom events
      const dispatchMotion = () => {
        const event = new DeviceMotionEvent('devicemotion', motionData);
        window.dispatchEvent(event);
      };

      // Start dispatching at the specified interval
      const intervalId = setInterval(dispatchMotion, interval);

      // Dispatch immediately
      dispatchMotion();

      // Store cleanup
      win.__mcpDeviceMotionCleanup = () => {
        clearInterval(intervalId);
        delete win.__mcpDeviceMotionCleanup;
      };
    }, { acceleration, accelerationIncludingGravity, rotationRate, interval });

    const output = ['✅ Device motion sensors set:'];

    if (params.acceleration)
      output.push(`  • Acceleration: x=${acceleration.x}, y=${acceleration.y}, z=${acceleration.z} m/s²`);

    if (params.accelerationIncludingGravity)
      output.push(`  • Acceleration (with gravity): x=${accelerationIncludingGravity.x}, y=${accelerationIncludingGravity.y}, z=${accelerationIncludingGravity.z} m/s²`);

    if (params.rotationRate)
      output.push(`  • Rotation rate: α=${rotationRate.alpha}, β=${rotationRate.beta}, γ=${rotationRate.gamma} deg/s`);

    output.push(`  • Update interval: ${interval}ms`);
    output.push('\nDeviceMotionEvent listeners will now receive these values.');

    response.addResult(output.join('\n'));
  },
});

/**
 * Clear device motion override.
 */
const clearDeviceMotion = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_device_motion',
    title: 'Clear device motion override',
    description: 'Remove the device motion override and stop sending simulated motion events.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (tab, _params, response) => {
    const page = tab.page;

    await page.evaluate(() => {
      const win = window as Window & { __mcpDeviceMotionCleanup?: () => void };
      if (win.__mcpDeviceMotionCleanup) {
        win.__mcpDeviceMotionCleanup();
        return true;
      }
      return false;
    });

    response.addResult('✅ Device motion override cleared.');
  },
});

/**
 * Helper to convert compass heading to direction.
 */
function getCompassDirection(alpha: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(alpha / 45) % 8;
  return directions[index];
}

export default [
  setDeviceOrientation,
  clearDeviceOrientation,
  setDeviceMotion,
  clearDeviceMotion,
];
