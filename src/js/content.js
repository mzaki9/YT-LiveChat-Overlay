/**
 * Main entry point for the YouTube Live Chat Overlay extension
 */

// Main variables
let videoPlayer;
let liveChatFrame;
let chatFrameLoadListener;
let chatFrameObserver;
let pendingFrameRefresh;
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
      
      runAdaptiveUpdateLoop(liveChatFrame, chatMessagesContainer);
    }
  } else {
    toggleButton.style.display = "none";
    toggleButton.classList.remove("show");
    overlayChatContainer.style.display = "none";
    overlayChatContainer.classList.remove("show");
    stopAdaptiveUpdateLoop();
  }
}

// Clean up all event listeners and intervals to prevent memory leaks
function detachLiveChatFrameListeners() {
  if (liveChatFrame && chatFrameLoadListener) {
    liveChatFrame.removeEventListener("load", chatFrameLoadListener);
  }
  chatFrameLoadListener = null;

  if (chatFrameObserver) {
    chatFrameObserver.disconnect();
    chatFrameObserver = null;
  }
}

function scheduleChatFrameRefresh(reason) {
  if (!chatMessagesContainer) {
    return;
  }

  if (!pendingFrameRefresh) {
    pendingFrameRefresh = setTimeout(() => {
      pendingFrameRefresh = null;
      log(`Refreshing overlay after chat frame change (${reason})`);

      while (chatMessagesContainer.firstChild) {
        const child = chatMessagesContainer.firstChild;
        chatMessagesContainer.removeChild(child);
        if (typeof elementPool !== "undefined" && elementPool?.recycle) {
          elementPool.recycle(child);
        }
      }

      resetChatTracking();
      if (typeof resetPerformanceMetrics === "function") {
        resetPerformanceMetrics();
      }

      if (isOverlayVisible && liveChatFrame) {
        stopAdaptiveUpdateLoop();
        runAdaptiveUpdateLoop(liveChatFrame, chatMessagesContainer);
      }
    }, 150);
  }
}

function attachLiveChatFrameListeners(frame) {
  detachLiveChatFrameListeners();

  if (!frame) {
    return;
  }

  chatFrameLoadListener = () => scheduleChatFrameRefresh("iframe load");
  frame.addEventListener("load", chatFrameLoadListener, { passive: true });

  chatFrameObserver = new MutationObserver((mutations) => {
    if (!mutations?.length) {
      return;
    }
    scheduleChatFrameRefresh("iframe src mutation");
  });

  chatFrameObserver.observe(frame, { attributes: true, attributeFilter: ["src"] });

  if (frame.contentDocument?.readyState === "complete") {
    scheduleChatFrameRefresh("iframe ready");
  }
}

function cleanupAllListeners(options = {}) {
  const keepUrlObserver = options.keepUrlObserver === true;
  // Clear intervals
  stopAdaptiveUpdateLoop();
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
  detachLiveChatFrameListeners();

  if (pendingFrameRefresh) {
    clearTimeout(pendingFrameRefresh);
    pendingFrameRefresh = null;
  }

  if (!keepUrlObserver && urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
  
  // Clean up overlay
  cleanupOverlay();
}

// Main function to initialize the extension
function injectLiveChatOverlay() {
  // Clean up previous instance first
  cleanupAllListeners({ keepUrlObserver: true });
  
  // Find required elements with more robust selectors
  videoPlayer = document.querySelector(".html5-video-player") || 
                document.querySelector(".ytp-embed") || 
                document.querySelector("ytd-player") ||
                document.querySelector("#movie_player") ||
                document.querySelector(".ytd-player");
  
  // Use the findChatFrame utility function
  liveChatFrame = findChatFrame();
  attachLiveChatFrameListeners(liveChatFrame);

  // Log what we found for easier debugging
  log(`Video player found: ${videoPlayer ? "Yes" : "No"}`);
  log(`Live chat frame found: ${liveChatFrame ? "Yes" : "No"}`);

  if (!videoPlayer || !liveChatFrame) {
    log(`Required elements not found - Video: ${videoPlayer ? "✓" : "✗"}, Chat: ${liveChatFrame ? "✓" : "✗"}`);
    return false; // Return false to indicate the injection failed
  }

  try {
    // Create the chat overlay
    log("Creating chat overlay...");
    const overlay = createChatOverlay(videoPlayer);
    overlayChatContainer = overlay.container;
    chatMessagesContainer = overlay.messagesContainer;
    log("Chat overlay created successfully");

    // Create toggle button
    log("Creating toggle button...");
    toggleButton = createToggleButton(videoPlayer, () => {
      toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton);
    });
    log("Toggle button created successfully");
    
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
    log("Initializing overlay state...");
    initializeOverlayState(overlayChatContainer, liveChatFrame, chatMessagesContainer);
    log("Overlay state initialized successfully");
    
    // Trigger initial fullscreen check to set up visibility and intervals properly
    log("Triggering initial fullscreen state check...");
    handleFullscreenChange();
    
    log("Chat overlay injection completed successfully!");
    return true; // Return true to indicate success
  } catch (error) {
    log(`Error during injection: ${error.message}`);
    console.error("Full injection error:", error);
    return false;
  }
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
        setTimeout(() => attemptChatDetection(), 1000);
        setTimeout(() => attemptChatDetection(), 2500);
        setTimeout(() => attemptChatDetection(), 5000);
      }
    } else {
      // More efficient mutation checking - only process if we find relevant changes
      const hasRelevantChanges = mutations && mutations.some(mutation => {
        if (!mutation.addedNodes?.length) return false;
        
        return Array.from(mutation.addedNodes).some(node => {
          // Only check element nodes
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          
          return node.id === 'chat' || 
                 node.matches?.('iframe[src*="live_chat"], ytd-live-chat-frame') ||
                 node.querySelector?.('iframe[src*="live_chat"], ytd-live-chat-frame');
        });
      });
      
      if (hasRelevantChanges) {
        attemptChatDetection();
      }
    }
  }, 200); // Reduced debounce time for more responsiveness

  // Create a new observer
  urlObserver = new MutationObserver(urlObserverCallback);
  
  // Start observing with more targeted options
  let lastUrl = location.href;
  urlObserver.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributeFilter: ['id', 'src'] // Only watch for relevant attribute changes
  });
}

// Function to attempt chat detection and injection
function attemptChatDetection() {
  liveChatFrame = findChatFrame();
  if (liveChatFrame) {
    attachLiveChatFrameListeners(liveChatFrame);
    log("Chat frame found, attempting to inject overlay");
    const success = injectLiveChatOverlay();
    if (success) {
      log("Successfully injected overlay after chat detection");
      // Clear any running intervals since we succeeded
      if (injectionInterval) {
        clearInterval(injectionInterval);
        injectionInterval = null;
      }
      return true;
    } else {
      log("Injection failed during chat detection attempt");
      return false;
    }
  } else {
    log("No chat frame found during detection attempt");
    return false;
  }
}

// Run the injection function when the page is loaded
if (document.readyState === "complete") {
  const success = injectLiveChatOverlay();
  if (!success) {
    // Set up a retry mechanism with more frequent attempts
    log("Initial injection failed, setting up retry mechanism");
    injectionInterval = setInterval(() => {
      const success = attemptChatDetection();
      if (success) {
        log("Successfully injected after retry");
        // attemptChatDetection already clears the interval
      }
    }, 1000); // Check every second
    
    // Cleanup interval after 30 seconds if nothing found to prevent endless checking
    setTimeout(() => {        if (injectionInterval) {
          clearInterval(injectionInterval);
          injectionInterval = null;
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
      setTimeout(() => attemptChatDetection(), 1000);
      setTimeout(() => attemptChatDetection(), 2500);
      setTimeout(() => attemptChatDetection(), 5000);
      
      injectionInterval = setInterval(() => {
        const success = attemptChatDetection();
        if (success) {
          log("Successfully injected after load and retry");
          // attemptChatDetection already clears the interval
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