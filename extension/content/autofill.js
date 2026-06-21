// SmartFill content script — capture + autofill
"use strict";
(function () {
    const { classify } = window.__SMARTFILL__;
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
        if ("value" in el)
            return String(el.value || "").trim();
        return String(el.innerText || el.textContent || "").trim();
    }
    function captureFrom(root) {
        chrome.storage.local.get(["smartfill_settings", "smartfill_profile", "enabled"], (data) => {
            const settings = data.smartfill_settings || {};
            // Respect the global enabled toggle from the popup
            if (data.enabled === false)
                return;
            if (settings.autoSaveEnabled === false)
                return;
            const collected = {};
            for (const el of allFields(root)) {
                const { canonicalField, confidence } = classify(el);
                const val = fieldValue(el);
                if (canonicalField && confidence >= 0.75 && val) {
                    collected[canonicalField] = val;
                }
            }
            if (Object.keys(collected).length === 0)
                return;
            const existingProfile = data.smartfill_profile || { fields: {} };
            const mergedFields = { ...existingProfile.fields, ...collected };
            const mergedProfile = {
                ...existingProfile,
                fields: mergedFields,
                updated_at: new Date().toISOString(),
            };
            chrome.storage.local.set({ smartfill_profile: mergedProfile });
        });
    }
    document.addEventListener("submit", (e) => {
        try {
            captureFrom(e.target);
        }
        catch (_) { }
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
        btn.textContent = "⚡";
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
            wrap.remove();
            el.dataset.smartfillFilled = "1";
        });
        wrap.appendChild(btn);
        document.body.appendChild(wrap);
        function position() {
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
        const ro = new ResizeObserver(position);
        try {
            ro.observe(el);
        }
        catch (_) { }
        window.addEventListener("scroll", position, true);
        window.addEventListener("resize", position);
        el.addEventListener("input", () => { if (fieldValue(el))
            wrap.remove(); }, { once: true });
    }
    function setNativeValue(el, value) {
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
            return;
        }
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
            : el.tagName === "SELECT" ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter)
            setter.call(el, value);
        else
            el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function scan() {
        chrome.storage.local.get(["smartfill_profile", "smartfill_settings", "enabled"], (data) => {
            const profileFields = data.smartfill_profile?.fields || {};
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
                const { canonicalField, confidence } = classify(el);
                if (!canonicalField || confidence < 0.50)
                    continue;
                const value = profileFields[canonicalField];
                if (!value)
                    continue;
                if (confidence >= 0.75) {
                    if (settings.autoFillEnabled) {
                        setNativeValue(el, value);
                        el.dataset.smartfill = "1";
                    }
                }
                else {
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
    chrome.runtime.onMessage.addListener((msg, _s, send) => {
        if (msg?.type === "SMARTFILL_FILL_NOW") {
            chrome.storage.local.get("smartfill_profile", (data) => {
                const profileFields = data.smartfill_profile?.fields || {};
                let filled = 0;
                for (const el of allFields()) {
                    if (fieldValue(el))
                        continue;
                    const { canonicalField } = classify(el);
                    if (!canonicalField)
                        continue;
                    const value = profileFields[canonicalField];
                    if (!value)
                        continue;
                    try {
                        setNativeValue(el, value);
                        filled++;
                    }
                    catch (_) { }
                }
                send({ filled });
            });
            return true;
        }
    });
})();
//# sourceMappingURL=autofill.js.map