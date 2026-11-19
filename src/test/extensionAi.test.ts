import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AiApi = {
  run: (req: Record<string, unknown>, fetchImpl?: typeof fetch) => Promise<Record<string, unknown>>;
  answersPrompt: (cv: string, fields: Record<string, string>, job: Record<string, string>, q: unknown[]) => { system: string; user: string };
  readMatch: (data: unknown) => Record<string, unknown>;
};
let ai: AiApi;

beforeAll(() => {
  window.eval(readFileSync(resolve("extension/background/ai.js"), "utf8"));
  ai = (globalThis as unknown as { SmartFillAI: AiApi }).SmartFillAI;
});

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const CV = "Alex Morgan. 4 years of experience with Python and Django at Northwind Labs.";
const QUESTIONS = [
  { id: "q1", label: "Why do you want to work at Acme?", kind: "long" },
  { id: "q2", label: "What is your expected salary?", kind: "short", maxLength: 40 },
];

describe("AI client", () => {
  it("calls Gemini with the key in a header and JSON output, and reads the answers", async () => {
    const fetchImpl = vi.fn(async () => json({
      candidates: [{ content: { parts: [{ text: '```json\n{"answers":[{"id":"q1","answer":"**I** build reliable backends at [Company]."},{"id":"q2","answer":"","note":"Salary isn\'t in your CV."}]}\n```' }] } }],
    }));
    const out = await ai.run({
      task: "answers", settings: { provider: "gemini", geminiKey: "g-key" }, cv: CV,
      fields: { full_name: "Alex Morgan", email: "alex@example.com", phone: "+91 98" },
      job: { title: "Backend Engineer", company: "Acme", text: "Python, PostgreSQL" }, questions: QUESTIONS,
    }, fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    expect(url).not.toContain("g-key");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    // Contact details are never sent.
    expect(init.body).not.toContain("alex@example.com");
    expect(init.body).not.toContain("+91 98");
    expect(init.body).toContain("Alex Morgan");

    expect(out.answers).toEqual([
      { id: "q1", answer: "I build reliable backends at .", choices: [], note: "" },
      { id: "q2", answer: "", choices: [], note: "Salary isn't in your CV." },
    ]);
  });

  it("calls Groq with a bearer token, JSON mode and the chosen model", async () => {
    const fetchImpl = vi.fn(async () => json({ choices: [{ message: { content: '{"score":140,"summary":"Good fit.","strengths":["Python"],"gaps":[],"tips":[]}' } }] }));
    const out = await ai.run({
      task: "match", settings: { provider: "groq", groqKey: "gsk", groqModel: "llama-3.1-8b-instant" }, cv: CV, job: { text: "Python" },
    }, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama-3.1-8b-instant");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(out.match).toMatchObject({ score: 100, verdict: "strong", summary: "Good fit.", strengths: ["Python"], provider: "groq" });
  });

  it("explains bad keys, rate limits and missing setup in plain words", async () => {
    const base = { task: "match", cv: CV, job: {} };
    await expect(ai.run({ ...base, settings: { provider: "gemini" } })).rejects.toMatchObject({ code: "no_key" });
    await expect(ai.run({ ...base, settings: { geminiKey: "x" } }, (async () => json({ error: { message: "API key not valid" } }, 400)) as unknown as typeof fetch))
      .rejects.toMatchObject({ code: "bad_key" });
    await expect(ai.run({ ...base, settings: { provider: "groq", groqKey: "x" } }, (async () => json({}, 429)) as unknown as typeof fetch))
      .rejects.toMatchObject({ code: "rate_limit", message: expect.stringMatching(/Groq rate limit/) });
    await expect(ai.run({ task: "match", cv: "", settings: { geminiKey: "x" } }, vi.fn() as unknown as typeof fetch))
      .rejects.toMatchObject({ code: "no_cv" });
  });

  it("keeps only answers that are real options, and sends the options to the model", async () => {
    const questions = [
      { id: "q1", label: "Are you willing to relocate?", kind: "single", options: ["Yes", "No"] },
      { id: "q2", label: "Which languages have you used?", kind: "multi", options: ["Python", "Go", "C++", "SQL"] },
      { id: "q3", label: "How did you hear about us?", kind: "single", options: ["LinkedIn", "Referral", "Other"] },
      { id: "q4", label: "Highest education", kind: "single", options: ["High school", "Bachelor's degree", "Master's degree"] },
    ];
    const fetchImpl = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answers: [
      { id: "q1", choice: "yes" },
      { id: "q2", choices: ["python", "SQL", "Rust"] },
      { id: "q3", choice: "A friend told me" },
      { id: "q4", choice: "Bachelor" },
    ] }) }] } }] }));
    const out = await ai.run({ task: "answers", settings: { geminiKey: "k" }, cv: CV, questions }, fetchImpl as unknown as typeof fetch);
    const sentBody = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    expect(sentBody).toContain('\\"options\\":[\\"Python\\",\\"Go\\",\\"C++\\",\\"SQL\\"]');
    expect((out.answers as Array<{ choices: string[]; note: string }>).map((a) => a.choices)).toEqual([
      ["Yes"], ["Python", "SQL"], [], ["Bachelor's degree"],
    ]);
    expect((out.answers as Array<{ note: string }>)[2].note).toMatch(/isn't one of the options/);
  });

  it("tells the model never to invent facts and to leave unknowns empty", () => {
    const { system } = ai.answersPrompt(CV, {}, {}, QUESTIONS);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/return an empty answer/);
  });
});

describe("AI drafting: dropdowns and multiple choice", () => {
  let sent: Array<Record<string, unknown>>;
  let answerFor: (q: { id: string; label: string; options?: string[] }) => Record<string, unknown>;

  beforeEach(() => {
    sent = [];
    answerFor = (q) => {
      if (/relocate/i.test(q.label)) return { choice: "Yes" };
      if (/languages/i.test(q.label)) return { choices: ["Python", "SQL"] };
      if (/hear about/i.test(q.label)) return { choice: "", note: "Not in your CV." };
      if (/experience level/i.test(q.label)) return { choice: "Mid-level (3-5 years)" };
      if (/remote/i.test(q.label)) return { choice: "Hybrid" };
      if (/country/i.test(q.label)) return { choice: "India" };
      return { choice: q.options?.[0] || "" };
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    document.body.innerHTML = `
      <form>
        <div><label for="exp">What is your experience level?</label>
          <select id="exp"><option value="">Select…</option><option value="j">Junior (0-2 years)</option>
          <option value="m">Mid-level (3-5 years)</option><option value="s">Senior (6+ years)</option></select></div>
        <div><label for="country">Country</label>
          <select id="country"><option value="">Select…</option><option>India</option><option>Germany</option></select></div>
        <div><label for="gender">Gender</label>
          <select id="gender"><option value="">Select…</option><option>Female</option><option>Male</option></select></div>
        <div><label for="race">Race / Ethnicity</label>
          <select id="race"><option value="">Select…</option><option>Asian</option><option>Other</option></select></div>
        <fieldset><legend>Are you willing to relocate?</legend>
          <label><input type="radio" name="reloc" value="1"> Yes</label>
          <label><input type="radio" name="reloc" value="0"> No</label></fieldset>
        <div class="field"><label>Which languages have you used professionally?</label>
          <label><input type="checkbox" name="langs[]" value="py"> Python</label>
          <label><input type="checkbox" name="langs[]" value="go"> Go</label>
          <label><input type="checkbox" name="langs[]" value="sql"> SQL</label></div>
        <div class="field"><label>How did you hear about us?</label>
          <label><input type="radio" name="src" value="li"> LinkedIn</label>
          <label><input type="radio" name="src" value="ref"> Referral</label></div>
        <div class="field"><label>Veteran status</label>
          <label><input type="radio" name="vet" value="y"> I am a veteran</label>
          <label><input type="radio" name="vet" value="n"> I am not a veteran</label></div>
        <label><input type="checkbox" name="consent"> I agree to the privacy policy</label>
        <div role="listitem"><div role="heading">Do you prefer remote work?</div>
          <div role="radiogroup">
            <div role="radio" aria-checked="false" data-value="Remote" aria-label="Remote"></div>
            <div role="radio" aria-checked="false" data-value="Hybrid" aria-label="Hybrid"></div>
          </div></div>
      </form>`;
    // Google Forms-style radios toggle aria-checked when clicked.
    for (const r of Array.from(document.querySelectorAll('[role="radio"]'))) {
      r.addEventListener("click", () => {
        r.parentElement!.querySelectorAll('[role="radio"]').forEach((x) => x.setAttribute("aria-checked", "false"));
        r.setAttribute("aria-checked", "true");
      });
    }
    Object.assign(window, {
      __SMARTFILL__: undefined,
      ResizeObserver: class { observe() {} disconnect() {} },
      chrome: {
        storage: {
          local: {
            get: (_k: unknown, cb: (d: unknown) => void) => cb({ smartfill_profile: { fields: {} }, smartfill_resume: { text: CV } }),
            set: vi.fn(),
          },
          onChanged: { addListener: () => {} },
        },
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: (msg: { questions: Array<{ id: string; label: string; options?: string[] }> }, cb: (r: unknown) => void) => {
            sent.push(msg as unknown as Record<string, unknown>);
            cb({ ok: true, answers: msg.questions.map((q) => {
              const a = answerFor(q);
              const choices = a.choices || (a.choice ? [a.choice] : []);
              return { id: q.id, answer: "", choices, note: a.note || "" };
            }) });
          },
        },
      },
    });
    for (const f of ["detectFields", "autofill", "matchScore", "tracker", "aiDraft"]) {
      window.eval(readFileSync(resolve(`extension/content/${f}.js`), "utf8"));
    }
  });
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

  it("asks about dropdowns and choice groups, but never demographics or consent", () => {
    const qs = window.__SMARTFILL__.ai!.questions();
    expect(qs.map((q) => [q.label, q.kind, q.options])).toEqual([
      ["What is your experience level?", "single", ["Junior (0-2 years)", "Mid-level (3-5 years)", "Senior (6+ years)"]],
      ["Country", "single", ["India", "Germany"]],
      ["Are you willing to relocate?", "single", ["Yes", "No"]],
      ["Which languages have you used professionally?", "multi", ["Python", "Go", "SQL"]],
      ["How did you hear about us?", "single", ["LinkedIn", "Referral"]],
      ["Do you prefer remote work?", "single", ["Remote", "Hybrid"]],
    ]);
  });

  it("selects, ticks and clicks the AI's choices and outlines them for review", async () => {
    const out = await window.__SMARTFILL__.ai!.draftAll("Job text");
    expect((document.getElementById("exp") as HTMLSelectElement).value).toBe("m");
    expect((document.querySelector('input[name="reloc"][value="1"]') as HTMLInputElement).checked).toBe(true);
    expect(Array.from(document.querySelectorAll('input[name="langs[]"]:checked'), (i) => (i as HTMLInputElement).value)).toEqual(["py", "sql"]);
    expect(document.querySelector('[data-value="Hybrid"]')!.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("fieldset")!.getAttribute("data-smartfill-status")).toBe("review");
    expect((document.getElementById("exp") as HTMLElement).dataset.smartfillStatus).toBe("review");
    // Left alone: no basis in the CV, demographics, consent.
    expect(document.querySelectorAll('input[name="src"]:checked')).toHaveLength(0);
    expect(document.querySelectorAll('input[name="vet"]:checked')).toHaveLength(0);
    expect((document.querySelector('input[name="consent"]') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("gender") as HTMLSelectElement).value).toBe("");
    expect((document.getElementById("country") as HTMLSelectElement).value).toBe("India");
    expect(out).toEqual({ total: 6, drafted: 5, skipped: [{ label: "How did you hear about us?", note: "Not in your CV." }] });
  });

  it("doesn't touch a group the user already answered", () => {
    (document.querySelector('input[name="reloc"][value="0"]') as HTMLInputElement).checked = true;
    expect(window.__SMARTFILL__.ai!.questions().map((q) => q.label)).not.toContain("Are you willing to relocate?");
  });
});

describe("AI drafting: custom dropdowns (Workday, React Select)", () => {
  let asked: Array<{ label: string; options?: string[] }>;

  // Workday-style: a button that opens a listbox appended to <body>.
  function workday(id: string, label: string) {
    const btn = document.getElementById(id) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const open = document.querySelector(`[data-for="${id}"]`);
      if (open) { open.remove(); return; }
      const list = document.createElement("ul");
      list.setAttribute("role", "listbox");
      list.dataset.for = id;
      for (const text of ["Yes", "No"]) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.innerHTML = `<div data-automation-label="${text}">${text}</div>`;
        li.addEventListener("click", () => { btn.textContent = text; list.remove(); });
        list.append(li);
      }
      document.body.append(list);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelector(`[data-for="${id}"]`)?.remove();
    });
    void label;
  }

  // React Select-style: an input[role=combobox] that opens on ArrowDown.
  function reactSelect(id: string, options: string[]) {
    const input = document.getElementById(id) as HTMLInputElement;
    const box = input.closest(".rs-container") as HTMLElement;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { box.querySelector('[role="listbox"]')?.remove(); return; }
      if (e.key !== "ArrowDown" || box.querySelector('[role="listbox"]')) return;
      const menu = document.createElement("div");
      menu.className = "select__menu";
      menu.setAttribute("role", "listbox");
      menu.id = `${id}-listbox`;
      input.setAttribute("aria-controls", menu.id);
      if (!options.length) menu.innerHTML = `<div class="select__menu-notice">No options</div>`;
      for (const text of options) {
        const o = document.createElement("div");
        o.setAttribute("role", "option");
        o.className = "select__option";
        o.textContent = text;
        o.addEventListener("click", () => {
          box.querySelector(".select__placeholder")!.outerHTML = `<div class="select__single-value">${text}</div>`;
          menu.remove();
        });
        menu.append(o);
      }
      box.append(menu);
    });
  }

  beforeEach(() => {
    asked = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    document.body.innerHTML = `
      <header><button aria-haspopup="listbox" aria-label="Language">English</button></header>
      <form>
        <div><label for="auth">Are you legally authorized to work in Germany?</label>
          <button id="auth" type="button" aria-haspopup="listbox" aria-label="Are you legally authorized to work in Germany? Select One Required">Select One</button></div>
        <div><label for="wdgender">Please select your gender</label>
          <button id="wdgender" type="button" aria-haspopup="listbox">Select One</button></div>
        <label id="lvl-label">What is your experience level?</label>
        <div class="rs-container"><div class="select__control">
          <div class="select__placeholder">Select...</div>
          <input id="lvl" role="combobox" aria-haspopup="true" aria-expanded="false" aria-labelledby="lvl-label">
        </div></div>
        <label id="school-label">Which school did you attend?</label>
        <div class="rs-container"><div class="select__control">
          <div class="select__placeholder">Start typing...</div>
          <input id="school" role="combobox" aria-haspopup="true" aria-labelledby="school-label">
        </div></div>
      </form>`;
    workday("auth", "auth");
    reactSelect("lvl", ["Junior", "Mid-level", "Senior"]);
    reactSelect("school", []);
    Object.assign(window, {
      __SMARTFILL__: undefined,
      ResizeObserver: class { observe() {} disconnect() {} },
      chrome: {
        storage: {
          local: {
            get: (_k: unknown, cb: (d: unknown) => void) => cb({ smartfill_profile: { fields: {} }, smartfill_resume: { text: CV } }),
            set: vi.fn(),
          },
          onChanged: { addListener: () => {} },
        },
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: (msg: { questions: Array<{ id: string; label: string; options?: string[] }> }, cb: (r: unknown) => void) => {
            asked.push(...msg.questions);
            cb({ ok: true, answers: msg.questions.map((q) => ({
              id: q.id, answer: "", note: "",
              choices: /authorized/.test(q.label) ? ["Yes"] : /experience level/.test(q.label) ? ["Mid-level"] : [],
            })) });
          },
        },
      },
    });
    for (const f of ["detectFields", "autofill", "matchScore", "tracker", "aiDraft"]) {
      window.eval(readFileSync(resolve(`extension/content/${f}.js`), "utf8"));
    }
  });
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

  it("finds custom dropdowns without opening them, and skips demographics and page controls", () => {
    expect(window.__SMARTFILL__.ai!.questions().map((q) => q.label)).toEqual([
      "Are you legally authorized to work in Germany?",
      "What is your experience level?",
      "Which school did you attend?",
    ]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("reads each menu's options, picks the AI's answer and closes the menu", async () => {
    const out = await window.__SMARTFILL__.ai!.draftAll("Job text");
    expect(asked.map((q) => [q.label, q.options])).toEqual([
      ["Are you legally authorized to work in Germany?", ["Yes", "No"]],
      ["What is your experience level?", ["Junior", "Mid-level", "Senior"]],
    ]);
    expect(document.getElementById("auth")!.textContent).toBe("Yes");
    expect(document.querySelector(".select__single-value")!.textContent).toBe("Mid-level");
    expect(document.getElementById("auth")!.dataset.smartfillStatus).toBe("review");
    expect((document.querySelector(".select__control") as HTMLElement).dataset.smartfillStatus).toBe("review");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.getElementById("wdgender")!.textContent).toBe("Select One");
    expect(out).toEqual({
      total: 3, drafted: 2,
      skipped: [{ label: "Which school did you attend?", note: "This dropdown only shows options as you type, so it was left for you." }],
    });
  });
});

describe("AI drafting on a form", () => {
  let sent: Array<Record<string, unknown>>;
  let reply: Record<string, unknown>;

  beforeEach(() => {
    sent = [];
    reply = { ok: true, answers: [
      { id: "q1", answer: "I want to build robots that ship real products.", note: "" },
      { id: "q2", answer: "", note: "Not in your CV." },
    ] };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 60, top: 0, right: 300, bottom: 60, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    document.body.innerHTML = `
      <form>
        <div><label for="email">Email</label><input id="email"></div>
        <div><label for="middle">Middle name</label><input id="middle"></div>
        <div><label for="why">Why do you want to work at Acme Robotics?</label><textarea id="why"></textarea></div>
        <div><label for="visa">Will you need visa sponsorship?</label><input id="visa"></div>
        <div><label for="done">Describe a project you're proud of</label><textarea id="done">Already written</textarea></div>
      </form>`;
    Object.assign(window, {
      __SMARTFILL__: undefined,
      ResizeObserver: class { observe() {} disconnect() {} },
      chrome: {
        storage: {
          local: {
            get: (_k: unknown, cb: (d: unknown) => void) => cb({
              smartfill_profile: { fields: {} },
              smartfill_ai: { provider: "gemini", geminiKey: "k" },
              smartfill_resume: { text: CV },
            }),
            set: vi.fn(),
          },
          onChanged: { addListener: () => {} },
        },
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: (msg: Record<string, unknown>, cb: (r: unknown) => void) => { sent.push(msg); cb(reply); },
        },
      },
    });
    for (const f of ["detectFields", "autofill", "matchScore", "tracker", "aiDraft"]) {
      window.eval(readFileSync(resolve(`extension/content/${f}.js`), "utf8"));
    }
  });
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

  it("only treats empty free-text questions as questions", () => {
    expect(window.__SMARTFILL__.ai!.questions().map((q) => q.label)).toEqual([
      "Why do you want to work at Acme Robotics?",
      "Will you need visa sponsorship?",
    ]);
  });

  it("fills drafted answers outlined for review and reports what it skipped", async () => {
    const out = await window.__SMARTFILL__.ai!.draftAll("Job text");
    expect(sent[0]).toMatchObject({ type: "SMARTFILL_AI", task: "answers", job: { text: "Job text" } });
    const why = document.getElementById("why") as HTMLTextAreaElement;
    expect(why.value).toBe("I want to build robots that ship real products.");
    expect(why.dataset.smartfillStatus).toBe("review");
    expect(why.title).toMatch(/Drafted by AI/);
    expect((document.getElementById("visa") as HTMLInputElement).value).toBe("");
    expect(out).toEqual({ total: 2, drafted: 1, skipped: [{ label: "Will you need visa sponsorship?", note: "Not in your CV." }] });
  });

  it("passes on the AI error instead of filling anything", async () => {
    reply = { ok: false, code: "bad_key", error: "Gemini rejected the API key." };
    const out = await window.__SMARTFILL__.ai!.draftAll();
    expect(out.error).toBe("Gemini rejected the API key.");
    expect((document.getElementById("why") as HTMLTextAreaElement).value).toBe("");
  });

  it("offers a Draft button on long questions once AI and a CV are set up", async () => {
    await new Promise((r) => setTimeout(r, 700));
    const buttons = Array.from(document.querySelectorAll(".smartfill-ai-draft"));
    expect(buttons).toHaveLength(1);
    (buttons[0] as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect((document.getElementById("why") as HTMLTextAreaElement).value).toMatch(/robots/);
    expect(document.querySelector(".smartfill-ai-draft")).toBeNull();
  });
});
