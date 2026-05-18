chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      overlayVisible: true,
      opacity: 50,
      fontSize: 14,
      avatarsEnabled: true,
      colorfulEnabled: true
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('youtube.com/watch')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get(null, (settings) => sendResponse(settings));
      return true;
    case 'SET_SETTING':
      chrome.storage.local.set({ [message.key]: message.value }, () => {
        sendResponse({ success: true });
      });
      return true;
    default:
      sendResponse({ error: 'unknown_type' });
  }
});
