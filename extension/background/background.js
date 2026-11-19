// SmartFill background service worker.
// - Writes default settings on install.
// - Runs AI requests (drafting answers, match analysis) with the user's own
//   Gemini or Groq key, so pages and content scripts never handle the key.
importScripts("ai.js");
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get({
        enabled: true,
        autoFill: true,
        profile: {},
        smartfill_profile: { fields: {} },
        smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true },
    }, (data) => {
        chrome.storage.local.set({
            enabled: data.enabled,
            autoFill: data.autoFill,
            profile: data.profile || {},
            smartfill_profile: data.smartfill_profile || { fields: {} },
            smartfill_settings: data.smartfill_settings || { autoFillEnabled: true, autoSaveEnabled: true },
        });
    });
});
// { type: "SMARTFILL_AI", task: "answers" | "match" | "test", ... }
// The CV, profile and AI settings are read here, not sent by the caller.
chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg || msg.type !== "SMARTFILL_AI")
        return;
    // Only this extension's own pages and content scripts may ask.
    if (sender && sender.id && sender.id !== chrome.runtime.id)
        return;
    chrome.storage.local.get(["smartfill_ai", "smartfill_resume", "smartfill_profile", "enabled"], async (d) => {
        try {
            if (d.enabled === false && msg.task !== "test")
                throw Object.assign(new Error("SmartFill is turned off."), { code: "disabled" });
            const settings = msg.task === "test" && msg.settings ? msg.settings : d.smartfill_ai;
            const result = await self.SmartFillAI.run({
                task: msg.task,
                settings,
                cv: (d.smartfill_resume && d.smartfill_resume.text) || "",
                fields: (d.smartfill_profile && d.smartfill_profile.fields) || {},
                job: msg.job || {},
                questions: msg.questions || [],
            });
            send({ ok: true, ...result });
        }
        catch (e) {
            send({ ok: false, code: e.code || "error", error: e.message || String(e) });
        }
    });
    return true;
});
