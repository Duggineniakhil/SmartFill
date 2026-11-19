import type {} from "../content/global";

// SmartFill application tracker page: a board of every application, read
// from chrome.storage.local. Content scripts add records on submit; this page
// changes status, notes and deletes. Page text comes from arbitrary job sites,
// so everything is rendered with textContent, never innerHTML.

const KEY = "smartfill_applications";
const FOLLOW_UP_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

type Status = SmartFillApplicationStatus;
type Apps = Record<string, SmartFillApplication>;

const STATUS_LABELS: Record<Status, string> = {
  interested: "Interested", applied: "Applied", interview: "Interview",
  offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};
const STATUSES = Object.keys(STATUS_LABELS) as Status[];

const COLUMNS: Array<{ id: string; label: string; color: string; statuses: Status[]; dropStatus: Status }> = [
  { id: "interested", label: "Interested", color: "#93c5fd", statuses: ["interested"], dropStatus: "interested" },
  { id: "applied", label: "Applied", color: "#22d3ee", statuses: ["applied"], dropStatus: "applied" },
  { id: "interview", label: "Interview", color: "#fbbf24", statuses: ["interview"], dropStatus: "interview" },
  { id: "offer", label: "Offer", color: "#4ade80", statuses: ["offer"], dropStatus: "offer" },
  { id: "closed", label: "Closed", color: "#f87171", statuses: ["rejected", "withdrawn"], dropStatus: "rejected" },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

let apps: Apps = {};
let cachedReqs: NonNullable<SmartFillStorageData["smartfill_job_requirements"]> = {};
let facts: SmartFillUserFacts | null = null;
let resumeText = "";
const openNotes = new Set<string>();
const matchApi = () => window.__SMARTFILL__?.match;

// ─── Storage ──────────────────────────────────────────────────────────────────

const PROFILE_DEFAULTS = {
  [KEY]: {}, smartfill_job_requirements: {}, smartfill_profile: { fields: {} }, smartfill_resume: { text: "", updated_at: "" },
} as SmartFillStorageData;

function readFacts(d: SmartFillStorageData) {
  resumeText = d.smartfill_resume?.text || "";
  facts = matchApi()?.userFacts(d.smartfill_profile?.fields || {}, resumeText) || null;
}

function load() {
  chrome.storage.local.get(PROFILE_DEFAULTS, (d) => {
    apps = d.smartfill_applications || {};
    cachedReqs = d.smartfill_job_requirements || {};
    readFacts(d);
    if (!$<HTMLTextAreaElement>("cvText").value) $<HTMLTextAreaElement>("cvText").value = resumeText;
    renderCvSummary();
    render();
  });
}

function matchFor(a: SmartFillApplication): SmartFillMatch | null {
  const req = a.requirements || cachedReqs[a.id]?.requirements;
  const api = matchApi();
  if (!req || !api || !facts) return null;
  return api.score(req, facts);
}

// Read-modify-write, so a record logged by another tab meanwhile is kept.
function update(mutate: (all: Apps) => void) {
  chrome.storage.local.get({ [KEY]: {} } as SmartFillStorageData, (d) => {
    const all = { ...(d.smartfill_applications || {}) };
    mutate(all);
    chrome.storage.local.set({ [KEY]: all }, () => { apps = all; render(); });
  });
}

function setStatus(id: string, status: Status) {
  update((all) => {
    const app = all[id];
    if (!app || app.status === status) return;
    const now = new Date().toISOString();
    all[id] = {
      ...app,
      status,
      updatedAt: now,
      appliedAt: app.appliedAt || (status !== "interested" && status !== "withdrawn" ? now : undefined),
      history: [...(app.history || []), { status, at: now }],
    };
  });
}

function setNotes(id: string, notes: string) {
  update((all) => { if (all[id]) all[id] = { ...all[id], notes }; });
}

function remove(id: string) {
  update((all) => { delete all[id]; });
}

// ─── Derived values ───────────────────────────────────────────────────────────

const isApplication = (a: SmartFillApplication) => a.status !== "interested";
const lastChange = (a: SmartFillApplication) => Date.parse(a.updatedAt || a.createdAt);
const needsFollowUp = (a: SmartFillApplication, now = Date.now()) =>
  a.status === "applied" && now - lastChange(a) >= FOLLOW_UP_DAYS * DAY;

function ago(iso: string | undefined): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function whenText(a: SmartFillApplication): string {
  if (a.status === "interested") return `Saved ${ago(a.createdAt)}`;
  const applied = a.appliedAt ? `Applied ${ago(a.appliedAt)}` : "";
  if (a.status === "applied") return applied;
  const moved = `${STATUS_LABELS[a.status]} ${ago(a.updatedAt)}`;
  return applied ? `${moved} · ${applied.toLowerCase()}` : moved;
}

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderStats(list: SmartFillApplication[]) {
  const sent = list.filter(isApplication);
  const weekAgo = Date.now() - 7 * DAY;
  const replied = sent.filter((a) => ["interview", "offer", "rejected"].includes(a.status)).length;
  $("statTotal").textContent = String(sent.length);
  $("statWeek").textContent = String(sent.filter((a) => Date.parse(a.appliedAt || a.createdAt) >= weekAgo).length);
  $("statReply").textContent = sent.length ? `${Math.round((replied / sent.length) * 100)}%` : "–";
  $("statInterviews").textContent = String(list.filter((a) => a.status === "interview" || a.status === "offer").length);
  $("statOffers").textContent = String(list.filter((a) => a.status === "offer").length);
  $("statFollow").textContent = String(list.filter((a) => needsFollowUp(a)).length);
}

function renderPlatformFilter(list: SmartFillApplication[]) {
  const select = $<HTMLSelectElement>("platformFilter");
  const current = select.value;
  const platforms = Array.from(new Set(list.map((a) => a.platform).filter(Boolean))).sort();
  select.replaceChildren(new Option("All platforms", ""), ...platforms.map((p) => new Option(p, p)));
  select.value = platforms.includes(current) ? current : "";
}

function matchesFilters(a: SmartFillApplication): boolean {
  const q = $<HTMLInputElement>("search").value.trim().toLowerCase();
  const platform = $<HTMLSelectElement>("platformFilter").value;
  if (platform && a.platform !== platform) return false;
  if ($<HTMLInputElement>("followOnly").checked && !needsFollowUp(a)) return false;
  if (!q) return true;
  return [a.company, a.title, a.location, a.notes, a.platform].join(" ").toLowerCase().includes(q);
}

function renderCard(a: SmartFillApplication): HTMLElement {
  const card = el("article", "card");
  card.draggable = true;
  card.dataset.id = a.id;
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/plain", a.id);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  const top = el("div", "top-row");
  top.append(el("div", "company", a.company));
  const match = matchFor(a);
  if (match && match.score !== null) {
    const pill = el("span", `score ${match.level}`, `${match.score}%`);
    pill.title = [
      `Match score: ${match.score}%${match.lowConfidence ? " (rough estimate)" : ""}`,
      match.matched.length ? `You have: ${match.matched.join(", ")}` : "",
      match.missing.length ? `Missing: ${match.missing.join(", ")}` : "",
      match.missingPreferred.length ? `Nice to have: ${match.missingPreferred.join(", ")}` : "",
      match.yearsNote || "", match.degreeNote || "",
    ].filter(Boolean).join("\n");
    top.append(pill);
  }
  card.append(top, el("div", "role", a.title));
  const meta = [a.location, a.platform].filter(Boolean).join(" · ");
  if (meta) card.append(el("div", "meta", meta));
  if (a.status === "rejected" || a.status === "withdrawn") card.append(el("span", `tag ${a.status}`, STATUS_LABELS[a.status]));
  card.append(el("div", "when", whenText(a)));
  if (match && match.score !== null && match.missing.length && a.status === "interested") {
    const more = match.missing.length > 3 ? ` +${match.missing.length - 3}` : "";
    card.append(el("div", "missing", `Missing: ${match.missing.slice(0, 3).join(", ")}${more}`));
  }
  if (needsFollowUp(a)) {
    const days = Math.floor((Date.now() - lastChange(a)) / DAY);
    card.append(el("div", "follow", `No reply in ${days} days — follow up?`));
  }

  if (openNotes.has(a.id)) {
    const area = el("textarea");
    area.value = a.notes || "";
    area.placeholder = "Recruiter name, interview dates, salary…";
    area.addEventListener("change", () => setNotes(a.id, area.value));
    area.addEventListener("mousedown", (e) => e.stopPropagation());
    card.append(area);
    setTimeout(() => area.focus(), 0);
  } else if (a.notes) {
    card.append(el("div", "notes-preview", a.notes));
  }

  const controls = el("div", "controls");
  const select = el("select");
  select.title = "Change status";
  for (const s of STATUSES) select.append(new Option(STATUS_LABELS[s], s));
  select.value = a.status;
  select.addEventListener("change", () => setStatus(a.id, select.value as Status));
  controls.append(select);

  const notesBtn = el("button", "", openNotes.has(a.id) ? "Done" : "Notes");
  notesBtn.type = "button";
  notesBtn.addEventListener("click", () => {
    if (openNotes.has(a.id)) openNotes.delete(a.id); else openNotes.add(a.id);
    const area = card.querySelector("textarea");
    if (area && area.value !== (a.notes || "")) setNotes(a.id, area.value); else render();
  });
  controls.append(notesBtn);

  const href = safeHref(a.url);
  if (href) {
    const link = el("a", "", "Open");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = href;
    controls.append(link);
  }

  const del = el("button", "del", "×");
  del.type = "button";
  del.title = "Delete";
  del.addEventListener("click", () => {
    if (confirm(`Delete ${a.title} at ${a.company} from the tracker?`)) remove(a.id);
  });
  controls.append(del);

  card.append(controls);
  return card;
}

function render() {
  const list = Object.values(apps);
  renderStats(list);
  renderPlatformFilter(list);
  $("empty").hidden = list.length > 0;

  const board = $("board");
  board.hidden = list.length === 0;
  board.replaceChildren();
  const byMatch = $<HTMLSelectElement>("sortBy").value === "match";
  const scoreOf = (a: SmartFillApplication) => matchFor(a)?.score ?? -1;
  const visible = list.filter(matchesFilters).sort((x, y) =>
    (byMatch ? scoreOf(y) - scoreOf(x) : 0) || lastChange(y) - lastChange(x));

  for (const col of COLUMNS) {
    const column = el("section", "column");
    column.dataset.column = col.id;
    const cards = visible.filter((a) => col.statuses.includes(a.status));
    const head = el("div", "column-head");
    const title = el("span");
    const dot = el("i");
    dot.style.background = col.color;
    title.append(dot, col.label);
    head.append(title, el("em", "count", String(cards.length)));
    column.append(head, ...cards.map(renderCard));

    column.addEventListener("dragover", (e) => { e.preventDefault(); column.classList.add("drop"); });
    column.addEventListener("dragleave", () => column.classList.remove("drop"));
    column.addEventListener("drop", (e) => {
      e.preventDefault();
      column.classList.remove("drop");
      const id = e.dataTransfer?.getData("text/plain");
      const app = id ? apps[id] : undefined;
      if (!app || col.statuses.includes(app.status)) return;
      setStatus(app.id, col.dropStatus);
    });
    board.append(column);
  }
}

// ─── Add, export, filters ─────────────────────────────────────────────────────

const addStatus = $<HTMLSelectElement>("addStatus");
for (const s of STATUSES) addStatus.append(new Option(STATUS_LABELS[s], s));
addStatus.value = "applied";

$("addToggle").addEventListener("click", () => {
  const form = $("addForm");
  form.hidden = !form.hidden;
  if (!form.hidden) $("addCompany").focus();
});

$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const company = $<HTMLInputElement>("addCompany").value.trim();
  const title = $<HTMLInputElement>("addTitle").value.trim();
  const url = $<HTMLInputElement>("addUrl").value.trim();
  const status = addStatus.value as Status;
  if (!company || !title) return;
  const now = new Date().toISOString();
  const id = `manual:${Date.now().toString(36)}`;
  update((all) => {
    all[id] = {
      id, url: safeHref(url) || "", company, title, location: "", platform: "Added manually",
      status, createdAt: now, updatedAt: now,
      appliedAt: status !== "interested" ? now : undefined,
      history: [{ status, at: now }], notes: "",
    };
  });
  ($("addForm") as HTMLFormElement).reset();
  addStatus.value = "applied";
  $("addForm").hidden = true;
});

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // Stop spreadsheet apps from running page-supplied text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$("exportCsv").addEventListener("click", () => {
  const header = ["Company", "Role", "Status", "Location", "Platform", "Applied", "Last update", "Link", "Notes"];
  const rows = Object.values(apps)
    .sort((a, b) => lastChange(b) - lastChange(a))
    .map((a) => [a.company, a.title, STATUS_LABELS[a.status], a.location, a.platform,
      a.appliedAt?.slice(0, 10) || "", (a.updatedAt || a.createdAt).slice(0, 10), a.url, a.notes]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const link = el("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `smartfill-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ─── CV ───────────────────────────────────────────────────────────────────────

function renderCvSummary() {
  const out = $("cvSummary");
  if (!facts || !facts.hasData) {
    out.className = "cv-summary";
    out.textContent = "No CV yet: jobs can't be scored until you add one.";
    return;
  }
  const degree = ["", "a diploma", "a bachelor's degree", "a master's degree", "a PhD"][facts.degree || 0];
  const years = facts.years === null ? "" : facts.yearsSource === "dates" ? `about ${facts.years} years of experience` : `${facts.years} years of experience`;
  out.className = "cv-summary ok";
  out.textContent = `Found ${facts.skills.length} skills${years ? `, ${years}` : ""}${degree ? `, ${degree}` : ""}.`;
  out.title = facts.skills.map((s) => s.label).join(", ");
}

function toggleCv(show = $("cvPanel").hidden) {
  $("cvPanel").hidden = !show;
  if (show) $("cvText").focus();
}

$("cvToggle").addEventListener("click", () => toggleCv());
$("cvCancel").addEventListener("click", () => toggleCv(false));
$("cvSave").addEventListener("click", () => {
  const text = $<HTMLTextAreaElement>("cvText").value.slice(0, 50000);
  chrome.storage.local.set({ smartfill_resume: { text, updated_at: new Date().toISOString() } }, () => {
    const btn = $("cvSave");
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = "Save CV"; }, 1200);
    load();
  });
});
if (location.hash === "#cv") toggleCv(true);

$("search").addEventListener("input", render);
$("sortBy").addEventListener("change", render);
$("platformFilter").addEventListener("change", render);
$("followOnly").addEventListener("change", render);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.smartfill_profile || changes.smartfill_resume || changes.smartfill_job_requirements) {
    load();
    return;
  }
  if (!changes[KEY]) return;
  apps = (changes[KEY].newValue as Apps) || {};
  // Don't wipe a note the user is typing; it re-renders once they're done.
  if (document.activeElement?.tagName === "TEXTAREA") return;
  render();
});

load();

export {};
