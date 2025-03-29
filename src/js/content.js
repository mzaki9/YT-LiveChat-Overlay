/**
 * Main entry point for the YouTube Live Chat Overlay extension
 */

// Main variables
let videoPlayer, liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton;

// Main function to initialize the extension
function injectLiveChatOverlay() {
  // Find required elements
  videoPlayer = document.querySelector(".html5-video-player");
  liveChatFrame =
    document.querySelector("#chat-frame") ||
    document.querySelector("iframe#chatframe");

  if (!videoPlayer || !liveChatFrame) {
    return;
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
}

// Handle fullscreen changes
function handleFullscreenChange() {
  if (document.fullscreenElement) {
    toggleButton.style.display = "block";
    toggleButton.classList.add("show");

    const savedState = localStorage.getItem("youtubeOverlayVisible");
    if (savedState === "true") {
      isOverlayVisible = true;
      overlayChatContainer.style.display = "block";
      overlayChatContainer.classList.add("show");
      
      // Create a debounced update function
      const debouncedUpdate = debounce(() => {
        updateChatMessages(liveChatFrame, chatMessagesContainer);
      }, 500);
      
      // Update immediately and set interval
      debouncedUpdate();
      clearInterval(updateInterval);
      updateInterval = setInterval(debouncedUpdate, 800);
    }
  } else {
    toggleButton.style.display = "none";
    toggleButton.classList.remove("show");
    overlayChatContainer.style.display = "none";
    overlayChatContainer.classList.remove("show");
    clearInterval(updateInterval);
  }
}

// Run the injection function when the page is loaded
if (document.readyState === "complete") {
  injectLiveChatOverlay();
} else {
  window.addEventListener("load", injectLiveChatOverlay);
}

// Listen for YouTube SPA navigation
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    injectLiveChatOverlay();
  }
});
urlObserver.observe(document, { subtree: true, childList: true });

// Additional check for dynamic content loading
const dynamicObserver = new MutationObserver((mutations) => {
  if (
    document.querySelector(".html5-video-player") &&
    (document.querySelector("#chat-frame") ||
      document.querySelector("iframe#chatframe"))
  ) {
    injectLiveChatOverlay();
    dynamicObserver.disconnect();
  }
});
dynamicObserver.observe(document.body, { childList: true, subtree: true });