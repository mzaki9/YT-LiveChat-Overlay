/**
 * NativeLayoutNormalModeInTheater
 *
 * Normalizes YouTube video layout in Theater Mode when chat is removed or hidden,
 * restoring the spatial proportions of a standard on-demand video.
 *
 * Signature:
 * NativeLayoutNormalModeInTheater :: Config -> Controller
 */

function NativeLayoutNormalModeInTheater(userConfig) {
  const DEFAULT_CONFIG = {
    target: "normal",
    chatPosition: "overlay",
    makeItNativeLike: true,
  };

  const config = Object.assign({}, DEFAULT_CONFIG, userConfig);

  // Constants & Selectors
  const ATTR_NORMAL_THEATER = "data-yt-native-theater-normal";
  const WATCH_CONTAINERS = "ytd-watch-flexy, ytd-watch-grid";

  // State
  let isRunning = false;
  let layoutObserver = null;
  let pendingRaf = null;
  let boundListeners = null;

  /**
   * Checks if current URL is a Shorts page.
   */
  function isShortsPage() {
    return window.location.pathname.startsWith("/shorts/");
  }

  /**
   * Checks if player is in fullscreen mode.
   */
  function isFullscreenActive() {
    if (typeof isYouTubeFullscreen === "function") {
      return isYouTubeFullscreen();
    }
    const player = document.querySelector(".html5-video-player, #movie_player");
    const isPlayerFs = Boolean(
      player && player.classList.contains("ytp-fullscreen"),
    );
    const isDocFs = Boolean(
      document.fullscreenElement || document.webkitFullscreenElement,
    );
    return isPlayerFs || isDocFs;
  }

  /**
   * Checks if watch page is in theater mode.
   */
  function isTheaterActive() {
    if (isFullscreenActive()) return false;
    if (typeof isYouTubeTheater === "function") {
      return isYouTubeTheater();
    }
    const watch = document.querySelector(WATCH_CONTAINERS);
    return Boolean(watch && watch.hasAttribute("theater"));
  }

  /**
   * Determines if the current video qualifies as a standard on-demand video.
   * If config.target === 'normal', strictly excludes live streams and replays.
   */
  function isTargetVideo() {
    if (isShortsPage()) return false;

    if (config.target === "normal") {
      // Exclude live streams
      if (typeof isYouTubeLiveNow === "function" && isYouTubeLiveNow())
        return false;
      if (typeof isLiveBroadcast === "function" && isLiveBroadcast())
        return false;
      // Exclude replay archives
      if (
        typeof hasArchiveReplaySignal === "function" &&
        hasArchiveReplaySignal()
      )
        return false;
      if (typeof detectChatMode === "function") {
        const mode = detectChatMode();
        if (mode === "live" || mode === "archive") return false;
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

    if (!document.documentElement.hasAttribute(ATTR_NORMAL_THEATER)) {
      document.documentElement.setAttribute(ATTR_NORMAL_THEATER, "true");
      try {
        window.dispatchEvent(new Event("resize"));
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
        window.dispatchEvent(new Event("resize"));
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
        if (mutation.type === "attributes") {
          const attr = mutation.attributeName;
          if (attr === "theater" || attr === "fullscreen" || attr === "class") {
            shouldCheck = true;
            break;
          }
        } else if (mutation.type === "childList") {
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
        attributeFilter: ["theater", "fullscreen", "class", "style"],
        childList: true,
      });
    }

    // Also observe documentElement for fullscreen / overlay attribute changes
    layoutObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["fullscreen", "data-yt-overlay-theater-active"],
    });
  }

  /**
   * Attaches window and YouTube SPA navigation listeners.
   */
  function setupEventListeners() {
    if (boundListeners) return;

    const onNav = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();

    window.addEventListener("yt-navigate-finish", onNav, { passive: true });
    window.addEventListener("yt-page-data-updated", onNav, { passive: true });
    window.addEventListener("popstate", onNav, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    boundListeners = { onNav, onResize };
  }

  /**
   * Removes all attached listeners.
   */
  function removeEventListeners() {
    if (!boundListeners) return;

    window.removeEventListener("yt-navigate-finish", boundListeners.onNav);
    window.removeEventListener("yt-page-data-updated", boundListeners.onNav);
    window.removeEventListener("popstate", boundListeners.onNav);
    window.removeEventListener("resize", boundListeners.onResize);

    boundListeners = null;
  }

  /**
   * Initializes the layout normalization controller.
   */
  function init() {
    if (isRunning) return;
    isRunning = true;

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
  }

  return {
    init,
    destroy,
    applyLayout,
    cleanLayout,
    scheduleUpdate,
    shouldApplyLayout,
    isTargetVideo,
    isTheaterActive,
  };
}

// Global expose for content script or external consumption
if (typeof window !== "undefined") {
  window.NativeLayoutNormalModeInTheater = NativeLayoutNormalModeInTheater;
}
