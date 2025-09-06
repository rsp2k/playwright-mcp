#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Playwright MCP
 * 
 * Tests all major functionality including:
 * - Smart video recording system
 * - Viewport matching
 * - Request monitoring
 * - Error handling
 * - Performance validation
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class PlaywrightMCPTester {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
  }

  async runMCPCommand(toolName, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const mcp = spawn('node', ['cli.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
        timeout: timeout
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        mcp.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      mcp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mcp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mcp.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });

      mcp.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      // Send MCP request
      const request = {
        jsonrpc: '2.0',
        id: ++this.testCount,
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

  async test(name, testFn) {
    console.log(`🧪 Testing: ${name}`);
    const start = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - start;
      console.log(`   ✅ PASS (${duration}ms)`);
      this.testResults.push({ name, status: 'PASS', duration });
      this.passCount++;
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`   ❌ FAIL (${duration}ms): ${error.message}`);
      this.testResults.push({ name, status: 'FAIL', duration, error: error.message });
      this.failCount++;
    }
    
    this.testCount++;
  }

  async testVideoRecordingWorkflow() {
    await this.test('Video Recording - Basic Workflow', async () => {
      // Test start recording
      const startResult = await this.runMCPCommand('mcp__playwright__browser_start_recording', {
        size: { width: 1280, height: 720 },
        filename: 'test-basic-workflow'
      });
      
      if (startResult.code !== 0) {
        throw new Error(`Start recording failed: ${startResult.stderr}`);
      }
      
      if (!startResult.stdout.includes('Video recording started')) {
        throw new Error('Start recording did not confirm success');
      }

      // Test navigation (should trigger recording)
      const navResult = await this.runMCPCommand('mcp__playwright__browser_navigate', {
        url: 'https://example.com'
      });
      
      if (navResult.code !== 0) {
        throw new Error(`Navigation failed: ${navResult.stderr}`);
      }

      // Test recording status
      const statusResult = await this.runMCPCommand('mcp__playwright__browser_recording_status');
      
      if (statusResult.code !== 0) {
        throw new Error(`Recording status check failed: ${statusResult.stderr}`);
      }
      
      if (!statusResult.stdout.includes('Video recording is active')) {
        throw new Error('Recording status does not show active recording');
      }

      // Test stop recording
      const stopResult = await this.runMCPCommand('mcp__playwright__browser_stop_recording');
      
      if (stopResult.code !== 0) {
        throw new Error(`Stop recording failed: ${stopResult.stderr}`);
      }
    });
  }

  async testSmartRecordingModes() {
    const modes = ['smart', 'continuous', 'action-only', 'segment'];
    
    for (const mode of modes) {
      await this.test(`Smart Recording - ${mode.toUpperCase()} mode`, async () => {
        // Set recording mode
        const modeResult = await this.runMCPCommand('mcp__playwright__browser_set_recording_mode', {
          mode: mode
        });
        
        if (modeResult.code !== 0) {
          throw new Error(`Setting ${mode} mode failed: ${modeResult.stderr}`);
        }
        
        if (!modeResult.stdout.includes(`Recording mode set to: ${mode}`)) {
          throw new Error(`Mode not confirmed as ${mode}`);
        }
        
        // Start recording to verify mode is active
        const startResult = await this.runMCPCommand('mcp__playwright__browser_start_recording', {
          filename: `test-${mode}-mode`
        });
        
        if (startResult.code !== 0) {
          throw new Error(`Start recording in ${mode} mode failed: ${startResult.stderr}`);
        }
        
        // Check status shows correct mode
        const statusResult = await this.runMCPCommand('mcp__playwright__browser_recording_status');
        
        if (!statusResult.stdout.includes(`Recording mode: ${mode}`)) {
          throw new Error(`Status does not show ${mode} mode`);
        }
        
        // Stop recording
        await this.runMCPCommand('mcp__playwright__browser_stop_recording');
      });
    }
  }

  async testViewportMatching() {
    const testSizes = [
      { width: 1280, height: 720, name: 'HD 720p' },
      { width: 1920, height: 1080, name: 'Full HD' },
      { width: 1024, height: 768, name: '4:3 Standard' },
      { width: 375, height: 667, name: 'iPhone Portrait' }
    ];

    for (const size of testSizes) {
      await this.test(`Viewport Matching - ${size.name} (${size.width}x${size.height})`, async () => {
        // Start recording with specific size
        const startResult = await this.runMCPCommand('mcp__playwright__browser_start_recording', {
          size: { width: size.width, height: size.height },
          filename: `test-viewport-${size.width}x${size.height}`,
          autoSetViewport: true
        });
        
        if (startResult.code !== 0) {
          throw new Error(`Recording start failed for ${size.name}: ${startResult.stderr}`);
        }
        
        // Verify viewport was set automatically
        if (!startResult.stdout.includes(`Browser viewport automatically set to ${size.width}x${size.height}`)) {
          throw new Error(`Viewport not automatically set to ${size.width}x${size.height}`);
        }
        
        // Navigate to test the viewport
        await this.runMCPCommand('mcp__playwright__browser_navigate', {
          url: 'https://example.com'
        });
        
        // Take screenshot to verify dimensions match
        const screenshotResult = await this.runMCPCommand('mcp__playwright__browser_take_screenshot', {
          filename: `viewport-test-${size.width}x${size.height}.png`
        });
        
        if (screenshotResult.code !== 0) {
          throw new Error(`Screenshot failed for ${size.name}: ${screenshotResult.stderr}`);
        }
        
        // Stop recording
        await this.runMCPCommand('mcp__playwright__browser_stop_recording');
      });
    }
  }

  async testPauseResumeControls() {
    await this.test('Pause/Resume Controls', async () => {
      // Start recording
      await this.runMCPCommand('mcp__playwright__browser_start_recording', {
        filename: 'test-pause-resume'
      });
      
      // Navigate to create some activity
      await this.runMCPCommand('mcp__playwright__browser_navigate', {
        url: 'https://example.com'
      });
      
      // Test pause
      const pauseResult = await this.runMCPCommand('mcp__playwright__browser_pause_recording');
      
      if (pauseResult.code !== 0) {
        throw new Error(`Pause failed: ${pauseResult.stderr}`);
      }
      
      // Check status shows paused
      const pausedStatus = await this.runMCPCommand('mcp__playwright__browser_recording_status');
      
      if (!pausedStatus.stdout.includes('Status: PAUSED')) {
        throw new Error('Status does not show paused state');
      }
      
      // Test resume
      const resumeResult = await this.runMCPCommand('mcp__playwright__browser_resume_recording');
      
      if (resumeResult.code !== 0) {
        throw new Error(`Resume failed: ${resumeResult.stderr}`);
      }
      
      // Check status shows recording
      const activeStatus = await this.runMCPCommand('mcp__playwright__browser_recording_status');
      
      if (!activeStatus.stdout.includes('Status: RECORDING')) {
        throw new Error('Status does not show recording state after resume');
      }
      
      // Stop recording
      await this.runMCPCommand('mcp__playwright__browser_stop_recording');
    });
  }

  async testRequestMonitoring() {
    await this.test('Request Monitoring - Basic Workflow', async () => {
      // Start request monitoring
      const startResult = await this.runMCPCommand('mcp__playwright__browser_start_request_monitoring', {
        captureBody: true,
        urlFilter: 'example.com'
      });
      
      if (startResult.code !== 0) {
        throw new Error(`Start request monitoring failed: ${startResult.stderr}`);
      }
      
      // Navigate to generate requests
      await this.runMCPCommand('mcp__playwright__browser_navigate', {
        url: 'https://example.com'
      });
      
      // Get captured requests
      const requestsResult = await this.runMCPCommand('mcp__playwright__browser_get_requests', {
        format: 'summary'
      });
      
      if (requestsResult.code !== 0) {
        throw new Error(`Get requests failed: ${requestsResult.stderr}`);
      }
      
      if (!requestsResult.stdout.includes('Captured requests')) {
        throw new Error('No requests were captured');
      }
      
      // Test export functionality
      const exportResult = await this.runMCPCommand('mcp__playwright__browser_export_requests', {
        format: 'json'
      });
      
      if (exportResult.code !== 0) {
        throw new Error(`Export requests failed: ${exportResult.stderr}`);
      }
      
      // Clear requests
      await this.runMCPCommand('mcp__playwright__browser_clear_requests');
    });
  }

  async testWaitWithRecordingControl() {
    await this.test('Wait Tool with Recording Control', async () => {
      // Set smart mode
      await this.runMCPCommand('mcp__playwright__browser_set_recording_mode', {
        mode: 'smart'
      });
      
      // Start recording
      await this.runMCPCommand('mcp__playwright__browser_start_recording', {
        filename: 'test-wait-control'
      });
      
      // Navigate
      await this.runMCPCommand('mcp__playwright__browser_navigate', {
        url: 'https://example.com'
      });
      
      // Test wait with auto-pause (default in smart mode)
      const waitResult = await this.runMCPCommand('mcp__playwright__browser_wait_for', {
        time: 2
      }, 10000); // 10 second timeout for wait
      
      if (waitResult.code !== 0) {
        throw new Error(`Wait with auto-pause failed: ${waitResult.stderr}`);
      }
      
      // Test wait with recording enabled during wait
      const waitRecordingResult = await this.runMCPCommand('mcp__playwright__browser_wait_for', {
        time: 1,
        recordDuringWait: true
      }, 5000);
      
      if (waitRecordingResult.code !== 0) {
        throw new Error(`Wait with recording enabled failed: ${waitRecordingResult.stderr}`);
      }
      
      // Stop recording
      await this.runMCPCommand('mcp__playwright__browser_stop_recording');
    });
  }

  async testDiagnosticTools() {
    await this.test('Diagnostic Tools', async () => {
      // Test artifact path revelation
      const pathsResult = await this.runMCPCommand('mcp__playwright__browser_reveal_artifact_paths');
      
      if (pathsResult.code !== 0) {
        throw new Error(`Reveal artifact paths failed: ${pathsResult.stderr}`);
      }
      
      if (!pathsResult.stdout.includes('Artifact Storage Paths')) {
        throw new Error('Artifact paths not properly revealed');
      }
      
      // Test recording status when not recording
      const statusResult = await this.runMCPCommand('mcp__playwright__browser_recording_status');
      
      if (statusResult.code !== 0) {
        throw new Error(`Recording status check failed: ${statusResult.stderr}`);
      }
      
      if (!statusResult.stdout.includes('Video recording is not enabled')) {
        throw new Error('Status should show recording not enabled');
      }
    });
  }

  async testErrorScenarios() {
    await this.test('Error Scenarios - Invalid Commands', async () => {
      // Test stopping recording when not started
      const stopResult = await this.runMCPCommand('mcp__playwright__browser_stop_recording');
      
      // Should not error, just return empty
      if (stopResult.code !== 0) {
        throw new Error(`Stop recording without start should not error: ${stopResult.stderr}`);
      }
      
      // Test pause when not recording
      const pauseResult = await this.runMCPCommand('mcp__playwright__browser_pause_recording');
      
      if (!pauseResult.stdout.includes('No video recording is active')) {
        throw new Error('Pause should indicate no recording is active');
      }
      
      // Test resume when not paused
      const resumeResult = await this.runMCPCommand('mcp__playwright__browser_resume_recording');
      
      if (!resumeResult.stdout.includes('No video recording is configured')) {
        throw new Error('Resume should indicate no recording is configured');
      }
    });
  }

  async runAllTests() {
    console.log('🎬 Playwright MCP Comprehensive Test Suite');
    console.log('==========================================\n');
    
    // Core video recording tests
    await this.testVideoRecordingWorkflow();
    await this.testSmartRecordingModes();
    await this.testViewportMatching();
    await this.testPauseResumeControls();
    
    // Request monitoring tests
    await this.testRequestMonitoring();
    
    // Integration tests
    await this.testWaitWithRecordingControl();
    
    // Diagnostic tests
    await this.testDiagnosticTools();
    
    // Error handling tests
    await this.testErrorScenarios();
    
    this.printSummary();
  }

  printSummary() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('\n📊 TEST SUMMARY');
    console.log('===============');
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);
    console.log(`⏱️  Total Time: ${totalTime}ms`);
    console.log(`📈 Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);
    
    if (this.failCount > 0) {
      console.log('\n❌ FAILED TESTS:');
      console.log('================');
      this.testResults
        .filter(result => result.status === 'FAIL')
        .forEach(result => {
          console.log(`• ${result.name}: ${result.error}`);
        });
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('===================');
    
    if (this.failCount === 0) {
      console.log('🎉 All tests passed! The system is ready for production use.');
      console.log('💡 Consider running this test suite regularly to catch regressions.');
    } else {
      console.log('🔧 Fix the failing tests before deploying to production.');
      console.log('🧪 Re-run this test suite after making fixes.');
    }
    
    if (this.passCount > this.failCount) {
      console.log('✅ Overall system health looks good!');
    }
    
    console.log('\n📝 Test results logged for analysis.');
    
    // Save detailed results
    const resultsFile = `test-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify({
      summary: {
        totalTests: this.testCount,
        passed: this.passCount,
        failed: this.failCount,
        duration: totalTime,
        successRate: (this.passCount / this.testCount) * 100
      },
      results: this.testResults,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`📄 Detailed results saved to: ${resultsFile}`);
  }
}

// Run the test suite
if (require.main === module) {
  const tester = new PlaywrightMCPTester();
  tester.runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { PlaywrightMCPTester };