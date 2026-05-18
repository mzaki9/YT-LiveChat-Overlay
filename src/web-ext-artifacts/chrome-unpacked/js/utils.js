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

    const details = window.ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
    if (typeof details?.isLiveNow === 'boolean') return details.isLiveNow;
    if (typeof window.ytInitialPlayerResponse?.videoDetails?.isLive === 'boolean') {
      return window.ytInitialPlayerResponse.videoDetails.isLive;
    }

    return Boolean(document.querySelector('.ytp-time-display.ytp-live, .ytp-live-badge.ytp-live-badge-is-livehead'));
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

  function resolveLiveChatSource(currentIframe) {
    const videoId = getVideoId();
    if (!videoId) return null;
    const nativeIframe = getLiveChatIframe();
    if (nativeIframe && isReplayChatIframe(nativeIframe)) return null;
    const managedCurrent = currentIframe?.getAttribute('data-yt-overlay-owned') === 'true';
    if (!isYouTubeLiveNow() && !isLiveChatIframe(nativeIframe) && !managedCurrent) return null;
    if (!hasLiveChatSignals() && !managedCurrent) return null;
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
    if (resolveArchiveChatSource(currentIframe)) return 'archive';
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
    const p = new URLSearchParams(window.location.search);
    if (p.has('v')) return p.get('v');
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
