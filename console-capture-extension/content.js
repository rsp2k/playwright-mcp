// Content script for console capture extension
console.log('Console Capture Extension: Content script loaded');

// Listen for console messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CONSOLE_MESSAGE') {
    const message = request.message;
    
    // Forward to window for Playwright to access
    window.postMessage({
      type: 'PLAYWRIGHT_CONSOLE_CAPTURE',
      consoleMessage: message
    }, '*');
    
    console.log('Console Capture Extension: Forwarded message:', message);
  }
});

// Also capture any window-level console messages that might be missed
const originalConsole = {
  log: window.console.log,
  warn: window.console.warn,
  error: window.console.error,
  info: window.console.info
};

function wrapConsoleMethod(method, level) {
  return function(...args) {
    // Call original method
    originalConsole[method].apply(window.console, args);
    
    // Forward to Playwright
    window.postMessage({
      type: 'PLAYWRIGHT_CONSOLE_CAPTURE',
      consoleMessage: {
        type: level,
        text: args.map(arg => String(arg)).join(' '),
        location: `content-script:${new Error().stack?.split('\n')[2]?.match(/:(\d+):/)?.[1] || 0}`,
        source: 'content-wrapper',
        timestamp: Date.now()
      }
    }, '*');
  };
}

// Wrap console methods
window.console.log = wrapConsoleMethod('log', 'log');
window.console.warn = wrapConsoleMethod('warn', 'warning');
window.console.error = wrapConsoleMethod('error', 'error');
window.console.info = wrapConsoleMethod('info', 'info');