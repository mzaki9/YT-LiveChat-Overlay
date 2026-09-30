/**
 * NativeLayoutNormalModeInTheater
 * 
 * Recreates the spatial relationships and responsive layout of a normal
 * YouTube video in Theater Mode when chat is removed or hidden.
 * 
 * Signature:
 * NativeLayoutNormalModeInTheater :: Config -> Controller
 */

function NativeLayoutNormalModeInTheater(userConfig) {
  'use strict';

  const DEFAULT_CONFIG = {
    target: 'normal',
    chatPosition: 'overlay',
    makeItNativeLike: true,
    codeStyle: 'clean',
    language: 'javascript'
  };

  const config = Object.assign({}, DEFAULT_CONFIG, userConfig);

  // Constants & Selectors
  const STYLE_ELEMENT_ID = 'yt-native-theater-layout-styles';
  const ATTR_NORMAL_THEATER = 'data-yt-native-theater-normal';
  const WATCH_CONTAINERS = 'ytd-watch-flexy, ytd-watch-grid';

  // State
  let isRunning = false;
  let layoutObserver = null;
  let pendingRaf = null;
  let boundListeners = null;

  /**
   * Namespaced CSS injected dynamically to normalize theater mode layout.
   * Eliminates empty chat columns, resets grid tracks, and aligns #primary
   * and #secondary into normal video proportions.
   */
  const INJECTED_CSS = `
    /* === Native Normal Mode Theater Layout === */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #player-full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #player-full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #player-theater-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #player-theater-container {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      flex: 1 1 100% !important;
    }

    /* Collapse and remove chat containers entirely from parent layout flow */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #panels-full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #panels-full-bleed-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #chat,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #chat,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #chat-container,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #chat-container,
    html[${ATTR_NORMAL_THEATER}] ytd-live-chat-frame {
      display: none !important;
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      flex: 0 0 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    /* Reset CSS Grid variables so modern watch-grid doesn't reserve panel column tracks */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] {
      --ytd-watch-flexy-chat-width: 0px !important;
      --ytd-watch-flexy-chat-max-height: 0px !important;
    }

    /* Normal watch-page two-column structure below theater player */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #columns,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #columns {
      display: flex !important;
      flex-direction: row !important;
      justify-content: center !important;
      width: 100% !important;
      max-width: var(--ytd-watch-flexy-max-horizontal-width, 1754px) !important;
      margin: 0 auto !important;
      padding-left: var(--ytd-margin-6x, 24px) !important;
      padding-right: var(--ytd-margin-6x, 24px) !important;
      box-sizing: border-box !important;
    }

    /* Primary column (video details, description, comments) */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #primary,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #primary {
      flex: 1 1 auto !important;
      min-width: var(--ytd-watch-flexy-min-player-width, 360px) !important;
      max-width: var(--ytd-watch-flexy-max-player-width, 1280px) !important;
    }

    /* Secondary column (recommendations) filling natural sidebar width */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #secondary,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #secondary {
      flex: 0 0 var(--ytd-watch-flexy-sidebar-width, 400px) !important;
      width: var(--ytd-watch-flexy-sidebar-width, 400px) !important;
      min-width: var(--ytd-watch-flexy-sidebar-min-width, 300px) !important;
      padding-left: var(--ytd-margin-6x, 24px) !important;
      box-sizing: border-box !important;
    }

    /* Ensure recommendations list fills secondary width without dead space */
    html[${ATTR_NORMAL_THEATER}] ytd-watch-flexy[theater] #secondary #related,
    html[${ATTR_NORMAL_THEATER}] ytd-watch-grid[theater] #secondary #related {
      display: block !important;
      width: 100% !important;
      margin-top: 0 !important;
    }
  `;

  /**
   * Injects the dedicated stylesheet idempotently.
   */
  function ensureStylesInjected() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = INJECTED_CSS;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /**
   * Removes the injected stylesheet if present.
   */
  function removeInjectedStyles() {
    const styleEl = document.getElementById(STYLE_ELEMENT_ID);
    if (styleEl) {
      styleEl.remove();
    }
  }

  /**
   * Checks if current URL is a Shorts page.
   */
  function isShortsPage() {
    return window.location.pathname.startsWith('/shorts/');
  }

  /**
   * Checks if player is in fullscreen mode.
   */
  function isFullscreenActive() {
    if (typeof isYouTubeFullscreen === 'function') {
      return isYouTubeFullscreen();
    }
    const player = document.querySelector('.html5-video-player, #movie_player');
    const isPlayerFs = Boolean(player && player.classList.contains('ytp-fullscreen'));
    const isDocFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    return isPlayerFs || isDocFs;
  }

  /**
   * Checks if watch page is in theater mode.
   */
  function isTheaterActive() {
    if (isFullscreenActive()) return false;
    const watch = document.querySelector(WATCH_CONTAINERS);
    return Boolean(watch && watch.hasAttribute('theater'));
  }

  /**
   * Determines if the current video qualifies as a standard on-demand video.
   * If config.target === 'normal', strictly excludes live streams and replays.
   */
  function isTargetVideo() {
    if (isShortsPage()) return false;

    if (config.target === 'normal') {
      // Exclude live streams
      if (typeof isYouTubeLiveNow === 'function' && isYouTubeLiveNow()) return false;
      if (typeof isLiveBroadcast === 'function' && isLiveBroadcast()) return false;
      // Exclude replay archives
      if (typeof hasArchiveReplaySignal === 'function' && hasArchiveReplaySignal()) return false;
      if (typeof detectChatMode === 'function') {
        const mode = detectChatMode();
        if (mode === 'live' || mode === 'archive') return false;
      }
    }

    return true;
  }

  /**
   * Checks if the layout should currently be applied.
   */
  function shouldApplyLayout() {
    return isRunning && isTheaterActive() && isTargetVideo();
  }

  /**
   * Applies the normalized theater layout idempotently.
   */
  function applyLayout() {
    if (!shouldApplyLayout()) {
      cleanLayout();
      return;
    }

    ensureStylesInjected();

    if (!document.documentElement.hasAttribute(ATTR_NORMAL_THEATER)) {
      document.documentElement.setAttribute(ATTR_NORMAL_THEATER, 'true');
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {}
    }
  }

  /**
   * Cleans the normalized theater layout attribute.
   */
  function cleanLayout() {
    if (document.documentElement.hasAttribute(ATTR_NORMAL_THEATER)) {
      document.documentElement.removeAttribute(ATTR_NORMAL_THEATER);
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {}
    }
  }

  /**
   * Schedules layout evaluation on the next animation frame (debounced).
   */
  function scheduleUpdate() {
    if (pendingRaf) return;
    pendingRaf = requestAnimationFrame(() => {
      pendingRaf = null;
      applyLayout();
    });
  }

  /**
   * Sets up a single scoped MutationObserver on YouTube layout containers.
   */
  function setupObserver() {
    if (layoutObserver) return;

    layoutObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const attr = mutation.attributeName;
          if (attr === 'theater' || attr === 'fullscreen' || attr === 'class') {
            shouldCheck = true;
            break;
          }
        } else if (mutation.type === 'childList') {
          shouldCheck = true;
          break;
        }
      }

      if (shouldCheck) {
        scheduleUpdate();
      }
    });

    const watch = document.querySelector(WATCH_CONTAINERS);
    if (watch) {
      layoutObserver.observe(watch, {
        attributes: true,
        attributeFilter: ['theater', 'fullscreen', 'class', 'style'],
        childList: true
      });
    }

    // Also observe documentElement for theme/fullscreen/overlay attribute changes
    layoutObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['fullscreen', 'data-yt-overlay-theater-active']
    });
  }

  /**
   * Attaches window and YouTube SPA navigation listeners.
   */
  function setupEventListeners() {
    if (boundListeners) return;

    const onNav = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();

    window.addEventListener('yt-navigate-finish', onNav, { passive: true });
    window.addEventListener('yt-page-data-updated', onNav, { passive: true });
    window.addEventListener('popstate', onNav, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    boundListeners = { onNav, onResize };
  }

  /**
   * Removes all attached listeners.
   */
  function removeEventListeners() {
    if (!boundListeners) return;

    window.removeEventListener('yt-navigate-finish', boundListeners.onNav);
    window.removeEventListener('yt-page-data-updated', boundListeners.onNav);
    window.removeEventListener('popstate', boundListeners.onNav);
    window.removeEventListener('resize', boundListeners.onResize);

    boundListeners = null;
  }

  /**
   * Initializes the layout normalization controller.
   */
  function init() {
    if (isRunning) return;
    isRunning = true;

    ensureStylesInjected();
    setupEventListeners();
    setupObserver();
    scheduleUpdate();
  }

  /**
   * Destroys the layout normalization controller and cleans up all changes.
   */
  function destroy() {
    if (!isRunning) return;
    isRunning = false;

    if (pendingRaf) {
      cancelAnimationFrame(pendingRaf);
      pendingRaf = null;
    }

    if (layoutObserver) {
      layoutObserver.disconnect();
      layoutObserver = null;
    }

    removeEventListeners();
    cleanLayout();
    removeInjectedStyles();
  }

  return {
    init,
    destroy,
    applyLayout,
    cleanLayout,
    scheduleUpdate,
    shouldApplyLayout,
    isTargetVideo,
    isTheaterActive
  };
}

// Global expose for content script or external consumption
if (typeof window !== 'undefined') {
  window.NativeLayoutNormalModeInTheater = NativeLayoutNormalModeInTheater;
}
