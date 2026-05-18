/**
 * Native YouTube chat iframe overlay creation and management.
 */

let isOverlayVisible = false;
let activeChatIframe = null;
let activeChatSourceKind = null;
let borrowedIframeRestoreTarget = null;
const pendingNativeHostRestoreIframes = new Set();
let pendingNativeHostRestoreObserver = null;

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
  iframe.setAttribute("data-yt-overlay-source", "live_direct");
  iframe.setAttribute("allowtransparency", "true");
  iframe.addEventListener("load", () => {
    debugState("managed live iframe load", {
      src: iframe.getAttribute("src") || iframe.src || "",
      href: getIframeHref(iframe),
      parent: iframe.parentElement?.id || iframe.parentElement?.tagName || "none",
    });
  });
  iframe.addEventListener("error", () => {
    debugState("managed live iframe error", {
      src: iframe.getAttribute("src") || iframe.src || "",
      href: getIframeHref(iframe),
    });
  });
  return iframe;
}

function isManagedLiveIframe(iframe) {
  return iframe?.getAttribute("data-yt-overlay-owned") === "true" &&
    iframe?.getAttribute("data-yt-overlay-source") === "live_direct";
}

function getReusableLiveIframe(source) {
  if (!isManagedLiveIframe(activeChatIframe)) return null;
  const href = getIframeHref(activeChatIframe);
  const src = activeChatIframe.getAttribute("src") || activeChatIframe.src || "";
  if (href === source.url || src === source.url) return activeChatIframe;
  return null;
}

function applyChatIframeStyle(iframe) {
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.maxWidth = "100%";
  iframe.style.borderStyle = "none";
  iframe.style.borderWidth = "0";
  iframe.style.outline = "none";
  iframe.style.display = "block";
  iframe.style.position = "relative";
  iframe.style.zIndex = "1";
  iframe.style.backgroundColor = "transparent";
  iframe.setAttribute("allowtransparency", "true");
}

function syncBorrowedIframeSrcWithDocumentHref(iframe) {
  let docHref = "";
  try {
    docHref = iframe.contentDocument?.location?.href || "";
  } catch {}
  if (!docHref || docHref.includes("about:blank")) return;

  const currentSrc = iframe.getAttribute("src") || iframe.src || "";
  if (currentSrc && !currentSrc.includes("about:blank")) return;
  iframe.src = docHref;
}

function rememberBorrowedIframe(iframe, container) {
  if (borrowedIframeRestoreTarget || iframe.parentNode === container) return;
  const placeholder = document.createComment("yt-overlay-borrowed-chat-anchor");
  iframe.parentNode.insertBefore(placeholder, iframe);
  borrowedIframeRestoreTarget = {
    parent: placeholder.parentNode,
    nextSibling: iframe.nextSibling,
    placeholder,
    style: {
      width: iframe.style.width,
      height: iframe.style.height,
      maxWidth: iframe.style.maxWidth,
      borderStyle: iframe.style.borderStyle,
      borderWidth: iframe.style.borderWidth,
      outline: iframe.style.outline,
      display: iframe.style.display,
      position: iframe.style.position,
      zIndex: iframe.style.zIndex,
      backgroundColor: iframe.style.backgroundColor,
    },
  };
  syncBorrowedIframeSrcWithDocumentHref(iframe);
}

function restoreBorrowedIframe(iframe) {
  if (!borrowedIframeRestoreTarget) return false;
  const target = borrowedIframeRestoreTarget;
  iframe.style.width = target.style.width;
  iframe.style.height = target.style.height;
  iframe.style.maxWidth = target.style.maxWidth;
  iframe.style.borderStyle = target.style.borderStyle;
  iframe.style.borderWidth = target.style.borderWidth;
  iframe.style.outline = target.style.outline;
  iframe.style.display = target.style.display;
  iframe.style.position = target.style.position;
  iframe.style.zIndex = target.style.zIndex;
  iframe.style.backgroundColor = target.style.backgroundColor;

  if (target.placeholder?.parentNode) {
    target.placeholder.parentNode.insertBefore(iframe, target.placeholder.nextSibling);
    target.placeholder.remove();
    borrowedIframeRestoreTarget = null;
    return true;
  }
  if (target.parent?.isConnected) {
    if (target.nextSibling && target.parent.contains(target.nextSibling)) {
      target.parent.insertBefore(iframe, target.nextSibling);
    } else {
      target.parent.appendChild(iframe);
    }
    borrowedIframeRestoreTarget = null;
    return true;
  }
  borrowedIframeRestoreTarget = null;
  return false;
}

function cleanupNativeRestoreObserverIfIdle() {
  if (pendingNativeHostRestoreIframes.size > 0) return;
  pendingNativeHostRestoreObserver?.disconnect();
  pendingNativeHostRestoreObserver = null;
}

function tryRestorePendingNativeIframes() {
  if (pendingNativeHostRestoreIframes.size === 0) {
    cleanupNativeRestoreObserverIfIdle();
    return;
  }

  const host = document.querySelector("ytd-live-chat-frame");
  if (!host) return;

  for (const iframe of Array.from(pendingNativeHostRestoreIframes)) {
    host.insertBefore(iframe, host.firstChild);
    pendingNativeHostRestoreIframes.delete(iframe);
  }
  cleanupNativeRestoreObserverIfIdle();
}

function queueRestoreToNativeHost(iframe) {
  pendingNativeHostRestoreIframes.add(iframe);
  iframe.remove();
  if (!pendingNativeHostRestoreObserver && document.body) {
    pendingNativeHostRestoreObserver = new MutationObserver(tryRestorePendingNativeIframes);
    pendingNativeHostRestoreObserver.observe(document.body, { childList: true, subtree: true });
  }
  tryRestorePendingNativeIframes();
}

function restoreIframeToNativeHost(iframe) {
  const host = document.querySelector("ytd-live-chat-frame");
  if (!host) return false;
  if (iframe.parentElement === host) return true;
  host.insertBefore(iframe, host.firstChild);
  return true;
}

function attachChatSource(iframeContainer) {
  if (!iframeContainer || !iframeContainer.isConnected) {
    debugState("attachChatSource:detached container", {
      hasContainer: Boolean(iframeContainer),
      containerConnected: Boolean(iframeContainer?.isConnected),
    });
    return false;
  }

  const duplicateIframes = iframeContainer.querySelectorAll('iframe[data-yt-overlay-chat="true"]');
  duplicateIframes.forEach((iframe) => {
    if (iframe !== activeChatIframe) iframe.remove();
  });

  const mode = detectChatMode(activeChatIframe);
  debugState("attachChatSource:start", {
    mode,
    videoId: getVideoId(),
    activeHref: getIframeHref(activeChatIframe),
    nativeHref: getIframeHref(getLiveChatIframe()),
    containerConnected: iframeContainer?.isConnected,
  });
  if (mode === "archive" && !resolveArchiveChatSource(activeChatIframe)) {
    debugState("attachChatSource:openArchiveNativeChatPanel", {});
    openArchiveNativeChatPanel();
  }
  const source = mode === "archive" ? resolveArchiveChatSource(activeChatIframe) : resolveLiveChatSource(activeChatIframe);
  if (!source) {
    debugState("attachChatSource:no source", {
      mode,
      videoId: getVideoId(),
      nativeHref: getIframeHref(getLiveChatIframe()),
    });
    return false;
  }

  debugState("attachChatSource:source", {
    kind: source.kind,
    url: source.url || getIframeHref(source.iframe),
  });

  const nextIframe = source.kind === "archive_borrow" ? source.iframe : (getReusableLiveIframe(source) || createManagedLiveIframe(source));
  if (activeChatIframe === nextIframe && nextIframe.parentElement === iframeContainer) {
    debugState("attachChatSource:reuse", { href: getIframeHref(nextIframe) });
    return true;
  }

  detachChatSource();
  activeChatIframe = nextIframe;
  activeChatSourceKind = source.kind;
  activeChatIframe.setAttribute("data-yt-overlay-chat", "true");

  if (source.kind === "archive_borrow") {
    rememberBorrowedIframe(activeChatIframe, iframeContainer);
  }

  applyChatIframeStyle(activeChatIframe);
  iframeContainer.appendChild(activeChatIframe);
  debugState("attachChatSource:appended", {
    kind: activeChatSourceKind,
    childCount: iframeContainer.childElementCount,
    src: activeChatIframe.getAttribute("src") || activeChatIframe.src || "",
    href: getIframeHref(activeChatIframe),
    connected: activeChatIframe.isConnected,
  });
  return true;
}

function isActiveChatIframeLoaded() {
  const href = getIframeHref(activeChatIframe);
  return Boolean(activeChatIframe?.isConnected && href && !href.includes("about:blank"));
}

function detachChatSource() {
  if (!activeChatIframe) return;

  activeChatIframe.removeAttribute("data-yt-overlay-chat");
  if (activeChatSourceKind === "archive_borrow") {
    const restored = restoreBorrowedIframe(activeChatIframe) || restoreIframeToNativeHost(activeChatIframe);
    if (!restored) queueRestoreToNativeHost(activeChatIframe);
  } else {
    activeChatIframe.remove();
  }

  activeChatIframe = null;
  activeChatSourceKind = null;
}

function toggleOverlayChat(overlayChatContainer, iframeContainer, toggleButton) {
  isOverlayVisible = !isOverlayVisible;
  debugState("toggleOverlayChat", { visible: isOverlayVisible, videoId: getVideoId(), mode: detectChatMode(activeChatIframe) });
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
  localStorage.setItem("overlayVisible", isOverlayVisible);
}

function initializeOverlayState(overlayChatContainer) {
  const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
  log("Overlay state initialized with native chat iframe source");
}

function cleanupOverlay() {
  detachChatSource();

  const existingOverlays = document.querySelectorAll("#overlay-chat-container");
  const existingToggleButtons = document.querySelectorAll("#toggle-chat-overlay");
  existingOverlays.forEach((overlay) => overlay.remove());
  existingToggleButtons.forEach((button) => button.remove());
  isOverlayVisible = false;
}
