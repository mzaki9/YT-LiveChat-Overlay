/**
 * Native YouTube chat iframe overlay creation and management.
 */

let isOverlayVisible = false;
let activeChatIframe = null;
let activeChatSourceKind = null;
let borrowedIframeRestoreTarget = null;

function createToggleButton(videoPlayer, toggleCallback) {
  const toggleButton = document.createElement("button");
  toggleButton.id = "toggle-chat-overlay";
  toggleButton.innerHTML = getToggleIcon(false);
  toggleButton.title = "Show Chat";
  toggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCallback();
  });
  videoPlayer.appendChild(toggleButton);
  return toggleButton;
}

function getToggleIcon(active) {
  if (active) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  }
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;
}

function setupSettingsPanel(settingsIcon, settingsPanel, container) {
  settingsIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    settingsPanel.classList.toggle("show");
  });

  document.addEventListener("click", (event) => {
    if (!settingsPanel.contains(event.target) && event.target !== settingsIcon) {
      settingsPanel.classList.remove("show");
    }
  });

  const opacitySlider = settingsPanel.querySelector("#opacity-slider");
  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  opacitySlider.value = savedOpacity;
  container.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;

  opacitySlider.addEventListener("input", (event) => {
    event.stopPropagation();
    const value = event.target.value;
    container.style.backgroundColor = `rgba(0, 0, 0, ${value / 100})`;
    localStorage.setItem("chatOverlayOpacity", value);
  });

  settingsPanel.addEventListener("mousedown", (event) => event.stopPropagation());
  settingsPanel.addEventListener("click", (event) => event.stopPropagation());
  settingsPanel.addEventListener("keydown", (event) => event.stopPropagation());
}

function createChatOverlay(videoPlayer) {
  const overlayChatContainer = document.createElement("div");
  overlayChatContainer.id = "overlay-chat-container";

  const dragHandle = document.createElement("div");
  dragHandle.id = "drag-handle";
  overlayChatContainer.appendChild(dragHandle);

  const dragTitle = document.createElement("span");
  dragTitle.id = "drag-title";
  dragTitle.textContent = "YouTube Live Chat";
  dragHandle.appendChild(dragTitle);

  const settingsIcon = document.createElement("div");
  settingsIcon.id = "settings-icon";
  settingsIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16">
    <path fill="currentColor" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
  </svg>`;
  dragHandle.appendChild(settingsIcon);

  const settingsPanel = document.createElement("div");
  settingsPanel.id = "settings-panel";
  settingsPanel.innerHTML = `
    <div class="opacity-control">
      <label>Opacity:</label>
      <input type="range" min="10" max="100" value="50" id="opacity-slider">
    </div>
  `;
  overlayChatContainer.appendChild(settingsPanel);

  const iframeContainer = document.createElement("div");
  iframeContainer.id = "chat-iframe-container";
  overlayChatContainer.appendChild(iframeContainer);

  const resizeHandle = document.createElement("div");
  resizeHandle.id = "resize-handle";
  overlayChatContainer.appendChild(resizeHandle);

  videoPlayer.appendChild(overlayChatContainer);
  setupSettingsPanel(settingsIcon, settingsPanel, overlayChatContainer);
  restoreContainerPosition(overlayChatContainer);
  makeDraggable(overlayChatContainer, dragHandle);
  makeResizable(overlayChatContainer, resizeHandle);

  return {
    container: overlayChatContainer,
    iframeContainer,
    dragHandle,
    resizeHandle,
    settingsIcon,
    settingsPanel,
  };
}

function restoreContainerPosition(container) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const savedLeft = localStorage.getItem("chatOverlayLeft");
  const savedTop = localStorage.getItem("chatOverlayTop");
  const savedWidth = localStorage.getItem("chatOverlayWidth");
  const savedHeight = localStorage.getItem("chatOverlayHeight");

  if (savedLeft && savedTop && savedWidth && savedHeight) {
    const left = (parseFloat(savedLeft) / 100) * viewportWidth;
    const top = (parseFloat(savedTop) / 100) * viewportHeight;
    const width = (parseFloat(savedWidth) / 100) * viewportWidth;
    const height = (parseFloat(savedHeight) / 100) * viewportHeight;
    container.style.left = `${Math.max(0, Math.min(left, viewportWidth - 200))}px`;
    container.style.top = `${Math.max(0, Math.min(top, viewportHeight - 150))}px`;
    container.style.width = `${Math.max(200, Math.min(width, viewportWidth * 0.9))}px`;
    container.style.height = `${Math.max(150, Math.min(height, viewportHeight * 0.9))}px`;
    return;
  }

  container.style.right = "5%";
  container.style.top = "10%";
  container.style.width = "25%";
  container.style.height = "80%";
}

function createManagedLiveIframe(source) {
  const iframe = document.createElement("iframe");
  iframe.className = "ytd-live-chat-frame";
  iframe.src = source.url;
  iframe.setAttribute("data-yt-overlay-chat", "true");
  iframe.setAttribute("data-yt-overlay-owned", "true");
  iframe.setAttribute("allowtransparency", "true");
  return iframe;
}

function applyChatIframeStyle(iframe) {
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.outline = "none";
  iframe.style.display = "block";
  iframe.style.backgroundColor = "transparent";
}

function rememberBorrowedIframe(iframe, container) {
  if (borrowedIframeRestoreTarget || iframe.parentNode === container) return;
  const placeholder = document.createComment("yt-overlay-borrowed-chat-anchor");
  iframe.parentNode.insertBefore(placeholder, iframe);
  borrowedIframeRestoreTarget = {
    parent: placeholder.parentNode,
    placeholder,
    style: {
      width: iframe.style.width,
      height: iframe.style.height,
      border: iframe.style.border,
      outline: iframe.style.outline,
      display: iframe.style.display,
      backgroundColor: iframe.style.backgroundColor,
    },
  };
}

function restoreBorrowedIframe(iframe) {
  if (!borrowedIframeRestoreTarget) return false;
  const target = borrowedIframeRestoreTarget;
  iframe.style.width = target.style.width;
  iframe.style.height = target.style.height;
  iframe.style.border = target.style.border;
  iframe.style.outline = target.style.outline;
  iframe.style.display = target.style.display;
  iframe.style.backgroundColor = target.style.backgroundColor;

  if (target.placeholder?.parentNode) {
    target.placeholder.parentNode.insertBefore(iframe, target.placeholder);
    target.placeholder.remove();
    borrowedIframeRestoreTarget = null;
    return true;
  }
  if (target.parent?.isConnected) {
    target.parent.appendChild(iframe);
    borrowedIframeRestoreTarget = null;
    return true;
  }
  borrowedIframeRestoreTarget = null;
  return false;
}

function attachChatSource(iframeContainer) {
  const mode = detectChatMode(activeChatIframe);
  const source = mode === "archive" ? resolveArchiveChatSource(activeChatIframe) : resolveLiveChatSource(activeChatIframe);
  if (!source) return false;

  const nextIframe = source.kind === "archive_borrow" ? source.iframe : createManagedLiveIframe(source);
  if (activeChatIframe === nextIframe && nextIframe.parentElement === iframeContainer) return true;

  detachChatSource();
  activeChatIframe = nextIframe;
  activeChatSourceKind = source.kind;
  activeChatIframe.setAttribute("data-yt-overlay-chat", "true");

  if (source.kind === "archive_borrow") {
    rememberBorrowedIframe(activeChatIframe, iframeContainer);
  }

  applyChatIframeStyle(activeChatIframe);
  iframeContainer.appendChild(activeChatIframe);
  return true;
}

function detachChatSource() {
  if (!activeChatIframe) return;

  activeChatIframe.removeAttribute("data-yt-overlay-chat");
  if (activeChatSourceKind === "archive_borrow") {
    restoreBorrowedIframe(activeChatIframe);
  } else {
    activeChatIframe.remove();
  }

  activeChatIframe = null;
  activeChatSourceKind = null;
}

function toggleOverlayChat(overlayChatContainer, iframeContainer, toggleButton) {
  isOverlayVisible = !isOverlayVisible;
  overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
  overlayChatContainer.classList.toggle("show", isOverlayVisible);
  toggleButton.title = isOverlayVisible ? "Hide Chat" : "Show Chat";
  toggleButton.innerHTML = getToggleIcon(isOverlayVisible);

  if (isOverlayVisible) {
    attachChatSource(iframeContainer);
  } else {
    detachChatSource();
  }

  localStorage.setItem("youtubeOverlayVisible", isOverlayVisible);
}

function initializeOverlayState(overlayChatContainer) {
  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
  log("Overlay state initialized with native chat iframe source");
}

function cleanupOverlay() {
  detachChatSource();

  const existingOverlay = document.getElementById("overlay-chat-container");
  const existingToggleButton = document.getElementById("toggle-chat-overlay");
  if (existingOverlay) existingOverlay.remove();
  if (existingToggleButton) existingToggleButton.remove();
  isOverlayVisible = false;
}
