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
      { id: "q1", answer: "I build reliable backends at .", note: "" },
      { id: "q2", answer: "", note: "Salary isn't in your CV." },
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

  it("tells the model never to invent facts and to leave unknowns empty", () => {
    const { system } = ai.answersPrompt(CV, {}, {}, QUESTIONS);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/return an empty answer/);
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
