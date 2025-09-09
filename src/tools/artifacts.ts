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

import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { ArtifactManagerRegistry } from '../artifactManager.js';

const getArtifactPaths = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_get_artifact_paths',
    title: 'Get artifact storage paths',
    description: 'Reveal the actual filesystem paths where artifacts (screenshots, videos, PDFs) are stored. Useful for locating generated files.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const registry = ArtifactManagerRegistry.getInstance();
    const artifactManager = context.sessionId ? registry.getManager(context.sessionId) : undefined;

    if (artifactManager) {
      // Using centralized artifact storage
      const baseDir = artifactManager.getBaseDirectory();
      const sessionDir = artifactManager.getSessionDirectory();

      response.addResult(`📁 **Centralized Artifact Storage (Session-based)**`);
      response.addResult(`Session ID: ${context.sessionId}`);
      response.addResult(`Base directory: ${baseDir}`);
      response.addResult(`Session directory: ${sessionDir}`);
      response.addResult(``);

      // Show subdirectories
      const subdirs = ['screenshots', 'videos', 'pdfs'];
      response.addResult(`📂 **Subdirectories:**`);
      for (const subdir of subdirs) {
        const fullPath = artifactManager.getSubdirectory(subdir);
        const exists = fs.existsSync(fullPath);
        const status = exists ? '✅' : '⚪';
        response.addResult(`${status} ${subdir}: ${fullPath}`);

        if (exists) {
          try {
            const files = fs.readdirSync(fullPath);
            if (files.length > 0)
              response.addResult(`   📄 Files (${files.length}): ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`);

          } catch (error) {
            // Ignore permission errors
          }
        }
      }

    } else {
      // Using default output directory
      const outputDir = context.config.outputDir;
      const absolutePath = path.resolve(outputDir);

      response.addResult(`📁 **Default Output Directory**`);
      response.addResult(`Configured path: ${outputDir}`);
      response.addResult(`Absolute path: ${absolutePath}`);
      response.addResult(``);

      // Check if directory exists
      const exists = fs.existsSync(absolutePath);
      response.addResult(`Directory exists: ${exists ? '✅ Yes' : '❌ No'}`);

      if (exists) {
        try {
          const files = fs.readdirSync(absolutePath);
          response.addResult(`Files in directory: ${files.length}`);
          if (files.length > 0)
            response.addResult(`Recent files: ${files.slice(-5).join(', ')}`);

        } catch (error: any) {
          response.addResult(`❌ Cannot read directory: ${error.message}`);
        }
      }

      // Show common subdirectories that might be created
      const subdirs = ['screenshots', 'videos', 'pdfs'];
      response.addResult(``);
      response.addResult(`📂 **Potential subdirectories:**`);
      for (const subdir of subdirs) {
        const fullPath = path.join(absolutePath, subdir);
        const exists = fs.existsSync(fullPath);
        const status = exists ? '✅' : '⚪';
        response.addResult(`${status} ${subdir}: ${fullPath}`);
      }
    }

    response.addResult(``);
    response.addResult(`💡 **Tips:**`);
    response.addResult(`• Use \`ls\` or file explorer to browse these directories`);
    response.addResult(`• Screenshots are typically saved as PNG/JPEG files`);
    response.addResult(`• Videos are saved as WebM files`);
    response.addResult(`• PDFs retain their original names or get timestamped names`);
  },
});

export default [
  getArtifactPaths,
];
