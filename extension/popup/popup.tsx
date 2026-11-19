import type {} from "../content/global";

const LABELS: Record<string, string> = {
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

const KEY_MAP: Record<string, string> = {
  college: "university",
  zip: "postal_code",
};

function getNormalizedProfile(d: SmartFillStorageData): Record<string, string> {
  const rawProfile = { ...(d.profile || {}), ...((d.smartfill_profile && d.smartfill_profile.fields) || {}) };
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawProfile)) {
    const canonicalKey = KEY_MAP[k] || k;
    normalized[canonicalKey] = v as string;
  }
  return normalized;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

type Row = { label: string; value: string; onDelete: () => void };

function renderRows(container: HTMLElement | null, rows: Row[], emptyText: string) {
  if (!container) return;
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
    del.className = "del"; del.textContent = "×"; del.title = "Remove";
    del.onclick = onDelete;
    row.append(keyEl, valEl, del);
    container.appendChild(row);
  }
}

function render(profile: Record<string, string>) {
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

function renderCustom(custom: Record<string, SmartFillCustomField>) {
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
    const enabledEl = $<HTMLInputElement>("enabled");
    if (enabledEl) enabledEl.checked = d.enabled;
    const autoFillEl = $<HTMLInputElement>("autoFill");
    if (autoFillEl) autoFillEl.checked = d.smartfill_settings?.autoFillEnabled ?? d.autoFill;
    render(mergedProfile);
    renderCustom(d.smartfill_profile?.custom || {});
  });
}

const enabledEl = $("enabled");
if (enabledEl) {
  enabledEl.addEventListener("change", (e) =>
    chrome.storage.local.set({ enabled: (e.target as HTMLInputElement).checked }));
}

const autoFillEl = $("autoFill");
if (autoFillEl) {
  autoFillEl.addEventListener("change", (e) => {
    // Read current settings first so we don't overwrite autoSaveEnabled
    chrome.storage.local.get({ smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true } }, (d) => {
      const currentSettings = d.smartfill_settings || {};
      const checked = (e.target as HTMLInputElement).checked;
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
    const newKeyEl = $<HTMLSelectElement>("newKey");
    const newValEl = $<HTMLInputElement>("newVal");
    if (!newKeyEl || !newValEl) return;
    const k = newKeyEl.value;
    const v = newValEl.value.trim();
    if (!v) return;
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

    const showResult = (res: unknown) => {
      const response = res as { filled?: number; disabled?: boolean } | undefined;
      const filled = response?.filled || 0;
      if (btn) btn.textContent = response?.disabled ? "SmartFill is disabled" : `Filled ${filled} field${filled === 1 ? "" : "s"}`;
      setTimeout(() => { if (btn) btn.textContent = txt; }, 1600);
    };

    type FillResult = { filled: number; disabled?: boolean } | null;
    // Runs in the content scripts' isolated world of every frame, so forms in
    // iframes (Greenhouse, embedded Google Forms) are filled too.
    const fillAllFrames = () => chrome.scripting.executeScript<FillResult>({
      target: { tabId: tab.id!, allFrames: true },
      func: () => (window.__SMARTFILL__?.fillNow ? window.__SMARTFILL__.fillNow() : null),
    });

    try {
      let results = await fillAllFrames();
      // Tabs opened before the extension was installed or reloaded have no
      // content script yet: inject it into just those frames, then retry.
      const missing = results.filter((r) => r.result == null).map((r) => r.frameId ?? 0);
      if (missing.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id!, frameIds: missing },
          files: ["content/detectFields.js", "content/autofill.js"],
        });
        results = await fillAllFrames();
      }
      const filled = results.reduce((sum, r) => sum + (r.result?.filled || 0), 0);
      const disabled = results.some((r) => r.result?.disabled);
      showResult({ filled, disabled });
    } catch {
      if (btn) btn.textContent = "Cannot fill this page";
      setTimeout(() => { if (btn) btn.textContent = txt; }, 1600);
    }
  });
}

// ─── Application tracker ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<SmartFillApplicationStatus, string> = {
  interested: "Interested", applied: "Applied", interview: "Interview",
  offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};

const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

function renderAppsCount(apps: Record<string, SmartFillApplication>) {
  const el = $("appsCount");
  if (!el) return;
  const list = Object.values(apps || {});
  // Same counting as the tracker page: anything past "Interested" was sent.
  const applied = list.filter((a) => a.status !== "interested");
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = applied.filter((a) => Date.parse(a.appliedAt || a.createdAt) >= weekAgo).length;
  const saved = list.length - applied.length;
  if (list.length === 0) { el.textContent = "No applications tracked yet"; return; }
  const parts = [`${applied.length} application${applied.length === 1 ? "" : "s"}`, `${thisWeek} this week`];
  if (saved > 0) parts.push(`${saved} saved`);
  el.textContent = parts.join(" · ");
}

type JobResult = {
  job: SmartFillJobInfo;
  application: SmartFillApplication | null;
  requirements: SmartFillRequirements | null;
};
let jobFrameId: number | null = null;

const LEVEL_TEXT = { strong: "Strong match", partial: "Partial match", weak: "Weak match", none: "" };

function listText(items: string[], max = 5): string {
  return items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} +${items.length - max} more`;
}

function openTracker(hash = "") {
  chrome.tabs.create({ url: chrome.runtime.getURL(`tracker/tracker.html${hash}`) });
  window.close();
}

// Built with textContent only: skill names can come from the job page.
function renderMatch(requirements: SmartFillRequirements | null, d: SmartFillStorageData) {
  const box = $("match");
  if (!box) return;
  box.hidden = false;
  box.replaceChildren();
  const line = (cls: string, label: string, text: string) => {
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
  if (result.matched.length) line("line", "You have:", listText(result.matched));
  if (result.missing.length) line("line", "Missing:", listText(result.missing));
  if (result.missingPreferred.length) line("line", "Nice to have:", listText(result.missingPreferred, 4));
  if (result.yearsNote) line("line", "", result.yearsNote);
  if (result.degreeNote) line("line", "", result.degreeNote);
}

function renderJob(found: JobResult | null) {
  const card = $("job");
  if (!card) return;
  if (!found) { card.hidden = true; return; }
  card.hidden = false;
  const { job, application } = found;
  $("jobTitle")!.textContent = application?.title || job.title;
  $("jobTitle")!.title = application?.title || job.title;
  const meta = [application?.company || job.company, application?.location || job.location, job.platform].filter(Boolean).join(" · ");
  $("jobMeta")!.textContent = meta;
  $("jobMeta")!.title = meta;
  const chip = $("jobStatus")!;
  const trackBtn = $("trackBtn")!;
  if (application) {
    chip.hidden = false;
    chip.className = `chip ${application.status}`;
    const when = application.status === "applied" ? application.appliedAt : application.updatedAt;
    chip.textContent = `${STATUS_LABELS[application.status]} · ${shortDate(when)}`;
    trackBtn.hidden = true;
  } else {
    chip.hidden = true;
    trackBtn.hidden = false;
  }
}

async function loadJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const ask = () => chrome.scripting.executeScript<JobResult | null | "missing">({
      target: { tabId: tab.id!, allFrames: true },
      func: () => (window.__SMARTFILL__?.tracker ? window.__SMARTFILL__.tracker.jobInfo() : "missing"),
    });
    let results = await ask();
    // Tabs opened before the extension was installed or updated have no
    // tracker script yet.
    const missing = results.filter((r) => r.result === "missing" || r.result === undefined).map((r) => r.frameId ?? 0);
    if (missing.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id!, frameIds: missing },
        files: ["content/detectFields.js", "content/autofill.js", "content/matchScore.js", "content/tracker.js", "content/aiDraft.js"],
      });
      results = await ask();
    }
    const hits = results
      .filter((r) => r.result && r.result !== "missing")
      .map((r) => ({ frameId: r.frameId ?? 0, found: r.result as JobResult }));
    // Prefer a job already tracked, then a known job platform (an embedded
    // Greenhouse form inside a company careers page), then anything.
    const pick = hits.find((h) => h.found.application)
      || hits.find((h) => h.found.job.platform !== "Company site")
      || hits[0];
    jobFrameId = pick ? pick.frameId : null;
    renderJob(pick ? pick.found : null);
    loadAi(tab.id!, pick ? pick.found : null).catch(() => {});
    if (!pick) return;

    let requirements = pick.found.requirements || pick.found.application?.requirements || null;
    // A form embedded in a careers page: the description is in the top frame.
    if (!requirements && pick.frameId !== 0) {
      const [top] = await chrome.scripting.executeScript<SmartFillRequirements | null>({
        target: { tabId: tab.id!, frameIds: [0] },
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
    chrome.storage.local.get({ smartfill_profile: { fields: {} }, smartfill_resume: { text: "", updated_at: "" } },
      (d) => renderMatch(requirements, d));
  } catch {
    renderJob(null);
  }
}

// ─── AI: draft answers and match analysis ─────────────────────────────────────

let aiJob: SmartFillJobInfo | null = null;
let aiTabId = 0;

function aiConfigured(s?: SmartFillAiSettings) {
  return Boolean(s?.geminiKey?.trim() || s?.groqKey?.trim());
}

function aiOut(build: (box: HTMLElement) => void) {
  const box = $("aiOut")!;
  box.hidden = false;
  box.replaceChildren();
  build(box);
}

const div = (cls: string, text: string) => {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return el;
};

function labelled(label: string, text: string) {
  const el = document.createElement("div");
  const b = document.createElement("b");
  b.textContent = `${label} `;
  el.append(b, text);
  return el;
}

function renderAiMatch(m: SmartFillAiMatch) {
  aiOut((box) => {
    const head = document.createElement("div");
    head.className = "head";
    const pill = document.createElement("span");
    pill.className = `score ${m.verdict}`;
    pill.textContent = `✦ ${m.score}% AI match`;
    head.append(pill, div("muted", `${m.provider === "groq" ? "Groq" : "Gemini"}${m.fallbackFrom ? ` (${m.fallbackFrom} was unavailable)` : ""} · ${shortDate(m.at)}`));
    box.append(head);
    if (m.summary) box.append(div("", m.summary));
    if (m.strengths.length) box.append(labelled("Strengths:", m.strengths.join("; ")));
    if (m.gaps.length) box.append(labelled("Gaps:", m.gaps.join("; ")));
    if (m.tips.length) box.append(labelled("Tips:", m.tips.join("; ")));
  });
}

// The job description: from whichever frame has it, else the cached copy.
async function jobTextFor(tabId: number, key: string): Promise<string> {
  const results = await chrome.scripting.executeScript<string>({
    target: { tabId, allFrames: true },
    func: (k: string) => window.__SMARTFILL__?.tracker?.jobText(k) ?? "",
    args: [key],
  }).catch(() => []);
  return results.map((r) => r.result || "").sort((a, b) => b.length - a.length)[0] || "";
}

async function loadAi(tabId: number, found: JobResult | null) {
  aiTabId = tabId;
  aiJob = found?.job || null;
  const d = await new Promise<SmartFillStorageData>((r) => chrome.storage.local.get({ smartfill_ai: {}, smartfill_ai_matches: {} }, r));
  const counts = await chrome.scripting.executeScript<number>({
    target: { tabId, allFrames: true },
    func: () => window.__SMARTFILL__?.ai?.questions().length ?? 0,
  }).catch(() => []);
  let questions = 0;
  for (const r of counts as Array<{ result?: number }>) questions += r.result || 0;
  if (!aiJob && questions === 0) return;

  $("aiSection")!.hidden = false;
  if (!aiConfigured(d.smartfill_ai)) {
    $("aiSetup")!.hidden = false;
    return;
  }
  const draftBtn = $("aiDraft")!;
  if (questions > 0) {
    draftBtn.hidden = false;
    draftBtn.textContent = `✦ Draft ${questions} answer${questions === 1 ? "" : "s"}`;
  }
  if (aiJob) {
    $("aiMatch")!.hidden = false;
    const saved = d.smartfill_ai_matches?.[aiJob.key];
    if (saved) renderAiMatch(saved);
  }
}

$("aiSetup")?.addEventListener("click", () => openTracker("#ai"));

$("aiDraft")?.addEventListener("click", async () => {
  const btn = $("aiDraft") as HTMLButtonElement;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting…";
  try {
    const text = aiJob ? await jobTextFor(aiTabId, aiJob.key) : "";
    const results = await chrome.scripting.executeScript<SmartFillDraftResult | null>({
      target: { tabId: aiTabId, allFrames: true },
      func: (t: string) => window.__SMARTFILL__?.ai?.draftAll(t || undefined) ?? null,
      args: [text],
    });
    const all = results.map((r) => r.result).filter(Boolean) as SmartFillDraftResult[];
    const drafted = all.reduce((s, r) => s + r.drafted, 0);
    const error = all.find((r) => r.error)?.error;
    const skipped = all.flatMap((r) => r.skipped);
    aiOut((box) => {
      if (error && !drafted) { box.append(div("err", error)); return; }
      box.append(div("", drafted
        ? `Drafted ${drafted} answer${drafted === 1 ? "" : "s"} from your CV. They're outlined amber: read and edit each one before you submit.`
        : "Nothing was drafted."));
      for (const s of skipped.slice(0, 4)) box.append(labelled("Skipped:", `${s.label} — ${s.note}`));
      if (error) box.append(div("err", error));
    });
  } catch {
    aiOut((box) => box.append(div("err", "Couldn't reach this page. Reload it and try again.")));
  }
  btn.disabled = false;
  btn.textContent = label;
});

$("aiMatch")?.addEventListener("click", async () => {
  if (!aiJob) return;
  const btn = $("aiMatch") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Analysing…";
  const job = aiJob;
  const text = await jobTextFor(aiTabId, job.key);
  const res = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.runtime.sendMessage({
      type: "SMARTFILL_AI", task: "match",
      job: { title: job.title, company: job.company, location: job.location, text },
    }, (r) => resolve((r as Record<string, unknown>) || { ok: false, error: "No reply from SmartFill." }));
  });
  btn.disabled = false;
  btn.textContent = "✦ AI match";
  if (!res.ok) {
    aiOut((box) => box.append(div("err", String(res.error))));
    return;
  }
  const match = res.match as SmartFillAiMatch;
  renderAiMatch(match);
  chrome.storage.local.get({ smartfill_ai_matches: {} }, (d) => {
    chrome.storage.local.set({ smartfill_ai_matches: { ...d.smartfill_ai_matches, [job.key]: match } });
  });
});

const trackBtnEl = $("trackBtn");
if (trackBtnEl) {
  trackBtnEl.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || jobFrameId === null) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [jobFrameId] },
        func: (status: SmartFillApplicationStatus) => window.__SMARTFILL__?.tracker?.track(status) ?? null,
        args: ["interested"],
      });
    } catch {
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
  if (area === "local" && changes.smartfill_applications) loadApps();
});

load();
loadApps();
loadJob();

export {};
