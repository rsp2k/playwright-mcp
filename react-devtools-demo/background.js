// React DevTools Background Script (Demo)
console.log('⚛️ React DevTools Demo Background Script loaded');

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('React DevTools Demo installed');
});

// Monitor for React pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Page loaded, checking for React:', tab.url);
  }
});