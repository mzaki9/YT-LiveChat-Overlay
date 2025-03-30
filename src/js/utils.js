/**
 * Utility functions for YouTube Live Chat Overlay
 */

// Debounce function to limit the rate of function execution
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
 
  function log(message) {
    console.log(`[YT Chat Overlay] ${message}`);
  }

  function findChatFrame() {
    return document.querySelector("#chat-frame") ||
      document.querySelector("iframe#chatframe") || 
      document.querySelector("iframe[src*='live_chat']") ||
      document.querySelector("iframe[src*='www.youtube.com/live_chat']");
  }