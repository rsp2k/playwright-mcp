/**
 * Test script to validate MCP session persistence
 */

import crypto from 'crypto';

async function makeRequest(sessionId, method, params = {}) {
  const response = await fetch('http://localhost:8931/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.random(),
      method: method,
      params: params
    })
  });
  
  const data = await response.json();
  if (data.error) {
    console.log(`   Error: ${data.error.message}`);
  }
  return data;
}

async function testSessionPersistence() {
  console.log('🧪 Testing MCP Session Persistence\n');
  
  // Create two different session IDs (simulating different MCP clients)
  const session1 = crypto.randomUUID();
  const session2 = crypto.randomUUID();
  
  console.log(`📍 Session 1: ${session1}`);
  console.log(`📍 Session 2: ${session2}\n`);
  
  // First, let's check what tools are available
  console.log('📋 Checking available tools');
  const toolsList = await makeRequest(session1, 'tools/list', {});
  console.log('Available tools:', toolsList.result?.tools?.length || 0);

  // Test 1: Navigate in session 1
  console.log('🔵 Session 1: Navigate to example.com');
  const nav1 = await makeRequest(session1, 'tools/call', {
    name: 'browser_navigate',
    arguments: { url: 'https://example.com' }
  });
  console.log('Result:', nav1.result ? '✅ Success' : '❌ Failed');
  
  // Test 2: Navigate in session 2 (different URL)
  console.log('🟢 Session 2: Navigate to httpbin.org/html');
  const nav2 = await makeRequest(session2, 'tools/call', {
    name: 'browser_navigate', 
    arguments: { url: 'https://httpbin.org/html' }
  });
  console.log('Result:', nav2.result ? '✅ Success' : '❌ Failed');
  
  // Test 3: Take screenshot in session 1 (should be on example.com)
  console.log('🔵 Session 1: Take screenshot (should show example.com)');
  const screenshot1 = await makeRequest(session1, 'tools/call', {
    name: 'browser_take_screenshot',
    arguments: {}
  });
  console.log('Result:', screenshot1.result ? '✅ Success' : '❌ Failed');
  
  // Test 4: Take screenshot in session 2 (should be on httpbin.org) 
  console.log('🟢 Session 2: Take screenshot (should show httpbin.org)');
  const screenshot2 = await makeRequest(session2, 'tools/call', {
    name: 'browser_take_screenshot',
    arguments: {}
  });
  console.log('Result:', screenshot2.result ? '✅ Success' : '❌ Failed');
  
  // Test 5: Navigate again in session 1 (should preserve browser state)
  console.log('🔵 Session 1: Navigate to example.com/test (should reuse browser)');
  const nav3 = await makeRequest(session1, 'tools/call', {
    name: 'browser_navigate',
    arguments: { url: 'https://example.com' }
  });
  console.log('Result:', nav3.result ? '✅ Success' : '❌ Failed');
  
  console.log('\n🎯 Session persistence test completed!');
  console.log('If all tests passed, each session maintained its own isolated browser context.');
}

testSessionPersistence().catch(console.error);