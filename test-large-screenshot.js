#!/usr/bin/env node

/**
 * Test script to verify large screenshot handling
 * Creates a very tall page and tests fullPage screenshot protection
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testLargeScreenshot() {
  console.log('🧪 Testing large screenshot protection...');
  
  // Create a simple HTML page that will be very tall
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Large Page Test</title>
  <style>
    .tall-content {
      height: 10000px;
      background: linear-gradient(to bottom, #ff0000, #00ff00, #0000ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      color: white;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div class="tall-content">
    This is a very tall page (10000px height)<br>
    Should trigger large image protection
  </div>
</body>
</html>
  `;
  
  const testFile = path.join(__dirname, 'test-large-page.html');
  fs.writeFileSync(testFile, testHtml);
  
  console.log(`📄 Created test file: ${testFile}`);
  console.log('🔧 This test requires manual verification with an MCP client');
  console.log('');
  console.log('To test:');
  console.log('1. Start MCP server: npm run build && node lib/index.js');
  console.log(`2. Navigate to: file://${testFile}`);
  console.log('3. Try: browser_take_screenshot {"fullPage": true}');
  console.log('4. Verify: Image saved to file but NOT included in response');
  console.log('5. Should see: "🚫 **Image not included in response**" message');
  console.log('');
  console.log('Expected behavior:');
  console.log('- Screenshot file should be created');
  console.log('- No large image sent to API (prevents conversation issues)');
  console.log('- Clear warning message displayed');
  
  return testFile;
}

testLargeScreenshot().catch(console.error);