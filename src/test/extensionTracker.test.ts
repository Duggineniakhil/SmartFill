import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Tracker = NonNullable<Window["__SMARTFILL__"]["tracker"]>;

let store: Record<string, unknown>;
const set = vi.fn((items: Record<string, unknown>, cb?: () => void) => { Object.assign(store, items); cb?.(); });

function loadTracker(): Tracker {
  Object.assign(window, {
    __SMARTFILL__: undefined,
    chrome: {
      storage: {
        local: {
          get: (_keys: unknown, cb: (d: unknown) => void) => cb({ ...store }),
          set,
        },
      },
    },
  });
  window.eval(readFileSync(resolve("extension/content/matchScore.js"), "utf8"));
  window.eval(readFileSync(resolve("extension/content/tracker.js"), "utf8"));
  return window.__SMARTFILL__.tracker!;
}

const JOB_LD = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Backend Engineer",
  hiringOrganization: { "@type": "Organization", name: "Acme Robotics" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Berlin", addressCountry: "DE" } },
})}</script>`;

const page = (html: string) => new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, "text/html");

describe("tracker: job identity", () => {
  let t: Tracker;
  beforeEach(() => { store = {}; t = loadTracker(); });

  it("gives the posting, the apply step and an embed the same key", () => {
    expect(t.jobKey("https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x"))
      .toBe(t.jobKey("https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345"));
    expect(t.jobKey("https://acme.com/careers/role?gh_jid=4012345")).toBe("greenhouse:4012345");
    expect(t.jobKey("https://jobs.lever.co/acme/0b2d6f4c-1d2e-4f3a-9b8c-7d6e5f4a3b2c/apply"))
      .toBe(t.jobKey("https://jobs.lever.co/acme/0b2d6f4c-1d2e-4f3a-9b8c-7d6e5f4a3b2c"));
    expect(t.jobKey("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Berlin/Backend-Engineer_R123/apply/applyManually"))
      .toBe(t.jobKey("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Berlin/Backend-Engineer_R123?source=li"));
    expect(t.jobKey("https://www.linkedin.com/jobs/view/3901234567/"))
      .toBe(t.jobKey("https://www.linkedin.com/jobs/search/?currentJobId=3901234567&keywords=x"));
  });

  it("links back to the posting, not the apply step", () => {
    expect(t.jobLink("https://jobs.lever.co/acme/0b2d6f4c-1d2e-4f3a-9b8c-7d6e5f4a3b2c/apply?lever-source=x"))
      .toBe("https://jobs.lever.co/acme/0b2d6f4c-1d2e-4f3a-9b8c-7d6e5f4a3b2c");
  });
});

describe("tracker: reading the job", () => {
  let t: Tracker;
  beforeEach(() => { store = {}; t = loadTracker(); });

  it("prefers the page's JobPosting data", () => {
    const job = t.extractJob(page(JOB_LD), "https://careers.acme.com/jobs/123");
    expect(job).toMatchObject({ title: "Backend Engineer", company: "Acme Robotics", location: "Berlin, DE", platform: "Company site" });
  });

  it("reads Lever pages from the layout and the URL", () => {
    const doc = page(`<div class="posting-headline"><h2>Data Analyst</h2></div><div class="posting-categories"><div class="location">Remote</div></div>`);
    const job = t.extractJob(doc, "https://jobs.lever.co/north-star/0b2d6f4c-1d2e-4f3a-9b8c-7d6e5f4a3b2c/apply");
    expect(job).toMatchObject({ title: "Data Analyst", company: "North Star", location: "Remote", platform: "Lever" });
  });

  it("splits page titles into role and company", () => {
    expect(t.splitTitle("Product Designer at Globex | Careers")).toEqual({ title: "Product Designer", company: "Globex" });
    expect(t.splitTitle("Site Reliability Engineer - Initech")).toEqual({ title: "Site Reliability Engineer", company: "Initech" });
  });

  it("only treats real application pages as job pages", () => {
    expect(t.isJobPage(page(JOB_LD), "https://example.com/blog/post")).toBe(true);
    expect(t.isJobPage(page(`<form><input type="file"></form>`), "https://example.com/careers/apply")).toBe(true);
    expect(t.isJobPage(page(`<form><input></form>`), "https://example.com/careers/apply")).toBe(false);
    expect(t.isJobPage(page(`<form><input type="file"></form>`), "https://example.com/upload")).toBe(false);
    const survey = page(`<div role="heading">Customer satisfaction survey</div>`);
    expect(t.isJobPage(survey, "https://docs.google.com/forms/d/e/abc/viewform")).toBe(false);
    const gApply = page(`<div role="heading">Summer Internship Application 2027</div>`);
    expect(t.isJobPage(gApply, "https://docs.google.com/forms/d/e/abc/viewform")).toBe(true);
  });
});

describe("tracker: merging", () => {
  let t: Tracker;
  beforeEach(() => { store = {}; t = loadTracker(); });
  const job = { key: "k", url: "https://x.test/job", title: "Role", company: "Co", location: "", platform: "Lever" };

  it("moves Interested to Applied and keeps the history", () => {
    const saved = t.mergeApplication(undefined, job, "interested", "2026-11-01T00:00:00.000Z");
    const applied = t.mergeApplication(saved, job, "applied", "2026-11-05T00:00:00.000Z");
    expect(applied.status).toBe("applied");
    expect(applied.appliedAt).toBe("2026-11-05T00:00:00.000Z");
    expect(applied.history.map((h) => h.status)).toEqual(["interested", "applied"]);
  });

  it("never moves an application backwards or reopens a closed one", () => {
    const base = t.mergeApplication(undefined, job, "applied", "2026-11-01T00:00:00.000Z");
    const interview = { ...base, status: "interview" as const };
    expect(t.mergeApplication(interview, job, "applied", "2026-11-09T00:00:00.000Z").status).toBe("interview");
    const rejected = { ...base, status: "rejected" as const };
    expect(t.mergeApplication(rejected, job, "applied", "2026-11-09T00:00:00.000Z").status).toBe("rejected");
  });
});

describe("tracker: logging on submit", () => {
  beforeEach(() => {
    store = {};
    set.mockClear();
    document.head.innerHTML = JOB_LD;
    document.body.innerHTML = `
      <form><input id="n"><button type="button" id="open">Apply now</button>
      <button type="button" id="next">Next</button>
      <button type="button" id="send"><span>Submit application</span></button></form>`;
    loadTracker();
  });
  afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

  it("ignores Apply now and Next, logs Submit application once", () => {
    document.getElementById("open")!.click();
    document.getElementById("next")!.click();
    expect(set).not.toHaveBeenCalled();

    document.querySelector("#send span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("send")!.click();
    const apps = Object.values(store.smartfill_applications as Record<string, SmartFillApplication>);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ company: "Acme Robotics", title: "Backend Engineer", status: "applied" });
  });

  it("logs nothing while SmartFill is disabled", () => {
    store.enabled = false;
    document.getElementById("send")!.click();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("tracker: job requirements", () => {
  const description = `<p>We are hiring a backend engineer to build payment APIs used by millions of customers every day.
    You will own services end to end, from design reviews to on-call, and work closely with product and design.</p>
    <h3>Requirements</h3><ul><li>3+ years of experience building backend services</li>
    <li>Python and PostgreSQL</li><li>AWS</li></ul>
    <h3>Nice to have</h3><ul><li>Kubernetes</li></ul>`;
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", title: "Backend Engineer", description,
    hiringOrganization: { name: "Acme Robotics" },
  })}</script>`;

  beforeEach(() => {
    store = {};
    set.mockClear();
    document.head.innerHTML = ld;
    document.body.innerHTML = "<form><input></form>";
  });
  afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

  it("reads requirements from the description and caches them for the apply page", async () => {
    const t = loadTracker();
    const info = await t.jobInfo();
    expect(info!.requirements!.required.map((r) => r.label).sort()).toEqual(["AWS", "PostgreSQL", "Python"]);
    expect(info!.requirements!.preferred.map((r) => r.label)).toEqual(["Kubernetes"]);
    expect(info!.requirements!.years).toBe(3);
    const cache = store.smartfill_job_requirements as Record<string, { requirements: SmartFillRequirements }>;
    expect(cache[info!.job.key].requirements.years).toBe(3);

    // Submitting attaches them to the application.
    document.body.innerHTML = `<button type="button" id="s">Submit application</button>`;
    document.getElementById("s")!.click();
    const app = Object.values(store.smartfill_applications as Record<string, SmartFillApplication>)[0];
    expect(app.requirements?.years).toBe(3);
  });
});

describe("tracker page", () => {
  const html = readFileSync(resolve("extension/tracker/tracker.html"), "utf8");
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const app = (id: string, status: SmartFillApplicationStatus, extra: Partial<SmartFillApplication> = {}): SmartFillApplication => ({
    id, url: `https://jobs.example/${id}`, title: `Role ${id}`, company: `Co ${id}`, location: "", platform: "Lever",
    status, createdAt: now, updatedAt: now, appliedAt: status === "interested" ? undefined : now,
    history: [{ status, at: now }], notes: "", ...extra,
  });

  function loadPage(apps: Record<string, SmartFillApplication>, extra: Record<string, unknown> = {}) {
    store = { smartfill_applications: apps, ...extra };
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    Object.assign(window, {
      chrome: {
        storage: {
          local: { get: (_k: unknown, cb: (d: unknown) => void) => cb({ ...store }), set },
          onChanged: { addListener: () => {} },
        },
      },
    });
    window.eval(readFileSync(resolve("extension/content/matchScore.js"), "utf8"));
    window.eval(readFileSync(resolve("extension/tracker/tracker.js"), "utf8"));
  }

  const column = (id: string) => document.querySelector(`[data-column="${id}"]`)!;

  it("places each application in its column and counts the stats", () => {
    loadPage({
      a: app("a", "interested"),
      b: app("b", "applied", { updatedAt: old, appliedAt: old, createdAt: old }),
      c: app("c", "interview"),
      d: app("d", "rejected"),
    });
    expect(column("interested").querySelectorAll(".card")).toHaveLength(1);
    expect(column("applied").querySelectorAll(".card")).toHaveLength(1);
    expect(column("interview").querySelectorAll(".card")).toHaveLength(1);
    expect(column("closed").querySelectorAll(".card")).toHaveLength(1);
    expect(document.getElementById("statTotal")!.textContent).toBe("3");
    expect(document.getElementById("statReply")!.textContent).toBe("67%");
    expect(document.getElementById("statFollow")!.textContent).toBe("1");
    expect(column("applied").querySelector(".follow")!.textContent).toMatch(/No reply in 20 days/);
  });

  it("renders page-supplied text as text and drops unsafe links", () => {
    loadPage({ x: app("x", "applied", { company: `<img src=x onerror="window.__pwned=1">`, url: "javascript:alert(1)" }) });
    const card = column("applied").querySelector(".card")!;
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector(".company")!.textContent).toContain("<img");
    expect(card.querySelector("a")).toBeNull();
  });

  it("shows a match score from the saved CV and sorts by it", () => {
    const req = (skills: string[]): SmartFillRequirements => ({
      required: skills.map((label) => ({ id: label.toLowerCase(), label })), preferred: [], years: null, degree: null,
    });
    loadPage({
      weak: app("weak", "interested", { requirements: req(["Kotlin", "Swift", "Python"]), updatedAt: now }),
      strong: app("strong", "interested", { requirements: req(["Python", "Django"]), updatedAt: old, createdAt: old }),
    }, { smartfill_resume: { text: "Python developer, 3 years of experience with Django", updated_at: now } });
    const pill = (id: string) => document.querySelector(`[data-id="${id}"] .score`)!.textContent;
    expect(pill("strong")).toBe("100%");
    expect(pill("weak")).toBe("33%");
    expect(document.querySelector('[data-id="weak"] .missing')!.textContent).toBe("Missing: Kotlin, Swift");

    const sort = document.getElementById("sortBy") as HTMLSelectElement;
    sort.value = "match";
    sort.dispatchEvent(new Event("change"));
    expect(Array.from(column("interested").querySelectorAll(".card"), (c) => (c as HTMLElement).dataset.id)).toEqual(["strong", "weak"]);
  });

  it("changes status from the card's dropdown and records the history", () => {
    loadPage({ a: app("a", "applied") });
    set.mockClear();
    const select = column("applied").querySelector("select") as HTMLSelectElement;
    select.value = "interview";
    select.dispatchEvent(new Event("change"));
    const saved = (store.smartfill_applications as Record<string, SmartFillApplication>).a;
    expect(saved.status).toBe("interview");
    expect(saved.history.map((h) => h.status)).toEqual(["applied", "interview"]);
    expect(column("interview").querySelectorAll(".card")).toHaveLength(1);
  });
});
