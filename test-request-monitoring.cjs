#!/usr/bin/env node

/**
 * Comprehensive test script for the new request monitoring system
 * Tests all the new tools and their integration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testRequestMonitoring() {
  console.log('🕵️ Testing Request Monitoring System');
  console.log('=====================================');
  
  // Create a test HTML page with various types of requests
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Request Monitoring Test</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; border: 1px solid #f5c6cb; }
  </style>
</head>
<body>
  <h1>Request Monitoring Test Page</h1>
  <p>This page generates various HTTP requests for testing the monitoring system.</p>
  
  <div id="status"></div>
  <button onclick="makeRequests()">Generate Test Requests</button>
  <button onclick="makeFailedRequests()">Generate Failed Requests</button>
  <button onclick="makeSlowRequests()">Generate Slow Requests</button>
  
  <script>
    const statusDiv = document.getElementById('status');
    
    function addStatus(message, type = 'success') {
      const div = document.createElement('div');
      div.className = \`status \${type}\`;
      div.textContent = message;
      statusDiv.appendChild(div);
    }
    
    async function makeRequests() {
      addStatus('Starting request generation...');
      
      try {
        // JSON API request
        const response1 = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        const data1 = await response1.json();
        addStatus(\`✅ GET JSON: \${response1.status} - Post title: \${data1.title}\`);
        
        // POST request
        const response2 = await fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Test Post', body: 'Test content', userId: 1 })
        });
        const data2 = await response2.json();
        addStatus(\`✅ POST JSON: \${response2.status} - Created post ID: \${data2.id}\`);
        
        // Image request
        const img = new Image();
        img.onload = () => addStatus('✅ Image loaded successfully');
        img.onerror = () => addStatus('❌ Image failed to load', 'error');
        img.src = 'https://httpbin.org/image/jpeg';
        
        // Multiple parallel requests
        const promises = [];
        for (let i = 1; i <= 3; i++) {
          promises.push(
            fetch(\`https://jsonplaceholder.typicode.com/posts/\${i}\`)
              .then(r => r.json())
              .then(data => addStatus(\`✅ Parallel request \${i}: \${data.title.substring(0, 30)}...\`))
          );
        }
        await Promise.all(promises);
        
      } catch (error) {
        addStatus(\`❌ Request failed: \${error.message}\`, 'error');
      }
    }
    
    async function makeFailedRequests() {
      addStatus('Generating failed requests...');
      
      try {
        // 404 error
        await fetch('https://jsonplaceholder.typicode.com/nonexistent');
      } catch (error) {
        addStatus('❌ 404 request completed');
      }
      
      try {
        // Invalid domain
        await fetch('https://invalid-domain-12345.com/api');
      } catch (error) {
        addStatus('❌ Invalid domain request failed (expected)');
      }
      
      try {
        // CORS error
        await fetch('https://httpbin.org/status/500');
      } catch (error) {
        addStatus('❌ 500 error request completed');
      }
    }
    
    async function makeSlowRequests() {
      addStatus('Generating slow requests...');
      
      try {
        // Delay request
        const start = Date.now();
        await fetch('https://httpbin.org/delay/2');
        const duration = Date.now() - start;
        addStatus(\`⏱️  Slow request completed in \${duration}ms\`);
        
        // Another slow request
        const start2 = Date.now();
        await fetch('https://httpbin.org/delay/3');
        const duration2 = Date.now() - start2;
        addStatus(\`⏱️  Very slow request completed in \${duration2}ms\`);
        
      } catch (error) {
        addStatus(\`❌ Slow request failed: \${error.message}\`, 'error');
      }
    }
    
    // Auto-generate some initial requests
    setTimeout(() => {
      addStatus('Auto-generating initial requests...');
      makeRequests();
    }, 1000);
  </script>
</body>
</html>
  `;
  
  const testFile = path.join(__dirname, 'test-request-monitoring.html');
  fs.writeFileSync(testFile, testHtml);
  
  console.log('✅ Created comprehensive test page');
  console.log(`📄 Test page: file://${testFile}`);
  console.log('');
  
  console.log('🧪 Manual Testing Instructions:');
  console.log('================================');
  console.log('');
  
  console.log('1. **Start MCP Server:**');
  console.log('   npm run build && node lib/index.js');
  console.log('');
  
  console.log('2. **Start Request Monitoring:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_start_request_monitoring",');
  console.log('     "parameters": {');
  console.log('       "captureBody": true,');
  console.log('       "maxBodySize": 1048576,');
  console.log('       "autoSave": false');
  console.log('     }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('3. **Navigate to Test Page:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_navigate",');
  console.log(`     "parameters": { "url": "file://${testFile}" }`);
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('4. **Interact with Page:**');
  console.log('   - Click "Generate Test Requests" button');
  console.log('   - Click "Generate Failed Requests" button');
  console.log('   - Click "Generate Slow Requests" button');
  console.log('   - Wait for requests to complete');
  console.log('');
  
  console.log('5. **Test Analysis Tools:**');
  console.log('');
  
  console.log('   **Check Status:**');
  console.log('   ```json');
  console.log('   { "tool": "browser_request_monitoring_status" }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Get All Requests:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_get_requests",');
  console.log('     "parameters": { "format": "detailed", "limit": 50 }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Get Failed Requests:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_get_requests",');
  console.log('     "parameters": { "filter": "failed", "format": "detailed" }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Get Slow Requests:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_get_requests",');
  console.log('     "parameters": { "filter": "slow", "slowThreshold": 1500 }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Get Statistics:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_get_requests",');
  console.log('     "parameters": { "format": "stats" }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('6. **Test Export Features:**');
  console.log('');
  
  console.log('   **Export to JSON:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_export_requests",');
  console.log('     "parameters": { "format": "json", "includeBody": true }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Export to HAR:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_export_requests",');
  console.log('     "parameters": { "format": "har" }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('   **Export Summary Report:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_export_requests",');
  console.log('     "parameters": { "format": "summary" }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('7. **Test Enhanced Network Tool:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_network_requests",');
  console.log('     "parameters": { "detailed": true }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('8. **Test Filtering:**');
  console.log('   ```json');
  console.log('   {');
  console.log('     "tool": "browser_get_requests",');
  console.log('     "parameters": { "domain": "jsonplaceholder.typicode.com" }');
  console.log('   }');
  console.log('   ```');
  console.log('');
  
  console.log('9. **Check File Paths:**');
  console.log('   ```json');
  console.log('   { "tool": "browser_get_artifact_paths" }');
  console.log('   ```');
  console.log('');
  
  console.log('10. **Clean Up:**');
  console.log('    ```json');
  console.log('    { "tool": "browser_clear_requests" }');
  console.log('    ```');
  console.log('');
  
  console.log('🎯 Expected Results:');
  console.log('===================');
  console.log('');
  console.log('✅ **Should work:**');
  console.log('- Request monitoring captures all HTTP traffic');
  console.log('- Different request types are properly categorized');
  console.log('- Failed requests are identified and logged');
  console.log('- Slow requests are flagged with timing info');
  console.log('- Request/response bodies are captured when enabled');
  console.log('- Export formats (JSON, HAR, CSV, Summary) work correctly');
  console.log('- Statistics show accurate counts and averages');
  console.log('- Filtering by domain, method, status works');
  console.log('- Enhanced network tool shows rich data');
  console.log('');
  
  console.log('📊 **Key Metrics to Verify:**');
  console.log('- Total requests > 10 (from page interactions)');
  console.log('- Some requests > 1000ms (slow requests)');
  console.log('- Some 4xx/5xx status codes (failed requests)');
  console.log('- JSON response bodies properly parsed');
  console.log('- Request headers include User-Agent, etc.');
  console.log('- Response headers include Content-Type');
  console.log('');
  
  console.log('🔍 **Security Testing Use Case:**');
  console.log('This system now enables:');
  console.log('- Complete API traffic analysis');
  console.log('- Authentication token capture');
  console.log('- CORS and security header analysis');
  console.log('- Performance bottleneck identification');
  console.log('- Failed request debugging');
  console.log('- Export to security tools (HAR format)');
  
  return testFile;
}

testRequestMonitoring().catch(console.error);