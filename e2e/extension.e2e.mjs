// End-to-end smoke test: loads extension/ unpacked into a real Chromium-based
// browser and checks learn-on-submit, autofill, badges, popup and "Fill this page".
//
//   node e2e/extension.e2e.mjs            (uses installed Edge; set SMARTFILL_BROWSER=chrome|chromium)
//
// Branded Chrome 137+ ignores --load-extension, so Edge or Playwright's Chromium is needed.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const EXT = resolve(process.env.SMARTFILL_EXT || "extension");
const ORIGIN = "http://smartfill.test";
const browserChoice = process.env.SMARTFILL_BROWSER || "msedge";

const FORM = `<!doctype html><html><body>
<form id="f" action="/done" method="get">
  <div><label for="name">Full Name</label><input id="name" name="name"></div>
  <div><label for="email">Email Address</label><input id="email" name="email" type="email"></div>
  <div><label for="phone">Phone Number</label><input id="phone" name="phone" type="tel"></div>
  <div><label for="college">College Name</label><input id="college" name="college"></div>
  <div><label for="company">Company Name</label><input id="company" name="company"></div>
  <div><label for="father">Father's Name</label><input id="father" name="father"></div>
  <div><label for="ship">Shipping Address</label><input id="ship" name="ship"></div>
  <div><label for="pw">Password</label><input id="pw" name="pw" type="password"></div>
  <div><label for="otp">Enter OTP</label><input id="otp" name="otp"></div>
  <div><label for="country">Country</label><select id="country" name="country">
    <option value="">Select…</option><option value="IN">India</option>
    <option value="GB">United Kingdom</option><option value="US">United States</option>
  </select></div>
  <button id="go" type="submit">Submit</button>
</form></body></html>`;

// First/last name only, plus a select whose option text differs from the stored value's casing.
const SPLIT = `<!doctype html><html><body><form>
  <div><label for="fn">First Name</label><input id="fn"></div>
  <div><label for="ln">Last Name</label><input id="ln"></div>
  <div><label for="c">Country</label><select id="c"><option value="">--</option>
    <option value="us">UNITED STATES</option><option value="uk">united kingdom</option></select></div>
</form></body></html>`;

// Google Forms-style: no <form>, a scripted "Submit" div that clears the fields.
const GFORM = `<!doctype html><html><body>
  <div role="listitem"><div role="heading">Phone number</div><input aria-label="Your answer"></div>
  <div role="listitem"><div role="heading">Graduation Year</div><input aria-label="Your answer"></div>
  <div role="listitem"><div role="heading">Preferred work location <span>*</span></div><input aria-label="Your answer"></div>
  <div role="button" id="gsubmit"><span>Submit</span></div>
  <script>document.getElementById("gsubmit").addEventListener("click", () => {
    document.querySelectorAll("input").forEach((i) => { i.value = ""; });
  });</script>
</body></html>`;

const HOST = `<!doctype html><html><body><h1>Careers</h1><iframe id="frame" src="/frame" width="600" height="400"></iframe></body></html>`;
const FRAME = `<!doctype html><html><body><form>
  <div><label for="e">Email</label><input id="e"></div>
  <div><label for="u">University</label><input id="u"></div>
</form></body></html>`;
// A company careers page with schema.org JobPosting data and a CV upload.
const JOB = `<!doctype html><html><head><title>Backend Engineer - Acme Robotics</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer",
"hiringOrganization":{"@type":"Organization","name":"Acme Robotics"},
"jobLocation":{"@type":"Place","address":{"addressLocality":"Berlin","addressCountry":"DE"}},
"description":"&lt;p&gt;Build the payment APIs behind our robots, used by thousands of warehouses. You will own services end to end and work closely with product.&lt;/p&gt;&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;3+ years of experience building backend services&lt;/li&gt;&lt;li&gt;Python and PostgreSQL&lt;/li&gt;&lt;li&gt;AWS and Docker&lt;/li&gt;&lt;/ul&gt;&lt;h3&gt;Nice to have&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Kubernetes&lt;/li&gt;&lt;/ul&gt;"}</script></head><body>
<h1>Backend Engineer</h1>
<div><label for="jn">Full Name</label><input id="jn"></div>
<div><label for="cv">Resume</label><input id="cv" type="file"></div>
<div><label for="jwhy">Why do you want to work at Acme Robotics?</label><textarea id="jwhy"></textarea></div>
<div><label for="jlevel">What is your experience level?</label><select id="jlevel"><option value="">Select…</option>
  <option value="j">Junior</option><option value="m">Mid-level</option></select></div>
<fieldset><legend>Are you willing to relocate?</legend>
  <label><input type="radio" name="reloc" value="y"> Yes</label><label><input type="radio" name="reloc" value="n"> No</label></fieldset>
<label><input type="checkbox" id="jconsent"> I agree to the privacy policy</label>
<button type="button" id="jnext">Next</button>
<button type="button" id="jsubmit">Submit application</button>
</body></html>`;
// Real react-select (Greenhouse's newer boards) and a Workday-style button.
const REACT_BUNDLE = (await build({
  entryPoints: ["e2e/fixtures/reactSelectForm.jsx"], bundle: true, write: false, format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
})).outputFiles[0].text;
const REACT_FORM = `<!doctype html><html><body><div id="root"></div><script src="/react-form.js"></script></body></html>`;

const PAGES = { "/done": "<!doctype html><p>thanks</p>", "/split": SPLIT, "/gform": GFORM, "/host": HOST, "/frame": FRAME, "/careers/backend-engineer/apply": JOB };

// A one-page PDF whose text is the given lines (Helvetica, no compression).
function makePdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// A minimal .docx: a zip holding word/document.xml with one paragraph per line.
function makeDocx(lines) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${
    lines.map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const data = Buffer.from(xml, "utf8");
  const packed = deflateRawSync(data);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const centralStart = local.length + name.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([local, name, packed, central, name, end]);
}

let failures = 0;
const stable = (v) => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x);
function check(label, actual, expected) {
  const ok = stable(actual) === stable(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

const userDataDir = mkdtempSync(join(tmpdir(), "smartfill-e2e-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  ...(browserChoice === "chromium" ? {} : { channel: browserChoice }),
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--headless=new"],
});

try {
  await context.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/react-form.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: REACT_BUNDLE });
    if (url.pathname === "/react-form") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: REACT_FORM });
    const body = PAGES[url.pathname] ?? FORM;
    return route.fulfill({ status: 200, contentType: "text/html", body });
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log(`extension id ${extId} (${browserChoice})`);
  const storage = () => sw.evaluate(() => chrome.storage.local.get(null));
  await sw.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // 1. Learn: fill a form by hand and submit it.
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/apply`);
  await page.fill("#name", "Ada Lovelace");
  await page.fill("#email", "ada@example.com");
  await page.fill("#phone", "+44 20 7946 0000");
  await page.fill("#college", "Cambridge University");
  await page.fill("#company", "Analytical Engines Ltd");
  await page.fill("#ship", "12 St James's Square, London");
  await page.fill("#pw", "hunter2");
  await page.fill("#otp", "123456");
  await page.selectOption("#country", "GB");
  await Promise.all([page.waitForURL(/\/done/), page.click("#go")]);
  await page.waitForTimeout(500);
  const learned = (await storage()).smartfill_profile?.fields || {};
  check("learn: saved fields", learned, {
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+44 20 7946 0000",
    university: "Cambridge University",
    address: "12 St James's Square, London",
    country: "United Kingdom",
    company: "Analytical Engines Ltd",
  });

  // 2. Autofill: a fresh copy of the form is filled on load.
  await page.goto(`${ORIGIN}/apply-again`);
  await page.waitForTimeout(1200);
  const values = await page.$$eval("input", (els) => Object.fromEntries(els.map((e) => [e.id, e.value])));
  check("autofill: values on load", values, {
    name: "Ada Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000",
    college: "Cambridge University", company: "Analytical Engines Ltd", father: "", ship: "12 St James's Square, London", pw: "", otp: "",
  });
  check("autofill: country select", await page.inputValue("#country"), "GB");
  check("autofill: SF badge offered for weak 'Father's Name' match", await page.locator(".smartfill-badge").count(), 1);

  await page.goto(`${ORIGIN}/split`);
  await page.waitForTimeout(1200);
  check("autofill: first/last derived from full name", [await page.inputValue("#fn"), await page.inputValue("#ln")], ["Ada", "Lovelace"]);
  check("autofill: select matched case-insensitively", await page.inputValue("#c"), "uk");

  // Google Forms-style scripted submit is learned, even though the page clears the inputs.
  await page.goto(`${ORIGIN}/gform`);
  await page.waitForTimeout(800);
  const gInputs = page.locator("input");
  check("gform: phone autofilled", await gInputs.nth(0).inputValue(), "+44 20 7946 0000");
  await gInputs.nth(0).fill("+44 7700 900123");
  await gInputs.nth(1).fill("1835");
  await gInputs.nth(2).fill("London or remote");
  await page.click("#gsubmit");
  await page.waitForTimeout(500);
  const afterG = (await storage()).smartfill_profile?.fields || {};
  check("gform: learned on scripted submit", [afterG.phone, afterG.graduation_year], ["+44 7700 900123", "1835"]);
  check("gform: custom question saved by label",
    (await storage()).smartfill_profile?.custom?.["preferred work location"],
    { label: "Preferred work location", value: "London or remote", updated_at: (await storage()).smartfill_profile?.custom?.["preferred work location"]?.updated_at });
  await page.goto(`${ORIGIN}/gform`);
  await page.waitForTimeout(800);
  check("gform: custom question refilled", await page.locator("input").nth(2).inputValue(), "London or remote");

  // Forms inside iframes are filled.
  await page.goto(`${ORIGIN}/host`);
  await page.waitForTimeout(1500);
  const frame = page.frame({ url: (u) => u.pathname === "/frame" });
  check("iframe: autofilled", [await frame.inputValue("#e"), await frame.inputValue("#u")], ["ada@example.com", "Cambridge University"]);

  // 3. Popup lists the learned profile.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForSelector("#profile .item");
  const rows = await popup.$$eval("#profile .item", (items) =>
    items.map((i) => [i.querySelector(".key")?.textContent, i.querySelector(".val")?.textContent]));
  check("popup: profile rows", rows.length, Object.keys((await storage()).smartfill_profile.fields).length);
  check("popup: enabled toggle reflects storage", await popup.isChecked("#enabled"), true);
  check("popup: custom field listed",
    await popup.$$eval("#custom .item", (items) => items.map((i) => [i.querySelector(".key")?.textContent, i.querySelector(".val")?.textContent])),
    [["Preferred work location", "London or remote"]]);

  // 4. Popup add/edit saves a new key.
  await popup.selectOption("#newKey", "cgpa");
  await popup.fill("#newVal", "9.1");
  await popup.click("#addBtn");
  await popup.waitForTimeout(300);
  check("popup: add cgpa", (await storage()).smartfill_profile?.fields?.cgpa, "9.1");

  // 5. Auto-fill off: page stays empty, "Fill this page" fills strong matches only.
  await popup.uncheck("#autoFill");
  await popup.waitForTimeout(300);
  check("popup: autoFill toggle saved", (await storage()).smartfill_settings?.autoFillEnabled, false);
  await page.bringToFront();
  await page.goto(`${ORIGIN}/manual`);
  await page.waitForTimeout(1200);
  check("auto-fill off: name left empty", await page.inputValue("#name"), "");
  // Same call the popup's "Fill this page" button makes.
  const fillNow = () => sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (window.__SMARTFILL__?.fillNow ? window.__SMARTFILL__.fillNow() : null),
    });
    const filled = results.reduce((sum, r) => sum + (r.result?.filled || 0), 0);
    return results.some((r) => r.result?.disabled) ? { filled, disabled: true } : { filled };
  }, ORIGIN);
  check("fill now: response", await fillNow(), { filled: 7 });
  check("fill now: father's name still empty", await page.inputValue("#father"), "");
  check("fill now: password untouched", await page.inputValue("#pw"), "");
  await page.goto(`${ORIGIN}/host`);
  await page.waitForTimeout(1200);
  check("fill now: counts iframe fields", await fillNow(), { filled: 2 });

  // 6. Disabled: nothing is filled or learned.
  await popup.uncheck("#enabled");
  await popup.waitForTimeout(300);
  await page.goto(`${ORIGIN}/disabled`);
  await page.waitForTimeout(800);
  check("disabled: fill now refused", await fillNow(), { filled: 0, disabled: true });
  await page.fill("#name", "Someone Else");
  await Promise.all([page.waitForURL(/\/done/), page.click("#go")]);
  await page.waitForTimeout(500);
  check("disabled: nothing learned", (await storage()).smartfill_profile?.fields?.full_name, "Ada Lovelace");

  // 7. Popup delete + clear.
  await popup.reload();
  await popup.waitForSelector("#profile .item");
  const before = await popup.locator("#profile .item").count();
  await popup.locator("#profile .item .del").first().click();
  await popup.waitForTimeout(300);
  check("popup: delete one row", await popup.locator("#profile .item").count(), before - 1);
  popup.once("dialog", (d) => d.accept());
  await popup.click("#clear");
  await popup.waitForTimeout(300);
  check("popup: clear all", (await storage()).smartfill_profile, { fields: {} });

  // 8. Application tracker: detect the job, log it on submit, show it on the board.
  await popup.check("#enabled");
  await popup.waitForTimeout(300);
  await sw.evaluate(() => chrome.storage.local.set({
    smartfill_resume: { text: "Backend developer. 4 years of experience with Python, Django, PostgreSQL and AWS.", updated_at: "2026-11-19" },
  }));
  await page.bringToFront();
  await page.goto(`${ORIGIN}/careers/backend-engineer/apply?utm_source=x`);
  await page.waitForTimeout(800);
  const jobInfo = await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__SMARTFILL__?.tracker?.jobInfo() ?? null,
    });
    return r.result;
  }, ORIGIN);
  check("tracker: job detected", [jobInfo?.job?.title, jobInfo?.job?.company, jobInfo?.job?.location, jobInfo?.application],
    ["Backend Engineer", "Acme Robotics", "Berlin, DE", null]);
  check("match: requirements read from the description",
    [jobInfo?.requirements?.required.map((r) => r.label).sort(), jobInfo?.requirements?.preferred.map((r) => r.label), jobInfo?.requirements?.years],
    [["AWS", "Docker", "PostgreSQL", "Python"], ["Kubernetes"], 3]);
  await page.click("#jnext");
  await page.waitForTimeout(300);
  check("tracker: Next does not log", Object.keys((await storage()).smartfill_applications || {}).length, 0);
  await page.click("#jsubmit");
  await page.waitForTimeout(500);
  const logged = Object.values((await storage()).smartfill_applications || {});
  check("tracker: logged on submit", logged.map((a) => [a.company, a.title, a.status, a.url]),
    [["Acme Robotics", "Backend Engineer", "applied", `${ORIGIN}/careers/backend-engineer`]]);

  const board = await context.newPage();
  await board.setViewportSize({ width: 1280, height: 720 });
  await board.goto(`chrome-extension://${extId}/tracker/tracker.html`);
  await board.waitForSelector('[data-column="applied"] .card');
  check("tracker page: card in Applied", await board.textContent('[data-column="applied"] .card .company'), "Acme Robotics");
  check("tracker page: total", await board.textContent("#statTotal"), "1");
  // Skills 3 of 4.5 (Kubernetes is nice-to-have, worth half) at 70%, years met at 20%: 74%.
  check("match: score on the card", await board.textContent('[data-column="applied"] .card .score'), "74%");
  await board.selectOption('[data-column="applied"] .card select', "interview");
  await board.waitForSelector('[data-column="interview"] .card');
  check("tracker page: moved to Interview", Object.values((await storage()).smartfill_applications).map((a) => a.status), ["interview"]);
  if (process.env.SMARTFILL_SHOT) await board.screenshot({ path: process.env.SMARTFILL_SHOT });

  // 9. AI (Gemini stubbed inside the service worker; no real request is made).
  await sw.evaluate(() => {
    self.__aiCalls = [];
    self.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      self.__aiCalls.push({ url: String(url), key: init.headers["x-goog-api-key"], body: init.body });
      const prompt = body.contents[0].parts[0].text;
      let reply;
      if (/QUESTIONS \(JSON\)/.test(prompt)) {
        const qs = JSON.parse(prompt.split("QUESTIONS (JSON):\n")[1]);
        reply = { answers: qs.map((q) => (q.type === "single"
          ? { id: q.id, choice: /authorized/.test(q.question) ? "Yes" : q.options[q.options.length - 1], note: "" }
          : q.type === "multi"
            ? { id: q.id, choices: q.options.filter((o) => o === "Python" || o === "SQL"), note: "" }
            : { id: q.id, answer: `Drafted: ${q.question}`, note: "" })) };
      } else if (/connectivity check/.test(body.systemInstruction.parts[0].text)) {
        reply = { ok: true };
      } else {
        reply = { score: 81, verdict: "strong", summary: "Solid backend fit.", strengths: ["Python"], gaps: ["Docker"], tips: [] };
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });
  await sw.evaluate(() => chrome.storage.local.set({
    smartfill_ai: { provider: "gemini", geminiKey: "test-key" },
    smartfill_profile: { fields: { full_name: "Ada Lovelace", email: "ada@example.com" } },
  }));
  await page.bringToFront();
  await page.goto(`${ORIGIN}/careers/backend-engineer/apply`);
  await page.waitForSelector(".smartfill-ai-draft", { timeout: 5000 });
  await page.click(".smartfill-ai-draft");
  await page.waitForFunction(() => document.getElementById("jwhy").value !== "", null, { timeout: 5000 });
  check("ai: drafted answer filled", await page.inputValue("#jwhy"), "Drafted: Why do you want to work at Acme Robotics?");
  check("ai: drafted answer marked for review", await page.getAttribute("#jwhy", "data-smartfill-status"), "review");
  const calls = await sw.evaluate(() => self.__aiCalls);
  check("ai: key sent as header, job text and CV included, email left out",
    [calls[0]?.key, calls[0]?.url.includes("test-key"), /payment APIs/.test(calls[0]?.body), /Backend developer/.test(calls[0]?.body), /ada@example\.com/.test(calls[0]?.body)],
    ["test-key", false, true, true, false]);

  // The popup's "Draft answers": every remaining question on the page.
  const drafted = await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__SMARTFILL__?.ai?.draftAll() ?? null,
    });
    return r.result;
  }, ORIGIN);
  check("ai: dropdown and radio answered", [drafted?.drafted, await page.inputValue("#jlevel"),
    await page.isChecked('input[name="reloc"][value="n"]'), await page.isChecked("#jconsent")], [2, "m", true, false]);
  check("ai: radio group marked for review", await page.getAttribute("fieldset", "data-smartfill-status"), "review");

  // Custom dropdowns: real react-select (single and multi) and a Workday-style button.
  await page.goto(`${ORIGIN}/react-form`);
  await page.waitForSelector("#level");
  const customAsked = await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__SMARTFILL__?.ai?.questions() ?? [] });
    return r.result.map((q) => q.label);
  }, ORIGIN);
  check("ai: custom dropdowns found", customAsked,
    ["What is your experience level?", "Which languages do you use professionally?", "Are you legally authorized to work in Germany?"]);
  const customDrafted = await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__SMARTFILL__?.ai?.draftAll() ?? null });
    return r.result;
  }, ORIGIN);
  const sentOptions = await sw.evaluate(() => {
    const prompt = JSON.parse(self.__aiCalls[self.__aiCalls.length - 1].body).contents[0].parts[0].text;
    return JSON.parse(prompt.split("QUESTIONS (JSON):\n")[1]).map((q) => [q.type, q.options]);
  });
  check("ai: custom dropdown options read from the open menus", sentOptions, [
    ["single", ["Junior (0-2 years)", "Mid-level (3-5 years)", "Senior (6+ years)"]],
    ["multi", ["Python", "Go", "SQL", "Rust"]],
    ["single", ["Yes", "No"]],
  ]);
  check("ai: react-select and Workday values set in React state",
    [customDrafted?.drafted, await page.textContent("#out-level"), await page.textContent("#out-langs"), await page.textContent("#out-auth"),
      await page.locator('[role="listbox"]').count()],
    [3, "l2", "python,sql", "Yes", 0]);

  await board.bringToFront();
  await board.reload();
  await board.click('[data-column="interview"] .card button.ai');
  await board.waitForSelector('[data-column="interview"] .card .score.ai', { timeout: 5000 });
  check("ai: match on the board", await board.textContent('[data-column="interview"] .card .score.ai'), "✦ 81%");

  await board.click("#aiToggle");
  await board.click("#aiTest");
  await board.waitForFunction(() => /Connected|rejected|error/i.test(document.getElementById("aiStatus").textContent), null, { timeout: 5000 });
  check("ai: test connection", await board.textContent("#aiStatus"), "Connected to Gemini (gemini-2.5-flash). Remember to Save.");

  await board.click("#cvToggle");
  await board.setInputFiles("#cvFile", { name: "cv.pdf", mimeType: "application/pdf",
    buffer: makePdf(["Ada Lovelace", "Analyst, Analytical Engines Ltd (2019 - 2024)", "Skills: Python, SQL, Tableau"]) });
  await board.waitForFunction(() => /Read cv\.pdf|Couldn/.test(document.getElementById("cvFileStatus").textContent), null, { timeout: 10000 });
  check("cv upload: pdf text", [await board.textContent("#cvFileStatus"), /Skills: Python, SQL, Tableau/.test(await board.inputValue("#cvText"))],
    ["Read cv.pdf (1 page). Check the text below, then Save CV.", true]);
  await board.setInputFiles("#cvFile", { name: "cv.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: makeDocx(["Ada Lovelace", "Research & analysis, 2019 - 2024", "Skills: Python, R, statistics and data visualisation"]) });
  await board.waitForFunction(() => /Read cv\.docx|Couldn|doesn/.test(document.getElementById("cvFileStatus").textContent), null, { timeout: 10000 });
  check("cv upload: docx text", await board.inputValue("#cvText"),
    "Ada Lovelace\nResearch & analysis, 2019 - 2024\nSkills: Python, R, statistics and data visualisation");
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
