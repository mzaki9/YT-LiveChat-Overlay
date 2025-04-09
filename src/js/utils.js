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

  function getColorFromName(name) {
    let hash = 0;
    const len = Math.min(name.length, 8);
    for (let i = 0; i < len; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) & 0xFFFFFFFF;
    }
    
    const avoidRanges = [
      [100, 140], // green area (for members)
      [200, 240]  // blue area (for moderators)
    ];
    
    const h = (hash >>> 0) % 360;
    const s = 70 + ((hash >>> 0) % 20); 
    const l = 60 + ((hash >>> 0) % 15);
    
    let finalHue = h;
    for (const [min, max] of avoidRanges) {
      if (h >= min && h <= max) {
        finalHue = (h + 120) % 360;
        break;
      }
    }
    
    // Use template literal only once at the end
    return `hsl(${finalHue}, ${s}%, ${l}%)`;
  }