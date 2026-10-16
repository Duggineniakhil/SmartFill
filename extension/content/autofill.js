// SmartFill content script - capture + autofill
"use strict";
(function () {
    // The popup may inject this file again into a tab that already has it.
    if (window.__SMARTFILL__.fillNow)
        return;
    const { classify, customFieldKey, labelSimilarity } = window.__SMARTFILL__;
    // Confidence thresholds (see classify() in detectFields.ts):
    // >= AUTOFILL_THRESHOLD: filled silently (if auto-fill is on), filled by
    //   "Fill this page", and captured into the profile on submit.
    // >= SUGGEST_THRESHOLD: only offered via the one-click "SF" badge.
    const AUTOFILL_THRESHOLD = 0.75;
    const SUGGEST_THRESHOLD = 0.5;
    // Custom fields (no canonical type) are remembered by label. An identical
    // label refills automatically; a label sharing this much of its words with a
    // stored one is only suggested via the badge.
    const CUSTOM_SIMILAR_THRESHOLD = 0.75;
    const CUSTOM_VALUE_MAX = 500;
    const CUSTOM_MAX_ENTRIES = 200;
    const INPUT_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [role="textbox"], [contenteditable="true"]';
    function allFields(root = document) {
        return Array.from(root.querySelectorAll(INPUT_SEL)).filter((el) => {
            const control = el;
            if (control.disabled)
                return false;
            if ("readOnly" in control && control.readOnly)
                return false;
            if (el.type === "hidden")
                return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    }
    function fieldValue(el) {
        if (el instanceof HTMLSelectElement) {
            // A placeholder option ("Select…", value "") counts as empty. Store the
            // visible text so the value can be matched against other sites' options.
            const opt = el.selectedOptions[0];
            return opt && opt.value ? String(opt.text || opt.value).trim() : "";
        }
        if ("value" in el)
            return String(el.value || "").trim();
        return String(el.innerText || el.textContent || "").trim();
    }
    function getProfileValue(profileFields, key) {
        if (profileFields[key])
            return profileFields[key];
        const synonyms = {
            university: ["college", "school"],
            postal_code: ["zip", "zip_code"],
            cgpa: ["gpa"],
        };
        const list = synonyms[key] || [];
        for (const syn of list) {
            if (profileFields[syn])
                return profileFields[syn];
        }
        // Derive name parts when only the other form was learned.
        const full = profileFields.full_name?.trim();
        if (key === "first_name" && full)
            return full.split(/\s+/)[0];
        if (key === "last_name" && full && /\s/.test(full))
            return full.split(/\s+/).slice(1).join(" ");
        if (key === "full_name" && profileFields.first_name) {
            return [profileFields.first_name, profileFields.last_name].filter(Boolean).join(" ");
        }
        return undefined;
    }
    function captureFrom(root) {
        // Read the values synchronously: by the time storage answers, a submit may
        // have navigated away or a single-page app may have cleared the form.
        const collected = {};
        const customCollected = {};
        const fields = allFields(root);
        // Custom fields are only learned from real forms: not from single-input
        // search boxes, and not from login forms (anything with a password field).
        const learnCustom = fields.length >= 2 && !root.querySelector('input[type="password"]');
        for (const el of fields) {
            const val = fieldValue(el);
            if (!val)
                continue;
            const { canonicalField, confidence } = classify(el);
            if (canonicalField && confidence >= AUTOFILL_THRESHOLD) {
                collected[canonicalField] = val;
                continue;
            }
            if (!learnCustom || val.length > CUSTOM_VALUE_MAX)
                continue;
            const custom = customFieldKey(el);
            if (custom)
                customCollected[custom.key] = { label: custom.label, value: val };
        }
        if (Object.keys(collected).length === 0 && Object.keys(customCollected).length === 0)
            return;
        chrome.storage.local.get(["smartfill_settings", "smartfill_profile", "enabled"], (data) => {
            const settings = data.smartfill_settings || {};
            // Respect the global enabled toggle from the popup
            if (data.enabled === false)
                return;
            if (settings.autoSaveEnabled === false)
                return;
            const now = new Date().toISOString();
            const existingProfile = data.smartfill_profile || { fields: {} };
            const mergedFields = { ...existingProfile.fields, ...collected };
            const mergedCustom = { ...(existingProfile.custom || {}) };
            for (const [key, entry] of Object.entries(customCollected)) {
                mergedCustom[key] = { ...entry, updated_at: now };
            }
            // Keep the most recently used entries if the list grows too long.
            const customEntries = Object.entries(mergedCustom)
                .sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at))
                .slice(0, CUSTOM_MAX_ENTRIES);
            const mergedProfile = {
                ...existingProfile,
                fields: mergedFields,
                custom: Object.fromEntries(customEntries),
                updated_at: now,
            };
            chrome.storage.local.set({ smartfill_profile: mergedProfile });
        });
    }
    document.addEventListener("submit", (e) => {
        try {
            if (e.target instanceof Element)
                captureFrom(e.target);
        }
        catch {
            // Ignore pages that block field inspection during submit.
        }
    }, true);
    // Google Forms and many single-page apps submit from a scripted button and
    // never fire a native submit event, so also learn when a submit-like control
    // is clicked. Forms with a real submit button are captured twice with the
    // same values, which is harmless.
    const SUBMIT_TEXT = /^(submit|send|apply|apply now|next|continue|save|save and continue|register|sign up|finish|done)$/i;
    document.addEventListener("click", (e) => {
        try {
            const target = e.target instanceof Element ? e.target : null;
            const control = target?.closest('button, input[type="submit"], [role="button"]');
            if (!control)
                return;
            // Real submit buttons inside a <form> are handled by the submit listener.
            if (control.type === "submit" && control.closest("form"))
                return;
            const text = control instanceof HTMLInputElement
                ? control.value
                : control.innerText || control.textContent || control.getAttribute("aria-label") || "";
            if (!SUBMIT_TEXT.test(text.trim()))
                return;
            captureFrom(control.closest("form") || document);
        }
        catch {
            // Never let learning break the page's own click handling.
        }
    }, true);
    const BADGE_CLASS = "smartfill-badge";
    function makeBadge(el, value) {
        if (el.dataset.smartfill === "1")
            return;
        el.dataset.smartfill = "1";
        const wrap = document.createElement("div");
        wrap.style.position = "absolute";
        wrap.style.zIndex = "2147483647";
        wrap.style.pointerEvents = "none";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = BADGE_CLASS;
        btn.textContent = "SF";
        btn.title = `SmartFill: fill "${value}"`;
        btn.style.cssText = `
      pointer-events:auto;background:#22d3ee;color:#000;border:none;border-radius:6px;
      width:22px;height:22px;font-size:13px;font-weight:700;cursor:pointer;
      box-shadow:0 2px 8px rgba(34,211,238,.5);font-family:system-ui;line-height:1;
    `;
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setNativeValue(el, value);
            cleanup();
            el.dataset.smartfillFilled = "1";
        });
        wrap.appendChild(btn);
        document.body.appendChild(wrap);
        const ro = new ResizeObserver(position);
        function cleanup() {
            wrap.remove();
            ro.disconnect();
            window.removeEventListener("scroll", position, true);
            window.removeEventListener("resize", position);
        }
        function position() {
            // Single-page apps remove fields without notice; drop the orphaned badge.
            if (!el.isConnected) {
                cleanup();
                return;
            }
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                wrap.style.display = "none";
                return;
            }
            wrap.style.display = "block";
            wrap.style.top = window.scrollY + r.top + (r.height - 22) / 2 + "px";
            wrap.style.left = window.scrollX + r.right - 28 + "px";
        }
        position();
        try {
            ro.observe(el);
        }
        catch {
            // Some detached elements cannot be observed.
        }
        window.addEventListener("scroll", position, true);
        window.addEventListener("resize", position);
        el.addEventListener("input", () => { if (fieldValue(el))
            cleanup(); }, { once: true });
    }
    function normalizeOption(s) {
        return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }
    // Pick the option whose text or value matches the stored value: exact first,
    // then a whole-word containment ("India" ~ "India (+91)"). Never guesses.
    function findOption(select, value) {
        const want = normalizeOption(value);
        if (!want)
            return undefined;
        const options = Array.from(select.options).filter((o) => o.value !== "" && !o.disabled);
        const exact = options.find((o) => normalizeOption(o.text) === want || normalizeOption(o.value) === want);
        if (exact)
            return exact;
        return options.find((o) => {
            const text = normalizeOption(o.text);
            return text.length > 1 && (` ${text} `.includes(` ${want} `) || ` ${want} `.includes(` ${text} `));
        });
    }
    // Returns false when the value could not be applied (no matching <option>).
    function setNativeValue(el, value) {
        if (el instanceof HTMLSelectElement) {
            const option = findOption(el, value);
            if (!option)
                return false;
            value = option.value;
        }
        if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
            el.focus();
            el.innerText = value;
            el.textContent = value;
            el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "v" }));
            el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "v" }));
            el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "v" }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.blur();
            return true;
        }
        const control = el;
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
            : el.tagName === "SELECT" ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter)
            setter.call(control, value);
        else
            control.value = value;
        // Typed inputs (date, number, email) silently reject values in the wrong
        // format; leave those alone instead of firing events on an empty field.
        if (control.value === "" && value !== "")
            return false;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }
    // Decides what to put in a field: a confident canonical match first, then an
    // exact custom-label match, then weaker suggestions (badge only).
    function resolveFill(el, profile) {
        const fields = profile.fields || {};
        const custom = profile.custom || {};
        const { canonicalField, confidence } = classify(el);
        if (canonicalField && confidence >= AUTOFILL_THRESHOLD) {
            const value = getProfileValue(fields, canonicalField);
            if (value)
                return { value, strong: true };
        }
        const key = Object.keys(custom).length > 0 ? customFieldKey(el) : null;
        if (key && custom[key.key])
            return { value: custom[key.key].value, strong: true };
        if (canonicalField && confidence >= SUGGEST_THRESHOLD) {
            const value = getProfileValue(fields, canonicalField);
            if (value)
                return { value, strong: false };
        }
        if (key) {
            let best = null;
            let bestScore = CUSTOM_SIMILAR_THRESHOLD;
            for (const [storedKey, entry] of Object.entries(custom)) {
                const score = labelSimilarity(key.key, storedKey);
                if (score >= bestScore) {
                    best = entry;
                    bestScore = score;
                }
            }
            if (best)
                return { value: best.value, strong: false };
        }
        return null;
    }
    function scan() {
        chrome.storage.local.get(["smartfill_profile", "smartfill_settings", "enabled"], (data) => {
            const profile = data.smartfill_profile || {};
            const settings = data.smartfill_settings || { autoFillEnabled: true };
            // Respect the global enabled toggle from the popup
            if (data.enabled === false)
                return;
            const fields = allFields();
            for (const el of fields) {
                if (fieldValue(el))
                    continue;
                if (el.dataset.smartfill === "1")
                    continue;
                const fill = resolveFill(el, profile);
                if (!fill)
                    continue;
                const { value } = fill;
                if (fill.strong) {
                    if (settings.autoFillEnabled) {
                        setNativeValue(el, value);
                        el.dataset.smartfill = "1";
                    }
                }
                else if (!(el instanceof HTMLSelectElement) || findOption(el, value)) {
                    makeBadge(el, value);
                }
            }
        });
    }
    let scanTimer;
    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 250);
    }
    scheduleScan();
    const obs = new MutationObserver(scheduleScan);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // "Fill this page": fills every empty field matched at AUTOFILL_THRESHOLD
    // or above (or by an exact custom label), even when silent auto-fill is off. It writes the whole page with
    // no per-field review, so it uses the same bar as silent auto-fill; weaker
    // matches keep their "SF" badge for one-click confirmation.
    function fillNow() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["smartfill_profile", "enabled"], (data) => {
                if (data.enabled === false) {
                    resolve({ filled: 0, disabled: true });
                    return;
                }
                const profile = data.smartfill_profile || {};
                let filled = 0;
                for (const el of allFields()) {
                    if (fieldValue(el))
                        continue;
                    const fill = resolveFill(el, profile);
                    if (!fill || !fill.strong)
                        continue;
                    try {
                        if (setNativeValue(el, fill.value)) {
                            el.dataset.smartfill = "1";
                            filled++;
                        }
                    }
                    catch {
                        // Continue filling other matched fields if one element rejects updates.
                    }
                }
                resolve({ filled });
            });
        });
    }
    // The popup calls fillNow() in every frame via chrome.scripting and sums the
    // counts; the message is kept for callers that only target the top frame.
    window.__SMARTFILL__.fillNow = fillNow;
    chrome.runtime.onMessage.addListener((msg, _sender, send) => {
        if (window !== window.top)
            return;
        if (typeof msg === "object" && msg !== null && "type" in msg && msg.type === "SMARTFILL_FILL_NOW") {
            fillNow().then(send);
            return true;
        }
    });
})();
//# sourceMappingURL=autofill.js.map