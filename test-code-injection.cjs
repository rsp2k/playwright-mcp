#!/usr/bin/env node

/**
 * Test script for MCP client identification system
 * Tests the debug toolbar and custom code injection functionality
 */

const { createConnection } = require('./lib/index.js');
const { BrowserContextFactory } = require('./lib/browserContextFactory.js');

async function testCodeInjection() {
  console.log('🧪 Testing MCP Client Identification System...\n');
  
  try {
    // Create MCP server connection
    console.log('📡 Creating MCP connection...');
    const connection = createConnection();
    
    // Configure browser with a test project name
    console.log('🌐 Configuring browser...');
    await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_configure',
        arguments: {
          headless: false, // Show browser for visual verification
          viewport: { width: 1280, height: 720 }
        }
      }
    });
    
    // Enable debug toolbar
    console.log('🏷️  Enabling debug toolbar...');
    const toolbarResult = await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_enable_debug_toolbar',
        arguments: {
          projectName: 'Test Project A',
          position: 'top-right',
          theme: 'dark',
          minimized: false,
          showDetails: true,
          opacity: 0.9
        }
      }
    });
    console.log('✅ Debug toolbar enabled:', toolbarResult.content[0].text);
    
    // Navigate to a test page
    console.log('🚀 Navigating to test page...');
    await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Add custom code injection
    console.log('💉 Adding custom JavaScript injection...');
    const injectionResult = await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_inject_custom_code',
        arguments: {
          name: 'test-alert',
          type: 'javascript',
          code: `
            console.log('[Test Injection] Hello from Test Project A!');
            // Create a subtle notification
            const notification = document.createElement('div');
            notification.style.cssText = \`
              position: fixed;
              top: 50px;
              right: 20px;
              background: #28a745;
              color: white;
              padding: 10px 15px;
              border-radius: 5px;
              font-family: Arial;
              z-index: 1000;
              font-size: 14px;
            \`;
            notification.textContent = 'Custom injection from Test Project A';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
          `,
          persistent: true,
          autoInject: true
        }
      }
    });
    console.log('✅ Custom code injected:', injectionResult.content[0].text);
    
    // List all injections
    console.log('📋 Listing all active injections...');
    const listResult = await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_list_injections',
        arguments: {}
      }
    });
    console.log('📊 Current injections:');
    listResult.content.forEach(item => console.log('  ', item.text));
    
    // Navigate to another page to test auto-injection
    console.log('\n🔄 Testing auto-injection on new page...');
    await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_navigate',
        arguments: {
          url: 'https://httpbin.org/html'
        }
      }
    });
    
    console.log('\n🎉 Test completed successfully!');
    console.log('👀 Check the browser window to see:');
    console.log('   - Debug toolbar in top-right corner showing "Test Project A"');
    console.log('   - Green notification message from custom injection');
    console.log('   - Both should appear on both pages (example.com and httpbin.org)');
    console.log('\n💡 The debug toolbar shows:');
    console.log('   - Project name with green indicator');
    console.log('   - Session ID (first 12 chars)');
    console.log('   - Client info');
    console.log('   - Session uptime');
    console.log('   - Current hostname');
    console.log('\n⏳ Browser will stay open for 30 seconds for manual inspection...');
    
    // Wait for manual inspection
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Clean up
    console.log('\n🧹 Cleaning up injections...');
    await connection.request({
      method: 'tools/call',
      params: {
        name: 'browser_clear_injections',
        arguments: {
          includeToolbar: true
        }
      }
    });
    
    console.log('✨ Test completed and cleaned up successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testCodeInjection().catch(console.error);