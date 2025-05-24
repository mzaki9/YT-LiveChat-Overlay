/**
 * Main entry point for the YouTube Live Chat Overlay extension
 */

// Main variables
let videoPlayer;
let liveChatFrame;
let overlayChatContainer;
let chatMessagesContainer;
let toggleButton;
let keyboardShortcutListener;
let fullscreenChangeListener;
let injectionInterval;
let urlObserver;

// Handle fullscreen changes and button visibility
function handleFullscreenChange() {
  if (!videoPlayer || !overlayChatContainer || !toggleButton) {
    log("Elements not ready during fullscreen change");
    return;
  }

  // Always show the button on livestream pages, whether in fullscreen or not
  const isLivestream = liveChatFrame && 
    (document.title.includes('(live)') || 
     document.title.toLowerCase().includes('stream') || 
     document.querySelector('[badge-label="LIVE"]') ||
     document.querySelector('.ytp-liv-badge'));

  // Show button in fullscreen OR if it's a livestream
  if (document.fullscreenElement || isLivestream) {
    toggleButton.style.display = "block";
    toggleButton.classList.add("show");

    const savedState = localStorage.getItem("youtubeOverlayVisible");
    if (savedState === "true") {
      isOverlayVisible = true;
      overlayChatContainer.style.display = "block";
      overlayChatContainer.classList.add("show");
      
      // Update immediately and set interval
      updateChatMessages(liveChatFrame, chatMessagesContainer);
      clearInterval(updateInterval);
      updateInterval = setInterval(() => {
        updateChatMessages(liveChatFrame, chatMessagesContainer);
      }, 800);
    }
  } else {
    toggleButton.style.display = "none";
    toggleButton.classList.remove("show");
    overlayChatContainer.style.display = "none";
    overlayChatContainer.classList.remove("show");
    clearInterval(updateInterval);
  }
}

// Clean up all event listeners and intervals to prevent memory leaks
function cleanupAllListeners() {
  // Clear intervals
  clearInterval(updateInterval);
  clearInterval(injectionInterval);
  
  // Remove document event listeners
  if (keyboardShortcutListener) {
    document.removeEventListener('keydown', keyboardShortcutListener);
    keyboardShortcutListener = null;
  }
  
  if (fullscreenChangeListener) {
    document.removeEventListener('fullscreenchange', fullscreenChangeListener);
    fullscreenChangeListener = null;
  }
  
  // Disconnect observer
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
  
  // Clean up overlay
  cleanupOverlay();
}

// Main function to initialize the extension
function injectLiveChatOverlay() {
  // Clean up previous instance first
  cleanupAllListeners();
  
  // Find required elements with more robust selectors
  videoPlayer = document.querySelector(".html5-video-player") || 
                document.querySelector(".ytp-embed") || 
                document.querySelector("ytd-player") ||
                document.querySelector("#movie_player") ||
                document.querySelector(".ytd-player");
  
  // Use the findChatFrame utility function
  liveChatFrame = findChatFrame();

  // Log what we found for easier debugging
  log(`Video player found: ${videoPlayer ? "Yes" : "No"}`);
  log(`Live chat frame found: ${liveChatFrame ? "Yes" : "No"}`);

  if (!videoPlayer || !liveChatFrame) {
    // log("Required elements not found, will retry later");
    return false; // Return false to indicate the injection failed
  }

  // Create the chat overlay
  const overlay = createChatOverlay(videoPlayer);
  overlayChatContainer = overlay.container;
  chatMessagesContainer = overlay.messagesContainer;

  // Create toggle button
  toggleButton = createToggleButton(videoPlayer, () => {
    toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton);
  });
  
  // Add keyboard shortcut
  keyboardShortcutListener = (e) => {
    if (e.altKey && e.key.toLowerCase() === 'c' && document.fullscreenElement) {
      toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton);
    }
  };
  document.addEventListener('keydown', keyboardShortcutListener);

  // Listen for fullscreen changes
  fullscreenChangeListener = handleFullscreenChange;
  document.addEventListener("fullscreenchange", fullscreenChangeListener, { passive: true });

  // Initialize overlay state
  initializeOverlayState(overlayChatContainer, liveChatFrame, chatMessagesContainer);
  
  return true; // Return true to indicate success
}

// Set up MutationObserver for URL changes - using a named function for easier cleanup
function setupUrlObserver() {
  const urlObserverCallback = debounce((mutations) => {
    // Check if URL has changed (for YouTube SPA navigation)
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      
      // YouTube SPA navigation - check if we're on a livestream
      if (location.href.includes('/watch') && 
         (location.href.includes('&ab_channel=') || document.title.includes('(live)') || document.title.toLowerCase().includes('stream'))) {
        
        // Try immediately first
        attemptChatDetection();
        
        // Then set up multiple delayed attempts for dynamically loaded content
        setTimeout(attemptChatDetection, 1000);
        setTimeout(attemptChatDetection, 2500);
        setTimeout(attemptChatDetection, 5000);
      }
    } else {
      // Even if URL hasn't changed, check for dynamically loaded chat
      if ((mutations || []).some(mutation => 
          mutation.addedNodes?.length && 
          Array.from(mutation.addedNodes).some(node => 
            node.id === 'chat' || 
            (node.querySelector && (
              node.querySelector('iframe[src*="live_chat"]') ||
              node.querySelector('ytd-live-chat-frame')
            ))
          )
      )) {
        attemptChatDetection();
      }
    }
  }, 250);

  // Create a new observer
  urlObserver = new MutationObserver(urlObserverCallback);
  
  // Start observing with necessary parameters
  let lastUrl = location.href;
  urlObserver.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
}

// Function to attempt chat detection and injection
function attemptChatDetection() {
  liveChatFrame = findChatFrame();
  if (liveChatFrame) {
    log("Chat frame found, attempting to inject overlay");
    injectLiveChatOverlay();
  } else {
    log("No chat frame found during detection attempt");
  }
}

// Run the injection function when the page is loaded
if (document.readyState === "complete") {
  const success = injectLiveChatOverlay();
  if (!success) {
    // Set up a retry mechanism with more frequent attempts
    log("Initial injection failed, setting up retry mechanism");
    injectionInterval = setInterval(() => {
      liveChatFrame = findChatFrame();
      if (liveChatFrame) {
        const success = injectLiveChatOverlay();
        if (success) {
          clearInterval(injectionInterval);
          log("Successfully injected after retry");
        }
      }
    }, 1000); // Check every second
    
    // Cleanup interval after 30 seconds if nothing found to prevent endless checking
    setTimeout(() => {
      if (injectionInterval) {
        clearInterval(injectionInterval);
        log("Chat detection timed out - no livestream chat found");
      }
    }, 30000);
  }
} else {
  window.addEventListener("load", () => {
    const success = injectLiveChatOverlay();
    if (!success) {
      // Retry after load with multiple delayed attempts for dynamic content
      log("Initial injection after load failed, setting up retry");
      setTimeout(attemptChatDetection, 1000);
      setTimeout(attemptChatDetection, 2500);
      setTimeout(attemptChatDetection, 5000);
      
      injectionInterval = setInterval(() => {
        liveChatFrame = findChatFrame();
        if (liveChatFrame) {
          const success = injectLiveChatOverlay();
          if (success) {
            clearInterval(injectionInterval);
            log("Successfully injected after load and retry");
          }
        }
      }, 1000);
      
      // Cleanup interval after 30 seconds
      setTimeout(() => {
        if (injectionInterval) {
          clearInterval(injectionInterval);
          log("Chat detection timed out after page load - no livestream chat found");
        }
      }, 30000);
    }
  });
}

// Set up observer for URL changes
setupUrlObserver();

// Clean up on extension unload
window.addEventListener('unload', cleanupAllListeners);