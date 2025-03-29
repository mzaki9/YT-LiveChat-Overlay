/**
 * Chat overlay creation and management
 */

// Variables for tracking the overlay state
let updateInterval;
let isOverlayVisible = false;

// Create the chat overlay and return elements
function createChatOverlay(videoPlayer) {
  // Create overlay container
  const overlayChatContainer = document.createElement("div");
  overlayChatContainer.id = "overlay-chat-container";

  // Create drag handle
  const dragHandle = document.createElement("div");
  dragHandle.id = "drag-handle";
  overlayChatContainer.appendChild(dragHandle);

  // Add settings icon
  const settingsIcon = document.createElement("div");
  settingsIcon.id = "settings-icon";
  settingsIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16">
    <path fill="currentColor" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
  </svg>`;
  dragHandle.appendChild(settingsIcon);

  // Create settings panel
  const settingsPanel = document.createElement("div");
  settingsPanel.id = "settings-panel";
  settingsPanel.innerHTML = `
    <div class="opacity-control">
      <label>Opacity:</label>
      <input type="range" min="10" max="100" value="50" id="opacity-slider">
    </div>
  `;
  overlayChatContainer.appendChild(settingsPanel);

  // Create chat messages container
  const chatMessagesContainer = document.createElement("div");
  chatMessagesContainer.id = "chat-messages-container";
  overlayChatContainer.appendChild(chatMessagesContainer);

  // Create resize handle
  const resizeHandle = document.createElement("div");
  resizeHandle.id = "resize-handle";
  overlayChatContainer.appendChild(resizeHandle);

  // Add overlay to video player
  videoPlayer.appendChild(overlayChatContainer);

  // Initialize settings panel
  setupSettingsPanel(settingsIcon, settingsPanel, overlayChatContainer);

  // Make overlay draggable and resizable
  makeDraggable(overlayChatContainer, dragHandle);
  makeResizable(overlayChatContainer, resizeHandle);

  return {
    container: overlayChatContainer,
    messagesContainer: chatMessagesContainer,
    dragHandle,
    resizeHandle,
    settingsIcon,
    settingsPanel
  };
}

// Toggle the visibility of the chat overlay
function toggleOverlayChat(liveChatFrame, overlayChatContainer, chatMessagesContainer, toggleButton) {
  isOverlayVisible = !isOverlayVisible;
  overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
  overlayChatContainer.classList.toggle("show", isOverlayVisible);
  toggleButton.textContent = isOverlayVisible ? "Hide Chat" : "Show Chat";

  if (isOverlayVisible) {
    // Create a debounced version of updateChatMessages
    const debouncedUpdate = debounce(() => {
      updateChatMessages(liveChatFrame, chatMessagesContainer);
    }, 500);
    
    // Update immediately
    debouncedUpdate();
    
    // Setup interval for updates
    clearInterval(updateInterval);
    updateInterval = setInterval(debouncedUpdate, 800);
  } else {
    clearInterval(updateInterval);
  }

  // Save the current state to local storage
  localStorage.setItem("youtubeOverlayVisible", isOverlayVisible);
}

// Initialize the overlay state based on saved preferences
function initializeOverlayState(overlayChatContainer, liveChatFrame, chatMessagesContainer) {
  const savedState = localStorage.getItem("youtubeOverlayVisible");
  
  if (savedState === "true" && document.fullscreenElement) {
    isOverlayVisible = true;
    overlayChatContainer.style.display = "block";
    overlayChatContainer.classList.add("show");
    
    // Create a debounced update function
    const debouncedUpdate = debounce(() => {
      updateChatMessages(liveChatFrame, chatMessagesContainer);
    }, 500);
    
    // Update immediately
    debouncedUpdate();
    
    // Setup interval
    clearInterval(updateInterval);
    updateInterval = setInterval(debouncedUpdate, 800);
  }

  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
  
  // Reset chat tracking
  resetChatTracking();
}

// Clean up the overlay and stop any intervals
function cleanupOverlay() {
  const existingOverlay = document.getElementById("overlay-chat-container");
  const existingToggleButton = document.getElementById("toggle-chat-overlay");
  
  if (existingOverlay) existingOverlay.remove();
  if (existingToggleButton) existingToggleButton.remove();
  
  clearInterval(updateInterval);
}