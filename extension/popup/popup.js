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
// ─── Application tracker ──────────────────────────────────────────────────────
const STATUS_LABELS = {
    interested: "Interested", applied: "Applied", interview: "Interview",
    offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};
const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
function renderAppsCount(apps) {
    const el = $("appsCount");
    if (!el)
        return;
    const list = Object.values(apps || {});
    // Same counting as the tracker page: anything past "Interested" was sent.
    const applied = list.filter((a) => a.status !== "interested");
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = applied.filter((a) => Date.parse(a.appliedAt || a.createdAt) >= weekAgo).length;
    const saved = list.length - applied.length;
    if (list.length === 0) {
        el.textContent = "No applications tracked yet";
        return;
    }
    const parts = [`${applied.length} application${applied.length === 1 ? "" : "s"}`, `${thisWeek} this week`];
    if (saved > 0)
        parts.push(`${saved} saved`);
    el.textContent = parts.join(" · ");
}
let jobFrameId = null;
const LEVEL_TEXT = { strong: "Strong match", partial: "Partial match", weak: "Weak match", none: "" };
function listText(items, max = 5) {
    return items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} +${items.length - max} more`;
}
function openTracker(hash = "") {
    chrome.tabs.create({ url: chrome.runtime.getURL(`tracker/tracker.html${hash}`) });
    window.close();
}
// Built with textContent only: skill names can come from the job page.
function renderMatch(requirements, d) {
    const box = $("match");
    if (!box)
        return;
    box.hidden = false;
    box.replaceChildren();
    const line = (cls, label, text) => {
        const el = document.createElement("div");
        el.className = cls;
        if (label) {
            const b = document.createElement("b");
            b.textContent = `${label} `;
            el.append(b);
        }
        el.append(text);
        box.append(el);
    };
    const match = window.__SMARTFILL__?.match;
    if (!match || !requirements) {
        line("muted", "", "Open the full job description to get a match score.");
        return;
    }
    const result = match.score(requirements, match.userFacts(d.smartfill_profile?.fields || {}, d.smartfill_resume?.text || ""));
    if (result.needsProfile) {
        line("muted", "", "Add your CV to see how well you match this job.");
        const btn = document.createElement("button");
        btn.className = "secondary small";
        btn.textContent = "Add your CV";
        btn.addEventListener("click", () => openTracker("#cv"));
        box.append(btn);
        return;
    }
    if (result.score === null) {
        line("muted", "", "Couldn't find clear requirements in this job description.");
        return;
    }
    const row = document.createElement("div");
    row.className = "score-row";
    const pill = document.createElement("span");
    pill.className = `score ${result.level}`;
    pill.textContent = `${result.score}% match`;
    const level = document.createElement("span");
    level.className = "level";
    level.textContent = LEVEL_TEXT[result.level] + (result.lowConfidence ? " · rough estimate" : "");
    row.append(pill, level);
    box.append(row);
    if (result.matched.length)
        line("line", "You have:", listText(result.matched));
    if (result.missing.length)
        line("line", "Missing:", listText(result.missing));
    if (result.missingPreferred.length)
        line("line", "Nice to have:", listText(result.missingPreferred, 4));
    if (result.yearsNote)
        line("line", "", result.yearsNote);
    if (result.degreeNote)
        line("line", "", result.degreeNote);
}
function renderJob(found) {
    const card = $("job");
    if (!card)
        return;
    if (!found) {
        card.hidden = true;
        return;
    }
    card.hidden = false;
    const { job, application } = found;
    $("jobTitle").textContent = application?.title || job.title;
    $("jobTitle").title = application?.title || job.title;
    const meta = [application?.company || job.company, application?.location || job.location, job.platform].filter(Boolean).join(" · ");
    $("jobMeta").textContent = meta;
    $("jobMeta").title = meta;
    const chip = $("jobStatus");
    const trackBtn = $("trackBtn");
    if (application) {
        chip.hidden = false;
        chip.className = `chip ${application.status}`;
        const when = application.status === "applied" ? application.appliedAt : application.updatedAt;
        chip.textContent = `${STATUS_LABELS[application.status]} · ${shortDate(when)}`;
        trackBtn.hidden = true;
    }
    else {
        chip.hidden = true;
        trackBtn.hidden = false;
    }
}
async function loadJob() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id)
            return;
        const ask = () => chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => (window.__SMARTFILL__?.tracker ? window.__SMARTFILL__.tracker.jobInfo() : "missing"),
        });
        let results = await ask();
        // Tabs opened before the extension was installed or updated have no
        // tracker script yet.
        const missing = results.filter((r) => r.result === "missing" || r.result === undefined).map((r) => r.frameId ?? 0);
        if (missing.length > 0) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: missing },
                files: ["content/matchScore.js", "content/tracker.js"],
            });
            results = await ask();
        }
        const hits = results
            .filter((r) => r.result && r.result !== "missing")
            .map((r) => ({ frameId: r.frameId ?? 0, found: r.result }));
        // Prefer a job already tracked, then a known job platform (an embedded
        // Greenhouse form inside a company careers page), then anything.
        const pick = hits.find((h) => h.found.application)
            || hits.find((h) => h.found.job.platform !== "Company site")
            || hits[0];
        jobFrameId = pick ? pick.frameId : null;
        renderJob(pick ? pick.found : null);
        if (!pick)
            return;
        let requirements = pick.found.requirements || pick.found.application?.requirements || null;
        // A form embedded in a careers page: the description is in the top frame.
        if (!requirements && pick.frameId !== 0) {
            const [top] = await chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [0] },
                func: () => window.__SMARTFILL__?.tracker?.pageRequirements() ?? null,
            }).catch(() => []);
            if (top?.result) {
                requirements = top.result;
                const key = pick.found.job.key;
                chrome.storage.local.get({ smartfill_job_requirements: {} }, (d) => {
                    chrome.storage.local.set({
                        smartfill_job_requirements: { ...d.smartfill_job_requirements, [key]: { requirements, at: new Date().toISOString() } },
                    });
                });
            }
        }
        chrome.storage.local.get({ smartfill_profile: { fields: {} }, smartfill_resume: { text: "", updated_at: "" } }, (d) => renderMatch(requirements, d));
    }
    catch {
        renderJob(null);
    }
}
const trackBtnEl = $("trackBtn");
if (trackBtnEl) {
    trackBtnEl.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || jobFrameId === null)
            return;
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [jobFrameId] },
                func: (status) => window.__SMARTFILL__?.tracker?.track(status) ?? null,
                args: ["interested"],
            });
        }
        catch {
            // The page navigated away; the next popup open will show the result.
        }
        await loadJob();
    });
}
const openTrackerEl = $("openTracker");
if (openTrackerEl) {
    openTrackerEl.addEventListener("click", () => openTracker());
}
function loadApps() {
    chrome.storage.local.get({ smartfill_applications: {} }, (d) => renderAppsCount(d.smartfill_applications || {}));
}
chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.smartfill_applications)
        loadApps();
});
load();
loadApps();
loadJob();
