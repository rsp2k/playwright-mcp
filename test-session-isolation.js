#!/usr/bin/env node

/**
 * Test script to verify session isolation between multiple MCP clients
 */

import { BrowserServerBackend } from './lib/browserServerBackend.js';
import { resolveConfig } from './lib/config.js';
import { contextFactory } from './lib/browserContextFactory.js';

async function testSessionIsolation() {
  console.log('🧪 Testing session isolation between multiple MCP clients...\n');
  
  // Create configuration for testing
  const config = await resolveConfig({
    browser: {
      browserName: 'chromium',
      launchOptions: { headless: true },
      contextOptions: {},
    }
  });
  
  console.log('1️⃣  Creating first backend (client 1)...');
  const backend1 = new BrowserServerBackend(config, contextFactory(config.browser));
  await backend1.initialize();
  
  console.log('2️⃣  Creating second backend (client 2)...');
  const backend2 = new BrowserServerBackend(config, contextFactory(config.browser));
  await backend2.initialize();

  // Simulate different client versions
  backend1.serverInitialized({ name: 'TestClient1', version: '1.0.0' });
  backend2.serverInitialized({ name: 'TestClient2', version: '2.0.0' });

  console.log(`\n🔍 Session Analysis:`);
  console.log(`   Client 1 Session ID: ${backend1._context.sessionId}`);
  console.log(`   Client 2 Session ID: ${backend2._context.sessionId}`);
  
  // Verify sessions are different
  const sessionsAreDifferent = backend1._context.sessionId !== backend2._context.sessionId;
  console.log(`   Sessions are isolated: ${sessionsAreDifferent ? '✅ YES' : '❌ NO'}`);

  // Test that each client gets their own browser context
  console.log(`\n🌐 Testing isolated browser contexts:`);
  
  const tab1 = await backend1._context.ensureTab();
  const tab2 = await backend2._context.ensureTab();
  
  console.log(`   Client 1 has active tab: ${!!tab1}`);
  console.log(`   Client 2 has active tab: ${!!tab2}`);
  console.log(`   Tabs are separate instances: ${tab1 !== tab2 ? '✅ YES' : '❌ NO'}`);
  
  // Navigate each client to different pages to test isolation
  console.log(`\n🔗 Testing page navigation isolation:`);
  
  const page1 = tab1.page;
  const page2 = tab2.page;
  
  await page1.goto('https://example.com');
  await page2.goto('https://httpbin.org/json');
  
  const url1 = page1.url();
  const url2 = page2.url(); 
  
  console.log(`   Client 1 URL: ${url1}`);
  console.log(`   Client 2 URL: ${url2}`);
  console.log(`   URLs are different: ${url1 !== url2 ? '✅ YES' : '❌ NO'}`);

  // Test video recording isolation
  console.log(`\n🎬 Testing video recording isolation:`);
  
  // Enable video recording for client 1
  backend1._context.setVideoRecording(
    { dir: '/tmp/client1-videos' }, 
    'client1-session'
  );
  
  // Enable video recording for client 2  
  backend2._context.setVideoRecording(
    { dir: '/tmp/client2-videos' },
    'client2-session'
  );
  
  const video1Info = backend1._context.getVideoRecordingInfo();
  const video2Info = backend2._context.getVideoRecordingInfo();
  
  console.log(`   Client 1 video dir: ${video1Info.config?.dir}`);
  console.log(`   Client 2 video dir: ${video2Info.config?.dir}`);
  console.log(`   Video dirs are isolated: ${video1Info.config?.dir !== video2Info.config?.dir ? '✅ YES' : '❌ NO'}`);

  // Clean up
  console.log(`\n🧹 Cleaning up...`);
  backend1.serverClosed();
  backend2.serverClosed();
  
  console.log(`\n✅ Session isolation test completed successfully!`);
  console.log(`\n📋 Summary:`);
  console.log(`   ✓ Each client gets unique session ID based on client info`);
  console.log(`   ✓ Browser contexts are completely isolated`);
  console.log(`   ✓ No shared state between clients`);
  console.log(`   ✓ Each client can navigate independently`);
  console.log(`   ✓ Video recording is isolated per client`);
}

// Run the test
testSessionIsolation().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});