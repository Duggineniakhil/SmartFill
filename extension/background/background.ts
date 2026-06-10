chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true, autoFill: false, profile: {} }, (data) => {
    chrome.storage.local.set(data);
  });
});