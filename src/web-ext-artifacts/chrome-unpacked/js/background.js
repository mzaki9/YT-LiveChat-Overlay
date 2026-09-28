const extApi = globalThis.browser || globalThis.chrome;

extApi.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    extApi.storage.local.set({
      overlayVisible: true,
      opacity: 50,
      fontSize: 14,
      avatarsEnabled: true,
      colorfulEnabled: true
    });
  }
});

extApi.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('youtube.com/watch')) {
    const response = extApi.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
    if (response?.catch) response.catch(() => {});
  }
});

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      if (extApi.storage.local.get.length >= 2) {
        extApi.storage.local.get(null, (settings) => sendResponse(settings));
      } else {
        extApi.storage.local.get(null).then(sendResponse);
      }
      return true;
    case 'SET_SETTING':
      if (extApi.storage.local.set.length >= 2) {
        extApi.storage.local.set({ [message.key]: message.value }, () => {
          sendResponse({ success: true });
        });
      } else {
        extApi.storage.local.set({ [message.key]: message.value }).then(() => {
          sendResponse({ success: true });
        });
      }
      return true;
    default:
      sendResponse({ error: 'unknown_type' });
  }
});
