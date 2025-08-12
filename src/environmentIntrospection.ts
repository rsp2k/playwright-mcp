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

import * as fs from 'fs';
import * as path from 'path';

export interface EnvironmentCapabilities {
  displays: DisplayInfo[];
  gpu: GPUInfo;
  projectDirectory?: string;
  memory?: MemoryInfo;
}

export interface DisplayInfo {
  socket: string;
  display: string;
  available: boolean;
}

export interface GPUInfo {
  hasGPU: boolean;
  hasRender: boolean;
  devices: string[];
}

export interface MemoryInfo {
  available: number;
  total: number;
}

export class EnvironmentIntrospector {
  private _currentRoots: { uri: string; name?: string }[] = [];
  private _capabilities: EnvironmentCapabilities | null = null;

  updateRoots(roots: { uri: string; name?: string }[]) {
    this._currentRoots = roots;
    this._capabilities = null; // Reset cached capabilities
  }

  getCurrentCapabilities(): EnvironmentCapabilities {
    if (!this._capabilities)
      this._capabilities = this._introspectEnvironment();

    return this._capabilities;
  }

  private _introspectEnvironment(): EnvironmentCapabilities {
    const capabilities: EnvironmentCapabilities = {
      displays: [],
      gpu: { hasGPU: false, hasRender: false, devices: [] }
    };

    for (const root of this._currentRoots) {
      if (!root.uri.startsWith('file://'))
        continue;

      const rootPath = root.uri.slice(7); // Remove 'file://' prefix

      try {
        if (rootPath === '/tmp/.X11-unix') {
          capabilities.displays = this._detectDisplays(rootPath);
        } else if (rootPath === '/dev/dri') {
          capabilities.gpu = this._detectGPU(rootPath);
        } else if (rootPath === '/proc/meminfo') {
          capabilities.memory = this._detectMemory(rootPath);
        } else if (fs.statSync(rootPath).isDirectory() && !rootPath.startsWith('/dev') && !rootPath.startsWith('/proc') && !rootPath.startsWith('/sys') && !rootPath.startsWith('/tmp')) {
          // Assume this is a project directory
          if (!capabilities.projectDirectory)
            capabilities.projectDirectory = rootPath;

        }
      } catch (error) {
        // Ignore errors for inaccessible paths
      }
    }

    return capabilities;
  }

  private _detectDisplays(x11Path: string): DisplayInfo[] {
    try {
      if (!fs.existsSync(x11Path))
        return [];

      const sockets = fs.readdirSync(x11Path);
      return sockets
          .filter(name => name.startsWith('X'))
          .map(socket => {
            const displayNumber = socket.slice(1);
            return {
              socket,
              display: `:${displayNumber}`,
              available: true
            };
          });
    } catch (error) {
      // Could not detect displays
      return [];
    }
  }

  private _detectGPU(driPath: string): GPUInfo {
    try {
      if (!fs.existsSync(driPath))
        return { hasGPU: false, hasRender: false, devices: [] };


      const devices = fs.readdirSync(driPath);
      return {
        hasGPU: devices.some(d => d.startsWith('card')),
        hasRender: devices.some(d => d.startsWith('renderD')),
        devices
      };
    } catch (error) {
      // Could not detect GPU
      return { hasGPU: false, hasRender: false, devices: [] };
    }
  }

  private _detectMemory(meminfoPath: string): MemoryInfo | undefined {
    try {
      if (!fs.existsSync(meminfoPath))
        return undefined;

      const content = fs.readFileSync(meminfoPath, 'utf8');
      const lines = content.split('\n');

      let total = 0;
      let available = 0;

      for (const line of lines) {
        if (line.startsWith('MemTotal:'))
          total = parseInt(line.split(/\s+/)[1], 10) * 1024; // Convert from kB to bytes
        else if (line.startsWith('MemAvailable:'))
          available = parseInt(line.split(/\s+/)[1], 10) * 1024; // Convert from kB to bytes

      }

      return total > 0 ? { total, available } : undefined;
    } catch (error) {
      // Could not detect memory
      return undefined;
    }
  }

  getRecommendedBrowserOptions(): {
    headless?: boolean;
    recordVideo?: { dir: string };
    env?: Record<string, string>;
    args?: string[];
    } {
    const capabilities = this.getCurrentCapabilities();
    const options: any = {};

    // Display configuration
    if (capabilities.displays.length > 0) {
      options.headless = false;
      options.env = {
        DISPLAY: capabilities.displays[0].display
      };
    } else {
      options.headless = true;
    }

    // Video recording directory
    if (capabilities.projectDirectory) {
      options.recordVideo = {
        dir: path.join(capabilities.projectDirectory, 'playwright-videos')
      };
    }

    // GPU acceleration
    if (capabilities.gpu.hasGPU) {
      options.args = options.args || [];
      options.args.push('--enable-gpu');
      if (capabilities.gpu.hasRender)
        options.args.push('--enable-gpu-sandbox');

    }

    return options;
  }

  getEnvironmentSummary(): string {
    const capabilities = this.getCurrentCapabilities();
    const summary: string[] = [];

    if (capabilities.displays.length > 0)
      summary.push(`Displays: ${capabilities.displays.map(d => d.display).join(', ')}`);
    else
      summary.push('No displays detected (headless mode)');


    if (capabilities.gpu.hasGPU)
      summary.push(`GPU: Available (${capabilities.gpu.devices.join(', ')})`);
    else
      summary.push('GPU: Not available');


    if (capabilities.projectDirectory)
      summary.push(`Project: ${capabilities.projectDirectory}`);
    else
      summary.push('Project: No directory specified');


    if (capabilities.memory) {
      const availableGB = (capabilities.memory.available / 1024 / 1024 / 1024).toFixed(1);
      summary.push(`Memory: ${availableGB}GB available`);
    }

    return summary.join(' | ');
  }
}
