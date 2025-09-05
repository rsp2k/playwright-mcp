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
import { z } from 'zod';
import { defineTool } from './tool.js';
import { ArtifactManagerRegistry } from '../artifactManager.js';

const startRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_start_recording',
    title: 'Start video recording',
    description: 'Start recording browser session video. This must be called BEFORE performing browser actions you want to record. New browser contexts will be created with video recording enabled. Videos are automatically saved when pages/contexts close.',
    inputSchema: z.object({
      size: z.object({
        width: z.number().optional().describe('Video width in pixels (default: scales to fit 800x800)'),
        height: z.number().optional().describe('Video height in pixels (default: scales to fit 800x800)'),
      }).optional().describe('Video recording size'),
      filename: z.string().optional().describe('Base filename for video files (default: session-{timestamp}.webm)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = params.filename || `session-${timestamp}`;

    // Use centralized artifact storage if configured
    let videoDir: string;
    const registry = ArtifactManagerRegistry.getInstance();
    const artifactManager = context.sessionId ? registry.getManager(context.sessionId) : undefined;

    if (artifactManager)
      videoDir = artifactManager.getSubdirectory('videos');
    else
      videoDir = path.join(context.config.outputDir, 'videos');


    // Update context options to enable video recording
    const recordVideoOptions: any = {
      dir: videoDir,
    };

    if (params.size)
      recordVideoOptions.size = params.size;


    // Store video recording config in context for future browser contexts
    context.setVideoRecording(recordVideoOptions, baseFilename);

    response.addResult(`✓ Video recording enabled. Videos will be saved to: ${videoDir}`);
    response.addResult(`✓ Video files will be named: ${baseFilename}-*.webm`);
    response.addResult(`\nNext steps:`);
    response.addResult(`1. Navigate to pages and perform browser actions`);
    response.addResult(`2. Use browser_stop_recording when finished to save videos`);
    response.addResult(`3. Videos are automatically saved when pages close`);
    response.addCode(`// Video recording enabled for new browser contexts`);
    response.addCode(`const context = await browser.newContext({`);
    response.addCode(`  recordVideo: {`);
    response.addCode(`    dir: '${videoDir}',`);
    if (params.size)
      response.addCode(`    size: { width: ${params.size.width || 'auto'}, height: ${params.size.height || 'auto'} }`);

    response.addCode(`  }`);
    response.addCode(`});`);
  },
});

const stopRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_stop_recording',
    title: 'Stop video recording',
    description: 'Stop video recording and return the paths to recorded video files. This closes all active pages to ensure videos are properly saved. Call this when you want to finalize and access the recorded videos.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const videoPaths = await context.stopVideoRecording();

    if (videoPaths.length === 0) {
      response.addResult('No video recording was active.');
      return;
    }

    response.addResult(`✓ Video recording stopped. ${videoPaths.length} video file(s) saved:`);
    for (const videoPath of videoPaths)
      response.addResult(`📹 ${videoPath}`);

    response.addResult(`\nVideos are now ready for viewing or sharing.`);
    response.addCode(`// Video recording stopped`);
    response.addCode(`await context.close(); // Ensures video is saved`);
  },
});

const getRecordingStatus = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_recording_status',
    title: 'Get video recording status',
    description: 'Check if video recording is currently enabled and get recording details. Use this to verify recording is active before performing actions, or to check output directory and settings.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const recordingInfo = context.getVideoRecordingInfo();

    if (!recordingInfo.enabled) {
      response.addResult('❌ Video recording is not enabled.');
      response.addResult('\n💡 To start recording:');
      response.addResult('1. Use browser_start_recording to enable recording');
      response.addResult('2. Navigate to pages and perform actions');
      response.addResult('3. Use browser_stop_recording to save videos');
      
      // Show potential artifact locations for debugging
      const registry = ArtifactManagerRegistry.getInstance();
      const artifactManager = context.sessionId ? registry.getManager(context.sessionId) : undefined;
      
      if (artifactManager) {
        const baseDir = artifactManager.getBaseDirectory();
        const sessionDir = artifactManager.getSessionDirectory();
        response.addResult(`\n🔍 Debug Info:`);
        response.addResult(`📁 Artifact base directory: ${baseDir}`);
        response.addResult(`📂 Session directory: ${sessionDir}`);
        response.addResult(`🆔 Session ID: ${context.sessionId}`);
      } else {
        response.addResult(`\n⚠️  No artifact manager configured - videos will save to default output directory`);
        response.addResult(`📁 Default output: ${path.join(context.config.outputDir, 'videos')}`);
      }
      
      return;
    }

    response.addResult(`✅ Video recording is active:`);
    response.addResult(`📁 Output directory: ${recordingInfo.config?.dir}`);
    response.addResult(`📝 Base filename: ${recordingInfo.baseFilename}`);
    if (recordingInfo.config?.size)
      response.addResult(`📐 Video size: ${recordingInfo.config.size.width}x${recordingInfo.config.size.height}`);
    else
      response.addResult(`📐 Video size: auto-scaled to fit 800x800`);

    response.addResult(`🎬 Active recordings: ${recordingInfo.activeRecordings}`);

    // Show helpful path info for MCP clients
    const outputDir = recordingInfo.config?.dir;
    if (outputDir) {
      const absolutePath = path.resolve(outputDir);
      response.addResult(`📍 Absolute path: ${absolutePath}`);
      
      // Check if directory exists and show contents
      const fs = await import('fs');
      if (fs.existsSync(absolutePath)) {
        try {
          const files = fs.readdirSync(absolutePath);
          const webmFiles = files.filter(f => f.endsWith('.webm'));
          if (webmFiles.length > 0) {
            response.addResult(`📹 Existing video files in directory: ${webmFiles.length}`);
            webmFiles.forEach(file => response.addResult(`  • ${file}`));
          } else {
            response.addResult(`📁 Directory exists but no .webm files found yet`);
          }
        } catch (error: any) {
          response.addResult(`⚠️  Could not read directory contents: ${error.message}`);
        }
      } else {
        response.addResult(`⚠️  Output directory does not exist yet (will be created when recording starts)`);
      }
    }

    // Show debug information
    const registry = ArtifactManagerRegistry.getInstance();
    const artifactManager = context.sessionId ? registry.getManager(context.sessionId) : undefined;
    
    if (artifactManager) {
      response.addResult(`\n🔍 Debug Info:`);
      response.addResult(`🆔 Session ID: ${context.sessionId}`);
      response.addResult(`📂 Session directory: ${artifactManager.getSessionDirectory()}`);
    }

    if (recordingInfo.activeRecordings === 0)
      response.addResult(`\n💡 Tip: Navigate to pages to start recording browser actions`);
  },
});

const revealArtifactPaths = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_reveal_artifact_paths',
    title: 'Reveal artifact storage paths',
    description: 'Show where artifacts (videos, screenshots, etc.) are stored, including resolved absolute paths. Useful for debugging when you cannot find generated files.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    response.addResult('🗂️  Artifact Storage Paths');
    response.addResult('=========================\n');

    // Show default output directory
    response.addResult(`📁 Default output directory: ${context.config.outputDir}`);
    response.addResult(`📍 Resolved absolute path: ${path.resolve(context.config.outputDir)}\n`);

    // Show artifact manager paths if configured
    const registry = ArtifactManagerRegistry.getInstance();
    const artifactManager = context.sessionId ? registry.getManager(context.sessionId) : undefined;

    if (artifactManager) {
      const baseDir = artifactManager.getBaseDirectory();
      const sessionDir = artifactManager.getSessionDirectory();

      response.addResult('🎯 Centralized Artifact Storage (ACTIVE):');
      response.addResult(`📁 Base directory: ${baseDir}`);
      response.addResult(`📍 Base absolute path: ${path.resolve(baseDir)}`);
      response.addResult(`📂 Session directory: ${sessionDir}`);
      response.addResult(`📍 Session absolute path: ${path.resolve(sessionDir)}`);
      response.addResult(`🆔 Session ID: ${context.sessionId}\n`);

      // Show subdirectories
      response.addResult('📋 Available subdirectories:');
      const subdirs = ['videos', 'screenshots', 'api-logs', 'traces'];
      for (const subdir of subdirs) {
        const subdirPath = artifactManager.getSubdirectory(subdir);
        const fs = await import('fs');
        const exists = fs.existsSync(subdirPath);
        response.addResult(`  📁 ${subdir}: ${subdirPath} ${exists ? '✅' : '⚠️ (will be created when needed)'}`);
      }

      // Show any existing files in the session directory
      const fs = await import('fs');
      if (fs.existsSync(sessionDir)) {
        try {
          const items = fs.readdirSync(sessionDir, { withFileTypes: true });
          const files = items.filter(item => item.isFile()).map(item => item.name);
          const dirs = items.filter(item => item.isDirectory()).map(item => item.name);

          if (dirs.length > 0) {
            response.addResult(`\n📂 Existing subdirectories: ${dirs.join(', ')}`);
          }

          if (files.length > 0) {
            response.addResult(`📄 Files in session directory: ${files.join(', ')}`);
          }

          // Count .webm files across all subdirectories
          let webmCount = 0;
          function countWebmFiles(dir: string) {
            try {
              const contents = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of contents) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                  countWebmFiles(fullPath);
                } else if (item.name.endsWith('.webm')) {
                  webmCount++;
                }
              }
            } catch (error) {
              // Ignore permission errors
            }
          }
          countWebmFiles(sessionDir);

          if (webmCount > 0) {
            response.addResult(`🎬 Total .webm video files found: ${webmCount}`);
          }
        } catch (error: any) {
          response.addResult(`⚠️  Could not list session directory contents: ${error.message}`);
        }
      }
    } else {
      response.addResult('⚠️  No centralized artifact storage configured');
      response.addResult('📁 Files will be saved to default output directory');
      response.addResult(`📍 Default path: ${path.resolve(context.config.outputDir)}\n`);
    }

    // Show current video recording paths if active
    const recordingInfo = context.getVideoRecordingInfo();
    if (recordingInfo.enabled && recordingInfo.config?.dir) {
      response.addResult('🎥 Current Video Recording:');
      response.addResult(`📁 Video output directory: ${recordingInfo.config.dir}`);
      response.addResult(`📍 Video absolute path: ${path.resolve(recordingInfo.config.dir)}`);
      response.addResult(`📝 Base filename pattern: ${recordingInfo.baseFilename}*.webm`);
    }

    response.addResult('\n💡 Tips:');
    response.addResult('• Use these absolute paths to locate your generated files');
    response.addResult('• Video files (.webm) are created when pages close or recording stops');
    response.addResult('• Screenshot files (.png/.jpeg) are created immediately when taken');
  },
});

export default [
  startRecording,
  stopRecording,
  getRecordingStatus,
  revealArtifactPaths,
];
