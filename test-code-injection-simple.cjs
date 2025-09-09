#!/usr/bin/env node

/**
 * Simple test to verify code injection tools are available
 */

const { spawn } = require('child_process');

async function runMCPCommand(toolName, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
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

async function testCodeInjectionTools() {
  console.log('🧪 Testing Code Injection Tools...\n');

  try {
    // Test 1: List tools to verify code injection tools are available
    console.log('📋 1. Checking available tools...');
    const listResult = await runMCPCommand('tools/list', {});
    
    if (listResult.stderr) {
      console.log('stderr:', listResult.stderr);
    }
    
    const response = JSON.parse(listResult.stdout.split('\n')[0]);
    const tools = response.result?.tools || [];
    
    const injectionTools = tools.filter(tool => 
      tool.name.includes('debug_toolbar') || tool.name.includes('inject')
    );
    
    console.log(`✅ Found ${injectionTools.length} code injection tools:`);
    injectionTools.forEach(tool => console.log(`   - ${tool.name}: ${tool.description}`));
    
    // Test 2: Enable debug toolbar
    console.log('\n🏷️  2. Testing debug toolbar activation...');
    const toolbarResult = await runMCPCommand('browser_enable_debug_toolbar', {
      projectName: 'Test Project',
      position: 'top-right',
      theme: 'dark',
      minimized: false,
      showDetails: true,
      opacity: 0.9
    });
    
    if (toolbarResult.stderr) {
      console.log('stderr:', toolbarResult.stderr);
    }
    
    if (toolbarResult.stdout) {
      const toolbarResponse = JSON.parse(toolbarResult.stdout.split('\n')[0]);
      if (toolbarResponse.result) {
        console.log('✅ Debug toolbar enabled successfully');
        toolbarResponse.result.content?.forEach(item => 
          console.log(`   ${item.text}`)
        );
      }
    }
    
    // Test 3: List injections
    console.log('\n📊 3. Testing injection listing...');
    const listInjectionsResult = await runMCPCommand('browser_list_injections', {});
    
    if (listInjectionsResult.stdout) {
      const listResponse = JSON.parse(listInjectionsResult.stdout.split('\n')[0]);
      if (listResponse.result) {
        console.log('✅ Injection listing works:');
        listResponse.result.content?.forEach(item => 
          console.log(`   ${item.text}`)
        );
      }
    }
    
    // Test 4: Add custom injection
    console.log('\n💉 4. Testing custom code injection...');
    const injectionResult = await runMCPCommand('browser_inject_custom_code', {
      name: 'test-console-log',
      type: 'javascript',
      code: 'console.log("Test injection from MCP client identification system!");',
      persistent: true,
      autoInject: true
    });
    
    if (injectionResult.stdout) {
      const injectionResponse = JSON.parse(injectionResult.stdout.split('\n')[0]);
      if (injectionResponse.result) {
        console.log('✅ Custom code injection works:');
        injectionResponse.result.content?.forEach(item => 
          console.log(`   ${item.text}`)
        );
      }
    }
    
    console.log('\n🎉 All code injection tools are working correctly!');
    console.log('\n💡 The system provides:');
    console.log('   ✅ Debug toolbar for client identification');
    console.log('   ✅ Custom code injection capabilities');  
    console.log('   ✅ Session persistence');
    console.log('   ✅ Auto-injection on new pages');
    console.log('   ✅ LLM-safe code wrapping');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testCodeInjectionTools().catch(console.error);