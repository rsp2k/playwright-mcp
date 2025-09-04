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

const uploadFile = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_file_upload',
    title: 'Upload files',
    description: 'Upload one or multiple files. Returns page snapshot after upload (configurable via browser_configure_snapshots).',
    inputSchema: z.object({
      paths: z.array(z.string()).describe('The absolute paths to the files to upload. Can be a single file or multiple files.'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const modalState = tab.modalStates().find(state => state.type === 'fileChooser');
    if (!modalState)
      throw new Error('No file chooser visible');

    response.addCode(`// Select files for upload`);
    response.addCode(`await fileChooser.setFiles(${JSON.stringify(params.paths)})`);

    tab.clearModalState(modalState);
    await tab.waitForCompletion(async () => {
      await modalState.fileChooser.setFiles(params.paths);
    });
  },
  clearsModalState: 'fileChooser',
});

const dismissFileChooser = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_dismiss_file_chooser',
    title: 'Dismiss file chooser',
    description: 'Dismiss/cancel a file chooser dialog without uploading files. Returns page snapshot after dismissal (configurable via browser_configure_snapshots).',
    inputSchema: z.object({
      // No parameters needed - just dismiss the dialog
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const modalState = tab.modalStates().find(state => state.type === 'fileChooser');
    if (!modalState)
      throw new Error('No file chooser visible');

    response.addCode(`// Cancel file chooser dialog`);
    response.addCode(`// File chooser dismissed without selecting files`);

    tab.clearModalState(modalState);
    // The file chooser is automatically dismissed when we don't interact with it
    // and just clear the modal state
  },
  clearsModalState: 'fileChooser',
});

const dismissAllFileChoosers = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_dismiss_all_file_choosers',
    title: 'Dismiss all file choosers',
    description: 'Dismiss/cancel all open file chooser dialogs without uploading files. Useful when multiple file choosers are stuck open. Returns page snapshot after dismissal (configurable via browser_configure_snapshots).',
    inputSchema: z.object({
      // No parameters needed
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const fileChooserStates = tab.modalStates().filter(state => state.type === 'fileChooser');
    if (fileChooserStates.length === 0)
      throw new Error('No file choosers visible');

    response.addCode(`// Dismiss all ${fileChooserStates.length} file chooser dialogs`);

    // Clear all file chooser modal states
    for (const modalState of fileChooserStates) {
      tab.clearModalState(modalState);
    }
    
    response.addResult(`Dismissed ${fileChooserStates.length} file chooser dialog(s)`);
  },
  clearsModalState: 'fileChooser',
});

export default [
  uploadFile,
  dismissFileChooser,
  dismissAllFileChoosers,
];
