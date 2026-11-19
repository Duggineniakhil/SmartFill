// SmartFill application tracker page: a board of every application, read
// from chrome.storage.local. Content scripts add records on submit; this page
// changes status, notes and deletes. Page text comes from arbitrary job sites,
// so everything is rendered with textContent, never innerHTML.
const KEY = "smartfill_applications";
const FOLLOW_UP_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;
const STATUS_LABELS = {
    interested: "Interested", applied: "Applied", interview: "Interview",
    offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};
const STATUSES = Object.keys(STATUS_LABELS);
const COLUMNS = [
    { id: "interested", label: "Interested", color: "#93c5fd", statuses: ["interested"], dropStatus: "interested" },
    { id: "applied", label: "Applied", color: "#22d3ee", statuses: ["applied"], dropStatus: "applied" },
    { id: "interview", label: "Interview", color: "#fbbf24", statuses: ["interview"], dropStatus: "interview" },
    { id: "offer", label: "Offer", color: "#4ade80", statuses: ["offer"], dropStatus: "offer" },
    { id: "closed", label: "Closed", color: "#f87171", statuses: ["rejected", "withdrawn"], dropStatus: "rejected" },
];
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
let apps = {};
let cachedReqs = {};
let aiMatches = {};
let jobTexts = {};
let aiSettings = {};
const aiBusy = new Set();
let facts = null;
let resumeText = "";
const openNotes = new Set();
const matchApi = () => window.__SMARTFILL__?.match;
// ─── Storage ──────────────────────────────────────────────────────────────────
const PROFILE_DEFAULTS = {
    [KEY]: {}, smartfill_job_requirements: {}, smartfill_profile: { fields: {} }, smartfill_resume: { text: "", updated_at: "" },
    smartfill_ai: {}, smartfill_ai_matches: {}, smartfill_job_texts: {},
};
const aiReady = () => Boolean((aiSettings.provider === "groq" ? aiSettings.groqKey : aiSettings.geminiKey)?.trim());
function readFacts(d) {
    resumeText = d.smartfill_resume?.text || "";
    facts = matchApi()?.userFacts(d.smartfill_profile?.fields || {}, resumeText) || null;
}
function load() {
    chrome.storage.local.get(PROFILE_DEFAULTS, (d) => {
        apps = d.smartfill_applications || {};
        cachedReqs = d.smartfill_job_requirements || {};
        aiMatches = d.smartfill_ai_matches || {};
        jobTexts = d.smartfill_job_texts || {};
        aiSettings = d.smartfill_ai || {};
        readFacts(d);
        if (!$("cvText").value)
            $("cvText").value = resumeText;
        renderCvSummary();
        render();
    });
}
function matchFor(a) {
    const req = a.requirements || cachedReqs[a.id]?.requirements;
    const api = matchApi();
    if (!req || !api || !facts)
        return null;
    return api.score(req, facts);
}
// Read-modify-write, so a record logged by another tab meanwhile is kept.
function update(mutate) {
    chrome.storage.local.get({ [KEY]: {} }, (d) => {
        const all = { ...(d.smartfill_applications || {}) };
        mutate(all);
        chrome.storage.local.set({ [KEY]: all }, () => { apps = all; render(); });
    });
}
function setStatus(id, status) {
    update((all) => {
        const app = all[id];
        if (!app || app.status === status)
            return;
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
function setNotes(id, notes) {
    update((all) => { if (all[id])
        all[id] = { ...all[id], notes }; });
}
function remove(id) {
    update((all) => { delete all[id]; });
}
// ─── Derived values ───────────────────────────────────────────────────────────
const isApplication = (a) => a.status !== "interested";
const lastChange = (a) => Date.parse(a.updatedAt || a.createdAt);
const needsFollowUp = (a, now = Date.now()) => a.status === "applied" && now - lastChange(a) >= FOLLOW_UP_DAYS * DAY;
function ago(iso) {
    if (!iso)
        return "";
    const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
    if (days <= 0)
        return "today";
    if (days === 1)
        return "yesterday";
    if (days < 30)
        return `${days} days ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function whenText(a) {
    if (a.status === "interested")
        return `Saved ${ago(a.createdAt)}`;
    const applied = a.appliedAt ? `Applied ${ago(a.appliedAt)}` : "";
    if (a.status === "applied")
        return applied;
    const moved = `${STATUS_LABELS[a.status]} ${ago(a.updatedAt)}`;
    return applied ? `${moved} · ${applied.toLowerCase()}` : moved;
}
function safeHref(url) {
    try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    }
    catch {
        return null;
    }
}
// ─── Rendering ────────────────────────────────────────────────────────────────
function renderStats(list) {
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
function renderPlatformFilter(list) {
    const select = $("platformFilter");
    const current = select.value;
    const platforms = Array.from(new Set(list.map((a) => a.platform).filter(Boolean))).sort();
    select.replaceChildren(new Option("All platforms", ""), ...platforms.map((p) => new Option(p, p)));
    select.value = platforms.includes(current) ? current : "";
}
function matchesFilters(a) {
    const q = $("search").value.trim().toLowerCase();
    const platform = $("platformFilter").value;
    if (platform && a.platform !== platform)
        return false;
    if ($("followOnly").checked && !needsFollowUp(a))
        return false;
    if (!q)
        return true;
    return [a.company, a.title, a.location, a.notes, a.platform].join(" ").toLowerCase().includes(q);
}
function renderCard(a) {
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
    const scores = el("div", "scores");
    const ai = aiMatches[a.id];
    if (ai) {
        const pill = el("span", "score ai", `✦ ${ai.score}%`);
        pill.title = [
            `AI match (${ai.provider}): ${ai.score}% — ${ai.verdict}`,
            ai.summary,
            ai.strengths.length ? `Strengths: ${ai.strengths.join("; ")}` : "",
            ai.gaps.length ? `Gaps: ${ai.gaps.join("; ")}` : "",
            ai.tips.length ? `Tips: ${ai.tips.join("; ")}` : "",
        ].filter(Boolean).join("\n");
        scores.append(pill);
    }
    top.append(scores);
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
        scores.append(pill);
    }
    card.append(top, el("div", "role", a.title));
    const meta = [a.location, a.platform].filter(Boolean).join(" · ");
    if (meta)
        card.append(el("div", "meta", meta));
    if (a.status === "rejected" || a.status === "withdrawn")
        card.append(el("span", `tag ${a.status}`, STATUS_LABELS[a.status]));
    card.append(el("div", "when", whenText(a)));
    if (match && match.score !== null && match.missing.length && a.status === "interested") {
        const more = match.missing.length > 3 ? ` +${match.missing.length - 3}` : "";
        card.append(el("div", "missing", `Missing: ${match.missing.slice(0, 3).join(", ")}${more}`));
    }
    if (ai?.summary)
        card.append(el("div", "ai-summary", ai.summary));
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
    }
    else if (a.notes) {
        card.append(el("div", "notes-preview", a.notes));
    }
    const controls = el("div", "controls");
    const select = el("select");
    select.title = "Change status";
    for (const s of STATUSES)
        select.append(new Option(STATUS_LABELS[s], s));
    select.value = a.status;
    select.addEventListener("change", () => setStatus(a.id, select.value));
    controls.append(select);
    const notesBtn = el("button", "", openNotes.has(a.id) ? "Done" : "Notes");
    notesBtn.type = "button";
    notesBtn.addEventListener("click", () => {
        if (openNotes.has(a.id))
            openNotes.delete(a.id);
        else
            openNotes.add(a.id);
        const area = card.querySelector("textarea");
        if (area && area.value !== (a.notes || ""))
            setNotes(a.id, area.value);
        else
            render();
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
    if (aiReady()) {
        const aiBtn = el("button", "ai", aiBusy.has(a.id) ? "…" : "✦");
        aiBtn.type = "button";
        aiBtn.title = ai ? "Run the AI match again" : "AI match: score this job against your CV";
        aiBtn.disabled = aiBusy.has(a.id);
        aiBtn.addEventListener("click", () => runAiMatch(a));
        controls.append(aiBtn);
    }
    const del = el("button", "del", "×");
    del.type = "button";
    del.title = "Delete";
    del.addEventListener("click", () => {
        if (confirm(`Delete ${a.title} at ${a.company} from the tracker?`))
            remove(a.id);
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
    const byMatch = $("sortBy").value === "match";
    const scoreOf = (a) => aiMatches[a.id]?.score ?? matchFor(a)?.score ?? -1;
    const visible = list.filter(matchesFilters).sort((x, y) => (byMatch ? scoreOf(y) - scoreOf(x) : 0) || lastChange(y) - lastChange(x));
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
            if (!app || col.statuses.includes(app.status))
                return;
            setStatus(app.id, col.dropStatus);
        });
        board.append(column);
    }
}
// ─── Add, export, filters ─────────────────────────────────────────────────────
const addStatus = $("addStatus");
for (const s of STATUSES)
    addStatus.append(new Option(STATUS_LABELS[s], s));
addStatus.value = "applied";
$("addToggle").addEventListener("click", () => {
    const form = $("addForm");
    form.hidden = !form.hidden;
    if (!form.hidden)
        $("addCompany").focus();
});
$("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const company = $("addCompany").value.trim();
    const title = $("addTitle").value.trim();
    const url = $("addUrl").value.trim();
    const status = addStatus.value;
    if (!company || !title)
        return;
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
    $("addForm").reset();
    addStatus.value = "applied";
    $("addForm").hidden = true;
});
function csvCell(v) {
    let s = String(v ?? "");
    // Stop spreadsheet apps from running page-supplied text as a formula.
    if (/^[=+\-@\t\r]/.test(s))
        s = `'${s}`;
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
    if (show)
        $("cvText").focus();
}
// ─── AI ───────────────────────────────────────────────────────────────────────
function sendAi(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "SMARTFILL_AI", ...message }, (res) => {
            resolve(res || { ok: false, error: "No reply from SmartFill's background worker." });
        });
    });
}
function runAiMatch(a) {
    aiBusy.add(a.id);
    render();
    sendAi({ task: "match", job: { title: a.title, company: a.company, location: a.location, text: jobTexts[a.id]?.text || "" } })
        .then((res) => {
        aiBusy.delete(a.id);
        if (!res.ok) {
            alert(`AI match failed: ${res.error}`);
            render();
            return;
        }
        chrome.storage.local.get({ smartfill_ai_matches: {} }, (d) => {
            chrome.storage.local.set({ smartfill_ai_matches: { ...d.smartfill_ai_matches, [a.id]: res.match } }, load);
        });
    });
}
function aiForm() {
    const provider = document.querySelector('input[name="aiProvider"]:checked')?.value === "groq" ? "groq" : "gemini";
    return {
        provider,
        geminiKey: $("geminiKey").value.trim(),
        groqKey: $("groqKey").value.trim(),
        geminiModel: $("geminiModel").value.trim(),
        groqModel: $("groqModel").value.trim(),
    };
}
function fillAiForm() {
    const radio = document.querySelector(`input[name="aiProvider"][value="${aiSettings.provider === "groq" ? "groq" : "gemini"}"]`);
    if (radio)
        radio.checked = true;
    $("geminiKey").value = aiSettings.geminiKey || "";
    $("groqKey").value = aiSettings.groqKey || "";
    $("geminiModel").value = aiSettings.geminiModel || "";
    $("groqModel").value = aiSettings.groqModel || "";
}
function aiStatus(text, kind = "") {
    const out = $("aiStatus");
    out.className = `cv-summary ${kind}`;
    out.textContent = text;
}
function toggleAi(show = $("aiPanel").hidden) {
    $("aiPanel").hidden = !show;
    if (show) {
        fillAiForm();
        aiStatus(aiReady() ? "AI is set up." : "No API key saved yet.", aiReady() ? "ok" : "");
    }
}
$("aiToggle").addEventListener("click", () => toggleAi());
$("aiClose").addEventListener("click", () => toggleAi(false));
$("aiSave").addEventListener("click", () => {
    chrome.storage.local.set({ smartfill_ai: aiForm() }, () => {
        aiStatus("Saved.", "ok");
        load();
    });
});
$("aiTest").addEventListener("click", async () => {
    const settings = aiForm();
    aiStatus("Testing…");
    const res = await sendAi({ task: "test", settings });
    if (res.ok)
        aiStatus(`Connected to ${res.provider === "groq" ? "Groq" : "Gemini"} (${res.model}). Remember to Save.`, "ok");
    else
        aiStatus(String(res.error), "err");
});
if (location.hash === "#ai")
    toggleAi(true);
// ─── CV upload ────────────────────────────────────────────────────────────────
const MAX_PDF_PAGES = 20;
async function pdfText(buf) {
    const pdfjs = await import(chrome.runtime.getURL("vendor/pdfjs/pdf.min.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const out = [];
    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
            text += item.str || "";
            if (item.hasEOL)
                text += "\n";
        }
        out.push(text.trim());
    }
    return { text: out.join("\n\n"), pages };
}
// Minimal .zip reader: finds one entry and inflates it with the browser's
// built-in DecompressionStream, so .docx needs no extra library.
async function unzipEntry(buf, name) {
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        return null;
    const count = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    for (let n = 0; n < count && off + 46 <= buf.byteLength; n++) {
        if (view.getUint32(off, true) !== 0x02014b50)
            break;
        const method = view.getUint16(off + 10, true);
        const size = view.getUint32(off + 20, true);
        const nameLen = view.getUint16(off + 28, true);
        const extraLen = view.getUint16(off + 30, true);
        const commentLen = view.getUint16(off + 32, true);
        const local = view.getUint32(off + 42, true);
        const entry = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
        if (entry === name) {
            const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            const data = bytes.slice(start, start + size);
            if (method === 0)
                return decoder.decode(data);
            if (method !== 8)
                return null;
            const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
            return new Response(stream).text();
        }
        off += 46 + nameLen + extraLen + commentLen;
    }
    return null;
}
async function docxText(buf) {
    const xml = await unzipEntry(buf, "word/document.xml");
    if (!xml)
        throw new Error("That doesn't look like a Word .docx file.");
    const marked = xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "");
    const decoded = new DOMParser().parseFromString(`<!doctype html><body>${marked.replace(/</g, "&lt;")}`, "text/html").body.textContent || "";
    return decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
let uploadedName = "";
$("cvFile").addEventListener("change", async () => {
    const input = $("cvFile");
    const file = input.files?.[0];
    input.value = "";
    if (!file)
        return;
    const status = $("cvFileStatus");
    status.className = "cv-summary";
    status.textContent = `Reading ${file.name}…`;
    try {
        if (file.size > 10 * 1024 * 1024)
            throw new Error("That file is over 10 MB.");
        const lower = file.name.toLowerCase();
        let text = "";
        let detail = "";
        if (lower.endsWith(".pdf") || file.type === "application/pdf") {
            const out = await pdfText(await file.arrayBuffer());
            text = out.text;
            detail = `${out.pages} page${out.pages === 1 ? "" : "s"}`;
        }
        else if (lower.endsWith(".docx")) {
            text = await docxText(await file.arrayBuffer());
        }
        else if (lower.endsWith(".doc")) {
            throw new Error("Old .doc files can't be read. Save it as .docx or PDF and try again.");
        }
        else {
            text = await file.text();
        }
        if (text.replace(/\s/g, "").length < 50) {
            throw new Error("Couldn't find text in that file. If it's a scanned PDF, paste your CV instead.");
        }
        $("cvText").value = text;
        uploadedName = file.name;
        status.className = "cv-summary ok";
        status.textContent = `Read ${file.name}${detail ? ` (${detail})` : ""}. Check the text below, then Save CV.`;
    }
    catch (e) {
        status.className = "cv-summary err";
        status.textContent = e.message || "Couldn't read that file.";
    }
});
$("cvToggle").addEventListener("click", () => toggleCv());
$("cvCancel").addEventListener("click", () => toggleCv(false));
$("cvSave").addEventListener("click", () => {
    const text = $("cvText").value.slice(0, 50000);
    chrome.storage.local.set({ smartfill_resume: { text, updated_at: new Date().toISOString(), fileName: uploadedName || undefined } }, () => {
        const btn = $("cvSave");
        btn.textContent = "Saved";
        setTimeout(() => { btn.textContent = "Save CV"; }, 1200);
        load();
    });
});
if (location.hash === "#cv")
    toggleCv(true);
$("search").addEventListener("input", render);
$("sortBy").addEventListener("change", render);
$("platformFilter").addEventListener("change", render);
$("followOnly").addEventListener("change", render);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local")
        return;
    if (changes.smartfill_profile || changes.smartfill_resume || changes.smartfill_job_requirements
        || changes.smartfill_ai || changes.smartfill_ai_matches || changes.smartfill_job_texts) {
        load();
        return;
    }
    if (!changes[KEY])
        return;
    apps = changes[KEY].newValue || {};
    // Don't wipe a note the user is typing; it re-renders once they're done.
    if (document.activeElement?.tagName === "TEXTAREA")
        return;
    render();
});
load();
