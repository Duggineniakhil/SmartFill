chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    {
      enabled: true,
      autoFill: true,
      profile: {},
      smartfill_profile: { fields: {} },
      smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true },
    },
    (data) => {
      chrome.storage.local.set({
        enabled: data.enabled,
        autoFill: data.autoFill,
        profile: data.profile || {},
        smartfill_profile: data.smartfill_profile || { fields: {} },
        smartfill_settings: data.smartfill_settings || { autoFillEnabled: true, autoSaveEnabled: true },
      });
    }
  );
});