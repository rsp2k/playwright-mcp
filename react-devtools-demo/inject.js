// React DevTools Hook Injector
console.log('🔧 React DevTools Demo - Injecting React detection hook');

// Inject the React DevTools hook
const script = document.createElement('script');
script.src = chrome.runtime.getURL('hook.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);