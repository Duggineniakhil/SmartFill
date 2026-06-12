const LABELS = {
  full_name: "Full name", first_name: "First name", last_name: "Last name",
  email: "Email", phone: "Phone", college: "College", degree: "Degree",
  cgpa: "CGPA", linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio",
  address: "Address", city: "City", country: "Country", zip: "ZIP", resume: "Resume"
};

const $ = (id) => document.getElementById(id);

function render(profile) {
  const container = $("profile");
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
      chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d) => {
        const profile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
        delete profile[k];
        chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, load);
      });
    };
    row.appendChild(del);
    container.appendChild(row);
  }
}

function load() {
  chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} }, enabled: true, autoFill: false }, (d) => {
    const mergedProfile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
    $("enabled").checked = d.enabled;
    $("autoFill").checked = d.autoFill;
    render(mergedProfile);
  });
}

$("enabled").addEventListener("change", (e) =>
  chrome.storage.local.set({ enabled: e.target.checked }));
$("autoFill").addEventListener("change", (e) =>
  chrome.storage.local.set({ autoFill: e.target.checked, smartfill_settings: { autoFillEnabled: e.target.checked } }));

$("addBtn").addEventListener("click", () => {
  const k = $("newKey").value;
  const v = $("newVal").value.trim();
  if (!v) return;
  chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d) => {
    const profile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
    profile[k] = v;
    chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, () => { $("newVal").value = ""; load(); });
  });
});

$("clear").addEventListener("click", () => {
  if (!confirm("Delete all stored profile data?")) return;
  chrome.storage.local.set({ profile: {}, smartfill_profile: { fields: {} } }, load);
});

$("fillNow").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "SMARTFILL_FILL_NOW" }, (res) => {
    const btn = $("fillNow");
    const txt = btn.textContent;
    if (chrome.runtime.lastError) {
      btn.textContent = "Open a webpage to fill";
    } else {
      btn.textContent = res ? `Filled ${res.filled} field${res.filled === 1 ? "" : "s"}` : "Open a webpage to fill";
    }
    setTimeout(() => (btn.textContent = txt), 1600);
  });
});

load();