// SmartFill content script - AI-drafted answers to custom questions.
// Finds empty free-text questions ("Why do you want to work here?"), asks the
// background worker to draft answers from the user's CV and the job
// description, and fills them in outlined amber for review. Never submits.
"use strict";
(function () {
    const sf = window.__SMARTFILL__;
    if (!sf || sf.ai)
        return;
    const AI_TITLE = "Drafted by AI from your CV — read and edit it before submitting";
    const BUTTON_CLASS = "smartfill-ai-draft";
    const TEXT_TYPES = new Set(["", "text"]);
    // Single-line inputs only count when the label reads like a question.
    const QUESTION_LABEL = /\?\s*$|^(why|how|what|describe|tell us|explain|share|please (describe|explain|tell|share)|briefly|in a few)/i;
    function candidates(root = document) {
        return Array.from(root.querySelectorAll("textarea, input")).filter((el) => {
            if (el instanceof HTMLInputElement && !TEXT_TYPES.has(el.type))
                return false;
            const control = el;
            if (control.disabled || control.readOnly)
                return false;
            return sf.fields?.visible(el) ?? true;
        });
    }
    function questionOf(el) {
        const { canonicalField, confidence } = sf.classify(el);
        // Name, email, phone and other profile fields are autofill's job.
        if (canonicalField && confidence >= 0.5)
            return null;
        const key = sf.customFieldKey(el);
        if (!key)
            return null;
        const label = key.label.trim();
        const isTextarea = el instanceof HTMLTextAreaElement;
        if (!isTextarea && !QUESTION_LABEL.test(label) && label.length < 25)
            return null;
        const max = el.maxLength;
        const maxLength = max && max > 0 && max < 100000 ? max : undefined;
        const kind = isTextarea || (maxLength ?? 0) > 200 ? "long" : "short";
        return { label, kind, maxLength };
    }
    function emptyQuestions(root = document) {
        const out = [];
        for (const el of candidates(root)) {
            if (sf.fields?.value(el))
                continue;
            const info = questionOf(el);
            if (info)
                out.push({ el, q: { id: `q${out.length + 1}`, ...info } });
        }
        return out;
    }
    function jobContext(override) {
        const tracker = sf.tracker;
        if (!tracker)
            return Promise.resolve({ text: override || "" });
        const job = tracker.extractJob(document, location.href);
        const isJob = tracker.isJobPage(document, location.href);
        const base = isJob ? { title: job.title, company: job.company, location: job.location } : {};
        if (override)
            return Promise.resolve({ ...base, text: override });
        return tracker.jobText(isJob ? job.key : "").then((text) => ({ ...base, text }));
    }
    function ask(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: "SMARTFILL_AI", ...message }, (res) => {
                    resolve(res || { ok: false, error: "No reply from SmartFill. Reload the page and try again." });
                });
            }
            catch {
                resolve({ ok: false, error: "SmartFill was updated. Reload the page and try again." });
            }
        });
    }
    async function draft(targets, jobText) {
        const result = { total: targets.length, drafted: 0, skipped: [] };
        if (!targets.length)
            return result;
        const res = await ask({ task: "answers", job: await jobContext(jobText), questions: targets.map((t) => t.q) });
        if (!res.ok)
            return { ...result, error: String(res.error || "AI request failed."), code: String(res.code || "") };
        const answers = (res.answers || []);
        for (const { el, q } of targets) {
            const a = answers.find((x) => x.id === q.id);
            // Leave it alone if the user typed something while we waited.
            if (!a?.answer || sf.fields?.value(el)) {
                result.skipped.push({ label: q.label, note: a?.note || (a?.answer ? "You'd already typed an answer." : "Not enough in your CV to answer this.") });
                continue;
            }
            if (sf.fields?.setValue(el, a.answer)) {
                el.dataset.smartfillAi = "1";
                sf.fields?.mark(el, "review", AI_TITLE);
                result.drafted++;
            }
        }
        return result;
    }
    // ─── Per-field "✦ Draft" button on long questions ───────────────────────────
    let aiReady = false;
    function refreshReady() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["smartfill_ai", "smartfill_resume", "enabled"], (d) => {
                const s = d.smartfill_ai || {};
                const key = s.provider === "groq" ? s.groqKey : s.geminiKey;
                aiReady = d.enabled !== false && Boolean(key && d.smartfill_resume?.text?.trim());
                resolve();
            });
        });
    }
    function addButton(el, q) {
        if (el.dataset.smartfillAiButton === "1")
            return;
        el.dataset.smartfillAiButton = "1";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = BUTTON_CLASS;
        btn.textContent = "✦ Draft";
        btn.title = "SmartFill: draft an answer from your CV with AI";
        btn.style.cssText = `
      position:absolute;z-index:2147483647;pointer-events:auto;background:#a78bfa;color:#000;border:none;
      border-radius:6px;padding:3px 8px;font:600 12px/1.3 system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(167,139,250,.5);
    `;
        document.body.appendChild(btn);
        const position = () => {
            if (!el.isConnected || sf.fields?.value(el)) {
                cleanup();
                return;
            }
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                btn.style.display = "none";
                return;
            }
            btn.style.display = "block";
            btn.style.top = `${window.scrollY + r.bottom - 28}px`;
            btn.style.left = `${window.scrollX + r.right - btn.offsetWidth - 6}px`;
        };
        const cleanup = () => {
            btn.remove();
            window.removeEventListener("scroll", position, true);
            window.removeEventListener("resize", position);
            el.removeEventListener("input", onInput);
            delete el.dataset.smartfillAiButton;
        };
        const onInput = () => { if (sf.fields?.value(el))
            cleanup(); };
        btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            btn.disabled = true;
            btn.textContent = "Drafting…";
            const out = await draft([{ el, q: { ...q, id: "q1" } }]);
            if (out.drafted) {
                cleanup();
                return;
            }
            btn.disabled = false;
            btn.textContent = "✦ Draft";
            btn.title = out.error || out.skipped[0]?.note || "Couldn't draft an answer.";
            btn.style.background = "#fca5a5";
        });
        el.addEventListener("input", onInput);
        window.addEventListener("scroll", position, true);
        window.addEventListener("resize", position);
        position();
    }
    function scan() {
        if (!aiReady)
            return;
        for (const { el, q } of emptyQuestions()) {
            // Only long questions get a button; a suggestion badge takes priority.
            if (q.kind !== "long" || el.dataset.smartfill === "1")
                continue;
            addButton(el, q);
        }
    }
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 600); };
    refreshReady().then(schedule);
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === "local" && (changes.smartfill_ai || changes.smartfill_resume || changes.enabled))
            refreshReady().then(schedule);
    });
    sf.ai = {
        // Called by the popup's "Draft answers" in every frame of the tab.
        draftAll: (jobText) => draft(emptyQuestions(), jobText),
        questions: () => emptyQuestions().map((t) => t.q),
    };
})();
//# sourceMappingURL=aiDraft.js.map