// React DevTools Panel (Demo)
console.log('⚛️ React DevTools Demo - DevTools panel loaded');

// Create the React panel in DevTools
chrome.devtools.panels.create(
  'React',
  'icon16.png',
  'panel.html',
  function(panel) {
    console.log('React DevTools panel created');
  }
);