// SmartFill AI client: builds prompts, calls Gemini or Groq with the user's own
// API key, and parses the JSON they return. Runs in the background service
// worker (and in tests); pages never see the key.
"use strict";
(function () {
    const DEFAULT_MODELS = {
        gemini: "gemini-3.8-flash",
        groq: "openai/gpt-oss-120b",
    };
    // Earlier defaults the providers have since retired. Settings saved with
    // these quietly move to the current default instead of failing.
    const RETIRED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.0-flash", "llama-3.3-70b-versatile"]);
    const TIMEOUT_MS = 45000;
    const CV_LIMIT = 15000;
    const JOB_LIMIT = 10000;
    // Contact details aren't needed to answer questions or judge fit.
    const PROFILE_KEYS = [
        "full_name", "job_title", "company", "experience_years", "skills", "degree", "university",
        "graduation_year", "cgpa", "city", "state", "country", "notice_period", "current_ctc", "expected_ctc",
        "linkedin", "github", "portfolio",
    ];
    class AiError extends Error {
        code;
        constructor(code, message) { super(message); this.code = code; }
    }
    function activeConfig(s) {
        const provider = s?.provider === "groq" ? "groq" : "gemini";
        const key = (provider === "groq" ? s?.groqKey : s?.geminiKey)?.trim() || "";
        const saved = (provider === "groq" ? s?.groqModel : s?.geminiModel)?.trim() || "";
        const model = saved && !RETIRED_MODELS.has(saved) ? saved : DEFAULT_MODELS[provider];
        return { provider, key, model };
    }
    function clip(s, max) {
        const t = String(s || "").trim();
        return t.length > max ? `${t.slice(0, max)}\n[…truncated]` : t;
    }
    function profileBlock(fields = {}) {
        const lines = PROFILE_KEYS.filter((k) => fields[k]).map((k) => `${k.replace(/_/g, " ")}: ${fields[k]}`);
        return lines.length ? lines.join("\n") : "(none)";
    }
    function jobBlock(job) {
        const head = [job.title && `Role: ${job.title}`, job.company && `Company: ${job.company}`, job.location && `Location: ${job.location}`]
            .filter(Boolean).join("\n");
        return `${head || "Role: (unknown)"}\n\nJob description:\n${clip(job.text, JOB_LIMIT) || "(not available — rely on the role and company only)"}`;
    }
    // ─── Prompts ──────────────────────────────────────────────────────────────────
    function answersPrompt(cv, fields, job, questions) {
        const system = [
            "You help a job applicant fill in an application form. Write each answer in the first person, as the applicant.",
            "Use only facts from the applicant's CV and profile. Never invent employers, job titles, degrees, dates, numbers, links or skills.",
            "If the CV and profile don't contain what a question needs (for example salary, visa status, start date or a reference), return an empty answer and explain in \"note\".",
            "Short questions get a short, direct answer. Long questions get 80–180 words unless a limit is given; connect the applicant's real experience to this job.",
            "Never exceed a question's maxLength. Plain text only: no markdown, no bullet symbols, no placeholders like [Company].",
            "Questions of type \"single\" have options: set \"choice\" to exactly one option, copied character for character. Questions of type \"multi\": set \"choices\" to every option that is true for the applicant, copied exactly.",
            "Only pick an option the CV or profile supports. For work authorisation, sponsorship, relocation, notice period, salary or availability, pick an option only if the CV or profile states it; otherwise leave choice empty (or choices []) and explain in \"note\".",
            "For \"How did you hear about us?\"-style questions with no basis in the CV, leave the choice empty.",
            'Reply with JSON only, in this shape: {"answers":[{"id":"q1","answer":"…","note":""},{"id":"q2","choice":"Yes","note":""},{"id":"q3","choices":["Python","SQL"],"note":""}]}.',
        ].join("\n");
        const user = [
            `APPLICANT CV:\n${clip(cv, CV_LIMIT) || "(no CV provided)"}`,
            `APPLICANT PROFILE:\n${profileBlock(fields)}`,
            `JOB:\n${jobBlock(job)}`,
            `QUESTIONS (JSON):\n${JSON.stringify(questions.map((q) => (q.kind === "single" || q.kind === "multi"
                ? { id: q.id, question: q.label, type: q.kind, options: q.options || [] }
                : { id: q.id, question: q.label, type: q.kind, maxLength: q.maxLength || undefined })))}`,
        ].join("\n\n");
        return { system, user };
    }
    function matchPrompt(cv, fields, job) {
        const system = [
            "You judge how well a candidate fits a job, like a fair, experienced recruiter. Be honest and specific; don't inflate.",
            "Use only the CV, profile and job description. Count transferable experience when it genuinely applies.",
            "score is 0–100. verdict is \"strong\" (75+), \"partial\" (50–74) or \"weak\" (under 50).",
            "summary: one or two sentences. strengths and gaps: up to 4 short items each. tips: up to 3 short, concrete ways to position this application.",
            'Reply with JSON only: {"score":0,"verdict":"partial","summary":"","strengths":[],"gaps":[],"tips":[]}.',
        ].join("\n");
        const user = [
            `CANDIDATE CV:\n${clip(cv, CV_LIMIT) || "(no CV provided)"}`,
            `CANDIDATE PROFILE:\n${profileBlock(fields)}`,
            `JOB:\n${jobBlock(job)}`,
        ].join("\n\n");
        return { system, user };
    }
    // ─── Responses ────────────────────────────────────────────────────────────────
    function parseJson(text) {
        let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        const start = t.indexOf("{");
        const end = t.lastIndexOf("}");
        if (start >= 0 && end > start)
            t = t.slice(start, end + 1);
        try {
            return JSON.parse(t);
        }
        catch {
            throw new AiError("bad_response", "The AI replied in an unexpected format. Try again.");
        }
    }
    const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const list = (v, n = 4) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, n) : []);
    const normOption = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Map what the model said onto the real options. Exact (ignoring case and
    // punctuation) first; otherwise a single option containing it, or contained
    // in it. Anything else is dropped rather than guessed.
    function matchOption(said, options) {
        const want = normOption(said);
        if (!want)
            return null;
        const exact = options.find((o) => normOption(o) === want);
        if (exact)
            return exact;
        const loose = options.filter((o) => {
            const n = normOption(o);
            return n && (n.includes(want) || want.includes(n));
        });
        return loose.length === 1 ? loose[0] : null;
    }
    function readChoices(q, a) {
        const options = q.options || [];
        let said = [];
        if (Array.isArray(a.choices))
            said = a.choices.map((x) => str(x, 300));
        else if (typeof a.choice === "string")
            said = [a.choice];
        else if (typeof a.answer === "string")
            said = q.kind === "multi" ? a.answer.split(/[,;\n]/) : [a.answer];
        said = said.map((x) => x.trim()).filter(Boolean);
        const picked = [];
        let unknown = "";
        for (const x of said) {
            const opt = matchOption(x, options);
            if (opt && !picked.includes(opt))
                picked.push(opt);
            else if (!opt)
                unknown = x;
        }
        const choices = q.kind === "single" ? picked.slice(0, 1) : picked;
        let note = str(a.note, 300);
        if (!choices.length && unknown)
            note = `The AI suggested "${unknown.slice(0, 60)}", which isn't one of the options.`;
        return { choices, note };
    }
    function readAnswers(data, questions) {
        const raw = data?.answers;
        const byId = new Map();
        if (Array.isArray(raw)) {
            for (const a of raw) {
                const id = str(a?.id, 50);
                if (id)
                    byId.set(id, a);
            }
        }
        return questions.map((q) => {
            const a = byId.get(q.id);
            if (q.kind === "single" || q.kind === "multi") {
                if (!a)
                    return { id: q.id, answer: "", choices: [], note: "No answer returned." };
                const { choices, note } = readChoices(q, a);
                return { id: q.id, answer: "", choices, note: choices.length ? "" : note || "Not enough in your CV to choose." };
            }
            const got = a ? { answer: str(a.answer), note: str(a.note, 300) } : { answer: "", note: "No answer returned." };
            let answer = got.answer.replace(/\*\*|__|^#+\s*/gm, "").replace(/\[(company|role|your name|name)\]/gi, "").trim();
            if (q.maxLength && answer.length > q.maxLength)
                answer = answer.slice(0, q.maxLength).replace(/\s+\S*$/, "");
            return { id: q.id, answer, choices: [], note: got.note };
        });
    }
    function readMatch(data) {
        const d = (data || {});
        const n = Math.round(Number(d.score));
        if (!Number.isFinite(n))
            throw new AiError("bad_response", "The AI didn't return a score. Try again.");
        const score = Math.max(0, Math.min(100, n));
        const verdict = ["strong", "partial", "weak"].includes(d.verdict)
            ? d.verdict
            : score >= 75 ? "strong" : score >= 50 ? "partial" : "weak";
        return { score, verdict, summary: str(d.summary, 600), strengths: list(d.strengths), gaps: list(d.gaps), tips: list(d.tips, 3) };
    }
    // ─── Providers ────────────────────────────────────────────────────────────────
    async function errorFor(res, provider) {
        let detail = "";
        try {
            const body = await res.json();
            detail = str(body?.error?.message, 300);
        }
        catch { /* not JSON */ }
        const name = provider === "groq" ? "Groq" : "Gemini";
        if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
            return new AiError("bad_key", `${name} rejected the API key. Check it in AI settings.`);
        }
        if (res.status === 429)
            return new AiError("rate_limit", `${name} rate limit or quota reached. Wait a minute and try again.`);
        if (res.status === 404 || /model.*(not found|does not exist|decommissioned|not supported)/i.test(detail)) {
            return new AiError("bad_model", `${name} doesn't offer that model any more${detail ? ` (${detail})` : ""}. Change the model in AI settings, or clear it to use the default.`);
        }
        return new AiError("http", `${name} error ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    async function complete(settings, prompt, fetchImpl = fetch) {
        const { provider, key, model } = activeConfig(settings);
        if (!key)
            throw new AiError("no_key", "Add a Gemini or Groq API key in AI settings first.");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            let res;
            if (provider === "gemini") {
                res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: prompt.system }] },
                        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
                        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
                    }),
                    signal: controller.signal,
                });
                if (!res.ok)
                    throw await errorFor(res, provider);
                const body = await res.json();
                const parts = body?.candidates?.[0]?.content?.parts || [];
                const text = parts.map((p) => p.text || "").join("");
                if (!text) {
                    const reason = body?.promptFeedback?.blockReason || body?.candidates?.[0]?.finishReason;
                    throw new AiError("empty", `Gemini returned no text${reason ? ` (${reason})` : ""}.`);
                }
                return text;
            }
            res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    model,
                    temperature: 0.4,
                    response_format: { type: "json_object" },
                    messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
                }),
                signal: controller.signal,
            });
            if (!res.ok)
                throw await errorFor(res, provider);
            const body = await res.json();
            const text = body?.choices?.[0]?.message?.content || "";
            if (!text)
                throw new AiError("empty", "Groq returned no text.");
            return text;
        }
        catch (e) {
            if (e instanceof AiError)
                throw e;
            if (e?.name === "AbortError")
                throw new AiError("timeout", "The AI took too long to answer. Try again.");
            throw new AiError("network", "Couldn't reach the AI service. Check your connection.");
        }
        finally {
            clearTimeout(timer);
        }
    }
    async function run(req, fetchImpl = fetch) {
        const { provider, model } = activeConfig(req.settings);
        if (req.task === "test") {
            const text = await complete(req.settings, {
                system: "You are a connectivity check. Reply with JSON only.",
                user: 'Reply with exactly {"ok":true} as JSON.',
            }, fetchImpl);
            parseJson(text);
            return { provider, model };
        }
        if (!String(req.cv || "").trim() && !String(req.fields?.skills || "").trim()) {
            throw new AiError("no_cv", "Add your CV in the tracker's Your CV panel first.");
        }
        if (req.task === "answers") {
            const questions = (req.questions || []).slice(0, 25);
            if (!questions.length)
                return { answers: [], provider, model };
            const text = await complete(req.settings, answersPrompt(req.cv || "", req.fields || {}, req.job || {}, questions), fetchImpl);
            return { answers: readAnswers(parseJson(text), questions), provider, model };
        }
        const text = await complete(req.settings, matchPrompt(req.cv || "", req.fields || {}, req.job || {}), fetchImpl);
        return { match: { ...readMatch(parseJson(text)), provider, model, at: new Date().toISOString() }, provider, model };
    }
    const api = { run, complete, answersPrompt, matchPrompt, parseJson, readAnswers, readMatch, matchOption, activeConfig, DEFAULT_MODELS };
    globalThis.SmartFillAI = api;
})();
