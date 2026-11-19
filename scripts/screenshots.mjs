// Regenerates the README screenshots in docs/screenshots/ from the real
// extension: loads extension/ unpacked into Edge (or SMARTFILL_BROWSER), seeds
// a fictional profile, and captures the form colours, popup and tracker.
//
//   npm run screenshots
//
// All people, companies and jobs here are made up.
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve("extension");
const OUT = resolve("docs/screenshots");
const ORIGIN = "http://smartfill.test";
const browserChoice = process.env.SMARTFILL_BROWSER || "msedge";
mkdirSync(OUT, { recursive: true });

const PROFILE = {
  fields: {
    full_name: "Alex Morgan",
    email: "alex.morgan@example.com",
    linkedin: "linkedin.com/in/alex-morgan-dev",
    city: "Pune",
    skills: "Python, Django, PostgreSQL, AWS, React, TypeScript",
  },
  custom: {
    "why do you want to work at acme": {
      label: "Why do you want to work at Acme?",
      value: "I want to build reliable backend systems for robots that ship real products.",
      updated_at: "2026-11-01T10:00:00.000Z",
    },
  },
};

const RESUME = `Alex Morgan — Backend Engineer
B.Tech in Computer Science, Pune Institute of Technology, 2017 – 2021

Software Engineer, Northwind Labs — Jul 2021 – Present
- Built Python and Django services on AWS backed by PostgreSQL and Redis
- Shipped a React + TypeScript admin dashboard used by 40 support agents
- Set up Docker-based CI/CD with GitHub Actions

Skills: Python, Django, FastAPI, PostgreSQL, Redis, AWS, Docker, React, TypeScript, Git`;

const JD = {
  acme: `About the role
Acme Robotics builds the fleet software that keeps thousands of warehouse robots moving.
Requirements
- 3+ years of experience building backend services
- Python and PostgreSQL
- AWS and Docker
- Bachelor's degree in Computer Science or equivalent
Nice to have
- Kubernetes
- Kafka`,
  globex: `Requirements
- 2+ years of experience with React and TypeScript
- Next.js and GraphQL
- Strong CSS skills
Nice to have
- Figma`,
  initech: `Requirements
- 5+ years of experience with Java and Spring Boot
- Kubernetes and Kafka in production
- Go is a plus`,
  contoso: `Requirements
- SQL and Python for analysis
- Tableau or Power BI
- 1+ years of experience in data analytics`,
  fabrikam: `Requirements
- 4+ years of experience with Python and Django
- AWS, Docker, PostgreSQL
Nice to have
- Terraform`,
  northwind: `Requirements
- Python, FastAPI, Redis
- 3+ years of experience`,
};

const FORM = `<!doctype html><html><head><title>Backend Engineer — Acme Robotics</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; background: #f6f7f9; color: #111; margin: 0; padding: 28px; }
  .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 10px; padding: 24px 28px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #666; margin: 0 0 18px; font-size: 13px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #ccd; border-radius: 6px; font: inherit; }
  textarea { min-height: 64px; }
  button { margin-top: 18px; background: #111; color: #fff; border: 0; padding: 10px 18px; border-radius: 6px; font-weight: 600; }
</style></head><body><div class="card">
  <h1>Backend Engineer</h1><p class="sub">Acme Robotics · Berlin, DE · Apply</p>
  <form>
    <div><label for="name">Full name *</label><input id="name"></div>
    <div><label for="email">Email *</label><input id="email" type="email"></div>
    <div><label for="phone">Phone number *</label><input id="phone" type="tel"></div>
    <div><label for="li">LinkedIn profile</label><input id="li"></div>
    <div><label for="notice">Notice period *</label><input id="notice" required></div>
    <div><label for="why">Why do you want to work at Acme Robotics?</label><textarea id="why"></textarea></div>
    <div><label for="proud">Tell us about a project you're proud of.</label><textarea id="proud"></textarea></div>
    <button type="button">Submit application</button>
  </form>
</div></body></html>`;

const userDataDir = mkdtempSync(join(tmpdir(), "smartfill-shots-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  ...(browserChoice === "chromium" ? {} : { channel: browserChoice }),
  headless: false,
  deviceScaleFactor: 2,
  colorScheme: "dark",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--headless=new"],
});

try {
  await context.route(`${ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FORM }));
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  // Let the install handler write its defaults first, or it overwrites the seed.
  await sw.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  await sw.evaluate(({ profile, resume }) => chrome.storage.local.set({
    smartfill_profile: profile,
    smartfill_settings: { autoFillEnabled: true, autoSaveEnabled: true },
    smartfill_resume: { text: resume, updated_at: new Date().toISOString() },
    // A placeholder key: screenshots never call the AI.
    smartfill_ai: { provider: "gemini", geminiKey: "demo-key-not-real" },
  }), { profile: PROFILE, resume: RESUME });

  // 1. Field colours on an application form.
  const form = await context.newPage();
  await form.setViewportSize({ width: 640, height: 860 });
  await form.goto(`${ORIGIN}/careers/backend-engineer/apply`);
  await form.waitForSelector('[data-smartfill-status="missing"]');
  await form.waitForSelector(".smartfill-ai-draft");
  await form.waitForTimeout(400);
  await form.screenshot({ path: join(OUT, "form-colours.png") });
  console.log("wrote form-colours.png");

  // 2. Tracker board, scored against the CV.
  const board = await context.newPage();
  await board.setViewportSize({ width: 1360, height: 820 });
  await board.goto(`chrome-extension://${extId}/tracker/tracker.html`);
  await board.evaluate(({ jd, resume }) => {
    const day = 864e5;
    const at = (n) => new Date(Date.now() - n * day).toISOString();
    const req = (k) => window.__SMARTFILL__.match.extractRequirements(jd[k]);
    const app = (id, company, title, location, platform, status, days, extra = {}) => ({
      id, url: `https://jobs.example.com/${id}`, company, title, location, platform, status,
      createdAt: at(days), updatedAt: at(days), appliedAt: status === "interested" ? undefined : at(days),
      history: [{ status, at: at(days) }], notes: "", requirements: jd[id] ? req(id) : undefined, ...extra,
    });
    const apps = [
      app("fabrikam", "Fabrikam", "Senior Backend Engineer", "Remote", "Greenhouse", "interested", 0),
      app("globex", "Globex", "Frontend Engineer", "Amsterdam", "Ashby", "interested", 1),
      app("acme", "Acme Robotics", "Backend Engineer", "Berlin, DE", "Company site", "applied", 2),
      app("initech", "Initech", "Platform Engineer", "London", "Lever", "applied", 17),
      app("northwind", "Northwind Labs", "Python Developer", "Pune", "LinkedIn", "interview", 6,
        { notes: "Tech screen Thursday 3pm with the platform team" }),
      app("contoso", "Contoso", "Data Analyst", "Remote", "Workday", "offer", 12),
      app("umbrella", "Tailspin Toys", "Full-stack Engineer", "Bangalore", "Lever", "rejected", 21),
    ];
    const aiMatch = (score, verdict, summary, strengths, gaps) => ({
      score, verdict, summary, strengths, gaps, tips: [], provider: "gemini", model: "gemini-2.5-flash", at: at(0),
    });
    return new Promise((done) => chrome.storage.local.set({
      smartfill_applications: Object.fromEntries(apps.map((a) => [a.id, a])),
      smartfill_resume: { text: resume, updated_at: new Date().toISOString() },
      smartfill_ai_matches: {
        acme: aiMatch(84, "strong", "Strong backend fit: Python, PostgreSQL and AWS in production.", ["Python and Django services on AWS"], ["No Kubernetes"]),
        globex: aiMatch(58, "partial", "Solid React and TypeScript, but no Next.js or GraphQL yet.", ["React + TypeScript dashboard"], ["Next.js", "GraphQL"]),
      },
    }, done));
  }, { jd: JD, resume: RESUME });
  await board.reload();
  await board.waitForSelector(".card .score");
  const boardBottom = await board.evaluate(() => document.getElementById("board").getBoundingClientRect().bottom + 20);
  await board.screenshot({ path: join(OUT, "tracker-board.png"), clip: { x: 0, y: 0, width: 1360, height: Math.ceil(boardBottom) } });
  console.log("wrote tracker-board.png");

  // 3. AI settings and CV panels.
  await board.click("#aiToggle");
  await board.waitForTimeout(200);
  const aiPanel = await board.locator("#aiPanel").boundingBox();
  await board.screenshot({ path: join(OUT, "ai-settings.png"), clip: { x: 0, y: aiPanel.y - 16, width: 1360, height: aiPanel.height + 32 } });
  console.log("wrote ai-settings.png");
  await board.click("#aiClose");

  await board.click("#cvToggle");
  await board.waitForTimeout(200);
  const panel = await board.locator("#cvPanel").boundingBox();
  await board.screenshot({ path: join(OUT, "cv-panel.png"), clip: { x: 0, y: panel.y - 16, width: 1360, height: panel.height + 32 } });
  console.log("wrote cv-panel.png");

  // 4. Popup on the Acme job page. A popup opened as a tab can't see another
  // tab, so render the job card with the same functions the popup uses.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 340, height: 1300 });
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForTimeout(400);
  await popup.evaluate((jd) => new Promise((done) => {
    const requirements = window.__SMARTFILL__.match.extractRequirements(jd);
    chrome.storage.local.get(null, (d) => {
      renderJob({
        job: { key: "acme", url: "", title: "Backend Engineer", company: "Acme Robotics", location: "Berlin, DE", platform: "Company site" },
        application: null, requirements,
      });
      renderMatch(requirements, d);
      document.getElementById("aiSection").hidden = false;
      for (const id of ["aiDraft", "aiMatch"]) document.getElementById(id).hidden = false;
      document.getElementById("aiDraft").textContent = "✦ Draft 2 answers";
      renderAiMatch({
        score: 84, verdict: "strong", provider: "gemini", model: "gemini-2.5-flash", at: new Date().toISOString(),
        summary: "Strong backend fit: you've run Python and PostgreSQL services on AWS for over 5 years.",
        strengths: ["Python/Django on AWS", "PostgreSQL in production"],
        gaps: ["No Kubernetes or Kafka"],
        tips: ["Lead with the CI/CD and Docker work"],
      });
      done();
    });
  }), JD.acme);
  await popup.waitForTimeout(200);
  const height = await popup.evaluate(() => document.querySelector(".legend").getBoundingClientRect().bottom + 14);
  await popup.screenshot({ path: join(OUT, "popup.png"), clip: { x: 0, y: 0, width: 340, height: Math.ceil(height) } });
  console.log("wrote popup.png");
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
