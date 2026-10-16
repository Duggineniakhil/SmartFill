// End-to-end smoke test: loads extension/ unpacked into a real Chromium-based
// browser and checks learn-on-submit, autofill, badges, popup and "Fill this page".
//
//   node e2e/extension.e2e.mjs            (uses installed Edge; set SMARTFILL_BROWSER=chrome|chromium)
//
// Branded Chrome 137+ ignores --load-extension, so Edge or Playwright's Chromium is needed.
import { chromium } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
const PAGES = { "/done": "<!doctype html><p>thanks</p>", "/split": SPLIT, "/gform": GFORM, "/host": HOST, "/frame": FRAME };

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
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
