// Background script for comprehensive console capture
console.log('Console Capture Extension: Background script loaded');

// Track active debug sessions
const debugSessions = new Map();

// Message storage for each tab
const tabConsoleMessages = new Map();

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    attachDebugger(tab.id);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    attachDebugger(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (debugSessions.has(tabId)) {
    try {
      chrome.debugger.detach({ tabId });
    } catch (e) {
      // Ignore errors when detaching
    }
    debugSessions.delete(tabId);
    tabConsoleMessages.delete(tabId);
  }
});

async function attachDebugger(tabId) {
  try {
    // Don't attach to chrome:// pages or if already attached
    if (debugSessions.has(tabId)) {
      return;
    }

    // Attach debugger
    await chrome.debugger.attach({ tabId }, '1.3');
    debugSessions.set(tabId, true);
    
    console.log(`Console Capture Extension: Attached to tab ${tabId}`);
    
    // Enable domains for comprehensive console capture
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Log.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Security.enable');
    
    // Initialize console messages array for this tab
    if (!tabConsoleMessages.has(tabId)) {
      tabConsoleMessages.set(tabId, []);
    }
    
  } catch (error) {
    console.log(`Console Capture Extension: Failed to attach to tab ${tabId}:`, error);
    debugSessions.delete(tabId);
  }
}

// Listen for debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !debugSessions.has(tabId)) return;
  
  let consoleMessage = null;
  
  try {
    switch (method) {
      case 'Runtime.consoleAPICalled':
        consoleMessage = {
          type: params.type || 'log',
          text: params.args?.map(arg => 
            arg.value !== undefined ? String(arg.value) :
            arg.unserializableValue || '[object]'
          ).join(' ') || '',
          location: `runtime:${params.stackTrace?.callFrames?.[0]?.lineNumber || 0}`,
          source: 'js-console',
          timestamp: Date.now()
        };
        break;
        
      case 'Runtime.exceptionThrown':
        const exception = params.exceptionDetails;
        consoleMessage = {
          type: 'error',
          text: exception?.text || exception?.exception?.description || 'Runtime Exception',
          location: `runtime:${exception?.lineNumber || 0}`,
          source: 'js-exception',
          timestamp: Date.now()
        };
        break;
        
      case 'Log.entryAdded':
        const entry = params.entry;
        if (entry && entry.text) {
          consoleMessage = {
            type: entry.level || 'info',
            text: entry.text,
            location: `browser-log:${entry.lineNumber || 0}`,
            source: 'browser-log',
            timestamp: Date.now()
          };
        }
        break;
        
      case 'Network.loadingFailed':
        if (params.errorText) {
          consoleMessage = {
            type: 'error',
            text: `Network Error: ${params.errorText} - ${params.blockedReason || 'Unknown reason'}`,
            location: 'network-layer',
            source: 'network-error',
            timestamp: Date.now()
          };
        }
        break;
        
      case 'Security.securityStateChanged':
        if (params.securityState === 'insecure' && params.explanations) {
          for (const explanation of params.explanations) {
            if (explanation.description && explanation.description.toLowerCase().includes('mixed content')) {
              consoleMessage = {
                type: 'error',
                text: `Security Warning: ${explanation.description}`,
                location: 'security-layer',
                source: 'security-warning',
                timestamp: Date.now()
              };
              break;
            }
          }
        }
        break;
    }
    
    if (consoleMessage) {
      // Store the message
      const messages = tabConsoleMessages.get(tabId) || [];
      messages.push(consoleMessage);
      tabConsoleMessages.set(tabId, messages);
      
      console.log(`Console Capture Extension: Captured message from tab ${tabId}:`, consoleMessage);
      
      // Send to content script for potential file writing
      chrome.tabs.sendMessage(tabId, {
        type: 'CONSOLE_MESSAGE',
        message: consoleMessage
      }).catch(() => {
        // Ignore errors if content script not ready
      });
    }
    
  } catch (error) {
    console.log('Console Capture Extension: Error processing event:', error);
  }
});

// Handle detach events
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (tabId && debugSessions.has(tabId)) {
    console.log(`Console Capture Extension: Detached from tab ${tabId}, reason: ${reason}`);
    debugSessions.delete(tabId);
    tabConsoleMessages.delete(tabId);
  }
});

// API to get console messages for a tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_CONSOLE_MESSAGES') {
    const tabId = request.tabId || sender.tab?.id;
    if (tabId) {
      const messages = tabConsoleMessages.get(tabId) || [];
      sendResponse({ messages });
    } else {
      sendResponse({ messages: [] });
    }
    return true;
  }
});

// Initialize for existing tabs
chrome.tabs.query({}, (tabs) => {
  for (const tab of tabs) {
    if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
      attachDebugger(tab.id);
    }
  }
});