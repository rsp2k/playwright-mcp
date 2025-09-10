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
    description: 'Start recording browser session video with intelligent viewport matching. For best results, the browser viewport size should match the video recording size to avoid gray space around content. Use browser_configure to set viewport size before recording.',
    inputSchema: z.object({
      size: z.object({
        width: z.number().optional().describe('Video width in pixels (default: 1280). For full-frame content, set browser viewport to match this width.'),
        height: z.number().optional().describe('Video height in pixels (default: 720). For full-frame content, set browser viewport to match this height.'),
      }).optional().describe('Video recording dimensions. IMPORTANT: Browser viewport should match these dimensions to avoid gray borders around content.'),
      filename: z.string().optional().describe('Base filename for video files (default: session-{timestamp}.webm)'),
      autoSetViewport: z.boolean().optional().default(true).describe('Automatically set browser viewport to match video recording size (recommended for full-frame content)'),
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


    // Default video size for better demos
    const videoSize = params.size || { width: 1280, height: 720 };

    // Update context options to enable video recording
    const recordVideoOptions: any = {
      dir: videoDir,
      size: videoSize,
    };

    // Automatically set viewport to match video size for full-frame content
    if (params.autoSetViewport) {
      try {
        await context.updateBrowserConfig({
          viewport: {
            width: videoSize.width || 1280,
            height: videoSize.height || 720,
          },
        });
        response.addResult(`🖥️  Browser viewport automatically set to ${videoSize.width}x${videoSize.height} to match video size`);
      } catch (error) {
        response.addResult(`⚠️  Could not auto-set viewport: ${error instanceof Error ? error.message : 'Unknown error'}`);
        response.addResult(`💡 Manually set viewport with: browser_configure({viewport: {width: ${videoSize.width}, height: ${videoSize.height}}})`);
      }
    }

    // Store video recording config in context for future browser contexts
    context.setVideoRecording(recordVideoOptions, baseFilename);

    response.addResult(`🎬 Video recording started!`);
    response.addResult(`📁 Videos will be saved to: ${videoDir}`);
    response.addResult(`📝 Files will be named: ${baseFilename}-*.webm`);
    response.addResult(`📐 Video size: ${videoSize.width}x${videoSize.height}`);

    // Show viewport matching info
    if (params.autoSetViewport) {
      response.addResult(`🖼️  Browser viewport matched to video size for full-frame content`);
    } else {
      response.addResult(`⚠️  Viewport not automatically set - you may see gray borders around content`);
      response.addResult(`💡 For full-frame content, use: browser_configure({viewport: {width: ${videoSize.width}, height: ${videoSize.height}}})`);
    }

    // Show current recording mode
    const recordingInfo = context.getVideoRecordingInfo();
    response.addResult(`🎯 Recording mode: ${recordingInfo.mode}`);

    switch (recordingInfo.mode) {
      case 'smart':
        response.addResult(`🧠 Smart mode: Auto-pauses during waits, resumes during actions`);
        response.addResult(`💡 Perfect for creating clean demo videos with minimal dead time`);
        break;
      case 'continuous':
        response.addResult(`📹 Continuous mode: Recording everything without pauses`);
        break;
      case 'action-only':
        response.addResult(`⚡ Action-only mode: Only recording during browser interactions`);
        break;
      case 'segment':
        response.addResult(`🎞️ Segment mode: Creating separate files for each action sequence`);
        break;
    }

    response.addResult(`\n📋 Next steps:`);
    response.addResult(`1. Navigate to pages and perform browser actions`);
    response.addResult(`2. Use browser_stop_recording when finished to save videos`);
    response.addResult(`3. Use browser_set_recording_mode to change behavior`);
    response.addResult(`4. Videos are automatically saved when pages close`);
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
    description: 'Finalize video recording session and return paths to all recorded video files (.webm format). Automatically closes browser pages to ensure videos are properly saved and available for use. Essential final step for completing video recording workflows and accessing demo files.',
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
    response.addResult(`🎯 Recording mode: ${recordingInfo.mode}`);

    if (recordingInfo.paused)
      response.addResult(`⏸️ Status: PAUSED (${recordingInfo.pausedRecordings} recordings stored)`);
    else
      response.addResult(`▶️ Status: RECORDING`);


    if (recordingInfo.mode === 'segment')
      response.addResult(`🎞️ Current segment: ${recordingInfo.currentSegment}`);


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

          if (dirs.length > 0)
            response.addResult(`\n📂 Existing subdirectories: ${dirs.join(', ')}`);


          if (files.length > 0)
            response.addResult(`📄 Files in session directory: ${files.join(', ')}`);


          // Count .webm files across all subdirectories
          let webmCount = 0;
          function countWebmFiles(dir: string) {
            try {
              const contents = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of contents) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory())
                  countWebmFiles(fullPath);
                else if (item.name.endsWith('.webm'))
                  webmCount++;

              }
            } catch (error) {
              // Ignore permission errors
            }
          }
          countWebmFiles(sessionDir);

          if (webmCount > 0)
            response.addResult(`🎬 Total .webm video files found: ${webmCount}`);

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

const pauseRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_pause_recording',
    title: 'Pause video recording',
    description: 'Manually pause the current video recording to eliminate dead time between actions. Useful for creating professional demo videos. In smart recording mode, pausing happens automatically during waits. Use browser_resume_recording to continue recording.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const result = await context.pauseVideoRecording();
    response.addResult(`⏸️ ${result.message}`);
    if (result.paused > 0)
      response.addResult(`💡 Use browser_resume_recording to continue`);

  },
});

const resumeRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_resume_recording',
    title: 'Resume video recording',
    description: 'Manually resume previously paused video recording. New video segments will capture subsequent browser actions. In smart recording mode, resuming happens automatically when browser actions begin. Useful for precise control over recording timing in demo videos.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const result = await context.resumeVideoRecording();
    response.addResult(`▶️ ${result.message}`);
  },
});

const setRecordingMode = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_set_recording_mode',
    title: 'Set video recording mode',
    description: 'Configure intelligent video recording behavior for professional demo videos. Choose from continuous recording, smart auto-pause/resume, action-only capture, or segmented recording. Smart mode is recommended for marketing demos as it eliminates dead time automatically.',
    inputSchema: z.object({
      mode: z.enum(['continuous', 'smart', 'action-only', 'segment']).describe('Video recording behavior mode:\n• continuous: Record everything continuously including waits (traditional behavior, may have dead time)\n• smart: Automatically pause during waits, resume during actions (RECOMMENDED for clean demo videos)\n• action-only: Only record during active browser interactions, minimal recording time\n• segment: Create separate video files for each action sequence (useful for splitting demos into clips)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    context.setVideoRecordingMode(params.mode);

    response.addResult(`🎬 Video recording mode set to: ${params.mode}`);

    switch (params.mode) {
      case 'continuous':
        response.addResult('📹 Will record everything continuously (traditional behavior)');
        break;
      case 'smart':
        response.addResult('🧠 Will auto-pause during waits, resume during actions (best for demos)');
        response.addResult('💡 Perfect for creating clean marketing/demo videos');
        break;
      case 'action-only':
        response.addResult('⚡ Will only record during active browser interactions');
        response.addResult('💡 Minimal recording time, focuses on user actions');
        break;
      case 'segment':
        response.addResult('🎞️ Will create separate video files for each action sequence');
        response.addResult('💡 Useful for breaking demos into individual clips');
        break;
    }

    const recordingInfo = context.getVideoRecordingInfo();
    if (recordingInfo.enabled) {
      response.addResult(`\n🎥 Current recording status: ${recordingInfo.paused ? 'paused' : 'active'}`);
      response.addResult(`📊 Active recordings: ${recordingInfo.activeRecordings}`);
    }
  },
});

export default [
  startRecording,
  stopRecording,
  getRecordingStatus,
  revealArtifactPaths,
  pauseRecording,
  resumeRecording,
  setRecordingMode,
];
