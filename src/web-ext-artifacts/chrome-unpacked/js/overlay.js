/**
 * Native YouTube chat iframe overlay creation and management.
 */

let isOverlayVisible = false;
let activeChatIframe = null;
let activeChatSourceKind = null;
let borrowedIframeRestoreTarget = null;
const pendingNativeHostRestoreIframes = new Set();
let pendingNativeHostRestoreObserver = null;

function createToggleIcon(active) {
  const svg = createSvgElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });

  if (active) {
    const line1 = createSvgElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" });
    const line2 = createSvgElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" });
    svg.appendChild(line1);
    svg.appendChild(line2);
  } else {
    const path = createSvgElement("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    });
    svg.appendChild(path);
  }
  return svg;
}

function updateToggleButtonIcon(button, active) {
  button.replaceChildren(createToggleIcon(active));
}

function createToggleButton(videoPlayer, toggleCallback) {
  const toggleButton = document.createElement("button");
  toggleButton.id = "toggle-chat-overlay";
  updateToggleButtonIcon(toggleButton, false);
  toggleButton.title = "Show Chat";
  toggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCallback();
  });
  videoPlayer.appendChild(toggleButton);
  return toggleButton;
}

function setupSettingsPanel(settingsIcon, settingsPanel, container) {
  settingsIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    const isShown = settingsPanel.classList.toggle("show");
    container.classList.toggle("settings-open", isShown);
  });

  document.addEventListener("click", (event) => {
    if (!settingsPanel.contains(event.target) && event.target !== settingsIcon) {
      settingsPanel.classList.remove("show");
      container.classList.remove("settings-open");
    }
  });

  const opacitySlider = settingsPanel.querySelector("#opacity-slider");
  const rawSavedOpacity = localStorage.getItem("chatOverlayOpacity");
  const savedOpacity = rawSavedOpacity !== null ? Number(rawSavedOpacity) : 50;
  opacitySlider.value = savedOpacity;
  container.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;

  opacitySlider.addEventListener("input", (event) => {
    event.stopPropagation();
    const value = event.target.value;
    container.style.backgroundColor = `rgba(0, 0, 0, ${value / 100})`;
    localStorage.setItem("chatOverlayOpacity", value);
  });

  const blurSlider = settingsPanel.querySelector("#blur-slider");
  const rawSavedBlur = localStorage.getItem("chatOverlayBlur");
  const savedBlur = rawSavedBlur !== null ? Number(rawSavedBlur) : 8;
  blurSlider.value = savedBlur;
  container.style.backdropFilter = `blur(${savedBlur}px)`;
  container.style.webkitBackdropFilter = `blur(${savedBlur}px)`;

  blurSlider.addEventListener("input", (event) => {
    event.stopPropagation();
    const value = event.target.value;
    container.style.backdropFilter = `blur(${value}px)`;
    container.style.webkitBackdropFilter = `blur(${value}px)`;
    localStorage.setItem("chatOverlayBlur", value);
  });

  const tickerToggle = settingsPanel.querySelector("#hide-ticker-toggle");
  const savedHideTicker = localStorage.getItem("chatOverlayHideTicker") === "true";
  tickerToggle.checked = savedHideTicker;

  const headerToggle = settingsPanel.querySelector("#hide-header-toggle");
  const savedHideHeader = localStorage.getItem("chatOverlayHideHeader") === "true";
  headerToggle.checked = savedHideHeader;

  const autoHideHeaderToggle = settingsPanel.querySelector("#auto-hide-header-toggle");
  const savedAutoHideHeader = localStorage.getItem("chatOverlayAutoHideHeader") !== "false";
  autoHideHeaderToggle.checked = savedAutoHideHeader;

  const inputToggle = settingsPanel.querySelector("#hide-input-toggle");
  const savedHideInput = localStorage.getItem("chatOverlayHideInput") !== "false";
  if (inputToggle) inputToggle.checked = savedHideInput;

  const stealthReplayToggle = settingsPanel.querySelector("#hide-native-replay-toggle");
  const savedStealthReplay = isStealthReplayEnabled();
  if (stealthReplayToggle) stealthReplayToggle.checked = savedStealthReplay;

  applyTickerHideStyle(savedHideTicker, savedHideHeader, savedAutoHideHeader, savedHideInput);
  applyStealthReplayStyle(savedStealthReplay);

  function syncThemeStyles() {
    const hideTicker = tickerToggle.checked;
    const hideHeader = headerToggle.checked;
    const autoHideHeader = autoHideHeaderToggle.checked;
    const hideInput = inputToggle ? inputToggle.checked : true;
    const hideStealthReplay = stealthReplayToggle ? stealthReplayToggle.checked : true;
    localStorage.setItem("chatOverlayHideTicker", hideTicker);
    localStorage.setItem("chatOverlayHideHeader", hideHeader);
    localStorage.setItem("chatOverlayAutoHideHeader", autoHideHeader);
    localStorage.setItem("chatOverlayHideInput", hideInput);
    localStorage.setItem("chatOverlayStealthReplay", hideStealthReplay);
    applyTickerHideStyle(hideTicker, hideHeader, autoHideHeader, hideInput);
    applyStealthReplayStyle(hideStealthReplay);
  }

  tickerToggle.addEventListener("change", (event) => {
    event.stopPropagation();
    syncThemeStyles();
  });

  headerToggle.addEventListener("change", (event) => {
    event.stopPropagation();
    syncThemeStyles();
  });

  autoHideHeaderToggle.addEventListener("change", (event) => {
    event.stopPropagation();
    syncThemeStyles();
  });

  if (inputToggle) {
    inputToggle.addEventListener("change", (event) => {
      event.stopPropagation();
      syncThemeStyles();
    });
  }

  if (stealthReplayToggle) {
    stealthReplayToggle.addEventListener("change", (event) => {
      event.stopPropagation();
      syncThemeStyles();
    });
  }

  settingsPanel.addEventListener("mousedown", (event) => event.stopPropagation());
  settingsPanel.addEventListener("click", (event) => event.stopPropagation());
  settingsPanel.addEventListener("keydown", (event) => event.stopPropagation());
}

function createSettingsIconElement() {
  const settingsIcon = document.createElement("div");
  settingsIcon.id = "settings-icon";

  const svg = createSvgElement("svg", {
    viewBox: "0 0 24 24",
    width: "16",
    height: "16"
  });
  const path = createSvgElement("path", {
    fill: "currentColor",
    d: "M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
  });
  svg.appendChild(path);
  settingsIcon.appendChild(svg);

  settingsIcon.addEventListener("pointerdown", (e) => e.stopPropagation());
  settingsIcon.addEventListener("mousedown", (e) => e.stopPropagation());
  return settingsIcon;
}

function createSettingsPanelElement() {
  const panel = document.createElement("div");
  panel.id = "settings-panel";

  // Opacity control
  const opacityRow = document.createElement("div");
  opacityRow.className = "opacity-control";
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "Opacity:";
  opacityLabel.htmlFor = "opacity-slider";
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "100";
  opacityInput.value = "50";
  opacityInput.id = "opacity-slider";
  opacityRow.appendChild(opacityLabel);
  opacityRow.appendChild(opacityInput);
  panel.appendChild(opacityRow);

  // Blur control
  const blurRow = document.createElement("div");
  blurRow.className = "opacity-control";
  const blurLabel = document.createElement("label");
  blurLabel.textContent = "Blur:";
  blurLabel.htmlFor = "blur-slider";
  const blurInput = document.createElement("input");
  blurInput.type = "range";
  blurInput.min = "0";
  blurInput.max = "20";
  blurInput.value = "8";
  blurInput.id = "blur-slider";
  blurRow.appendChild(blurLabel);
  blurRow.appendChild(blurInput);
  panel.appendChild(blurRow);

  // Auto-hide header toggle
  const autoHideRow = document.createElement("div");
  autoHideRow.className = "toggle-control";
  const autoHideLabel = document.createElement("label");
  autoHideLabel.textContent = "Auto-hide header on hover";
  autoHideLabel.htmlFor = "auto-hide-header-toggle";
  const autoHideInput = document.createElement("input");
  autoHideInput.type = "checkbox";
  autoHideInput.id = "auto-hide-header-toggle";
  autoHideInput.checked = true;
  autoHideRow.appendChild(autoHideLabel);
  autoHideRow.appendChild(autoHideInput);
  panel.appendChild(autoHideRow);

  // Hide ticker toggle
  const tickerRow = document.createElement("div");
  tickerRow.className = "toggle-control";
  const tickerLabel = document.createElement("label");
  tickerLabel.textContent = "Hide Super Chat ticker";
  tickerLabel.htmlFor = "hide-ticker-toggle";
  const tickerInput = document.createElement("input");
  tickerInput.type = "checkbox";
  tickerInput.id = "hide-ticker-toggle";
  tickerRow.appendChild(tickerLabel);
  tickerRow.appendChild(tickerInput);
  panel.appendChild(tickerRow);

  // Hide header toggle
  const headerRow = document.createElement("div");
  headerRow.className = "toggle-control";
  const headerLabel = document.createElement("label");
  headerLabel.textContent = "Always hide chat header";
  headerLabel.htmlFor = "hide-header-toggle";
  const headerInput = document.createElement("input");
  headerInput.type = "checkbox";
  headerInput.id = "hide-header-toggle";
  headerRow.appendChild(headerLabel);
  headerRow.appendChild(headerInput);
  panel.appendChild(headerRow);

  // Hide chat input (comment, love, money) toggle
  const inputRow = document.createElement("div");
  inputRow.className = "toggle-control";
  const inputLabel = document.createElement("label");
  inputLabel.textContent = "Hide chat input (comment, love, money)";
  inputLabel.htmlFor = "hide-input-toggle";
  const inputInput = document.createElement("input");
  inputInput.type = "checkbox";
  inputInput.id = "hide-input-toggle";
  inputInput.checked = true;
  inputRow.appendChild(inputLabel);
  inputRow.appendChild(inputInput);
  panel.appendChild(inputRow);

  // Hide native replay sidebar toggle
  const stealthReplayRow = document.createElement("div");
  stealthReplayRow.className = "toggle-control";
  const stealthReplayLabel = document.createElement("label");
  stealthReplayLabel.textContent = "Hide native replay sidebar";
  stealthReplayLabel.htmlFor = "hide-native-replay-toggle";
  const stealthReplayInput = document.createElement("input");
  stealthReplayInput.type = "checkbox";
  stealthReplayInput.id = "hide-native-replay-toggle";
  stealthReplayInput.checked = true;
  stealthReplayRow.appendChild(stealthReplayLabel);
  stealthReplayRow.appendChild(stealthReplayInput);
  panel.appendChild(stealthReplayRow);

  return panel;
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

  const settingsIcon = createSettingsIconElement();
  dragHandle.appendChild(settingsIcon);

  const settingsPanel = createSettingsPanelElement();
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
    container.style.right = "auto";
    container.style.bottom = "auto";
    container.style.width = `${Math.max(200, Math.min(width, viewportWidth * 0.9))}px`;
    container.style.height = `${Math.max(150, Math.min(height, viewportHeight * 0.9))}px`;
    return;
  }

  container.style.left = "70%";
  container.style.top = "10%";
  container.style.right = "auto";
  container.style.bottom = "auto";
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
  const loadStart = performance.now();
  iframe.addEventListener("load", () => {
    const duration = performance.now() - loadStart;
    if (typeof recordIframeLoadDuration === "function") {
      recordIframeLoadDuration(duration);
    } else if (globalThis.__ytOverlayPerf?.recordIframeLoad) {
      globalThis.__ytOverlayPerf.recordIframeLoad(duration);
    }
    injectChatIframeThemeOverride(iframe);
    debugState("managed live iframe load", {
      durationMs: duration,
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

function getThemeOverrideCss(hideTicker, hideHeader, autoHideHeader = true, hideInput = true) {
  let headerRules = "";
  if (hideHeader) {
    headerRules = "yt-live-chat-header-renderer { display: none !important; }";
  } else if (autoHideHeader) {
    headerRules = `
      yt-live-chat-header-renderer {
        opacity: 0 !important;
        max-height: 0 !important;
        min-height: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        pointer-events: none !important;
        transition: opacity 0.25s ease, max-height 0.25s ease, padding 0.25s ease !important;
      }
      yt-live-chat-app:hover yt-live-chat-header-renderer,
      yt-live-chat-renderer:hover yt-live-chat-header-renderer {
        opacity: 1 !important;
        max-height: 60px !important;
        height: auto !important;
        pointer-events: auto !important;
      }
    `;
  }

  const inputRules = hideInput ? `
    #input-panel,
    yt-live-chat-message-input-renderer,
    yt-reaction-control-panel-overlay-renderer,
    #reaction-control-panel-overlay,
    #reactions,
    yt-live-chat-reaction-control-panel-renderer,
    yt-live-chat-restricted-participation-renderer,
    yt-live-chat-renderer > #separator {
      display: none !important;
    }
    #item-scroller {
      margin-bottom: 0 !important;
      padding-bottom: 8px !important;
    }
  ` : "";

  return `
    html,
    body {
      background-color: transparent !important;
      background: transparent !important;
    }
    yt-live-chat-app {
      --yt-live-chat-background-color: transparent !important;
      --yt-live-chat-action-panel-background-color: transparent !important;
      --yt-live-chat-secondary-background-color: transparent !important;
      --yt-live-chat-toast-background-color: rgba(33, 33, 33, 0.9) !important;
      --yt-live-chat-mode-change-background-color: transparent !important;
      --yt-spec-base-background: transparent !important;
      --yt-spec-general-background-a: transparent !important;
      --yt-spec-general-background-b: transparent !important;
      --yt-sys-color-baseline--base-background: transparent !important;
      --yt-sys-color-baseline--surface: transparent !important;
      --yt-sys-color-baseline--surface-variant: transparent !important;
      --yt-sys-color-baseline--text-primary: #f1f1f1 !important;
      --yt-sys-color-baseline--text-secondary: #aaa !important;
      --yt-live-chat-primary-text-color: #f1f1f1 !important;
      --yt-live-chat-secondary-text-color: #aaa !important;
      background-color: transparent !important;
      background: transparent !important;
    }
    yt-live-chat-renderer,
    yt-live-chat-renderer[is-replay],
    yt-live-chat-item-list-renderer,
    yt-live-chat-header-renderer,
    #item-scroller,
    #item-list,
    #item-list #items,
    #contents,
    #chat,
    #loading,
    yt-live-chat-ninja-message-renderer,
    ytd-engagement-panel-section-list-renderer,
    #content.ytd-engagement-panel-section-list-renderer,
    #panel-pages,
    #content-pages {
      background-color: transparent !important;
      background: transparent !important;
    }
    #card.yt-live-chat-viewer-engagement-message-renderer {
      background-color: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #f1f1f1 !important;
    }
    #container.yt-live-chat-restricted-participation-renderer {
      background: transparent !important;
      color: rgba(235, 232, 232, 0.7) !important;
    }
    yt-live-chat-text-message-renderer #message,
    yt-live-chat-text-message-renderer #author-name,
    yt-live-chat-header-renderer,
    #title.yt-live-chat-header-renderer,
    #view-selector yt-dropdown-menu,
    #trigger.tp-yt-paper-menu-button {
      color: #f1f1f1 !important;
    }
    yt-live-chat-text-message-renderer #timestamp {
      color: #aaa !important;
    }
    yt-live-chat-header-renderer yt-icon,
    yt-live-chat-header-renderer yt-icon-button {
      color: #f1f1f1 !important;
      fill: #f1f1f1 !important;
    }

    /* Banner manager and banner renderer */
    yt-live-chat-banner-manager {
      pointer-events: auto !important;
      z-index: 100 !important;
    }
    yt-live-chat-banner-renderer {
      background: rgba(28, 28, 28, 0.92) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 8px !important;
      color: #f1f1f1 !important;
      pointer-events: auto !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      margin: 4px 6px !important;
    }
    yt-live-chat-banner-header-renderer {
      color: #f1f1f1 !important;
      pointer-events: auto !important;
      display: flex !important;
      align-items: center !important;
    }
    yt-live-chat-banner-header-renderer #title,
    yt-live-chat-banner-header-renderer yt-formatted-string {
      color: #f1f1f1 !important;
    }
    yt-live-chat-banner-header-renderer yt-button-renderer,
    yt-live-chat-banner-header-renderer button,
    yt-live-chat-banner-header-renderer yt-button-shape {
      pointer-events: auto !important;
      cursor: pointer !important;
    }
    yt-live-chat-banner-header-renderer yt-icon {
      color: #f1f1f1 !important;
      fill: #f1f1f1 !important;
    }

    /* Action panel & Polls */
    #action-panel,
    yt-live-chat-action-panel-renderer {
      background: transparent !important;
      pointer-events: auto !important;
    }
    yt-live-chat-poll-renderer {
      background: rgba(28, 28, 28, 0.92) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 8px !important;
      color: #f1f1f1 !important;
      pointer-events: auto !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
      margin: 4px 6px !important;
    }
    yt-live-chat-poll-renderer #question,
    yt-live-chat-poll-renderer #choice-text,
    yt-live-chat-poll-renderer yt-formatted-string {
      color: #f1f1f1 !important;
    }

    /* Dropdown menus & popup containers */
    tp-yt-iron-dropdown,
    iron-dropdown,
    ytd-menu-popup-renderer,
    tp-yt-paper-dialog,
    yt-sheet-view-model,
    .yt-overlay-banner-menu {
      background-color: rgba(28, 28, 28, 0.96) !important;
      background: rgba(28, 28, 28, 0.96) !important;
      color: #f1f1f1 !important;
      border-radius: 8px !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7) !important;
      pointer-events: auto !important;
      z-index: 2147483647 !important;
    }
    ytd-menu-popup-renderer tp-yt-paper-listbox,
    ytd-menu-popup-renderer #items,
    .yt-overlay-banner-menu tp-yt-paper-listbox {
      background-color: rgba(28, 28, 28, 0.96) !important;
      background: rgba(28, 28, 28, 0.96) !important;
      color: #f1f1f1 !important;
      border-radius: 8px !important;
      padding: 4px 0 !important;
    }
    ytd-menu-service-item-renderer,
    ytd-menu-navigation-item-renderer,
    tp-yt-paper-item,
    .yt-overlay-banner-menu-item {
      color: #f1f1f1 !important;
      background: transparent !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      font-size: 13px !important;
      min-height: 36px !important;
      padding: 0 14px !important;
      display: flex !important;
      align-items: center !important;
      transition: background-color 0.15s ease !important;
    }
    ytd-menu-service-item-renderer:hover,
    ytd-menu-navigation-item-renderer:hover,
    tp-yt-paper-item:hover,
    .yt-overlay-banner-menu-item:hover {
      background-color: rgba(255, 255, 255, 0.12) !important;
    }
    ytd-menu-service-item-renderer yt-icon,
    ytd-menu-navigation-item-renderer yt-icon,
    ytd-menu-service-item-renderer yt-formatted-string,
    tp-yt-paper-item yt-formatted-string,
    .yt-overlay-banner-menu-item span {
      color: #f1f1f1 !important;
      fill: #f1f1f1 !important;
    }

    /* Tooltips */
    tp-yt-paper-tooltip,
    yt-tooltip-renderer,
    #tooltip.tp-yt-paper-tooltip {
      pointer-events: none !important;
      background-color: rgba(33, 33, 33, 0.95) !important;
      color: #f1f1f1 !important;
      border-radius: 4px !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      font-size: 11px !important;
      z-index: 2147483647 !important;
    }

    /* Custom banner controls & dismissed state */
    .yt-overlay-banner-close-btn {
      background: transparent !important;
      border: none !important;
      color: #aaa !important;
      font-size: 15px !important;
      line-height: 1 !important;
      padding: 4px 6px !important;
      margin-left: 4px !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      border-radius: 50% !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: color 0.15s ease, background-color 0.15s ease !important;
    }
    .yt-overlay-banner-close-btn:hover {
      color: #fff !important;
      background-color: rgba(255, 255, 255, 0.15) !important;
    }
    .yt-overlay-dismissed {
      display: none !important;
    }
    ${hideTicker ? "yt-live-chat-ticker-renderer { display: none !important; }" : ""}
    ${headerRules}
    ${inputRules}
  `;
}

function setupChatIframeBannerInteractions(doc) {
  if (!doc || doc._ytOverlayBannerInteractionsInit) return;
  doc._ytOverlayBannerInteractionsInit = true;

  function closeAllTooltips() {
    try {
      const tooltips = doc.querySelectorAll("tp-yt-paper-tooltip, yt-tooltip-renderer, #tooltip");
      tooltips.forEach((t) => {
        t.style.setProperty("display", "none", "important");
        if (typeof t.hide === "function") t.hide();
      });
    } catch {}
  }

  function dismissActiveBanner() {
    const banners = doc.querySelectorAll("yt-live-chat-banner-renderer, yt-live-chat-banner-manager, #live-chat-banner");
    banners.forEach((b) => {
      b.classList.add("yt-overlay-dismissed");
      b.style.setProperty("display", "none", "important");
    });
    closeAllTooltips();
    closeCustomBannerMenu();
  }

  function dismissActivePoll() {
    const polls = doc.querySelectorAll("yt-live-chat-poll-renderer, #action-panel, yt-live-chat-banner-poll-renderer");
    polls.forEach((p) => {
      p.classList.add("yt-overlay-dismissed");
      p.style.setProperty("display", "none", "important");
    });
    closeAllTooltips();
    closeCustomBannerMenu();
  }

  function toggleBannerCollapse() {
    const banner = doc.querySelector("yt-live-chat-banner-renderer");
    if (banner) {
      if (typeof banner.toggleBanner === "function") {
        banner.toggleBanner();
      } else if (typeof banner.collapsed === "boolean") {
        banner.collapsed = !banner.collapsed;
      } else {
        const isCollapsed = banner.hasAttribute("collapsed");
        if (isCollapsed) {
          banner.removeAttribute("collapsed");
        } else {
          banner.setAttribute("collapsed", "");
        }
      }
    }
    closeAllTooltips();
    closeCustomBannerMenu();
  }

  function closeCustomBannerMenu() {
    const existing = doc.querySelector(".yt-overlay-banner-menu");
    if (existing) existing.remove();
  }

  function showCustomBannerMenu(targetBtn) {
    const existing = doc.querySelector(".yt-overlay-banner-menu");
    if (existing) {
      existing.remove();
      return;
    }
    closeAllTooltips();

    const menu = doc.createElement("div");
    menu.className = "yt-overlay-banner-menu";

    function createMenuSvg(pathD) {
      const svg = createSvgElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "currentColor" });
      const path = createSvgElement("path", { d: pathD });
      svg.appendChild(path);
      return svg;
    }

    const hasPoll = Boolean(doc.querySelector("yt-live-chat-poll-renderer, #action-panel yt-live-chat-poll-renderer, [class*='poll']"));
    const items = [
      {
        createIcon: () => createMenuSvg("M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"),
        label: "Close pinned chat",
        action: dismissActiveBanner,
      },
      ...(hasPoll ? [{
        createIcon: () => createMenuSvg("M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"),
        label: "Close polling",
        action: dismissActivePoll,
      }] : []),
      {
        createIcon: () => createMenuSvg("M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"),
        label: "Collapse / expand banner",
        action: toggleBannerCollapse,
      },
      {
        createIcon: () => createMenuSvg("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"),
        label: "Close all tooltips",
        action: closeAllTooltips,
      },
    ];

    items.forEach((it) => {
      const itemEl = doc.createElement("div");
      itemEl.className = "yt-overlay-banner-menu-item";
      const iconSpan = doc.createElement("span");
      iconSpan.style.cssText = "display:inline-flex;align-items:center;margin-right:8px;opacity:0.85;";
      iconSpan.appendChild(it.createIcon());
      const labelSpan = doc.createElement("span");
      labelSpan.textContent = it.label;
      itemEl.appendChild(iconSpan);
      itemEl.appendChild(labelSpan);
      itemEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        it.action();
        closeCustomBannerMenu();
      });
      menu.appendChild(itemEl);
    });

    const rect = targetBtn.getBoundingClientRect();
    const docWidth = doc.documentElement.clientWidth || doc.body.clientWidth || 300;
    menu.style.position = "absolute";
    menu.style.top = `${Math.max(4, rect.bottom + 4)}px`;
    menu.style.right = `${Math.max(8, docWidth - rect.right)}px`;

    doc.body.appendChild(menu);
  }

  doc.addEventListener("click", (e) => {
    closeAllTooltips();

    const clickedMenu = e.target.closest(".yt-overlay-banner-menu");
    if (!clickedMenu) {
      closeCustomBannerMenu();
    }

    const bannerBtn = e.target.closest(
      "yt-button-renderer.yt-live-chat-banner-header-renderer, yt-live-chat-banner-header-renderer button, yt-live-chat-banner-header-renderer yt-button-shape"
    );
    if (bannerBtn && !bannerBtn.classList.contains("yt-overlay-banner-close-btn")) {
      e.stopPropagation();
      showCustomBannerMenu(bannerBtn);
    }
  }, true);

  function ensureBannerControls() {
    const headers = doc.querySelectorAll("yt-live-chat-banner-header-renderer");
    headers.forEach((header) => {
      if (header.querySelector(".yt-overlay-banner-close-btn")) return;
      const closeBtn = doc.createElement("button");
      closeBtn.className = "yt-overlay-banner-close-btn";
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("title", "Close banner");
      closeBtn.setAttribute("aria-label", "Close banner");
      const closeSvg = createSvgElement("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "currentColor" });
      const closePath = createSvgElement("path", { d: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" });
      closeSvg.appendChild(closePath);
      closeBtn.appendChild(closeSvg);
      closeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        dismissActiveBanner();
      });
      header.appendChild(closeBtn);
    });
  }

  ensureBannerControls();

  const observer = new MutationObserver(() => {
    ensureBannerControls();
  });
  if (doc.body || doc.documentElement) {
    observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

function injectChatIframeThemeOverride(iframe) {
  if (!iframe) return false;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;

    const root = doc.head || doc.documentElement;
    if (!root) return false;

    let hideTicker = false;
    let hideHeader = false;
    let autoHideHeader = true;
    let hideInput = true;
    try {
      hideTicker = localStorage.getItem("chatOverlayHideTicker") === "true";
      hideHeader = localStorage.getItem("chatOverlayHideHeader") === "true";
      autoHideHeader = localStorage.getItem("chatOverlayAutoHideHeader") !== "false";
      hideInput = localStorage.getItem("chatOverlayHideInput") !== "false";
    } catch {}
    const css = getThemeOverrideCss(hideTicker, hideHeader, autoHideHeader, hideInput);

    let style = doc.getElementById("yt-overlay-theme-override");
    if (!style) {
      style = doc.createElement("style");
      style.id = "yt-overlay-theme-override";
      style.textContent = css;
      root.appendChild(style);
      setupChatIframeBannerInteractions(doc);
      return true;
    }
    if (style.textContent !== css) {
      style.textContent = css;
      setupChatIframeBannerInteractions(doc);
      return true;
    }
    setupChatIframeBannerInteractions(doc);
    return true;
  } catch {
    return false;
  }
}

let themeOverrideWatcherTimer = null;

function ensureActiveChatThemeOverride() {
  const target = activeChatIframe || document.querySelector("#chat-iframe-container iframe, iframe[data-yt-overlay-chat='true']");
  if (!target || !target.isConnected) return false;
  return injectChatIframeThemeOverride(target);
}

function startThemeOverrideWatcher(iframe) {
  if (themeOverrideWatcherTimer) {
    clearInterval(themeOverrideWatcherTimer);
    themeOverrideWatcherTimer = null;
  }
  let ticks = 0;
  themeOverrideWatcherTimer = setInterval(() => {
    ticks++;
    const target = iframe || activeChatIframe || document.querySelector("#chat-iframe-container iframe, iframe[data-yt-overlay-chat='true']");
    if (!target || !target.isConnected) {
      clearInterval(themeOverrideWatcherTimer);
      themeOverrideWatcherTimer = null;
      return;
    }
    injectChatIframeThemeOverride(target);
    if (ticks >= 30) {
      clearInterval(themeOverrideWatcherTimer);
      themeOverrideWatcherTimer = null;
    }
  }, 500);
}

function applyTickerHideStyle(hideTicker, hideHeader, autoHideHeader = true, hideInput = true) {
  const iframes = new Set(document.querySelectorAll("iframe[data-yt-overlay-chat='true']"));
  if (activeChatIframe) iframes.add(activeChatIframe);
  iframes.forEach((iframe) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const root = doc.head || doc.documentElement;
      if (!root) return;
      let style = doc.getElementById("yt-overlay-theme-override");
      if (!style) {
        style = doc.createElement("style");
        style.id = "yt-overlay-theme-override";
        root.appendChild(style);
      }
      style.textContent = getThemeOverrideCss(hideTicker, hideHeader, autoHideHeader, hideInput);
      setupChatIframeBannerInteractions(doc);
    } catch {}
  });
}

function isStealthReplayEnabled() {
  return localStorage.getItem("chatOverlayStealthReplay") !== "false";
}

function applyStealthReplayStyle() {
  if (document.documentElement.hasAttribute("data-yt-overlay-stealth-replay")) {
    document.documentElement.removeAttribute("data-yt-overlay-stealth-replay");
  }
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

function shouldUpgradeToNativeChat() {
  if (!isOverlayVisible) return false;
  if (activeChatSourceKind !== "live_direct") return false;
  return Boolean(findNativeLiveChatIframe(activeChatIframe));
}

function attachChatSource(iframeContainer) {
  if (!iframeContainer || !iframeContainer.isConnected) {
    debugState("attachChatSource:detached container", {
      hasContainer: Boolean(iframeContainer),
      containerConnected: Boolean(iframeContainer?.isConnected),
    });
    return false;
  }

  const currentVideoId = getVideoId();
  if (activeChatIframe && !isIframeForCurrentVideo(activeChatIframe, currentVideoId)) {
    debugState("attachChatSource:detaching stale iframe", {
      activeVideo: activeChatIframe.getAttribute("data-yt-overlay-video"),
      currentVideoId,
    });
    detachChatSource();
  }

  const duplicateIframes = iframeContainer.querySelectorAll('iframe[data-yt-overlay-chat="true"]');
  duplicateIframes.forEach((iframe) => {
    if (iframe !== activeChatIframe) iframe.remove();
  });

  const mode = detectChatMode(activeChatIframe);
  debugState("attachChatSource:start", () => ({
    mode,
    videoId: getVideoId(),
    activeHref: getIframeHref(activeChatIframe),
    nativeHref: getIframeHref(getLiveChatIframe()),
    containerConnected: iframeContainer?.isConnected,
  }));
  if (mode === "archive" && !resolveArchiveChatSource(activeChatIframe)) {
    debugState("attachChatSource:openArchiveNativeChatPanel", {});
    openArchiveNativeChatPanel();
  }
  const source = mode === "archive" ? resolveArchiveChatSource(activeChatIframe) : resolveLiveChatSource(activeChatIframe);
  if (!source) {
    if (activeChatIframe && activeChatIframe.parentElement === iframeContainer && isReplayChatIframe(activeChatIframe)) {
      debugState("attachChatSource:pending replay reload", { href: getIframeHref(activeChatIframe) });
      return true;
    }
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

  const nextIframe = isBorrowedSourceKind(source.kind) ? source.iframe : (getReusableLiveIframe(source) || createManagedLiveIframe(source));
  if (activeChatIframe === nextIframe && nextIframe.parentElement === iframeContainer) {
    debugState("attachChatSource:reuse", { href: getIframeHref(nextIframe) });
    injectChatIframeThemeOverride(activeChatIframe);
    return true;
  }

  detachChatSource();
  activeChatIframe = nextIframe;
  activeChatSourceKind = source.kind;
  activeChatIframe.setAttribute("data-yt-overlay-chat", "true");
  // Chat documents have no ?v= in their URL, so remember which video this
  // document was attached for: after an SPA hop it must no longer be trusted.
  activeChatIframe.setAttribute("data-yt-overlay-video", getVideoId() || "");
  activeChatIframe.removeAttribute("data-yt-overlay-stale-src");

  if (isBorrowedSourceKind(source.kind)) {
    rememberBorrowedIframe(activeChatIframe, iframeContainer);
  }

  applyChatIframeStyle(activeChatIframe);
  iframeContainer.appendChild(activeChatIframe);
  injectChatIframeThemeOverride(activeChatIframe);
  startThemeOverrideWatcher(activeChatIframe);
  activeChatIframe.addEventListener("load", () => {
    injectChatIframeThemeOverride(activeChatIframe);
    startThemeOverrideWatcher(activeChatIframe);
  }, { once: true });
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
  return Boolean(activeChatIframe?.isConnected && href && !href.includes("about:blank") && isIframeForCurrentVideo(activeChatIframe, getVideoId()));
}

function detachChatSource() {
  if (themeOverrideWatcherTimer) {
    clearInterval(themeOverrideWatcherTimer);
    themeOverrideWatcherTimer = null;
  }
  if (!activeChatIframe) return;

  activeChatIframe.removeAttribute("data-yt-overlay-chat");
  if (isBorrowedSourceKind(activeChatSourceKind)) {
    const currentSrc = getIframeHref(activeChatIframe);
    if (currentSrc && !currentSrc.includes("about:blank")) {
      activeChatIframe.setAttribute("data-yt-overlay-stale-src", currentSrc);
    }
    const currentVid = activeChatIframe.getAttribute("data-yt-overlay-video") || getVideoId();
    if (currentVid) {
      activeChatIframe.setAttribute("data-yt-overlay-video", currentVid);
    }
    const restored = restoreBorrowedIframe(activeChatIframe) || restoreIframeToNativeHost(activeChatIframe);
    if (!restored) queueRestoreToNativeHost(activeChatIframe);
  } else {
    activeChatIframe.removeAttribute("data-yt-overlay-video");
    activeChatIframe.removeAttribute("data-yt-overlay-stale-src");
    activeChatIframe.onload = null;
    activeChatIframe.onerror = null;
    try {
      activeChatIframe.src = "about:blank";
    } catch {}
    activeChatIframe.remove();
  }

  activeChatIframe = null;
  activeChatSourceKind = null;
}

function toggleOverlayChat(overlayChatContainer, iframeContainer, toggleButton) {
  isOverlayVisible = !isOverlayVisible;
  debugState("toggleOverlayChat", () => ({ visible: isOverlayVisible, videoId: getVideoId(), mode: detectChatMode(activeChatIframe) }));
  overlayChatContainer.style.display = isOverlayVisible ? "block" : "none";
  overlayChatContainer.classList.toggle("show", isOverlayVisible);
  toggleButton.title = isOverlayVisible ? "Hide Chat" : "Show Chat";
  updateToggleButtonIcon(toggleButton, isOverlayVisible);

  if (isOverlayVisible) {
    attachChatSource(iframeContainer);
    ensureActiveChatThemeOverride();
  } else {
    detachChatSource();
  }

  localStorage.setItem("youtubeOverlayVisible", isOverlayVisible);
  localStorage.setItem("overlayVisible", isOverlayVisible);
}

function initializeOverlayState(overlayChatContainer) {
  const rawSavedOpacity = localStorage.getItem("chatOverlayOpacity");
  const opacityVal = rawSavedOpacity !== null ? Number(rawSavedOpacity) : 50;
  overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${opacityVal / 100})`;
  const rawSavedBlur = localStorage.getItem("chatOverlayBlur");
  const blurVal = rawSavedBlur !== null ? Number(rawSavedBlur) : 8;
  overlayChatContainer.style.backdropFilter = `blur(${blurVal}px)`;
  overlayChatContainer.style.webkitBackdropFilter = `blur(${blurVal}px)`;
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
