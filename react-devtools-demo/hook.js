// React DevTools Hook (Demo Version)
console.log('⚛️ React DevTools Demo Hook loaded');

// Simulate React DevTools hook detection
(function() {
  // Add React detection indicator
  if (typeof window !== 'undefined') {
    // Check if React is present
    const hasReact = !!(
      window.React || 
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
      document.querySelector('[data-reactroot]') ||
      document.querySelector('script[src*="react"]')
    );
    
    if (hasReact) {
      console.log('⚛️ React detected! DevTools would be active');
      
      // Add visual indicator
      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: fixed;
        top: 50px;
        right: 10px;
        background: #61dafb;
        color: #20232a;
        padding: 8px 12px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 2px solid #20232a;
      `;
      indicator.textContent = '⚛️ React DevTools Active';
      indicator.id = 'react-devtools-indicator';
      
      // Add when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(indicator);
        });
      } else {
        document.body.appendChild(indicator);
      }
    } else {
      console.log('ℹ️ No React detected on this page');
    }
  }
})();