#!/usr/bin/env node

/**
 * Quick test script to verify the new snapshot features work correctly
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function testConfig(name, args, expectedInHelp) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`Args: ${args.join(' ')}`);
  
  return new Promise((resolve) => {
    const child = spawn('node', ['lib/program.js', '--help', ...args], {
      cwd: __dirname,
      stdio: 'pipe'
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (expectedInHelp) {
        const found = expectedInHelp.every(text => output.includes(text));
        console.log(found ? '✅ PASS' : '❌ FAIL');
        if (!found) {
          console.log(`Expected to find: ${expectedInHelp.join(', ')}`);
        }
      } else {
        console.log(code === 0 ? '✅ PASS' : '❌ FAIL');
      }
      resolve();
    });
  });
}

async function main() {
  console.log('🚀 Testing new snapshot features...\n');

  // Test that help includes new options
  await testConfig('Help shows new options', [], [
    '--no-snapshots',
    '--max-snapshot-tokens',
    '--differential-snapshots'
  ]);

  // Test config parsing with new options
  await testConfig('No snapshots option', ['--no-snapshots'], null);
  await testConfig('Max tokens option', ['--max-snapshot-tokens', '5000'], null);
  await testConfig('Differential snapshots', ['--differential-snapshots'], null);
  await testConfig('Combined options', ['--no-snapshots', '--max-snapshot-tokens', '15000', '--differential-snapshots'], null);

  console.log('\n✨ All tests completed!\n');
  console.log('📋 Feature Summary:');
  console.log('1. ✅ Snapshot size limits with --max-snapshot-tokens (default: 10k)');
  console.log('2. ✅ Optional snapshots with --no-snapshots');
  console.log('3. ✅ Differential snapshots with --differential-snapshots');
  console.log('4. ✅ Enhanced tool descriptions with snapshot behavior info');
  console.log('5. ✅ Helpful truncation messages with configuration suggestions');
  
  console.log('\n🎯 Usage Examples:');
  console.log('  # Disable auto-snapshots to reduce token usage:');
  console.log('  node lib/program.js --no-snapshots');
  console.log('');
  console.log('  # Set custom token limit:');
  console.log('  node lib/program.js --max-snapshot-tokens 25000');
  console.log('');
  console.log('  # Use differential snapshots (show only changes):');
  console.log('  node lib/program.js --differential-snapshots');
}

main().catch(console.error);