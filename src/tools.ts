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

import artifacts from './tools/artifacts.js';
import common from './tools/common.js';
import codeInjection from './tools/codeInjection.js';
import configure from './tools/configure.js';
import console from './tools/console.js';
import dialogs from './tools/dialogs.js';
import evaluate from './tools/evaluate.js';
import files from './tools/files.js';
import install from './tools/install.js';
import keyboard from './tools/keyboard.js';
import navigate from './tools/navigate.js';
import network from './tools/network.js';
import networkThrottle from './tools/network-throttle.js';
import notifications from './tools/notifications.js';
import pdf from './tools/pdf.js';
import sensors from './tools/sensors.js';
import requests from './tools/requests.js';
import snapshot from './tools/snapshot.js';
import storage from './tools/storage.js';
import tabs from './tools/tabs.js';
import screenshot from './tools/screenshot.js';
import themeManagement from './tools/themeManagement.js';
import video from './tools/video.js';
import wait from './tools/wait.js';
import webrtc from './tools/webrtc.js';
import mouse from './tools/mouse.js';

import type { Tool } from './tools/tool.js';
import type { FullConfig } from './config.js';

export const allTools: Tool<any>[] = [
  ...artifacts,
  ...codeInjection,
  ...common,
  ...configure,
  ...console,
  ...dialogs,
  ...evaluate,
  ...files,
  ...install,
  ...keyboard,
  ...navigate,
  ...network,
  ...networkThrottle,
  ...notifications,
  ...mouse,
  ...pdf,
  ...requests,
  ...screenshot,
  ...sensors,
  ...snapshot,
  ...storage,
  ...tabs,
  ...themeManagement,
  ...video,
  ...wait,
  ...webrtc,
];

export function filteredTools(config: FullConfig) {
  return allTools.filter(tool => tool.capability.startsWith('core') || config.capabilities?.includes(tool.capability));
}
