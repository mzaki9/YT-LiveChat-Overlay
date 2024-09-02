console.log("YouTube Live Chat Overlay: Content script loaded");

let updateInterval;
let isOverlayVisible = false;
let videoPlayer, liveChatFrame, overlayChatContainer, chatMessagesContainer;

function injectLiveChatOverlay() {
  console.log("YouTube Live Chat Overlay: Attempting to inject overlay");

  videoPlayer = document.querySelector(".html5-video-player");
  liveChatFrame =
    document.querySelector("#chat-frame") ||
    document.querySelector("iframe#chatframe");

  if (!videoPlayer || !liveChatFrame) {
    console.error("YouTube Live Chat Overlay: Required elements not found");
    return;
  }

  console.log("YouTube Live Chat Overlay: Required elements found");

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
  function updateChatMessages() {
    const chatDocument = liveChatFrame.contentDocument;
    if (!chatDocument) return;

    const chatItems = chatDocument.querySelectorAll(
      "yt-live-chat-text-message-renderer"
    );
    const fragment = document.createDocumentFragment();

    chatItems.forEach((item) => {
      const authorName = item.querySelector("#author-name").textContent;
      const authorPhoto = item.querySelector("#img").src;
      const badgeElement = item.querySelector(
        "yt-live-chat-author-badge-renderer #img"
      );
      const messageElement = item.querySelector("#message").cloneNode(true);

      const authorClass = item.querySelector("#author-name.member")
        ? "author-member"
        : item.querySelector("#author-name.moderator")
        ? "author-moderator"
        : "";

      // Create the chat message element without using innerHTML
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

      if (badgeElement) {
        const badgeImg = document.createElement("img");
        badgeImg.className = "chat-badge";
        badgeImg.src = badgeElement.src;
        badgeImg.alt = "Badge";
        chatMessageAuthor.appendChild(badgeImg);
      }

      const authorText = document.createTextNode(authorName);
      chatMessageAuthor.appendChild(authorText);

      // Append the cloned message element to the content
      chatMessageContent.appendChild(messageElement);

      // Append the chat message to the fragment
      fragment.appendChild(chatMessageElement);
    });

    chatMessagesContainer.innerHTML = "";
    chatMessagesContainer.appendChild(fragment);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  // Function to make the overlay draggable
  function makeDraggable(element) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;
    let isDragging = false;

    dragHandle.onmousedown = function (e) {
      e = e || window.event;
      e.preventDefault();
      isDragging = true;
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = dragElement;
    };

    function dragElement(e) {
      if (!isDragging) return;
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      requestAnimationFrame(() => {
        element.style.top = element.offsetTop - pos2 + "px";
        element.style.left = element.offsetLeft - pos1 + "px";
      });
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      isDragging = false;
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
    const resizer = document.getElementById("resize-handle");
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    function startResize(e) {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(
        document.defaultView.getComputedStyle(element).width,
        10
      );
      startHeight = parseInt(
        document.defaultView.getComputedStyle(element).height,
        10
      );
      document.addEventListener("mousemove", resize, { passive: false });
      document.addEventListener("mouseup", stopResize, { passive: true });
    }

    function resize(e) {
      if (!isResizing) return;
      e.preventDefault();
      const newWidth = startWidth + e.clientX - startX;
      const newHeight = startHeight + e.clientY - startY;
      element.style.width = `${newWidth}px`;
      element.style.height = `${newHeight}px`;
    }

    function stopResize() {
      isResizing = false;
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResize);
    }

    resizer.addEventListener("mousedown", startResize, { passive: false });
  }

  // Function to toggle chat visibility in fullscreen
  function toggleOverlayChat() {
    isOverlayVisible = !isOverlayVisible;
    overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";

    if (isOverlayVisible) {
      updateChatMessages();
      clearInterval(updateInterval);
      updateInterval = setInterval(updateChatMessages, 1000); // Update every 3 seconds
    } else {
      clearInterval(updateInterval);
    }

    // Save the current state to local storage
    localStorage.setItem("youtubeOverlayVisible", isOverlayVisible);

    console.log("YouTube Live Chat Overlay: Overlay toggled", isOverlayVisible);
  }

  // Listen for fullscreen changes
  document.addEventListener(
    "fullscreenchange",
    () => {
      if (document.fullscreenElement) {
        toggleButton.style.display = "block";
        // Restore the last known state when entering fullscreen
        const savedState = localStorage.getItem("youtubeOverlayVisible");
        if (savedState !== null) {
          isOverlayVisible = savedState === "true";
          overlayChatContainer.style.display = isOverlayVisible
            ? "block"
            : "none";
          if (isOverlayVisible) {
            updateChatMessages();
            clearInterval(updateInterval);
            updateInterval = setInterval(updateChatMessages, 3000);
          }
        }
        console.log("YouTube Live Chat Overlay: Entered fullscreen");
      } else {
        toggleButton.style.display = "none";
        overlayChatContainer.style.display = "none";
        clearInterval(updateInterval);
        console.log("YouTube Live Chat Overlay: Exited fullscreen");
      }
    },
    { passive: true }
  );

  // Add click event to toggle button
  toggleButton.addEventListener("click", toggleOverlayChat);

  // Make the overlay draggable and resizable
  makeDraggable(overlayChatContainer);
  makeResizable(overlayChatContainer);

  // Initialize overlay state
  initializeOverlayState();

  console.log("YouTube Live Chat Overlay: Injection complete");
}

function initializeOverlayState() {
  const savedState = localStorage.getItem("youtubeOverlayVisible");
  if (savedState !== null) {
    isOverlayVisible = savedState === "true";
    overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
    if (isOverlayVisible && document.fullscreenElement) {
      updateChatMessages();
      clearInterval(updateInterval);
      updateInterval = setInterval(updateChatMessages, 3000);
    }
  }
}

// Function to clean up previous overlay
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
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    cleanupOverlay();
    injectLiveChatOverlay();
  }
}).observe(document, { subtree: true, childList: true });

// Additional check for dynamic content loading
const observer = new MutationObserver((mutations) => {
  if (
    document.querySelector(".html5-video-player") &&
    (document.querySelector("#chat-frame") ||
      document.querySelector("iframe#chatframe"))
  ) {
    cleanupOverlay();
    injectLiveChatOverlay();
    observer.disconnect();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
