/**
 * Utility functions for YouTube Live Chat Overlay
 */

// Debounce function to limit the rate of function execution
function debounce(func, wait) {
    let timeout;
    let lastCallTime = 0;
    
    return function executedFunction(...args) {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTime;
      
      // If enough time has passed, execute immediately
      if (timeSinceLastCall >= wait) {
        lastCallTime = now;
        return func.apply(this, args);
      }
      
      // Otherwise, schedule for later
      const later = () => {
        lastCallTime = Date.now();
        timeout = null;
        func.apply(this, args);
      };
      
      clearTimeout(timeout);
      timeout = setTimeout(later, wait - timeSinceLastCall);
    };
  }
  
  function log() {}

  // Never logs unless explicitly enabled, but callers still evaluate their
  // arguments. Anything expensive (detectChatMode() costs up to ~3 ms) must be
  // passed as a thunk so a disabled logger costs nothing.
  let debugLoggingEnabled = false;

  function debugState(message, data) {
    if (!debugLoggingEnabled) return;
    try {
      console.debug('[yt-overlay]', message, typeof data === 'function' ? data() : data);
    } catch {}
  }

  // Page-signal verdicts (live vs replay) are derived from data that cannot
  // change without a navigation: inline <script> text (~1.6 MB on a watch page),
  // ytInitialPlayerResponse and metadata markup. detectChatMode()/isYouTubeLiveNow()
  // re-scanned all of it on every call (up to ~3 ms each, ~47x a full
  // querySelectorAll('*')). Cache briefly, keyed by video + URL so SPA
  // navigations still force a refresh. See docs/perf-findings.md.
  const SIGNAL_CACHE_TTL_MS = 1000;
  let signalCache = null;
  let signalCacheKey = '';
  let signalCacheAt = 0;

  function invalidateSignalCache() {
    signalCache = null;
    signalCacheKey = '';
    signalCacheAt = 0;
  }

  function getCachedSignal(name, compute) {
    const key = `${getVideoId() || ''}@${window.location.href}`;
    const now = Date.now();
    if (!signalCache || signalCacheKey !== key || now - signalCacheAt > SIGNAL_CACHE_TTL_MS) {
      signalCache = {};
      signalCacheKey = key;
      signalCacheAt = now;
    }
    if (name in signalCache) return signalCache[name];
    const value = compute();
    signalCache[name] = value;
    return value;
  }

  function createSvgElement(name, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
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

  function isYouTubeDarkMode() {
    try {
      return document.documentElement.hasAttribute('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        window.location.search.includes('dark_theme=true') ||
        Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
    } catch {
      return false;
    }
  }

  function getLiveChatIframe() {
    return document.querySelector('#chatframe') ||
      document.querySelector('ytd-live-chat-frame iframe.ytd-live-chat-frame') ||
      document.querySelector('ytd-live-chat-frame iframe') ||
      document.querySelector('iframe[src*="live_chat"]');
  }

  function getIframeHref(iframe) {
    if (!iframe) return '';
    try {
      const docHref = iframe.contentDocument?.location?.href || '';
      if (docHref && !docHref.includes('about:blank')) return docHref;
    } catch {}
    return iframe.getAttribute('src') || iframe.src || '';
  }

  function isReplayChatIframe(iframe) {
    return getIframeHref(iframe).includes('/live_chat_replay');
  }

  function isLiveChatIframe(iframe) {
    const href = getIframeHref(iframe);
    return href.includes('/live_chat') && !href.includes('/live_chat_replay');
  }

  function getIframeVideoId(iframe) {
    if (!iframe) return null;
    const href = getIframeHref(iframe);
    if (href) {
      try {
        const v = new URL(href, window.location.origin).searchParams.get('v');
        if (v) return v;
      } catch {}
    }
    try {
      const win = iframe.contentWindow;
      const winVideoId = win?.ytcfg?.get?.('VIDEO_ID') || win?.ytcfg?.data_?.VIDEO_ID;
      if (typeof winVideoId === 'string' && winVideoId) return winVideoId;
    } catch {}
    const tagged = iframe.getAttribute('data-yt-overlay-video');
    if (tagged) return tagged;
    return null;
  }

  function markChatIframesStale(oldVideoId) {
    if (!oldVideoId) return;
    const iframes = document.querySelectorAll('iframe#chatframe, ytd-live-chat-frame iframe, iframe[src*="live_chat"], iframe[data-yt-overlay-chat="true"]');
    iframes.forEach((iframe) => {
      if (iframe.getAttribute('data-yt-overlay-owned') === 'true') {
        try { iframe.src = 'about:blank'; } catch {}
        iframe.remove();
        return;
      }
      iframe.setAttribute('data-yt-overlay-video', oldVideoId);
      const href = getIframeHref(iframe);
      if (href && !href.includes('about:blank')) {
        iframe.setAttribute('data-yt-overlay-stale-src', href);
      }
    });
  }

  function getPageContinuation() {
    try {
      const host = document.querySelector('ytd-live-chat-frame');
      const hostCont = host?.data?.liveChatRenderer?.continuations?.[0]?.reloadContinuationData?.continuation;
      if (hostCont) return hostCont;
    } catch {}
    try {
      const flexy = document.querySelector('ytd-watch-flexy, ytd-watch-grid');
      const flexyCont = flexy?.data?.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer?.continuations?.[0]?.reloadContinuationData?.continuation;
      if (flexyCont) return flexyCont;
    } catch {}
    try {
      const initCont = window.ytInitialData?.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer?.continuations?.[0]?.reloadContinuationData?.continuation;
      if (initCont) return initCont;
    } catch {}
    return null;
  }

  function hasIframeReloadedForNewVideo(iframe, videoId) {
    if (!iframe || !videoId) return false;
    const currentHref = getIframeHref(iframe);
    if (!currentHref || currentHref.includes('about:blank')) return false;

    // Direct match by ?v= query parameter (live chat)
    if (currentHref.includes(videoId)) return true;

    // Check if the current continuation matches page's continuation for new video
    const pageContinuation = getPageContinuation();
    if (pageContinuation && currentHref.includes(pageContinuation)) return true;

    // Check if URL has changed from the recorded stale URL
    const staleSrc = iframe.getAttribute('data-yt-overlay-stale-src');
    if (staleSrc && currentHref !== staleSrc) {
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.body && doc.body.children.length > 0) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  function checkAndRefreshNativeIframe(iframe, videoId) {
    if (!iframe || !videoId) return false;
    const taggedVideo = iframe.getAttribute('data-yt-overlay-video');
    if (taggedVideo === videoId) {
      return true;
    }
    if (hasIframeReloadedForNewVideo(iframe, videoId)) {
      iframe.setAttribute('data-yt-overlay-video', videoId);
      iframe.removeAttribute('data-yt-overlay-stale-src');
      return true;
    }
    return false;
  }

  function isIframeForCurrentVideo(iframe, videoId) {
    if (!iframe || !videoId) return true;
    if (checkAndRefreshNativeIframe(iframe, videoId)) return true;

    const taggedVideoId = iframe.getAttribute('data-yt-overlay-video');
    if (taggedVideoId) {
      return taggedVideoId === videoId;
    }

    const staleSrc = iframe.getAttribute('data-yt-overlay-stale-src');
    if (staleSrc) {
      const currentHref = getIframeHref(iframe);
      if (!currentHref || currentHref === staleSrc) return false;
    }

    const iframeVideoId = getIframeVideoId(iframe);
    if (iframeVideoId) {
      if (iframeVideoId === videoId) {
        iframe.setAttribute('data-yt-overlay-video', videoId);
        return true;
      }
      return false;
    }

    // Only on fresh initial page load (where it has never been stamped from a previous video)
    if (isReplayChatIframe(iframe) || isLiveChatIframe(iframe)) {
      iframe.setAttribute('data-yt-overlay-video', videoId);
      return true;
    }

    return false;
  }

  function hasUnavailableChatDocument(iframe) {
    try {
      const doc = iframe?.contentDocument;
      if (!doc || !doc.body) return false;
      if (doc.querySelector('yt-live-chat-unavailable-message-renderer')) return true;
      const text = doc.body.textContent?.toLowerCase() || '';
      return text.includes('live chat replay is not available') ||
        text.includes('chat is disabled') ||
        text.includes('live chat is disabled');
    } catch {
      return false;
    }
  }

  function isArchiveChatPlayable(iframe) {
    if (!iframe || !isReplayChatIframe(iframe)) return false;
    if (!isIframeForCurrentVideo(iframe, getVideoId())) return false;
    if (hasUnavailableChatDocument(iframe)) return false;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || doc.location.href.includes('about:blank')) {
        if (iframe.getAttribute('data-yt-overlay-chat') === 'true') {
          return true;
        }
        return false;
      }
      return Boolean(doc.querySelector('yt-live-chat-renderer, yt-live-chat-item-list-renderer, yt-live-chat-app'));
    } catch {
      return true;
    }
  }

  function getMoviePlayerLiveState() {
    const player = document.getElementById('movie_player');
    const data = player?.getVideoData?.();
    const currentVideoId = getVideoId();
    if (currentVideoId && data?.video_id && data.video_id !== currentVideoId) {
      return null;
    }
    if (typeof data?.isLive === 'boolean') return data.isLive;
    return null;
  }

  function getMoviePlayerIsLive() {
    return getMoviePlayerLiveState();
  }

  function getInitialPlayerResponseLiveState() {
    try {
      // ytInitialPlayerResponse is written once by the initial page load and is
      // never reassigned on SPA navigation: after changing videos it still
      // describes the previous one (verified: live -> replay keeps
      // {videoId, isLiveNow} of the old live stream). Ignore it then.
      const responseVideoId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
      const videoId = getVideoId();
      if (responseVideoId && videoId && responseVideoId !== videoId) return null;

      const details = window.ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
      if (typeof details?.isLiveNow === 'boolean') return details.isLiveNow;
      if (typeof window.ytInitialPlayerResponse?.videoDetails?.isLive === 'boolean') {
        return window.ytInitialPlayerResponse.videoDetails.isLive;
      }
    } catch {}
    return null;
  }

  function getInlinePlayerResponseLiveState() {
    return getCachedSignal('inlinePlayerResponseLive', () => {
      const videoId = getVideoId();
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('ytInitialPlayerResponse')) continue;
        // Inline scripts belong to the document that was loaded first, so after
        // an SPA navigation they still carry the previous video's verdict.
        if (videoId && !text.includes(videoId)) continue;

        const isLiveNowMatch = text.match(/"isLiveNow":(true|false)/);
        if (isLiveNowMatch?.[1]) return isLiveNowMatch[1] === 'true';

        const isLiveMatch = text.match(/"isLive":(true|false)/);
        if (isLiveMatch?.[1]) return isLiveMatch[1] === 'true';
      }
      return null;
    });
  }

  function hasReplayContinuationSignal() {
    return getCachedSignal('replayContinuation', () => {
      try {
        const videoId = getVideoId();
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          if (
            text.includes('liveChatReplayContinuation') ||
            text.includes('Show chat replay') ||
            text.includes('Live chat replay') ||
            text.includes('Top chat replay') ||
            text.includes('チャットのリプレイ')
          ) {
            if (videoId && text.includes('videoId') && !text.includes(videoId)) continue;
            return true;
          }
        }
      } catch {}
      return false;
    });
  }

  function isLiveBroadcast() {
    return getCachedSignal('liveBroadcast', () => {
      // Order matters: signals that YouTube refreshes per video come first,
      // page data that only exists for the initially loaded document last.
      const moviePlayerLive = getMoviePlayerLiveState();
      if (moviePlayerLive === true) return true;

      const watchFlexy = document.querySelector('ytd-watch-flexy');
      const watchGrid = document.querySelector('ytd-watch-grid');
      if (watchFlexy?.hasAttribute('is-live-now') || watchGrid?.hasAttribute('is-live-now')) return true;

      if (document.querySelector('.ytp-time-display.ytp-live, .ytp-live-badge.ytp-live-badge-is-livehead')) {
        return true;
      }

      // Fresh negative verdict from the player API beats any page data left
      // over from a previous video (live -> replay hop, same-document SPA).
      if (moviePlayerLive === false) return false;

      const initialLive = getInitialPlayerResponseLiveState();
      if (initialLive !== null) return initialLive;

      const inlineLive = getInlinePlayerResponseLiveState();
      if (inlineLive !== null) return inlineLive;

      return false;
    });
  }

  function hasArchiveReplaySignal() {
    const iframe = getLiveChatIframe();
    if (iframe && isIframeForCurrentVideo(iframe, getVideoId()) && isReplayChatIframe(iframe)) return true;

    return getCachedSignal('archiveReplaySignal', computeArchiveReplaySignal);
  }

  function computeArchiveReplaySignal() {
    if (isLiveBroadcast()) return false;

    // Check modern video metadata carousel specifically for replay text
    const carouselItems = document.querySelectorAll('yt-video-metadata-carousel-view-model');
    for (const item of carouselItems) {
      const text = `${item.getAttribute('aria-label') || ''} ${item.innerText || ''}`.toLowerCase();
      if (text.includes('chat replay') || text.includes('リプレイ') || text.includes('rekaman live chat') || text.includes('rekaman chat')) {
        return true;
      }
    }

    // Check buttons specifically for replay labels
    const replayButtons = document.querySelectorAll(
      'button[aria-label*="chat replay" i], ' +
      'button[aria-label*="Show chat replay" i], ' +
      'button[aria-label*="チャットのリプレイ" i], ' +
      'button[aria-label*="rekaman chat" i]'
    );
    for (const btn of replayButtons) {
      const label = [
        btn.getAttribute('aria-label'),
        btn.getAttribute('title'),
        btn.getAttribute('data-title-no-tooltip'),
        btn.getAttribute('data-tooltip-text'),
        btn.innerText
      ].join(' ').toLowerCase();
      if (label.includes('replay') || label.includes('リプレイ') || label.includes('rekaman')) {
        return true;
      }
    }

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy?.hasAttribute('should-stamp-chat')) return true;

    // Check inline player response / ytInitialData for replay continuation or replay title
    return hasReplayContinuationSignal();
  }

  function isYouTubeLiveNow() {
    if (isLiveBroadcast()) return true;
    if (hasArchiveReplaySignal()) return false;
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const watchGrid = document.querySelector('ytd-watch-grid');
    if (watchFlexy?.hasAttribute('is-live-now') || watchGrid?.hasAttribute('is-live-now')) return true;

    const moviePlayerLive = getMoviePlayerLiveState();
    if (moviePlayerLive !== null) return moviePlayerLive;

    const initialPlayerResponseLive = getInitialPlayerResponseLiveState();
    if (initialPlayerResponseLive !== null) return initialPlayerResponseLive;

    const inlinePlayerResponseLive = getInlinePlayerResponseLiveState();
    if (inlinePlayerResponseLive !== null) return inlinePlayerResponseLive;

    return Boolean(document.querySelector('.ytp-time-display.ytp-live, .ytp-live-badge.ytp-live-badge-is-livehead'));
  }

  function isYouTubeLiveVideo() {
    if (hasArchiveReplaySignal()) return false;
    const moviePlayerLive = getMoviePlayerLiveState();
    if (moviePlayerLive !== null) return moviePlayerLive;
    const initialPlayerResponseLive = getInitialPlayerResponseLiveState();
    if (initialPlayerResponseLive !== null) return initialPlayerResponseLive;
    const inlinePlayerResponseLive = getInlinePlayerResponseLiveState();
    if (inlinePlayerResponseLive !== null) return inlinePlayerResponseLive;
    return false;
  }

  function hasLiveChatSignals() {
    const iframe = getLiveChatIframe();
    if (iframe && isIframeForCurrentVideo(iframe, getVideoId())) {
      if (isLiveChatIframe(iframe) && !hasUnavailableChatDocument(iframe)) return true;
    }
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const watchGrid = document.querySelector('ytd-watch-grid');
    return Boolean(
      watchFlexy?.hasAttribute('live-chat-present') ||
      watchFlexy?.hasAttribute('live-chat-present-and-expanded') ||
      watchGrid?.hasAttribute('live-chat-present') ||
      watchGrid?.hasAttribute('live-chat-present-and-expanded') ||
      document.querySelector('ytd-live-chat-frame, #chat-container')
    );
  }

  const archiveSidebarOpenSelectors = [
    'yt-video-metadata-carousel-view-model [role="button"]',
    'yt-video-metadata-carousel-view-model button',
    'button[aria-label*="Show chat replay" i]',
    'button[aria-label*="chat replay" i]',
    'button[aria-label*="チャットのリプレイ" i]',
    'ytd-live-chat-frame #show-hide-button button',
    '#chat-container #show-hide-button button'
  ];

  function getButtonLabelText(element) {
    const carouselText = element.closest('yt-video-metadata-carousel-view-model')?.innerText || '';
    return `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('data-title-no-tooltip') || ''} ${element.getAttribute('data-tooltip-text') || ''} ${element.innerText || ''} ${carouselText}`.toLowerCase();
  }

  function isChatLabel(label) {
    return label.includes('replay') ||
      label.includes('リプレイ') ||
      label.includes('chat') ||
      label.includes('チャット') ||
      label.includes('open panel') ||
      label.includes('buka panel') ||
      label.includes('rekaman');
  }

  function isElementVisible(element) {
    if (!element || element.hasAttribute('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return element.getClientRects().length > 0;
  }

  function resolveClickable(target) {
    if (!target) return null;
    if (target.matches('button, yt-icon-button, [role="button"]')) return target;
    return target.querySelector('button, yt-icon-button, [role="button"]');
  }

  function findFirstMatchingControl(selectors, options = {}) {
    const requireVisible = options.requireVisible !== false;
    for (const selector of selectors) {
      const targets = Array.from(document.querySelectorAll(selector));
      for (const target of targets) {
        const clickable = resolveClickable(target);
        if (!clickable) continue;
        if (requireVisible && !isElementVisible(clickable)) continue;
        if (clickable instanceof HTMLButtonElement && clickable.disabled) continue;
        if (clickable.getAttribute('aria-disabled') === 'true') continue;
        if (options.requireChatLabel && !isChatLabel(getButtonLabelText(clickable))) continue;
        return clickable;
      }
    }
    return null;
  }

  function hasChatFrameShowHideHandler() {
    const host = document.querySelector('ytd-live-chat-frame');
    return typeof host?.onShowHideChat === 'function';
  }

  function hasArchiveShowHideSlotContent() {
    const slots = document.querySelectorAll('ytd-live-chat-frame #show-hide-button, #chat-container #show-hide-button');
    for (const slot of slots) {
      if (slot.querySelector('button, yt-icon-button, [role="button"]')) return true;
      if ((slot.textContent || '').trim().length > 0) return true;
    }
    return false;
  }

  function hasArchiveNativeOpenControl() {
    if (findFirstMatchingControl(archiveSidebarOpenSelectors, { requireVisible: true })) return true;
    if (findFirstMatchingControl(archiveSidebarOpenSelectors, { requireVisible: false })) return true;
    return hasChatFrameShowHideHandler() && hasArchiveShowHideSlotContent();
  }

  function isNativeChatMarkedExpanded() {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const watchGrid = document.querySelector('ytd-watch-grid');
    return Boolean(watchFlexy?.hasAttribute('live-chat-present-and-expanded') || watchGrid?.hasAttribute('live-chat-present-and-expanded'));
  }

  function isNativeChatHostVisible() {
    const host = document.querySelector('ytd-live-chat-frame');
    if (!host) return false;
    if (host.hasAttribute('hidden') || host.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(host);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isNativeChatIframeBlank() {
    const href = getIframeHref(getLiveChatIframe());
    return !href || href.includes('about:blank');
  }

  function tryInvokeChatFrameShowHide() {
    const host = document.querySelector('ytd-live-chat-frame');
    if (!host) return false;
    if (typeof host.onShowHideChat === 'function') {
      host.onShowHideChat();
      return true;
    }
    if (host.collapsed === true) {
      host.collapsed = false;
      return true;
    }
    return false;
  }

  function clickFirstMatchingSelector(selectors, options = {}) {
    const target = findFirstMatchingControl(selectors, options);
    if (!target) return false;
    target.click();
    return true;
  }

  function openArchiveNativeChatPanel() {
    if (isLiveBroadcast() || isYouTubeLiveNow()) return false;
    const host = document.querySelector('ytd-live-chat-frame');
    const isFrameCollapsed = host?.collapsed === true || (host && window.getComputedStyle(host).display === 'none');
    const currentIframe = getLiveChatIframe();
    const isFrameValidForCurrent = currentIframe && isIframeForCurrentVideo(currentIframe, getVideoId());
    if (!isFrameCollapsed && isNativeChatMarkedExpanded() && isFrameValidForCurrent && !isNativeChatIframeBlank() && isNativeChatHostVisible()) {
      return false;
    }

    if (clickFirstMatchingSelector(archiveSidebarOpenSelectors, { requireChatLabel: true, requireVisible: true })) return true;
    if (clickFirstMatchingSelector(archiveSidebarOpenSelectors, { requireChatLabel: true, requireVisible: false })) return true;
    return tryInvokeChatFrameShowHide();
  }

  function isReusableLiveChatIframe(iframe, videoId) {
    if (!iframe) return false;
    if (iframe.getAttribute('data-yt-overlay-owned') === 'true') return false;
    if (!isIframeForCurrentVideo(iframe, videoId)) return false;
    if (hasUnavailableChatDocument(iframe)) return false;
    // YouTube only loads chat into its own host frame, so an empty frame cannot be
    // borrowed: require a document that is already running.
    if (!isLiveChatIframe(iframe)) return false;
    return Boolean(iframe.id === 'chatframe' || iframe.closest('ytd-live-chat-frame'));
  }

  function findNativeLiveChatIframe(currentIframe) {
    const candidates = document.querySelectorAll('iframe#chatframe, ytd-live-chat-frame iframe, iframe[src*="live_chat"]');
    const videoId = getVideoId();
    let fallback = null;
    for (const candidate of candidates) {
      if (!isReusableLiveChatIframe(candidate, videoId)) continue;
      // Keep the frame we are already serving so the overlay never churns.
      if (candidate === currentIframe) return candidate;
      if (!fallback) fallback = candidate;
    }
    return fallback;
  }

  function isBorrowedSourceKind(kind) {
    return kind === 'archive_borrow' || kind === 'native_borrow';
  }

  function resolveLiveChatSource(currentIframe) {
    const videoId = getVideoId();
    if (!videoId) return null;
    if (!isYouTubeLiveNow()) return null;
    // Note: a replay document sitting in the native frame is deliberately not
    // treated as a blocker. isYouTubeLiveNow() already ruled out VODs, so on a
    // live video such a document belongs to the previous video (its URL is
    // continuation-based and carries no ?v=). Bailing out there left the overlay
    // empty after a live -> replay -> live hop.
    // Reuse YouTube's own live chat document when one is already running. A second,
    // overlay-owned copy keeps receiving and rendering every message behind the
    // scenes (~33 MB heap, ~70% of chat script time - see docs/perf-findings.md).
    const borrowable = findNativeLiveChatIframe(currentIframe);
    if (borrowable) {
      return { kind: 'native_borrow', iframe: borrowable };
    }
    const url = new URL('https://www.youtube.com/live_chat');
    url.searchParams.set('v', videoId);
    if (isYouTubeDarkMode()) {
      url.searchParams.set('dark_theme', 'true');
    }
    return { kind: 'live_direct', url: url.toString(), videoId };
  }

  function resolveArchiveChatSource(currentIframe) {
    const videoId = getVideoId();
    const nativeIframe = getLiveChatIframe() || currentIframe;
    if (!nativeIframe) return null;
    if (nativeIframe.getAttribute('data-yt-overlay-owned') === 'true') return null;
    if (!isIframeForCurrentVideo(nativeIframe, videoId)) return null;
    if (nativeIframe === currentIframe && currentIframe?.getAttribute('data-yt-overlay-chat') === 'true') {
      if (isReplayChatIframe(currentIframe)) {
        return { kind: 'archive_borrow', iframe: currentIframe };
      }
    }
    if (!isArchiveChatPlayable(nativeIframe)) return null;
    return { kind: 'archive_borrow', iframe: nativeIframe };
  }

  function detectChatMode(currentIframe) {
    const videoId = getVideoId();
    if (!videoId) return 'none';
    // Chat URLs are continuation-based and carry no ?v=, so a document kept
    // from the previous video is indistinguishable from this video's by URL
    // alone. Settle live-vs-replay from the page first, then only let a chat
    // document confirm that verdict.
    const liveNow = isYouTubeLiveNow();
    const iframe = currentIframe || getLiveChatIframe();
    if (iframe && isIframeForCurrentVideo(iframe, videoId)) {
      if (isReplayChatIframe(iframe)) {
        // live -> replay -> live: the previous video's replay chat must not
        // mask a video that is live now.
        if (!liveNow) return 'archive';
      } else if (isLiveChatIframe(iframe) || iframe.getAttribute('data-yt-overlay-owned') === 'true') {
        // Symmetric guard: only believe a live_chat document while the player
        // does not explicitly report this video as a VOD.
        if (getMoviePlayerIsLive() !== false) return 'live';
      }
    }
    if (liveNow) return 'live';
    if (resolveArchiveChatSource(currentIframe)) return 'archive';
    if (hasArchiveReplaySignal()) return 'archive';
    if (hasArchiveNativeOpenControl()) {
      const isLive = getMoviePlayerIsLive();
      if (isLive === false && hasArchiveReplaySignal()) return 'archive';
      if (isLive === true) return 'live';
    }
    if (resolveLiveChatSource(currentIframe)) return 'live';
    return 'none';
  }

  function getColorFromName(name) {
    let hash = 0;
    const len = Math.min(name.length, 8);
    for (let i = 0; i < len; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) & 0xFFFFFFFF;
    }
    
    const avoidRanges = [
      [100, 140], // green area (for members)
      [200, 240]  // blue area (for moderators)
    ];
    
    const h = (hash >>> 0) % 360;
    const s = 70 + ((hash >>> 0) % 20); 
    const l = 60 + ((hash >>> 0) % 15);
    
    let finalHue = h;
    for (const [min, max] of avoidRanges) {
      if (h >= min && h <= max) {
        finalHue = (h + 120) % 360;
        break;
      }
    }
    
    return `hsl(${finalHue}, ${s}%, ${l}%)`;
  }

  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      const queryId = url.searchParams.get('v');
      if (queryId) return queryId;
      const liveMatch = url.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch?.[1]) return liveMatch[1];
    } catch {}
    const watchFlexyId = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
    if (watchFlexyId) return watchFlexyId;

    const moviePlayer = document.getElementById('movie_player');
    const moviePlayerId = moviePlayer?.getAttribute('video-id');
    if (moviePlayerId) return moviePlayerId;
    const playerData = moviePlayer?.getVideoData?.();
    if (playerData?.video_id) return playerData.video_id;

    try {
      if (window.ytInitialPlayerResponse?.videoDetails?.videoId) {
        return window.ytInitialPlayerResponse.videoDetails.videoId;
      }
    } catch {}
    const og = document.querySelector('meta[property="og:url"]');
    if (og) {
      const m = og.content.match(/[?&]v=([^&]+)/);
      if (m) return m[1];
    }
    return null;
  }
