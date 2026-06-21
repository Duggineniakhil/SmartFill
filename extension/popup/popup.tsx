declare const chrome: any;

const LABELS: Record<string, string> = {
  full_name: "Full name", first_name: "First name", last_name: "Last name",
  email: "Email", phone: "Phone",
  university: "University / College", degree: "Degree", graduation_year: "Graduation Year",
  skills: "Skills",
  linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio / Website",
  address: "Address", city: "City", state: "State / Province",
  country: "Country", postal_code: "ZIP / Postal Code",
  resume: "Resume Link",
  cgpa: "CGPA"
};

const KEY_MAP: Record<string, string> = {
  college: "university",
  zip: "postal_code",
};

function getNormalizedProfile(d: any): Record<string, string> {
  const rawProfile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawProfile)) {
    const canonicalKey = KEY_MAP[k] || k;
    normalized[canonicalKey] = v as string;
  }
  return normalized;
}

const $ = (id: string): any => document.getElementById(id);

function render(profile: Record<string, string>) {
  const container = $("profile");
  if (!container) return;
  const entries = Object.entries(profile || {});
  if (entries.length === 0) {
    container.className = "profile empty";
    container.textContent = "No data yet. Fill a form anywhere and SmartFill will remember it.";
    return;
  }
  container.className = "profile";
  container.innerHTML = "";
  for (const [k, v] of entries) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div class="key">${LABELS[k] || k}</div><div class="val" title="${v.replace(/"/g, "&quot;")}">${v}</div>`;
    const del = document.createElement("button");
    del.className = "del"; del.textContent = "×"; del.title = "Remove";
    del.onclick = () => {
      chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d: any) => {
        const profile = getNormalizedProfile(d);
        delete profile[k];
        chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, load);
      });
    };
    row.appendChild(del);
    container.appendChild(row);
  }
}

function load() {
  chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} }, enabled: true, autoFill: true, smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true } }, (d: any) => {
    const mergedProfile = getNormalizedProfile(d);
    const enabledEl = $("enabled");
    if (enabledEl) enabledEl.checked = d.enabled;
    const autoFillEl = $("autoFill");
    if (autoFillEl) autoFillEl.checked = d.smartfill_settings?.autoFillEnabled ?? d.autoFill;
    render(mergedProfile);
  });
}

const enabledEl = $("enabled");
if (enabledEl) {
  enabledEl.addEventListener("change", (e: any) =>
    chrome.storage.local.set({ enabled: e.target.checked }));
}

const autoFillEl = $("autoFill");
if (autoFillEl) {
  autoFillEl.addEventListener("change", (e: any) => {
    // Read current settings first so we don't overwrite autoSaveEnabled
    chrome.storage.local.get({ smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true } }, (d: any) => {
      const currentSettings = d.smartfill_settings || {};
      chrome.storage.local.set({
        autoFill: e.target.checked,
        smartfill_settings: { ...currentSettings, autoFillEnabled: e.target.checked },
      });
    });
  });
}

const addBtnEl = $("addBtn");
if (addBtnEl) {
  addBtnEl.addEventListener("click", () => {
    const newKeyEl = $("newKey");
    const newValEl = $("newVal");
    if (!newKeyEl || !newValEl) return;
    const k = newKeyEl.value;
    const v = newValEl.value.trim();
    if (!v) return;
    chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d: any) => {
      const profile = getNormalizedProfile(d);
      profile[k] = v;
      chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, () => { newValEl.value = ""; load(); });
    });
  });
}

const clearEl = $("clear");
if (clearEl) {
  clearEl.addEventListener("click", () => {
    if (!confirm("Delete all stored profile data?")) return;
    chrome.storage.local.set({ profile: {}, smartfill_profile: { fields: {} } }, load);
  });
}

const fillNowEl = $("fillNow");
if (fillNowEl) {
  fillNowEl.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const btn = $("fillNow");
    const txt = btn ? btn.textContent : "";

    const showResult = (res: any) => {
      const filled = res?.filled || 0;
      if (btn) btn.textContent = `Filled ${filled} field${filled === 1 ? "" : "s"}`;
      setTimeout(() => { if (btn) btn.textContent = txt; }, 1600);
    };

    const sendFillRequest = () => new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: "SMARTFILL_FILL_NOW" }, (res: any) => {
        const error = chrome.runtime.lastError;
        if (error) reject(error);
        else resolve(res);
      });
    });

    try {
      showResult(await sendFillRequest());
    } catch (_) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/detectFields.js", "content/autofill.js"],
        });
        showResult(await sendFillRequest());
      } catch (_) {
        if (btn) btn.textContent = "Cannot fill this page";
        setTimeout(() => { if (btn) btn.textContent = txt; }, 1600);
      }
    }
  });
}

load();

export {};
