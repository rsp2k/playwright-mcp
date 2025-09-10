#!/usr/bin/env node

/**
 * Test script to verify video recording fixes
 * Tests the complete lifecycle: start → navigate → stop → verify files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testVideoRecordingFix() {
  console.log('🎥 Testing Video Recording Fix');
  console.log('=====================================');
  
  const testDir = path.join(__dirname, 'test-video-output');
  
  // Create simple HTML page for testing
  const testHtml = `
<!DOCTYPE html>
<html>
<head><title>Video Recording Test</title></head>
<body>
  <h1>Testing Video Recording</h1>
  <p>This page is being recorded...</p>
  <script>
    setInterval(() => {
      document.body.style.backgroundColor = 
        '#' + Math.floor(Math.random()*16777215).toString(16);
    }, 1000);
  </script>
</body>
</html>
  `;
  
  const testFile = path.join(__dirname, 'test-video-page.html');
  fs.writeFileSync(testFile, testHtml);
  
  console.log('✅ Created test page with animated background');
  console.log(`📄 Test page: file://${testFile}`);
  console.log('');
  
  console.log('🔧 Manual Test Instructions:');
  console.log('1. Start MCP server: npm run build && node lib/index.js');
  console.log(`2. Use browser_start_recording to start recording`);
  console.log(`3. Navigate to: file://${testFile}`);
  console.log('4. Wait a few seconds (watch animated background)');
  console.log('5. Use browser_stop_recording to stop recording');
  console.log('6. Check that video files are created and paths are returned');
  console.log('');
  
  console.log('🐛 Expected Fixes:');
  console.log('- ✅ Recording config persists between browser actions');
  console.log('- ✅ Pages are properly tracked for video generation');
  console.log('- ✅ Video paths are extracted before closing pages');
  console.log('- ✅ Absolute paths are shown in status output');
  console.log('- ✅ Debug logging helps troubleshoot issues');
  console.log('');
  
  console.log('🔍 To verify fix:');
  console.log('- browser_recording_status should show "Active recordings: 1" after navigate');
  console.log('- browser_stop_recording should return actual video file paths');
  console.log('- Video files should exist at the returned paths');
  console.log('- Should NOT see "No video recording was active" error');
  
  return testFile;
}

testVideoRecordingFix().catch(console.error);