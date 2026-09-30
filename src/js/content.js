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
let lifecycleInterval;
let attachRetryInterval;
let playerFullscreenObserver;
let watchModeObserver;
let nativeTheaterLayoutController = null;
let lastUrl = location.href;
let currentVideoId = typeof getVideoId === 'function' ? getVideoId() : null;

const extApi = globalThis.browser || globalThis.chrome || null;

function getSavedOverlayVisible() {
  const savedState = localStorage.getItem('youtubeOverlayVisible');
  if (savedState !== null) return savedState === 'true';
  const legacyState = localStorage.getItem('overlayVisible');
  if (legacyState !== null) return legacyState === 'true';
  localStorage.setItem('youtubeOverlayVisible', 'true');
  return true;
}

function getVideoPlayer() {
  return document.querySelector('.html5-video-player') ||
    document.querySelector('#movie_player') ||
    document.querySelector('ytd-player') ||
    document.querySelector('.ytd-player');
}

function isYouTubeFullscreen() {
  const player = getVideoPlayer();
  const isPlayerFs = Boolean(player?.classList?.contains('ytp-fullscreen') || document.querySelector('.html5-video-player.ytp-fullscreen, #movie_player.ytp-fullscreen'));
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
  const isDocFs = Boolean(fsEl && player && (player === fsEl || player.contains(fsEl) || fsEl.contains(player)));
  return isPlayerFs || isDocFs;
}

function isYouTubeTheater() {
  const watch = document.querySelector('ytd-watch-flexy, ytd-watch-grid');
  return Boolean(watch && watch.hasAttribute('theater'));
}

function isTheaterModeEnabled() {
  return localStorage.getItem('chatOverlayTheaterMode') !== 'false';
}

function isOverlayActiveView() {
  if (isYouTubeFullscreen()) return true;
  if (isTheaterModeEnabled() && isYouTubeTheater()) return true;
  return false;
}

function removeDuplicateOverlays() {
  const overlays = Array.from(document.querySelectorAll('#overlay-chat-container'));
  const toggles = Array.from(document.querySelectorAll('#toggle-chat-overlay'));

  overlays.slice(1).forEach((overlay) => overlay.remove());
  toggles.slice(1).forEach((button) => button.remove());

  overlayChatContainer = overlays[0] || null;
  toggleButton = toggles[0] || null;
  chatIframeContainer = overlayChatContainer?.querySelector('#chat-iframe-container') || null;
}

function cleanupOverlayEventListeners() {
  clearInterval(attachRetryInterval);
  attachRetryInterval = null;

  if (keyboardShortcutListener) {
    document.removeEventListener('keydown', keyboardShortcutListener);
    keyboardShortcutListener = null;
  }
  if (messageListener && extApi?.runtime?.onMessage) {
    extApi.runtime.onMessage.removeListener(messageListener);
    messageListener = null;
  }
}

function removeOverlayDom() {
  document.documentElement.removeAttribute('data-yt-overlay-theater-active');
  cleanupOverlayEventListeners();
  cleanupOverlay();
  overlayChatContainer = null;
  chatIframeContainer = null;
  toggleButton = null;
}

function ensureOverlayConnected() {
  if (overlayChatContainer?.isConnected && !chatIframeContainer?.isConnected) {
    let existingContainer = overlayChatContainer.querySelector('#chat-iframe-container');
    if (!existingContainer) {
      existingContainer = document.createElement('div');
      existingContainer.id = 'chat-iframe-container';
      const resizeHandle = overlayChatContainer.querySelector('#resize-handle');
      overlayChatContainer.insertBefore(existingContainer, resizeHandle || null);
      debugState('ensureOverlayConnected:rebuilt iframe container', {
        overlayConnected: overlayChatContainer.isConnected,
        childCount: overlayChatContainer.childElementCount,
      });
    }
    chatIframeContainer = existingContainer;
  }

  if (overlayChatContainer?.isConnected && chatIframeContainer?.isConnected && toggleButton?.isConnected) return true;

  const currentPlayer = getVideoPlayer();
  if (!currentPlayer) return false;
  videoPlayer = currentPlayer;

  if (overlayChatContainer && !overlayChatContainer.isConnected) {
    currentPlayer.appendChild(overlayChatContainer);
  }
  if (toggleButton && !toggleButton.isConnected) {
    currentPlayer.appendChild(toggleButton);
  }

  overlayChatContainer = document.getElementById('overlay-chat-container') || overlayChatContainer;
  if (overlayChatContainer && !chatIframeContainer?.isConnected) {
    chatIframeContainer = overlayChatContainer.querySelector('#chat-iframe-container') || chatIframeContainer;
  }
  toggleButton = document.getElementById('toggle-chat-overlay') || toggleButton;

  const connected = Boolean(overlayChatContainer?.isConnected && chatIframeContainer?.isConnected && toggleButton?.isConnected);
  debugState('ensureOverlayConnected', {
    connected,
    overlayConnected: Boolean(overlayChatContainer?.isConnected),
    iframeContainerConnected: Boolean(chatIframeContainer?.isConnected),
    toggleConnected: Boolean(toggleButton?.isConnected),
    playerConnected: Boolean(currentPlayer?.isConnected),
  });
  return connected;
}

function hasChatSource() {
  const mode = detectChatMode();
  return mode === 'live' || mode === 'archive';
}

function handleFullscreenChange() {
  removeDuplicateOverlays();

  const isTheaterActive = Boolean(isYouTubeTheater() && !isYouTubeFullscreen() && isTheaterModeEnabled() && hasChatSource());
  const prevTheaterActive = document.documentElement.hasAttribute('data-yt-overlay-theater-active');
  document.documentElement.toggleAttribute('data-yt-overlay-theater-active', isTheaterActive);
  if (isTheaterActive !== prevTheaterActive) {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch {}
  }

  if (nativeTheaterLayoutController) {
    nativeTheaterLayoutController.scheduleUpdate();
  }

  if (!isOverlayActiveView()) {
    removeOverlayDom();
    return;
  }

  if (!overlayChatContainer || !toggleButton) {
    injectLiveChatOverlay();
    return;
  }

  ensureOverlayConnected();
  if (!videoPlayer || !overlayChatContainer || !toggleButton) return;

  const canShowToggle = hasChatSource();
  debugState('handleFullscreenChange', () => ({
    fullscreen: isYouTubeFullscreen(),
    theater: isYouTubeTheater(),
    canShowToggle,
    mode: detectChatMode(),
    videoId: getVideoId(),
    savedVisible: getSavedOverlayVisible(),
  }));
  toggleButton.style.display = canShowToggle ? 'flex' : 'none';
  toggleButton.classList.toggle('show', canShowToggle);

  if (!canShowToggle) {
    if (isOverlayVisible) {
      toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
    }
    return;
  }

  if (getSavedOverlayVisible() && !isOverlayVisible) {
    toggleOverlayChat(overlayChatContainer, chatIframeContainer, toggleButton);
  }
  if (isOverlayVisible && !isActiveChatIframeLoaded()) startAttachRetry();
  if (isOverlayVisible && typeof ensureActiveChatThemeOverride === 'function') {
    ensureActiveChatThemeOverride();
  }
}

function startAttachRetry() {
  if (attachRetryInterval || !isOverlayVisible || !chatIframeContainer || isActiveChatIframeLoaded()) return;
  const startedAt = Date.now();
  debugState('startAttachRetry', () => ({ videoId: getVideoId(), mode: detectChatMode() }));
  attachRetryInterval = setInterval(() => {
    if (!isOverlayVisible || !chatIframeContainer) {
      clearInterval(attachRetryInterval);
      attachRetryInterval = null;
      return;
    }
    if (!ensureOverlayConnected()) {
      debugState('attachRetry:overlay unavailable', { videoId: getVideoId() });
      clearInterval(attachRetryInterval);
      attachRetryInterval = null;
      return;
    }
    attachChatSource(chatIframeContainer);
    if (typeof ensureActiveChatThemeOverride === 'function') {
      ensureActiveChatThemeOverride();
    }
    debugState('attachRetry:tick', {
      loaded: isActiveChatIframeLoaded(),
      elapsed: Date.now() - startedAt,
      iframeCount: chatIframeContainer.childElementCount,
    });
    if (isActiveChatIframeLoaded() || Date.now() - startedAt >= 120000) {
      clearInterval(attachRetryInterval);
      attachRetryInterval = null;
    }
  }, 1000);
}

function cleanupAllListeners() {
  clearInterval(injectionInterval);
  injectionInterval = null;
  clearInterval(lifecycleInterval);
  lifecycleInterval = null;
  clearInterval(attachRetryInterval);
  attachRetryInterval = null;

  cleanupOverlayEventListeners();
  if (fullscreenChangeListener) {
    document.removeEventListener('fullscreenchange', fullscreenChangeListener);
    fullscreenChangeListener = null;
  }
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
  if (playerFullscreenObserver) {
    playerFullscreenObserver.disconnect();
    playerFullscreenObserver = null;
  }
  if (watchModeObserver) {
    watchModeObserver.disconnect();
    watchModeObserver = null;
  }
  if (nativeTheaterLayoutController) {
    nativeTheaterLayoutController.destroy();
    nativeTheaterLayoutController = null;
  }

  removeOverlayDom();
}

function injectLiveChatOverlay() {
  if (!isOverlayActiveView()) return false;

  removeDuplicateOverlays();
  const existingOverlay = document.getElementById('overlay-chat-container');
  const existingToggle = document.getElementById('toggle-chat-overlay');
  if (existingOverlay && existingToggle) {
    overlayChatContainer = existingOverlay;
    chatIframeContainer = document.getElementById('chat-iframe-container') || chatIframeContainer;
    toggleButton = existingToggle;
    videoPlayer = getVideoPlayer() || videoPlayer;
    debugState('injectLiveChatOverlay:reuse existing', {
      overlayConnected: Boolean(overlayChatContainer?.isConnected),
      iframeContainerConnected: Boolean(chatIframeContainer?.isConnected),
      toggleConnected: Boolean(toggleButton?.isConnected),
    });
    handleFullscreenChange();
    return true;
  }

  removeOverlayDom();

  videoPlayer = getVideoPlayer();
  debugState('injectLiveChatOverlay:start', () => ({
    hasVideoPlayer: Boolean(videoPlayer),
    videoId: getVideoId(),
    mode: detectChatMode(),
    url: location.href,
  }));
  if (!videoPlayer || !getVideoId()) {
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
      if (event.altKey && event.key.toLowerCase() === 'c' && isOverlayActiveView() && hasChatSource()) {
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
    if (extApi?.runtime?.onMessage) {
      extApi.runtime.onMessage.addListener(messageListener);
    }

    initializeOverlayState(overlayChatContainer);
    handleFullscreenChange();
    setupUrlObserver();
    debugState('injectLiveChatOverlay:done', {
      overlayConnected: overlayChatContainer.isConnected,
      iframeContainerConnected: chatIframeContainer.isConnected,
      toggleConnected: toggleButton.isConnected,
    });
    log('Native chat iframe overlay injected');
    return true;
  } catch (error) {
    log('Error during injection: ' + error.message);
    console.error('Full injection error:', error);
    return false;
  }
}

function handleVideoChange(newVid) {
  if (!newVid || newVid === currentVideoId) return false;
  const oldVid = currentVideoId;
  currentVideoId = newVid;
  lastUrl = location.href;

  if (typeof invalidateSignalCache === 'function') invalidateSignalCache();
  if (typeof markChatIframesStale === 'function' && oldVid) {
    markChatIframesStale(oldVid);
  }

  removeOverlayDom();

  if (playerFullscreenObserver) {
    playerFullscreenObserver.disconnect();
    playerFullscreenObserver = null;
  }
  setupPlayerFullscreenObserver();

  if (isOverlayActiveView()) {
    startInjection();
  }
  if (nativeTheaterLayoutController) {
    nativeTheaterLayoutController.scheduleUpdate();
  }
  return true;
}

function setupUrlObserver() {
  if (urlObserver) urlObserver.disconnect();

  const callback = debounce((mutations) => {
    const newVid = typeof getVideoId === 'function' ? getVideoId() : null;
    if (newVid && newVid !== currentVideoId) {
      handleVideoChange(newVid);
      return;
    }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (newVid) handleVideoChange(newVid);
      return;
    }

    if (!mutations) return;
    let hasRelevantChanges = false;
    for (let i = 0; i < mutations.length; i++) {
      const addedNodes = mutations[i].addedNodes;
      if (!addedNodes || addedNodes.length === 0) continue;
      for (let j = 0; j < addedNodes.length; j++) {
        const node = addedNodes[j];
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.id === 'chat' || node.id === 'chatframe' ||
            node.matches?.('iframe[src*="live_chat"], ytd-live-chat-frame, #chat-container, #secondary') ||
            node.querySelector?.('iframe[src*="live_chat"], ytd-live-chat-frame, #chat-container, #secondary')) {
          hasRelevantChanges = true;
          break;
        }
      }
      if (hasRelevantChanges) break;
    }

    if (hasRelevantChanges) {
      attemptChatDetection();
    }
  }, 250);

  urlObserver = new MutationObserver(callback);
  urlObserver.observe(document.body, { childList: true, subtree: true });
}

function attemptChatDetection() {
  if (!getVideoPlayer() || !getVideoId()) return false;
  const vid = getVideoId();
  if (currentVideoId && vid !== currentVideoId) {
    handleVideoChange(vid);
    return true;
  }
  const existingOverlay = document.getElementById('overlay-chat-container');
  if (existingOverlay) {
    ensureOverlayConnected();
    handleFullscreenChange();
    return true;
  }
  return injectLiveChatOverlay();
}

function startInjection() {
  if (!isOverlayActiveView()) {
    removeOverlayDom();
    return;
  }

  const success = injectLiveChatOverlay();
  if (success) return;

  if (injectionInterval) return;

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
  }, 120000);
}

function setupPlayerFullscreenObserver() {
  const player = (videoPlayer && videoPlayer.isConnected) ? videoPlayer : getVideoPlayer();
  if (!player || playerFullscreenObserver) return;

  videoPlayer = player;
  playerFullscreenObserver = new MutationObserver(handleFullscreenChange);
  playerFullscreenObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  handleFullscreenChange();
}

function setupWatchModeObserver() {
  const watch = document.querySelector('ytd-watch-flexy, ytd-watch-grid');
  if (!watch || watchModeObserver) return;

  watchModeObserver = new MutationObserver(handleFullscreenChange);
  watchModeObserver.observe(watch, { attributes: true, attributeFilter: ['theater', 'fullscreen'] });
}

function initializeLifecycle() {
  if (!fullscreenChangeListener) {
    fullscreenChangeListener = handleFullscreenChange;
    document.addEventListener('fullscreenchange', fullscreenChangeListener, { passive: true });
  }
  setupPlayerFullscreenObserver();
  setupWatchModeObserver();
  setupUrlObserver();

  if (!nativeTheaterLayoutController && typeof NativeLayoutNormalModeInTheater === 'function') {
    nativeTheaterLayoutController = NativeLayoutNormalModeInTheater({ target: 'normal' });
    nativeTheaterLayoutController.init();
  }

  if (lifecycleInterval) return;
  lifecycleInterval = setInterval(() => {
    const newVid = typeof getVideoId === 'function' ? getVideoId() : null;
    if (newVid && newVid !== currentVideoId) {
      handleVideoChange(newVid);
      return;
    }
    setupPlayerFullscreenObserver();
    setupWatchModeObserver();
    if (!isOverlayActiveView()) {
      if (overlayChatContainer && overlayChatContainer.isConnected) {
        removeOverlayDom();
      }
      return;
    }

    // Only inject if overlay DOM is missing or detached
    if (!overlayChatContainer || !overlayChatContainer.isConnected || !toggleButton || !toggleButton.isConnected) {
      startInjection();
      return;
    }

    // YouTube starts its native chat a moment after the fullscreen swap. Once it
    // is running, adopt it so only one live chat document stays alive instead of
    // ours plus the hidden native one (docs/perf-findings.md, finding #1).
    if (chatIframeContainer && typeof shouldUpgradeToNativeChat === 'function' && shouldUpgradeToNativeChat()) {
      attachChatSource(chatIframeContainer);
    }
  }, 1000);
}

if (document.readyState === 'complete') {
  initializeLifecycle();
} else {
  window.addEventListener('load', initializeLifecycle, { once: true });
}

document.addEventListener('yt-navigate-start', () => {
  if (typeof invalidateSignalCache === 'function') invalidateSignalCache();
  const oldVid = currentVideoId || (typeof getVideoId === 'function' ? getVideoId() : null);
  if (typeof markChatIframesStale === 'function' && oldVid) {
    markChatIframesStale(oldVid);
  }
  removeOverlayDom();
});

document.addEventListener('yt-navigate-finish', () => {
  const newVid = typeof getVideoId === 'function' ? getVideoId() : null;
  handleVideoChange(newVid);
});

document.addEventListener('yt-page-data-updated', () => {
  const newVid = typeof getVideoId === 'function' ? getVideoId() : null;
  handleVideoChange(newVid);
});

window.addEventListener('popstate', () => {
  const newVid = typeof getVideoId === 'function' ? getVideoId() : null;
  handleVideoChange(newVid);
});

window.addEventListener('unload', cleanupAllListeners);
