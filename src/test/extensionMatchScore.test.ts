import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Match = NonNullable<Window["__SMARTFILL__"]["match"]>;
let m: Match;

beforeAll(() => {
  Object.assign(window, { __SMARTFILL__: undefined });
  window.eval(readFileSync(resolve("extension/content/matchScore.js"), "utf8"));
  m = window.__SMARTFILL__.match!;
});

const JD = `
About the role
You'll build the APIs behind our payments product.

Requirements
- 3+ years of professional experience building backend services
- Strong Python or Go, and solid SQL (PostgreSQL)
- Experience with AWS and Docker
- Bachelor's or Master's degree in Computer Science or equivalent

Nice to have
- Kubernetes
- Experience with Kafka
- Scrum Master certification
`;

const labels = (xs: Array<{ label: string }>) => xs.map((x) => x.label).sort();

describe("match score: reading a job description", () => {
  it("splits required from nice-to-have skills and reads years and degree", () => {
    const req = m.extractRequirements(JD);
    expect(labels(req.required)).toEqual(["AWS", "Docker", "Go", "PostgreSQL", "Python", "SQL"].sort());
    expect(labels(req.preferred)).toEqual(["Agile / Scrum", "Kafka", "Kubernetes"].sort());
    expect(req.years).toBe(3);
    expect(req.degree).toBe(2); // "Bachelor's or Master's": a bachelor's is enough
  });

  it("does not mistake ordinary words for languages", () => {
    const req = m.extractRequirements("Requirements\nWe go fast. Ready to go live and excel in a team. Rest assured, our C-suite loves it.\nUse MS Office daily.");
    expect(req.required).toEqual([]);
    expect(req.degree).toBeNull();
  });

  it("counts skills the user lists even if they aren't built in", () => {
    const req = m.extractRequirements("Requirements\n- Shipped games with Godot and Blender", "Godot, Blender, Python");
    expect(labels(req.required)).toEqual(["Blender", "Godot"]);
  });
});

describe("match score: reading the user", () => {
  it("reads skills, stated experience and degree from a CV", () => {
    const facts = m.userFacts({}, "B.Tech in Computer Science\n4 years of experience with Python, Django, PostgreSQL and AWS.");
    expect(labels(facts.skills)).toEqual(expect.arrayContaining(["Python", "Django", "PostgreSQL", "AWS", "SQL"]));
    expect(facts.years).toBe(4);
    expect(facts.degree).toBe(2);
  });

  it("works out experience from job dates, skipping education and overlaps", () => {
    const cv = [
      "Software Engineer, Acme — Jan 2020 – Dec 2021",
      "Contract developer — Jun 2021 – Mar 2022",
      "Bachelor of Engineering, State University 2015 – 2019",
    ].join("\n");
    // Jan 2020 to Mar 2022, counting the overlap once.
    expect(m.yearsFromRanges(cv)).toBe(2.3);
  });

  it("prefers the experience the user typed into a form", () => {
    expect(m.userFacts({ experience_years: "6" }, "2 years of experience").years).toBe(6);
  });
});

describe("match score: scoring", () => {
  it("scores a close match high and lists what is missing", () => {
    const req = m.extractRequirements(JD);
    const facts = m.userFacts({ skills: "Python, SQL, PostgreSQL, AWS, Docker, Go" }, "5 years of experience. B.Sc Computer Science.");
    const r = m.score(req, facts);
    expect(r.level).toBe("strong");
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.missing).toEqual([]);
    expect(r.missingPreferred.sort()).toEqual(["Agile / Scrum", "Kafka", "Kubernetes"]);
  });

  it("scores a poor match low", () => {
    const req = m.extractRequirements(JD);
    const r = m.score(req, m.userFacts({ skills: "Figma, Photoshop" }, "1 year of experience designing apps"));
    expect(r.level).toBe("weak");
    expect(r.missing).toContain("Python");
    expect(r.yearsNote).toBe("Asks for 3+ years, you have 1");
  });

  it("asks for a CV instead of guessing when the profile is empty", () => {
    const r = m.score(m.extractRequirements(JD), m.userFacts({}, ""));
    expect(r.needsProfile).toBe(true);
    expect(r.score).toBeNull();
  });
});
