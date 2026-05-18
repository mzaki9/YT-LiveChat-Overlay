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
  
 
  const isDebug = () => localStorage.getItem('chatOverlayDebug') === 'true';

  function log(message) {
    if (isDebug()) console.log(`[YT Chat Overlay] ${message}`);
  }

  function debugState(label, details = {}) {
    if (!isDebug()) return;
    const safeDetails = {};
    for (const key of Object.keys(details)) {
      try {
        const value = details[key];
        safeDetails[key] = value instanceof Element ? `<${value.tagName.toLowerCase()} id="${value.id}" class="${value.className}">` : value;
      } catch (error) {
        safeDetails[key] = `[unreadable: ${error.message}]`;
      }
    }
    console.log(`[YT Chat Overlay] ${label}`, safeDetails);
    const debugPanel = document.getElementById('yt-overlay-debug-panel');
    if (debugPanel) {
      const line = document.createElement('div');
      line.textContent = `${new Date().toLocaleTimeString()} ${label}: ${JSON.stringify(safeDetails)}`;
      debugPanel.appendChild(line);
      while (debugPanel.childElementCount > 18) debugPanel.firstChild?.remove();
      debugPanel.scrollTop = debugPanel.scrollHeight;
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
    const href = getIframeHref(iframe);
    if (!href) return null;
    try {
      return new URL(href, window.location.origin).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function isIframeForCurrentVideo(iframe, videoId) {
    if (!iframe || !videoId) return true;
    const iframeVideoId = getIframeVideoId(iframe);
    return !iframeVideoId || iframeVideoId === videoId;
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
      if (!doc || !doc.body || doc.location.href.includes('about:blank')) return false;
      return Boolean(doc.querySelector('yt-live-chat-renderer, yt-live-chat-item-list-renderer'));
    } catch {
      return true;
    }
  }

  function getMoviePlayerLiveState() {
    const player = document.getElementById('movie_player');
    const data = player?.getVideoData?.();
    if (typeof data?.isLive === 'boolean') return data.isLive;
    if (typeof data?.isLiveContent === 'boolean') return data.isLiveContent;
    return null;
  }

  function getMoviePlayerIsLive() {
    const player = document.getElementById('movie_player');
    const data = player?.getVideoData?.();
    return typeof data?.isLive === 'boolean' ? data.isLive : null;
  }

  function getInitialPlayerResponseLiveState() {
    try {
      const details = window.ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
      if (typeof details?.isLiveNow === 'boolean') return details.isLiveNow;
      if (typeof window.ytInitialPlayerResponse?.videoDetails?.isLive === 'boolean') {
        return window.ytInitialPlayerResponse.videoDetails.isLive;
      }
      if (typeof window.ytInitialPlayerResponse?.videoDetails?.isLiveContent === 'boolean') {
        return window.ytInitialPlayerResponse.videoDetails.isLiveContent;
      }
    } catch {}
    return null;
  }

  function getInlinePlayerResponseLiveState() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('ytInitialPlayerResponse')) continue;

      const isLiveNowMatch = text.match(/"isLiveNow":(true|false)/);
      if (isLiveNowMatch?.[1]) return isLiveNowMatch[1] === 'true';

      const viewedLiveMatch = text.match(/"key":"is_viewed_live","value":"(True|False)"/);
      if (viewedLiveMatch?.[1]) return viewedLiveMatch[1] === 'True';

      const isLiveContentMatch = text.match(/"isLiveContent":(true|false)/);
      if (isLiveContentMatch?.[1]) return isLiveContentMatch[1] === 'true';
    }
    return null;
  }

  function hasArchiveReplaySignal() {
    const iframe = getLiveChatIframe();
    if (iframe && isIframeForCurrentVideo(iframe, getVideoId()) && isReplayChatIframe(iframe)) return true;
    const replayButton = document.querySelector('#show-hide-button button, ytd-live-chat-frame #show-hide-button button, #chat-container #show-hide-button button');
    const label = [
      replayButton?.getAttribute('aria-label'),
      replayButton?.getAttribute('title'),
      replayButton?.getAttribute('data-title-no-tooltip'),
      replayButton?.getAttribute('data-tooltip-text')
    ].join(' ').toLowerCase();
    return label.includes('replay') || label.includes('リプレイ');
  }

  function isYouTubeLiveNow() {
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
    'ytd-live-chat-frame #show-hide-button button',
    'ytd-live-chat-frame #show-hide-button yt-icon-button',
    '#chat-container #show-hide-button button',
    '#chat-container #show-hide-button yt-icon-button',
    'ytd-live-chat-frame #show-hide-button',
    '#chat-container #show-hide-button'
  ];

  const archivePlayerChatToggleSelectors = [
    '.ytp-right-controls toggle-button-view-model button[aria-pressed="false"]',
    '.ytp-right-controls button-view-model button[aria-pressed="false"]',
    '#movie_player toggle-button-view-model button[aria-pressed="false"]',
    '#movie_player button-view-model button[aria-pressed="false"]'
  ];

  function getButtonLabelText(element) {
    return `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('data-title-no-tooltip') || ''} ${element.getAttribute('data-tooltip-text') || ''}`.toLowerCase();
  }

  function isChatLabel(label) {
    return label.includes('chat') || label.includes('チャット');
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
    if (findFirstMatchingControl(archivePlayerChatToggleSelectors, { requireChatLabel: true, requireVisible: true })) return true;
    if (findFirstMatchingControl(archivePlayerChatToggleSelectors, { requireChatLabel: true, requireVisible: false })) return true;
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

  function revealPlayerControls() {
    const moviePlayer = document.getElementById('movie_player');
    if (!moviePlayer) return;
    for (const type of ['mouseover', 'mousemove', 'mouseenter']) {
      moviePlayer.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true }));
    }
  }

  function tryInvokeChatFrameShowHide() {
    const host = document.querySelector('ytd-live-chat-frame');
    if (typeof host?.onShowHideChat !== 'function') return false;
    host.onShowHideChat();
    return true;
  }

  function clickFirstMatchingSelector(selectors, options = {}) {
    const target = findFirstMatchingControl(selectors, options);
    if (!target) return false;
    target.click();
    return true;
  }

  function openArchiveNativeChatPanel() {
    if (isNativeChatMarkedExpanded() && !isNativeChatIframeBlank() && isNativeChatHostVisible()) return false;
    if (clickFirstMatchingSelector(archiveSidebarOpenSelectors, { requireVisible: true })) return true;
    if (clickFirstMatchingSelector(archiveSidebarOpenSelectors, { requireVisible: false })) return true;
    revealPlayerControls();
    if (clickFirstMatchingSelector(archivePlayerChatToggleSelectors, { requireChatLabel: true, requireVisible: true })) return true;
    if (clickFirstMatchingSelector(archivePlayerChatToggleSelectors, { requireChatLabel: true, requireVisible: false })) return true;
    return tryInvokeChatFrameShowHide();
  }

  function resolveLiveChatSource(currentIframe) {
    const videoId = getVideoId();
    if (!videoId) return null;
    const nativeIframe = getLiveChatIframe();
    if (nativeIframe && isReplayChatIframe(nativeIframe)) return null;
    const url = new URL('https://www.youtube.com/live_chat');
    url.searchParams.set('v', videoId);
    return { kind: 'live_direct', url: url.toString(), videoId };
  }

  function resolveArchiveChatSource(currentIframe) {
    const videoId = getVideoId();
    const nativeIframe = getLiveChatIframe() || currentIframe;
    if (!nativeIframe) return null;
    if (nativeIframe.getAttribute('data-yt-overlay-owned') === 'true') return null;
    if (!isIframeForCurrentVideo(nativeIframe, videoId)) return null;
    if (!isArchiveChatPlayable(nativeIframe)) return null;
    return { kind: 'archive_borrow', iframe: nativeIframe };
  }

  function detectChatMode(currentIframe) {
    const videoId = getVideoId();
    if (!videoId) return 'none';
    const iframe = currentIframe || getLiveChatIframe();
    if (iframe && isIframeForCurrentVideo(iframe, videoId)) {
      if (isReplayChatIframe(iframe)) return 'archive';
      if (isLiveChatIframe(iframe) || iframe.getAttribute('data-yt-overlay-owned') === 'true') return 'live';
    }
    if (isYouTubeLiveNow()) return 'live';
    if (resolveArchiveChatSource(currentIframe)) return 'archive';
    if (resolveLiveChatSource(currentIframe)) return 'live';
    if (hasArchiveNativeOpenControl()) {
      const isLive = getMoviePlayerIsLive();
      if (isLive === false && hasArchiveReplaySignal()) return 'archive';
      return 'live';
    }
    if (videoId) return 'live';
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
