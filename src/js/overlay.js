/**
 * Chat overlay creation and management
 */

// Variables for tracking the overlay state
let updateInterval;
let isOverlayVisible = false;

// Create a toggle button for the chat overlay
function createToggleButton(videoPlayer, toggleCallback) {
  const toggleButton = document.createElement("button");
  toggleButton.id = "toggle-chat-overlay";

  // Use an SVG icon instead of text
  toggleButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;

  toggleButton.title = isOverlayVisible ? "Hide Chat" : "Show Chat"; // Add tooltip
  toggleButton.addEventListener("click", toggleCallback);

  videoPlayer.appendChild(toggleButton);

  return toggleButton;
}

function setupSettingsPanel(settingsIcon, settingsPanel, container) {
  // Toggle settings panel visibility
  settingsIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle("show");
  });

  // Close settings panel when clicking outside
  document.addEventListener("click", (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsIcon) {
      settingsPanel.classList.remove("show");
    }
  });

  // Initialize opacity slider
  const opacitySlider = settingsPanel.querySelector("#opacity-slider");
  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;

  // Set initial value
  opacitySlider.value = savedOpacity;
  container.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;

  // Handle opacity changes
  opacitySlider.addEventListener("input", (e) => {
    e.stopPropagation();
    const value = e.target.value;
    container.style.backgroundColor = `rgba(0, 0, 0, ${value / 100})`;
    localStorage.setItem("chatOverlayOpacity", value);
  });

  // Initialize font size input
  const fontSizeInput = settingsPanel.querySelector("#font-size-input");
  const savedFontSize = localStorage.getItem("chatFontSize") || 14;

  // Set initial value
  fontSizeInput.value = savedFontSize;
  document.documentElement.style.setProperty(
    "--chat-font-size",
    `${savedFontSize}px`
  );

  // Prevent any keydown events from propagating to YouTube player
  fontSizeInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });

  // Prevent click and mousedown events from affecting video playback
  fontSizeInput.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  fontSizeInput.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  // Prevent scroll events from changing volume
  fontSizeInput.addEventListener("wheel", (e) => {
    e.stopPropagation();
  });

  // Handle font size changes
  fontSizeInput.addEventListener("input", (e) => {
    e.stopPropagation();
    let value = parseInt(e.target.value);

    // Enforce min/max constraints
    if (value < 10) value = 10;
    if (value > 24) value = 24;

    document.documentElement.style.setProperty(
      "--chat-font-size",
      `${value}px`
    );
    localStorage.setItem("chatFontSize", value);
  });

  // Stop propagation for spin buttons
  fontSizeInput.addEventListener("focus", (e) => {
    e.stopPropagation();
  });

  // Also prevent events on the entire settings panel
  settingsPanel.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  settingsPanel.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  settingsPanel.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });

  // Avatar toggle code
  const avatarToggle = settingsPanel.querySelector("#avatar-toggle");
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false"; // Default to true

  // Set initial state
  avatarToggle.checked = avatarsEnabled;
  document.documentElement.setAttribute("data-avatars-enabled", avatarsEnabled);

  // Handle toggle changes
  avatarToggle.addEventListener("change", (e) => {
    e.stopPropagation();
    const enabled = e.target.checked;
    localStorage.setItem("chatAvatarsEnabled", enabled);
    document.documentElement.setAttribute("data-avatars-enabled", enabled);

    // Update existing avatars in the DOM
    const avatars = document.querySelectorAll(".chat-message-profile");
    avatars.forEach((avatar) => {
      avatar.style.display = enabled ? "block" : "none";
    });
  });
}

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
    <div class="font-size-control">
      <label>Font Size:</label>
      <input type="number" min="10" max="24" value="14" id="font-size-input" class="font-size-input">
      <span class="font-size-unit">px</span>
    </div>
    <div class="toggle-control">
      <label for="avatar-toggle">Show avatars:</label>
      <input type="checkbox" id="avatar-toggle" checked>
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

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Get saved positions (as percentages)
  const savedLeft = localStorage.getItem("chatOverlayLeft");
  const savedTop = localStorage.getItem("chatOverlayTop");
  const savedWidth = localStorage.getItem("chatOverlayWidth");
  const savedHeight = localStorage.getItem("chatOverlayHeight");

  // Apply saved position or use defaults
  if (savedLeft && savedTop && savedWidth && savedHeight) {
    // Convert percentages to pixels
    const left = (parseFloat(savedLeft) / 100) * viewportWidth;
    const top = (parseFloat(savedTop) / 100) * viewportHeight;
    const width = (parseFloat(savedWidth) / 100) * viewportWidth;
    const height = (parseFloat(savedHeight) / 100) * viewportHeight;

    // Ensure the values are within reasonable bounds
    overlayChatContainer.style.left = `${Math.max(
      0,
      Math.min(left, viewportWidth - 200)
    )}px`;
    overlayChatContainer.style.top = `${Math.max(
      0,
      Math.min(top, viewportHeight - 150)
    )}px`;
    overlayChatContainer.style.width = `${Math.max(
      200,
      Math.min(width, viewportWidth * 0.9)
    )}px`;
    overlayChatContainer.style.height = `${Math.max(
      150,
      Math.min(height, viewportHeight * 0.9)
    )}px`;
  } else {
    // Default position (right side of screen)
    overlayChatContainer.style.right = "5%";
    overlayChatContainer.style.top = "10%";
    overlayChatContainer.style.width = "25%";
    overlayChatContainer.style.height = "80%";
  }

  // Make overlay draggable and resizable
  makeDraggable(overlayChatContainer, dragHandle);
  makeResizable(overlayChatContainer, resizeHandle);

  return {
    container: overlayChatContainer,
    messagesContainer: chatMessagesContainer,
    dragHandle,
    resizeHandle,
    settingsIcon,
    settingsPanel,
  };
}

// Toggle the visibility of the chat overlay
function toggleOverlayChat(
  liveChatFrame,
  overlayChatContainer,
  chatMessagesContainer,
  toggleButton
) {
  isOverlayVisible = !isOverlayVisible;
  overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
  overlayChatContainer.classList.toggle("show", isOverlayVisible);

  // Update the tooltip and icon instead of text content
  toggleButton.title = isOverlayVisible ? "Hide Chat" : "Show Chat";

  // Update icon based on state
  if (isOverlayVisible) {
    toggleButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  } else {
    toggleButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
  }

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
function initializeOverlayState(
  overlayChatContainer,
  liveChatFrame,
  chatMessagesContainer
) {
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
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${
    savedOpacity / 100
  })`;

  // Set font size
  const savedFontSize = localStorage.getItem("chatFontSize") || 14;
  document.documentElement.style.setProperty(
    "--chat-font-size",
    `${savedFontSize}px`
  );

  // Set avatar visibility
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false";
  document.documentElement.setAttribute("data-avatars-enabled", avatarsEnabled);

  // Reset chat tracking
  resetChatTracking();
}

// Improve memory management when cleaning up the overlay
function cleanupOverlay() {
  const existingOverlay = document.getElementById("overlay-chat-container");
  const existingToggleButton = document.getElementById("toggle-chat-overlay");

  if (existingOverlay) {
    const dragHandle = existingOverlay.querySelector("#drag-handle");
    const resizeHandle = existingOverlay.querySelector("#resize-handle");
    const settingsIcon = existingOverlay.querySelector("#settings-icon");

    if (dragHandle) {
      const clone = dragHandle.cloneNode(true);
      dragHandle.parentNode.replaceChild(clone, dragHandle);
    }

    if (resizeHandle) {
      const clone = resizeHandle.cloneNode(true);
      resizeHandle.parentNode.replaceChild(clone, resizeHandle);
    }

    if (settingsIcon) {
      const clone = settingsIcon.cloneNode(true);
      settingsIcon.parentNode.replaceChild(clone, settingsIcon);
    }

    existingOverlay.remove();
  }

  if (existingToggleButton) {
    const clone = existingToggleButton.cloneNode(true);
    existingToggleButton.parentNode.replaceChild(clone, existingToggleButton);
    clone.remove();
  }

  clearInterval(updateInterval);

  // Clean up message tracking to prevent memory leaks with long streams
  resetChatTracking();
}
