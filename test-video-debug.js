#!/usr/bin/env node

/**
 * Video Recording Debug Script
 * 
 * This script helps debug video recording issues by:
 * 1. Testing the complete video recording workflow
 * 2. Showing actual artifact paths
 * 3. Verifying video file creation
 * 4. Checking session persistence
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runMCPTool(toolName, params = {}) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`MCP tool failed: ${stderr}`));
      }
    });

    // Send MCP request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function findVideoFiles(searchDir) {
  const videoFiles = [];
  
  function scanDir(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDir(fullPath);
        } else if (item.endsWith('.webm')) {
          videoFiles.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }
  
  scanDir(searchDir);
  return videoFiles;
}

async function debugVideoRecording() {
  console.log('🎥 Video Recording Debug Script');
  console.log('================================\n');

  try {
    // Step 1: Check recording status before starting
    console.log('1️⃣ Checking initial recording status...');
    const initialStatus = await runMCPTool('mcp__playwright__browser_recording_status');
    console.log('Initial status:', initialStatus.stdout);
    console.log('');

    // Step 2: Start recording
    console.log('2️⃣ Starting video recording...');
    const startResult = await runMCPTool('mcp__playwright__browser_start_recording', {
      size: { width: 1280, height: 720 },
      filename: 'debug-test-session'
    });
    console.log('Start result:', startResult.stdout);
    console.log('');

    // Step 3: Check status after starting
    console.log('3️⃣ Checking recording status after start...');
    const activeStatus = await runMCPTool('mcp__playwright__browser_recording_status');
    console.log('Active status:', activeStatus.stdout);
    console.log('');

    // Step 4: Navigate to a page
    console.log('4️⃣ Navigating to test page...');
    const navResult = await runMCPTool('mcp__playwright__browser_navigate', {
      url: 'https://example.com'
    });
    console.log('Navigation result:', navResult.stdout);
    console.log('');

    // Step 5: Check status after navigation
    console.log('5️⃣ Checking recording status after navigation...');
    const navStatus = await runMCPTool('mcp__playwright__browser_recording_status');
    console.log('Status after navigation:', navStatus.stdout);
    console.log('');

    // Step 6: Stop recording
    console.log('6️⃣ Stopping video recording...');
    const stopResult = await runMCPTool('mcp__playwright__browser_stop_recording');
    console.log('Stop result:', stopResult.stdout);
    console.log('');

    // Step 7: Search for video files
    console.log('7️⃣ Searching for video files...');
    const commonPaths = [
      process.cwd(),
      path.join(process.cwd(), 'artifacts'),
      path.join(process.cwd(), '@artifacts'),
      path.join(process.env.HOME || '.', '.cache'),
      '/tmp'
    ];

    for (const searchPath of commonPaths) {
      if (fs.existsSync(searchPath)) {
        console.log(`Searching in: ${searchPath}`);
        const videos = await findVideoFiles(searchPath);
        if (videos.length > 0) {
          console.log(`✅ Found ${videos.length} video files:`);
          videos.forEach(video => {
            const stats = fs.statSync(video);
            console.log(`  📹 ${video} (${Math.round(stats.size / 1024)}KB, ${stats.mtime.toISOString()})`);
          });
        } else {
          console.log(`  ❌ No video files found`);
        }
      } else {
        console.log(`⚠️  Path doesn't exist: ${searchPath}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Debug script failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugVideoRecording();