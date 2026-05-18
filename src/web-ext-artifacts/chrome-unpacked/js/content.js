if (window.top !== window) {
  throw new Error('YT Chat Overlay: not running in top frame');
}

let videoPlayer;
let overlayChatContainer;
let chatIframeContainer;
let toggleButton;
let keyboardShortcutListener;
let fullscreenChangeListener;
let messageListener;
let urlObserver;
let injectionInterval;
let lastUrl = location.href;

function getVideoPlayer() {
  return document.querySelector('.html5-video-player') ||
    document.querySelector('#movie_player') ||
    document.querySelector('ytd-player') ||
    document.querySelector('.ytd-player');
}

function hasChatSource() {
  const mode = detectChatMode();
  return mode === 'live' || mode === 'archive';
}

function handleFullscreenChange() {
  if (!videoPlayer || !overlayChatContainer || !toggleButton) return;

  const canShowToggle = Boolean(document.fullscreenElement || hasChatSource());
  toggleButton.style.display = canShowToggle ? 'flex' : 'none';
  toggleButton.classList.toggle('show', canShowToggle);

  if (!canShowToggle) {
    if (isOverlayVisible) {
      toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
    }
    return;
  }

  const savedState = localStorage.getItem('youtubeOverlayVisible');
  if (savedState === 'true' && !isOverlayVisible) {
    toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
  }
}

function cleanupAllListeners() {
  clearInterval(injectionInterval);
  injectionInterval = null;

  if (keyboardShortcutListener) {
    document.removeEventListener('keydown', keyboardShortcutListener);
    keyboardShortcutListener = null;
  }
  if (fullscreenChangeListener) {
    document.removeEventListener('fullscreenchange', fullscreenChangeListener);
    fullscreenChangeListener = null;
  }
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
    messageListener = null;
  }
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }

  cleanupOverlay();
}

function injectLiveChatOverlay() {
  cleanupAllListeners();

  videoPlayer = getVideoPlayer();
  if (!videoPlayer || !hasChatSource()) {
    log('Native chat source or video player not ready');
    return false;
  }

  try {
    const overlay = createChatOverlay(videoPlayer);
    overlayChatContainer = overlay.container;
    chatIframeContainer = overlay.iframeContainer;

    toggleButton = createToggleButton(videoPlayer, () => {
      toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
    });

    keyboardShortcutListener = (event) => {
      if (event.altKey && event.key.toLowerCase() === 'c' && (document.fullscreenElement || hasChatSource())) {
        toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
      }
    };
    document.addEventListener('keydown', keyboardShortcutListener);

    messageListener = (message, sender, sendResponse) => {
      if (message.type === 'TOGGLE_OVERLAY') {
        toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
        sendResponse({ success: true });
        return true;
      }
      sendResponse({ error: 'unknown_type' });
      return true;
    };
    chrome.runtime.onMessage.addListener(messageListener);

    fullscreenChangeListener = handleFullscreenChange;
    document.addEventListener('fullscreenchange', fullscreenChangeListener, { passive: true });

    initializeOverlayState(overlayChatContainer);
    handleFullscreenChange();
    setupUrlObserver();
    log('Native chat iframe overlay injected');
    return true;
  } catch (error) {
    log('Error during injection: ' + error.message);
    console.error('Full injection error:', error);
    return false;
  }
}

function setupUrlObserver() {
  if (urlObserver) urlObserver.disconnect();

  const callback = debounce((mutations) => {
    const urlChanged = location.href !== lastUrl;
    const hasRelevantChanges = mutations && mutations.some((mutation) => {
      if (!mutation.addedNodes?.length) return false;
      return Array.from(mutation.addedNodes).some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        return node.id === 'chat' ||
          node.id === 'chatframe' ||
          node.matches?.('iframe[src*="live_chat"], ytd-live-chat-frame, #chat-container') ||
          node.querySelector?.('iframe[src*="live_chat"], ytd-live-chat-frame, #chat-container');
      });
    });

    if (!urlChanged && !hasRelevantChanges) return;
    if (urlChanged) {
      cleanupOverlay();
      lastUrl = location.href;
      startInjection();
      return;
    }
    attemptChatDetection();
  }, 250);

  urlObserver = new MutationObserver(callback);
  urlObserver.observe(document.body, { childList: true, subtree: true });
}

function attemptChatDetection() {
  if (!getVideoPlayer() || !hasChatSource()) return false;
  const existingOverlay = document.getElementById('overlay-chat-container');
  if (existingOverlay) {
    handleFullscreenChange();
    return true;
  }
  return injectLiveChatOverlay();
}

function startInjection() {
  const success = injectLiveChatOverlay();
  if (success) return;

  injectionInterval = setInterval(() => {
    if (attemptChatDetection()) {
      clearInterval(injectionInterval);
      injectionInterval = null;
    }
  }, 1000);

  setTimeout(() => {
    if (injectionInterval) {
      clearInterval(injectionInterval);
      injectionInterval = null;
      log('Native chat source detection timed out');
    }
  }, 30000);
}

if (document.readyState === 'complete') {
  startInjection();
} else {
  window.addEventListener('load', startInjection, { once: true });
}

document.addEventListener('yt-navigate-finish', () => {
  cleanupOverlay();
  lastUrl = location.href;
  startInjection();
});

window.addEventListener('unload', cleanupAllListeners);
