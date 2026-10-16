const LABELS = {
    full_name: "Full name", first_name: "First name", last_name: "Last name",
    email: "Email", phone: "Phone",
    university: "University / College", degree: "Degree", graduation_year: "Graduation Year",
    skills: "Skills",
    linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio / Website",
    address: "Address", city: "City", state: "State / Province",
    country: "Country", postal_code: "ZIP / Postal Code",
    resume: "Resume Link",
    cgpa: "CGPA",
    company: "Company", job_title: "Job Title", experience_years: "Experience (years)",
    date_of_birth: "Date of Birth", gender: "Gender", nationality: "Nationality",
    notice_period: "Notice Period", current_ctc: "Current CTC", expected_ctc: "Expected CTC",
    address_line2: "Address Line 2", twitter: "Twitter / X", leetcode: "LeetCode",
};
const KEY_MAP = {
    college: "university",
    zip: "postal_code",
};
function getNormalizedProfile(d) {
    const rawProfile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
    const normalized = {};
    for (const [k, v] of Object.entries(rawProfile)) {
        const canonicalKey = KEY_MAP[k] || k;
        normalized[canonicalKey] = v;
    }
    return normalized;
}
const $ = (id) => document.getElementById(id);
function renderRows(container, rows, emptyText) {
    if (!container)
        return;
    if (rows.length === 0) {
        container.className = "profile empty";
        container.textContent = emptyText;
        return;
    }
    container.className = "profile";
    container.replaceChildren();
    for (const { label, value, onDelete } of rows) {
        // Keys and values are captured from arbitrary web pages: build nodes with
        // textContent, never innerHTML.
        const row = document.createElement("div");
        row.className = "item";
        const keyEl = document.createElement("div");
        keyEl.className = "key";
        keyEl.textContent = label;
        keyEl.title = label;
        const valEl = document.createElement("div");
        valEl.className = "val";
        valEl.title = value;
        valEl.textContent = value;
        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "×";
        del.title = "Remove";
        del.onclick = onDelete;
        row.append(keyEl, valEl, del);
        container.appendChild(row);
    }
}
function render(profile) {
    renderRows($("profile"), Object.entries(profile || {}).map(([k, v]) => ({
        label: LABELS[k] || k,
        value: String(v ?? ""),
        onDelete: () => {
            chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d) => {
                const profile = getNormalizedProfile(d);
                delete profile[k];
                chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, load);
            });
        },
    })), "No data yet. Fill a form anywhere and SmartFill will remember it.");
}
function renderCustom(custom) {
    const rows = Object.entries(custom || {})
        .sort((a, b) => (b[1].updated_at || "").localeCompare(a[1].updated_at || ""))
        .map(([key, entry]) => ({
        label: entry.label || key,
        value: String(entry.value ?? ""),
        onDelete: () => {
            chrome.storage.local.get({ smartfill_profile: { fields: {} } }, (d) => {
                const current = d.smartfill_profile || {};
                const next = { ...(current.custom || {}) };
                delete next[key];
                chrome.storage.local.set({ smartfill_profile: { ...current, custom: next } }, load);
            });
        },
    }));
    renderRows($("custom"), rows, "Answers to other questions are remembered here by their label.");
}
function load() {
    chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} }, enabled: true, autoFill: true, smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true } }, (d) => {
        const mergedProfile = getNormalizedProfile(d);
        const enabledEl = $("enabled");
        if (enabledEl)
            enabledEl.checked = d.enabled;
        const autoFillEl = $("autoFill");
        if (autoFillEl)
            autoFillEl.checked = d.smartfill_settings?.autoFillEnabled ?? d.autoFill;
        render(mergedProfile);
        renderCustom(d.smartfill_profile?.custom || {});
    });
}
const enabledEl = $("enabled");
if (enabledEl) {
    enabledEl.addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
}
const autoFillEl = $("autoFill");
if (autoFillEl) {
    autoFillEl.addEventListener("change", (e) => {
        // Read current settings first so we don't overwrite autoSaveEnabled
        chrome.storage.local.get({ smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true } }, (d) => {
            const currentSettings = d.smartfill_settings || {};
            const checked = e.target.checked;
            chrome.storage.local.set({
                autoFill: checked,
                smartfill_settings: { ...currentSettings, autoFillEnabled: checked },
            });
        });
    });
}
const addBtnEl = $("addBtn");
if (addBtnEl) {
    addBtnEl.addEventListener("click", () => {
        const newKeyEl = $("newKey");
        const newValEl = $("newVal");
        if (!newKeyEl || !newValEl)
            return;
        const k = newKeyEl.value;
        const v = newValEl.value.trim();
        if (!v)
            return;
        chrome.storage.local.get({ profile: {}, smartfill_profile: { fields: {} } }, (d) => {
            const profile = getNormalizedProfile(d);
            profile[k] = v;
            chrome.storage.local.set({ profile, smartfill_profile: { ...(d.smartfill_profile || {}), fields: profile } }, () => { newValEl.value = ""; load(); });
        });
    });
}
const clearEl = $("clear");
if (clearEl) {
    clearEl.addEventListener("click", () => {
        if (!confirm("Delete all stored profile data?"))
            return;
        chrome.storage.local.set({ profile: {}, smartfill_profile: { fields: {} } }, load);
    });
}
const fillNowEl = $("fillNow");
if (fillNowEl) {
    fillNowEl.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id)
            return;
        const btn = $("fillNow");
        const txt = btn ? btn.textContent : "";
        const showResult = (res) => {
            const response = res;
            const filled = response?.filled || 0;
            if (btn)
                btn.textContent = response?.disabled ? "SmartFill is disabled" : `Filled ${filled} field${filled === 1 ? "" : "s"}`;
            setTimeout(() => { if (btn)
                btn.textContent = txt; }, 1600);
        };
        // Runs in the content scripts' isolated world of every frame, so forms in
        // iframes (Greenhouse, embedded Google Forms) are filled too.
        const fillAllFrames = () => chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => (window.__SMARTFILL__?.fillNow ? window.__SMARTFILL__.fillNow() : null),
        });
        try {
            let results = await fillAllFrames();
            // Tabs opened before the extension was installed or reloaded have no
            // content script yet: inject it into just those frames, then retry.
            const missing = results.filter((r) => r.result == null).map((r) => r.frameId ?? 0);
            if (missing.length > 0) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, frameIds: missing },
                    files: ["content/detectFields.js", "content/autofill.js"],
                });
                results = await fillAllFrames();
            }
            const filled = results.reduce((sum, r) => sum + (r.result?.filled || 0), 0);
            const disabled = results.some((r) => r.result?.disabled);
            showResult({ filled, disabled });
        }
        catch {
            if (btn)
                btn.textContent = "Cannot fill this page";
            setTimeout(() => { if (btn)
                btn.textContent = txt; }, 1600);
        }
    });
}
load();
