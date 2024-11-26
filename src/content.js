let updateInterval;
let isOverlayVisible = false;
let videoPlayer, liveChatFrame, overlayChatContainer, chatMessagesContainer;

function injectLiveChatOverlay() {
  videoPlayer = document.querySelector(".html5-video-player");
  liveChatFrame =
    document.querySelector("#chat-frame") ||
    document.querySelector("iframe#chatframe");

  if (!videoPlayer || !liveChatFrame) {
    return;
  }

  // Inject CSS
  const linkElement = document.createElement("link");
  linkElement.rel = "stylesheet";
  linkElement.href = chrome.runtime.getURL("styles.css");
  document.head.appendChild(linkElement);

  // Create overlay elements
  overlayChatContainer = document.createElement("div");
  overlayChatContainer.id = "overlay-chat-container";

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

  // Add settings panel
  const settingsPanel = document.createElement("div");
  settingsPanel.id = "settings-panel";
  settingsPanel.innerHTML = `
    <div class="opacity-control">
      <label>Opacity:</label>
      <input type="range" min="10" max="100" value="50" id="opacity-slider">
    </div>
  `;
  overlayChatContainer.appendChild(settingsPanel);

  // Initialize opacity after adding the panel to DOM
  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  const opacityControl = settingsPanel.querySelector(".opacity-control");
  const opacitySlider = opacityControl.querySelector("#opacity-slider");

  if (opacitySlider) {
    opacitySlider.value = savedOpacity;
    overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
    overlayChatContainer.style.transition = "background-color 0.1s ease"; // Reduced transition time

    opacitySlider.addEventListener("input", handleOpacityChange);
  }

  // Handle settings interaction
  let isSettingsPanelVisible = false;
  settingsIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    isSettingsPanelVisible = !isSettingsPanelVisible;
    settingsPanel.classList.toggle("show", isSettingsPanelVisible);
  });

  // Close settings panel when clicking outside
  document.addEventListener("click", (e) => {
    if (!settingsPanel.contains(e.target) && !settingsIcon.contains(e.target)) {
      isSettingsPanelVisible = false;
      settingsPanel.classList.remove("show");
    }
  });

  chatMessagesContainer = document.createElement("div");
  chatMessagesContainer.id = "chat-messages-container";
  overlayChatContainer.appendChild(chatMessagesContainer);

  const resizeHandle = document.createElement("div");
  resizeHandle.id = "resize-handle";
  overlayChatContainer.appendChild(resizeHandle);

  videoPlayer.appendChild(overlayChatContainer);

  // Create toggle button
  const toggleButton = document.createElement("button");
  toggleButton.id = "toggle-chat-overlay";
  toggleButton.textContent = "Toggle Chat Overlay";
  videoPlayer.appendChild(toggleButton);

  // Function to extract and display chat messages
  let lastMessageId = null; // Track the last processed message
  const MAX_MESSAGES = 100; // Maximum number of messages to display

  function updateChatMessages() {
    const chatDocument = liveChatFrame.contentDocument;
    if (!chatDocument) return;

    const chatItems = chatDocument.querySelectorAll(
      "yt-live-chat-text-message-renderer"
    );
    const fragment = document.createDocumentFragment();
    let newLastMessageId = lastMessageId;

    chatItems.forEach((item) => {
      const messageId = item.getAttribute('id');
      if (messageId && messageId !== lastMessageId) {
        const authorName = item.querySelector("#author-name")?.textContent || "Unknown";
        const authorPhoto = item.querySelector("#img")?.src || "";
        const badgeElement = item.querySelector(
          "yt-live-chat-author-badge-renderer #img"
        );
        const messageElement = item.querySelector("#message")?.cloneNode(true) || document.createTextNode("");

        const authorClass = getChatMessageAuthorClass(item);

        const chatMessageElement = createChatMessageElement(
          authorName,
          authorPhoto,
          badgeElement?.src,
          messageElement,
          authorClass
        );

        fragment.appendChild(chatMessageElement);
        newLastMessageId = messageId; // Update last message ID
      }
    });

    if (fragment.children.length > 0) {
      chatMessagesContainer.appendChild(fragment);
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      lastMessageId = newLastMessageId;

      // Limit the number of messages
      while (chatMessagesContainer.children.length > MAX_MESSAGES) {
        chatMessagesContainer.firstElementChild?.remove();
      }
    }
  }

  // Debounce the updateChatMessages function
  const debouncedUpdateChatMessages = debounce(updateChatMessages, 500);

  // Function to make the overlay draggable
  function makeDraggable(element) {
    let isDragging = false;
    let lastX, lastY;

    dragHandle.addEventListener("mousedown", (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", stopDrag);
    });

    function onDrag(e) {
      if (!isDragging) return;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      requestAnimationFrame(() => {
        element.style.top = `${element.offsetTop + deltaY}px`;
        element.style.left = `${element.offsetLeft + deltaX}px`;
      });
    }

    function stopDrag() {
      isDragging = false;
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", stopDrag);
    }
  }

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

  // Function to make the overlay resizable
  function makeResizable(element) {
    const resizer = overlayChatContainer.querySelector("#resize-handle");
    let isResizing = false;
    let lastX, lastY, startWidth, startHeight;

    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isResizing = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const style = window.getComputedStyle(element);
      startWidth = parseInt(style.width, 10);
      startHeight = parseInt(style.height, 10);
      document.addEventListener("mousemove", onResize);
      document.addEventListener("mouseup", stopResize);
    });

    function onResize(e) {
      if (!isResizing) return;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      requestAnimationFrame(() => {
        element.style.width = `${element.offsetWidth + deltaX}px`;
        element.style.height = `${element.offsetHeight + deltaY}px`;
      });
    }

    function stopResize() {
      isResizing = false;
      document.removeEventListener("mousemove", onResize);
      document.removeEventListener("mouseup", stopResize);
    }
  }

  // Function to toggle chat visibility in fullscreen
  function toggleOverlayChat() {
    isOverlayVisible = !isOverlayVisible;
    overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
    overlayChatContainer.classList.toggle("show", isOverlayVisible);
    toggleButton.classList.toggle("show", isOverlayVisible);

    if (isOverlayVisible) {
      debouncedUpdateChatMessages();
      clearInterval(updateInterval);
      updateInterval = setInterval(debouncedUpdateChatMessages, 800);
    } else {
      clearInterval(updateInterval);
    }

    // Save the current state to local storage
    localStorage.setItem("youtubeOverlayVisible", isOverlayVisible);
  }

  // Listen for fullscreen changes
  document.addEventListener(
    "fullscreenchange",
    () => {
      if (document.fullscreenElement) {
        toggleButton.style.display = "block";
        toggleButton.classList.add("show");

        const savedState = localStorage.getItem("youtubeOverlayVisible");
        if (savedState === "true") {
          isOverlayVisible = true;
          overlayChatContainer.style.display = "block";
          overlayChatContainer.classList.add("show");
          debouncedUpdateChatMessages();
          clearInterval(updateInterval);
          updateInterval = setInterval(debouncedUpdateChatMessages, 800);
        }
      } else {
        toggleButton.style.display = "none";
        toggleButton.classList.remove("show");
        overlayChatContainer.style.display = "none";
        overlayChatContainer.classList.remove("show");
        clearInterval(updateInterval);
      }
    },
    { passive: true }
  );

  // Add click event to toggle button
  toggleButton.addEventListener("click", toggleOverlayChat, { passive: true });

  // Make the overlay draggable and resizable
  makeDraggable(overlayChatContainer);
  makeResizable(overlayChatContainer);

  // Initialize overlay state
  initializeOverlayState();
}

function initializeOverlayState() {
  const savedState = localStorage.getItem("youtubeOverlayVisible");
  if (savedState === "true" && document.fullscreenElement) {
    isOverlayVisible = true;
    overlayChatContainer.style.display = "block";
    overlayChatContainer.classList.add("show");
    debouncedUpdateChatMessages();
    clearInterval(updateInterval);
    updateInterval = setInterval(debouncedUpdateChatMessages, 800);
  }

  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
  lastMessageId = null; // Initialize lastMessageId
}

function cleanupOverlay() {
  const existingOverlay = document.getElementById("overlay-chat-container");
  const existingToggleButton = document.getElementById("toggle-chat-overlay");
  if (existingOverlay) existingOverlay.remove();
  if (existingToggleButton) existingToggleButton.remove();
  clearInterval(updateInterval);
}

// Run the injection function when the page is loaded
if (document.readyState === "complete") {
  cleanupOverlay();
  injectLiveChatOverlay();
} else {
  window.addEventListener("load", () => {
    cleanupOverlay();
    injectLiveChatOverlay();
  });
}

// Listen for YouTube spa navigation
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    cleanupOverlay();
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
    cleanupOverlay();
    injectLiveChatOverlay();
    dynamicObserver.disconnect();
  }
});
dynamicObserver.observe(document.body, { childList: true, subtree: true });

function createChatMessageElement(
  authorName,
  authorPhoto,
  badgeUrl,
  messageElement,
  authorClass
) {
  const chatMessageElement = document.createElement("div");
  chatMessageElement.className = "chat-message";

  const profileImg = document.createElement("img");
  profileImg.className = "chat-message-profile";
  profileImg.src = authorPhoto;
  profileImg.alt = authorName;
  chatMessageElement.appendChild(profileImg);

  const chatMessageContent = document.createElement("div");
  chatMessageContent.className = "chat-message-content";
  chatMessageElement.appendChild(chatMessageContent);

  const chatMessageAuthor = document.createElement("div");
  chatMessageAuthor.className = `chat-message-author ${authorClass}`;
  chatMessageContent.appendChild(chatMessageAuthor);

  if (badgeUrl) {
    const badgeImg = document.createElement("img");
    badgeImg.className = "chat-badge";
    badgeImg.src = badgeUrl;
    badgeImg.alt = "Badge";
    chatMessageAuthor.appendChild(badgeImg);
  }

  const authorText = document.createTextNode(authorName);
  chatMessageAuthor.appendChild(authorText);

  // Append the cloned message element to the content
  chatMessageContent.appendChild(messageElement);

  return chatMessageElement;
}

function getChatMessageAuthorClass(item) {
  const authorNameElement = item.querySelector("#author-name");
  if (authorNameElement.classList.contains("member")) {
    return "author-member";
  } else if (authorNameElement.classList.contains("moderator")) {
    return "author-moderator";
  }
  return "";
}

// Event handler for opacity change
function handleOpacityChange(e) {
  const opacity = e.target.value / 100;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
  localStorage.setItem("chatOverlayOpacity", e.target.value);
}