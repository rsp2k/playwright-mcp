#!/usr/bin/env node

/**
 * Quick System Validation Script
 * 
 * Validates that our new features are working correctly:
 * - MCP server starts properly
 * - Video recording tools are accessible
 * - Request monitoring tools are available
 * - Diagnostic tools work
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 Playwright MCP System Validation');
console.log('===================================\n');

async function checkMCPServer() {
  console.log('1️⃣ Checking MCP Server startup...');
  
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error('MCP server startup timeout'));
    }, 10000);

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || stdout.includes('listening') || stderr.includes('listening')) {
        console.log('   ✅ MCP Server starts successfully');
        resolve(true);
      } else {
        console.log(`   ❌ MCP Server failed to start: ${stderr}`);
        resolve(false);
      }
    });

    // Send a simple request to test
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function checkVideoTools() {
  console.log('2️⃣ Checking video recording tools...');
  
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    
    const timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error('Tool list timeout'));
    }, 10000);

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      
      const expectedTools = [
        'browser_start_recording',
        'browser_stop_recording',
        'browser_pause_recording',
        'browser_resume_recording',
        'browser_set_recording_mode',
        'browser_recording_status',
        'browser_reveal_artifact_paths'
      ];
      
      let foundTools = 0;
      
      expectedTools.forEach(tool => {
        if (stdout.includes(tool)) {
          foundTools++;
        } else {
          console.log(`   ⚠️  Missing tool: ${tool}`);
        }
      });
      
      if (foundTools === expectedTools.length) {
        console.log(`   ✅ All ${foundTools} video recording tools found`);
        resolve(true);
      } else {
        console.log(`   ❌ Only ${foundTools}/${expectedTools.length} video tools found`);
        resolve(false);
      }
    });

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function checkRequestMonitoringTools() {
  console.log('3️⃣ Checking request monitoring tools...');
  
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    
    const timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error('Tool list timeout'));
    }, 10000);

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      
      const expectedTools = [
        'browser_start_request_monitoring',
        'browser_get_requests',
        'browser_export_requests',
        'browser_clear_requests',
        'browser_request_monitoring_status'
      ];
      
      let foundTools = 0;
      
      expectedTools.forEach(tool => {
        if (stdout.includes(tool)) {
          foundTools++;
        } else {
          console.log(`   ⚠️  Missing tool: ${tool}`);
        }
      });
      
      if (foundTools === expectedTools.length) {
        console.log(`   ✅ All ${foundTools} request monitoring tools found`);
        resolve(true);
      } else {
        console.log(`   ❌ Only ${foundTools}/${expectedTools.length} request monitoring tools found`);
        resolve(false);
      }
    });

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function testBasicTool() {
  console.log('4️⃣ Testing basic tool functionality...');
  
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['cli.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error('Tool test timeout'));
    }, 15000);

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      
      if (stdout.includes('Artifact Storage Paths') || 
          stdout.includes('Video recording is not enabled')) {
        console.log('   ✅ Basic tool functionality works');
        resolve(true);
      } else {
        console.log(`   ❌ Tool test failed: ${stderr}`);
        console.log(`   📝 Stdout: ${stdout.substring(0, 200)}...`);
        resolve(false);
      }
    });

    // Test the reveal paths tool
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'browser_reveal_artifact_paths',
        arguments: {}
      }
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function checkFileStructure() {
  console.log('5️⃣ Checking file structure...');
  
  const fs = require('fs');
  const criticalFiles = [
    'src/context.ts',
    'src/tools/video.ts',
    'src/tools/requests.ts',
    'src/tools/wait.ts',
    'src/requestInterceptor.ts',
    'video-recording-best-practices.md'
  ];
  
  let allFilesExist = true;
  
  criticalFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      console.log(`   ✅ ${file} exists`);
    } else {
      console.log(`   ❌ ${file} missing`);
      allFilesExist = false;
    }
  });
  
  return allFilesExist;
}

async function runValidation() {
  console.log('Starting system validation...\n');
  
  const results = [];
  
  try {
    results.push(await checkMCPServer());
  } catch (error) {
    console.log(`   ❌ MCP Server check failed: ${error.message}`);
    results.push(false);
  }
  
  try {
    results.push(await checkVideoTools());
  } catch (error) {
    console.log(`   ❌ Video tools check failed: ${error.message}`);
    results.push(false);
  }
  
  try {
    results.push(await checkRequestMonitoringTools());
  } catch (error) {
    console.log(`   ❌ Request monitoring tools check failed: ${error.message}`);
    results.push(false);
  }
  
  try {
    results.push(await testBasicTool());
  } catch (error) {
    console.log(`   ❌ Basic tool test failed: ${error.message}`);
    results.push(false);
  }
  
  results.push(checkFileStructure());
  
  const passCount = results.filter(r => r).length;
  const totalCount = results.length;
  
  console.log('\n📊 VALIDATION SUMMARY');
  console.log('====================');
  console.log(`Total Checks: ${totalCount}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${totalCount - passCount}`);
  console.log(`📈 Success Rate: ${((passCount / totalCount) * 100).toFixed(1)}%`);
  
  if (passCount === totalCount) {
    console.log('\n🎉 System validation complete! All checks passed.');
    console.log('✅ Ready to run comprehensive test suite.');
  } else {
    console.log('\n⚠️  Some validation checks failed.');
    console.log('🔧 Fix the issues above before running full tests.');
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('• Run: node test-suite-comprehensive.js (for full testing)');
  console.log('• Run: node test-smart-recording.js (for manual testing)');
  console.log('• Run: node test-viewport-matching.js (for viewport info)');
  
  return passCount === totalCount;
}

// Run validation
runValidation().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});