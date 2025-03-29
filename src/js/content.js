/**
 * Main entry point for the YouTube Live Chat Overlay extension
 */

// Main variables
let videoPlayer, liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton;

function log(message) {
  console.log(`[YT Chat Overlay] ${message}`);
}

// Handle fullscreen changes
function handleFullscreenChange() {
  if (!videoPlayer || !overlayChatContainer || !toggleButton) {
    log("Elements not ready during fullscreen change");
    return;
  }

  if (document.fullscreenElement) {
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

// Main function to initialize the extension
function injectLiveChatOverlay() {
  // Find required elements
  videoPlayer = document.querySelector(".html5-video-player");
  
  // Use the findChatFrame utility function
  liveChatFrame = findChatFrame();

  if (!videoPlayer || !liveChatFrame) {
    log("Required elements not found, will retry later");
    return false; // Return false to indicate the injection failed
  }

  // Clean up existing overlay
  cleanupOverlay();

  // Create the chat overlay
  const overlay = createChatOverlay(videoPlayer);
  overlayChatContainer = overlay.container;
  chatMessagesContainer = overlay.messagesContainer;

  // Create toggle button
  toggleButton = createToggleButton(videoPlayer, () => {
    toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton);
  });
  
  // Add keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'c' && document.fullscreenElement) {
      toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton);
    }
  });

  // Listen for fullscreen changes
  document.addEventListener("fullscreenchange", handleFullscreenChange, { passive: true });

  // Initialize overlay state
  initializeOverlayState(overlayChatContainer, liveChatFrame, chatMessagesContainer);
  
  return true; // Return true to indicate success
}

// Run the injection function when the page is loaded
if (document.readyState === "complete") {
  const success = injectLiveChatOverlay();
  if (!success) {
    // Set up a retry mechanism
    const injectionInterval = setInterval(() => {
      liveChatFrame = findChatFrame();
      if (liveChatFrame) {
        const success = injectLiveChatOverlay();
        if (success) {
          clearInterval(injectionInterval);
          log("Successfully injected after retry");
        }
      }
    }, 2000); // Check every 2 seconds
  }
} else {
  window.addEventListener("load", () => {
    const success = injectLiveChatOverlay();
    if (!success) {
      // Retry after load
      const injectionInterval = setInterval(() => {
        liveChatFrame = findChatFrame();
        if (liveChatFrame) {
          const success = injectLiveChatOverlay();
          if (success) {
            clearInterval(injectionInterval);
            log("Successfully injected after load and retry");
          }
        }
      }, 2000);
    }
  });
}

// More reliable chat iframe detection for SPAs
const urlObserver = new MutationObserver((mutations) => {
  // Check if URL has changed (for YouTube SPA navigation)
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    log("URL changed, looking for chat frame");
    // Allow some time for YouTube to load the new page
    setTimeout(() => {
      liveChatFrame = findChatFrame();
      if (liveChatFrame) {
        injectLiveChatOverlay();
      }
    }, 1500);
  }
  
  // Also look for chat frames that might have been dynamically added
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.addedNodes.length) {
      // Check if any of the added nodes or their children could be a chat frame
      const chatFrame = findChatFrame();
      if (chatFrame && chatFrame !== liveChatFrame) {
        log("Chat frame dynamically added");
        liveChatFrame = chatFrame;
        injectLiveChatOverlay();
        break;
      }
    }
  }
});

// Start observing with necessary parameters
let lastUrl = location.href;
urlObserver.observe(document.body, { 
  childList: true, 
  subtree: true 
});