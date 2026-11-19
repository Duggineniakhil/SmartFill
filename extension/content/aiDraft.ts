// SmartFill content script - AI-drafted answers to custom questions.
// Finds unanswered questions — free text, dropdowns, radio groups and
// checkbox groups — asks the background worker to answer them from the user's
// CV and the job description, and fills them in outlined amber for review.
// Never submits, never ticks consent boxes, never answers demographic
// (equal-opportunity) questions.
"use strict";
(function () {
  const sf = window.__SMARTFILL__;
  if (!sf || sf.ai) return;

  const AI_TITLE = "Drafted by AI from your CV — read and edit it before submitting";
  const BUTTON_CLASS = "smartfill-ai-draft";
  const TEXT_TYPES = new Set(["", "text"]);
  const MAX_OPTIONS = 80;
  // Single-line inputs only count when the label reads like a question.
  const QUESTION_LABEL = /\?\s*$|^(why|how|what|describe|tell us|explain|share|please (describe|explain|tell|share)|briefly|in a few)/i;
  // Left for the user, always: self-identification and legal attestations.
  const SENSITIVE = /\b(gender|sex|race|racial|ethnic|ethnicity|hispanic|latin[oax]|veteran|disabilit|sexual orientation|lgbt|transgender|pronoun|religio|marital|pregnan|date of birth|age range|criminal|convict|felony|self[- ]identif|eeo|equal (employment )?opportunit|voluntary)\b/i;
  const CONSENT = /\b(i (agree|consent|acknowledge|certify|confirm|understand|accept|attest)|privacy (policy|notice)|terms (and|&) conditions|terms of (use|service)|gdpr|data processing|by (checking|ticking|submitting))\b/i;

  type Kind = "short" | "long" | "single" | "multi";
  type Question = { id: string; label: string; kind: Kind; maxLength?: number; options?: string[] };
  type Answer = { id: string; answer: string; choices: string[]; note: string };
  interface Target {
    q: Omit<Question, "id">;
    markEl: HTMLElement;
    textEl?: HTMLElement;
    answered: () => boolean;
    apply: (a: Answer) => boolean;
  }

  const clean = (s: string | null | undefined) => String(s || "").replace(/\s+/g, " ").trim();
  const stripLabel = (s: string) => clean(s).replace(/\s*\*\s*$/, "").replace(/\s*\(?required\)?\s*$/i, "").trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const skipLabel = (label: string) => !label || label.length < 3 || label.length > 400 || SENSITIVE.test(label) || CONSENT.test(label);

  function shown(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  // ─── Free text ────────────────────────────────────────────────────────────────

  function textTargets(): Target[] {
    const out: Target[] = [];
    for (const el of Array.from(document.querySelectorAll("textarea, input") as NodeListOf<HTMLElement>)) {
      if (el instanceof HTMLInputElement && !TEXT_TYPES.has(el.type)) continue;
      const control = el as HTMLInputElement | HTMLTextAreaElement;
      if (control.disabled || control.readOnly) continue;
      if (!(sf.fields?.visible(el) ?? true) || sf.fields?.value(el)) continue;
      const { canonicalField, confidence } = sf.classify(el);
      // Name, email, phone and other profile fields are autofill's job.
      if (canonicalField && confidence >= 0.5) continue;
      const key = sf.customFieldKey(el);
      if (!key) continue;
      const label = stripLabel(key.label);
      const isTextarea = el instanceof HTMLTextAreaElement;
      if (skipLabel(label) || (!isTextarea && !QUESTION_LABEL.test(label) && label.length < 25)) continue;
      const max = (el as HTMLInputElement).maxLength;
      const maxLength = max && max > 0 && max < 100000 ? max : undefined;
      out.push({
        q: { label, kind: isTextarea || (maxLength ?? 0) > 200 ? "long" : "short", maxLength },
        markEl: el,
        textEl: el,
        answered: () => Boolean(sf.fields?.value(el)),
        apply: (a) => Boolean(a.answer) && Boolean(sf.fields?.setValue(el, a.answer)),
      });
    }
    return out;
  }

  // ─── Dropdowns ────────────────────────────────────────────────────────────────

  // "Select…", "-- Choose --" and empty-value options are placeholders.
  const PLACEHOLDER = /^(select|choose|pick one|please select|please choose|none selected|-{2,}|—)/i;
  const isPlaceholder = (o: HTMLOptionElement) => o.value === "" || !clean(o.text) || PLACEHOLDER.test(clean(o.text));

  function realOptions(select: HTMLSelectElement): HTMLOptionElement[] {
    return Array.from(select.options).filter((o) => !o.disabled && !isPlaceholder(o));
  }

  function selectAnswered(select: HTMLSelectElement): boolean {
    const opt = select.selectedOptions[0];
    return Boolean(opt) && !isPlaceholder(opt);
  }

  function selectTargets(): Target[] {
    const out: Target[] = [];
    for (const select of Array.from(document.querySelectorAll("select"))) {
      // A profile dropdown (country, experience) that is still empty is one
      // autofill couldn't answer, so the AI may try it from the CV.
      if (select.disabled || select.multiple || !shown(select) || selectAnswered(select)) continue;
      const key = sf.customFieldKey(select);
      const label = stripLabel(key?.label || "");
      if (skipLabel(label)) continue;
      const options = realOptions(select).map((o) => clean(o.text));
      if (options.length < 2 || options.length > MAX_OPTIONS) continue;
      out.push({
        q: { label, kind: "single", options },
        markEl: select,
        answered: () => selectAnswered(select),
        apply: (a) => Boolean(a.choices[0]) && Boolean(sf.fields?.setValue(select, a.choices[0])),
      });
    }
    return out;
  }

  // ─── Radio and checkbox groups (native and ARIA, e.g. Google Forms) ─────────

  interface Item { el: HTMLElement; text: string; checked: () => boolean }

  function itemText(el: HTMLElement): string {
    if (el instanceof HTMLInputElement) {
      const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const wrap = el.closest("label");
      const text = clean(byFor?.textContent) || clean(wrap?.textContent) || clean(el.getAttribute("aria-label"));
      if (text) return text;
      const next = el.nextSibling;
      return clean(next?.textContent) || clean(el.value);
    }
    return clean(el.getAttribute("aria-label")) || clean(el.getAttribute("data-value")) || clean(el.textContent);
  }

  const isChecked = (el: HTMLElement) =>
    el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true";

  function commonAncestor(els: HTMLElement[]): HTMLElement {
    let node: HTMLElement | null = els[0].parentElement;
    while (node && !els.every((e) => node!.contains(e))) node = node.parentElement;
    return node || document.body;
  }

  // The group's question: an ARIA name, a <legend>, a Google Forms heading, or
  // the nearest text block before the first option.
  function groupLabel(container: HTMLElement, first: HTMLElement): string {
    const labelledBy = container.getAttribute("aria-labelledby");
    if (labelledBy) {
      const t = labelledBy.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).join(" ");
      if (clean(t)) return stripLabel(t);
    }
    if (container.getAttribute("aria-label")) return stripLabel(container.getAttribute("aria-label")!);
    const legend = first.closest("fieldset")?.querySelector("legend");
    if (legend && clean(legend.textContent)) return stripLabel(legend.textContent!);
    const heading = first.closest('[role="listitem"]')?.querySelector('[role="heading"]');
    if (heading && clean(heading.textContent)) return stripLabel(heading.textContent!);

    for (let scope: HTMLElement | null = container, depth = 0; scope && depth < 3; scope = scope.parentElement, depth++) {
      const stopAt = first.closest("label") || first;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        // Stop at the first option.
        if (stopAt.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING || stopAt.contains(n)) break;
        if (clean(n.textContent).replace(/\*/g, "").length >= 2) last = n;
      }
      if (last) {
        const block = last.parentElement?.closest("label, legend, p, h1, h2, h3, h4, h5, h6, [role=heading], div, span");
        const text = stripLabel(block && block !== scope ? block.textContent || "" : last.textContent || "");
        if (text.length >= 3) return text;
      }
    }
    return "";
  }

  function groups(): Array<{ items: Item[]; multi: boolean; container: HTMLElement }> {
    const buckets = new Map<string | HTMLElement, { items: HTMLElement[]; multi: boolean }>();
    const add = (key: string | HTMLElement, el: HTMLElement, multi: boolean) => {
      const b = buckets.get(key) || { items: [], multi };
      b.items.push(el);
      buckets.set(key, b);
    };
    for (const el of Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]') as NodeListOf<HTMLInputElement>)) {
      if (el.disabled) continue;
      const multi = el.type === "checkbox";
      const scope = el.form ? `form${Array.from(document.forms).indexOf(el.form)}` : "doc";
      if (el.name) add(`${scope}:${el.type}:${el.name}`, el, multi);
      else add(el.closest("fieldset, [role=group], [role=radiogroup]") as HTMLElement || el.parentElement!.parentElement || el, el, multi);
    }
    for (const el of Array.from(document.querySelectorAll('[role="radio"], [role="checkbox"]') as NodeListOf<HTMLElement>)) {
      if (el instanceof HTMLInputElement || el.getAttribute("aria-disabled") === "true") continue;
      const multi = el.getAttribute("role") === "checkbox";
      const root = (el.closest(multi ? '[role="group"], [role="list"], fieldset' : '[role="radiogroup"]') as HTMLElement)
        || el.parentElement?.parentElement || el;
      add(root, el, multi);
    }
    const out: Array<{ items: Item[]; multi: boolean; container: HTMLElement }> = [];
    for (const { items, multi } of buckets.values()) {
      // A lone checkbox is a consent or yes/no tick: never the AI's call.
      if (items.length < 2 || items.length > MAX_OPTIONS) continue;
      const container = commonAncestor(items);
      if (!shown(container)) continue;
      out.push({ items: items.map((el) => ({ el, text: itemText(el), checked: () => isChecked(el) })), multi, container });
    }
    return out;
  }

  function groupTargets(): Target[] {
    const out: Target[] = [];
    for (const g of groups()) {
      if (g.items.some((i) => i.checked())) continue;
      const label = groupLabel(g.container, g.items[0].el);
      if (skipLabel(label)) continue;
      const options = g.items.map((i) => i.text).filter(Boolean);
      if (options.length !== g.items.length || g.items.some((i) => CONSENT.test(i.text))) continue;
      out.push({
        q: { label, kind: g.multi ? "multi" : "single", options },
        markEl: g.container,
        answered: () => g.items.some((i) => i.checked()),
        apply: (a) => {
          let picked = 0;
          for (const choice of a.choices) {
            const item = g.items.find((i) => norm(i.text) === norm(choice));
            if (!item) continue;
            if (!item.checked()) item.el.click();
            if (item.checked()) picked++;
          }
          return picked > 0;
        },
      });
    }
    return out;
  }

  function allTargets(): Target[] {
    return [...textTargets(), ...selectTargets(), ...groupTargets()];
  }

  // ─── Asking and applying ──────────────────────────────────────────────────────

  function jobContext(override?: string): Promise<{ title?: string; company?: string; location?: string; text?: string }> {
    const tracker = sf.tracker;
    if (!tracker) return Promise.resolve({ text: override || "" });
    const job = tracker.extractJob(document, location.href);
    const isJob = tracker.isJobPage(document, location.href);
    const base = isJob ? { title: job.title, company: job.company, location: job.location } : {};
    if (override) return Promise.resolve({ ...base, text: override });
    return tracker.jobText(isJob ? job.key : "").then((text) => ({ ...base, text }));
  }

  function ask(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "SMARTFILL_AI", ...message }, (res) => {
          resolve((res as Record<string, unknown>) || { ok: false, error: "No reply from SmartFill. Reload the page and try again." });
        });
      } catch {
        resolve({ ok: false, error: "SmartFill was updated. Reload the page and try again." });
      }
    });
  }

  async function draft(targets: Target[], jobText?: string): Promise<SmartFillDraftResult> {
    const result: SmartFillDraftResult = { total: targets.length, drafted: 0, skipped: [] };
    if (!targets.length) return result;
    const questions: Question[] = targets.map((t, i) => ({ id: `q${i + 1}`, ...t.q }));
    const res = await ask({ task: "answers", job: await jobContext(jobText), questions });
    if (!res.ok) return { ...result, error: String(res.error || "AI request failed."), code: String(res.code || "") };
    const answers = (res.answers || []) as Answer[];
    targets.forEach((t, i) => {
      const a = answers.find((x) => x.id === questions[i].id);
      const hasAnswer = Boolean(a && (a.answer || a.choices?.length));
      // Leave it alone if the user answered it while we waited.
      if (!a || !hasAnswer || t.answered()) {
        result.skipped.push({
          label: t.q.label,
          note: a?.note || (hasAnswer ? "You'd already answered it." : "Not enough in your CV to answer this."),
        });
        return;
      }
      if (t.apply({ ...a, choices: a.choices || [] })) {
        t.markEl.dataset.smartfillAi = "1";
        sf.fields?.mark(t.markEl, "review", AI_TITLE);
        result.drafted++;
      } else {
        result.skipped.push({ label: t.q.label, note: "Couldn't apply the AI's answer to this field." });
      }
    });
    return result;
  }

  // ─── Per-field "✦ Draft" button on long questions ───────────────────────────

  let aiReady = false;

  function refreshReady(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["smartfill_ai", "smartfill_resume", "enabled"], (d) => {
        const s = d.smartfill_ai || {};
        const key = s.provider === "groq" ? s.groqKey : s.geminiKey;
        aiReady = d.enabled !== false && Boolean(key && d.smartfill_resume?.text?.trim());
        resolve();
      });
    });
  }

  function addButton(target: Target) {
    const el = target.textEl!;
    if (el.dataset.smartfillAiButton === "1") return;
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
      if (!el.isConnected || sf.fields?.value(el)) { cleanup(); return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { btn.style.display = "none"; return; }
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
    const onInput = () => { if (sf.fields?.value(el)) cleanup(); };

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      btn.disabled = true;
      btn.textContent = "Drafting…";
      const out = await draft([target]);
      if (out.drafted) { cleanup(); return; }
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
    if (!aiReady) return;
    for (const t of textTargets()) {
      // Only long questions get a button; a suggestion badge takes priority.
      if (t.q.kind !== "long" || !t.textEl || t.textEl.dataset.smartfill === "1") continue;
      addButton(t);
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 600); };
  refreshReady().then(schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && (changes.smartfill_ai || changes.smartfill_resume || changes.enabled)) refreshReady().then(schedule);
  });

  sf.ai = {
    // Called by the popup's "Draft answers" in every frame of the tab.
    draftAll: (jobText?: string) => draft(allTargets(), jobText),
    questions: () => allTargets().map((t, i) => ({ id: `q${i + 1}`, ...t.q })),
  };
})();
