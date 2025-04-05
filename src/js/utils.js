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
    // Generate a predictable hash from the name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to HSL for better readability
    // Use hue 0-360, high saturation, lightness between 45-80%
    const h = Math.abs(hash) % 360;
    const s = 70 + (Math.abs(hash) % 20); // 70-90%
    const l = 60 + (Math.abs(hash) % 15); // 60-75%
    
    // Avoid colors that are too similar to moderator blue or member green
    // Moderator is around 220° (blue), Member is around 120° (green)
    const avoidHues = [
      [100, 140], // green area (for members)
      [200, 240]  // blue area (for moderators)
    ];
    
    let finalHue = h;
    for (const [min, max] of avoidHues) {
      if (h >= min && h <= max) {
        // Shift the hue outside these ranges
        finalHue = (h + 120) % 360;
        break;
      }
    }
    
    return `hsl(${finalHue}, ${s}%, ${l}%)`;
  }