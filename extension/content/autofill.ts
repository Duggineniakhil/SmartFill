// SmartFill content script — capture + autofill
(function () {
  const { classify, isForbidden } = window.__AUTOFLOW__;

  const INPUT_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select';

  function allFields(root = document) {
    return Array.from(root.querySelectorAll(INPUT_SEL)).filter(el => {
      if (el.disabled || el.readOnly) return false;
      if (el.type === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  // ---- Capture on submit ----
  function captureFrom(root) {
    const collected = {};
    for (const el of allFields(root)) {
      const key = classify(el);
      const val = (el.value || "").toString().trim();
      if (!key || !val) continue;
      collected[key] = val;
    }
    if (Object.keys(collected).length === 0) return;
    chrome.storage.local.get({ profile: {}, history: [] }, (data) => {
      const merged = { ...data.profile, ...collected };
      const history = [{ at: Date.now(), host: location.hostname, fields: Object.keys(collected) }, ...data.history].slice(0, 25);
      chrome.storage.local.set({ profile: merged, history });
    });
  }

  document.addEventListener("submit", (e) => {
    try { captureFrom(e.target || document); } catch (_) {}
  }, true);

  // ---- Autofill UI ----
  const BADGE_CLASS = "autoflow-badge";

  function makeBadge(el, key, value) {
    if (el.dataset.autoflow === "1") return;
    el.dataset.autoflow = "1";
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
      ev.preventDefault(); ev.stopPropagation();
      setNativeValue(el, value);
      wrap.remove();
      el.dataset.autoflowFilled = "1";
    });
    wrap.appendChild(btn);
    document.body.appendChild(wrap);

    function position() {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { wrap.style.display = "none"; return; }
      wrap.style.display = "block";
      wrap.style.top = window.scrollY + r.top + (r.height - 22) / 2 + "px";
      wrap.style.left = window.scrollX + r.right - 28 + "px";
    }
    position();
    const ro = new ResizeObserver(position);
    try { ro.observe(el); } catch (_) {}
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);

    // Hide badge once user types
    el.addEventListener("input", () => { if (el.value) wrap.remove(); }, { once: true });
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
                : el.tagName === "SELECT" ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function scan() {
    chrome.storage.local.get({ profile: {}, enabled: true, autoFill: false }, (data) => {
      if (!data.enabled) return;
      const fields = allFields();
      for (const el of fields) {
        if (el.value) continue;
        if (el.dataset.autoflow === "1") continue;
        const key = classify(el);
        if (!key) continue;
        const value = data.profile[key];
        if (!value) continue;
        if (data.autoFill) {
          setNativeValue(el, value);
        } else {
          makeBadge(el, key, value);
        }
      }
    });
  }

  // Initial + observe DOM changes
  let scanTimer;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 250);
  }
  scheduleScan();
  const obs = new MutationObserver(scheduleScan);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Manual trigger via popup
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg && msg.type === "AUTOFLOW_FILL_NOW") {
      chrome.storage.local.get({ profile: {} }, (data) => {
        let filled = 0;
        for (const el of allFields()) {
          if (el.value) continue;
          const key = classify(el);
          if (!key) continue;
          const value = data.profile[key];
          if (!value) continue;
          setNativeValue(el, value);
          filled++;
        }
        send({ filled });
      });
      return true;
    }
  });
})();