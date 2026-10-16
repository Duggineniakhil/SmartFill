import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (message: unknown, sender: unknown, send: (response: unknown) => void) => boolean;

function loadContentScripts(storage: Record<string, unknown>): Listener {
  let messageListener: Listener | undefined;
  Object.assign(window, {
    chrome: {
      storage: {
        local: {
          get: (_keys: unknown, callback: (data: unknown) => void) => callback(storage),
          set: vi.fn(),
        },
      },
      runtime: {
        onMessage: { addListener: (listener: Listener) => { messageListener = listener; } },
      },
    },
    ResizeObserver: class { observe() {} },
  });
  window.eval(readFileSync(resolve("extension/content/detectFields.js"), "utf8"));
  window.eval(readFileSync(resolve("extension/content/autofill.js"), "utf8"));
  return messageListener!;
}

async function fillNow(listener: Listener) {
  let response: unknown;
  listener({ type: "SMARTFILL_FILL_NOW" }, {}, (value) => { response = value; });
  await Promise.resolve(); // the reply is sent from a resolved promise
  return response;
}

const profile = {
  smartfill_profile: { fields: { full_name: "Ada Lovelace", university: "Cambridge", email: "ada@example.com" } },
  smartfill_settings: { autoFillEnabled: false, autoSaveEnabled: true },
};

describe("SMARTFILL_FILL_NOW", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div><label for="a">Name</label><input id="a" /></div>
      <div><label for="b">College Name</label><input id="b" /></div>
      <div><label for="c">Company Name</label><input id="c" /></div>
      <div><label for="d">Email</label><input id="d" /></div>
    `;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
  });

  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  it("fills only matches at or above the 0.75 threshold", async () => {
    const response = await fillNow(loadContentScripts(profile));
    expect(value("a")).toBe("Ada Lovelace");
    expect(value("b")).toBe("Cambridge");
    // "Company Name" only weakly matches full_name, so it must stay empty.
    expect(value("c")).toBe("");
    expect(value("d")).toBe("ada@example.com");
    expect(response).toEqual({ filled: 3 });
  });

  it("derives first/last name, fills selects by option text, and never swaps skills and resume", async () => {
    document.body.innerHTML = `
      <div><label for="fn">First Name</label><input id="fn" /></div>
      <div><label for="ln">Last Name</label><input id="ln" /></div>
      <div><label for="co">Country</label><select id="co"><option value="">Select</option>
        <option value="in">India</option><option value="gb">United Kingdom</option></select></div>
      <div><label for="cv">Resume Link</label><input id="cv" /></div>
    `;
    const response = await fillNow(loadContentScripts({
      smartfill_profile: { fields: { full_name: "Ada King Lovelace", country: "united kingdom", skills: "Maths" } },
    }));
    expect(["fn", "ln", "co", "cv"].map(value)).toEqual(["Ada", "King Lovelace", "gb", ""]);
    expect(response).toEqual({ filled: 3 });
  });

  it("leaves a select alone when no option matches", async () => {
    document.body.innerHTML = `<div><label for="co">Country</label><select id="co"><option value="">Select</option>
      <option value="in">India</option></select></div>`;
    const response = await fillNow(loadContentScripts({ smartfill_profile: { fields: { country: "Narnia" } } }));
    expect(value("co")).toBe("");
    expect(response).toEqual({ filled: 0 });
  });

  it("learns from a scripted submit button and reads values before the page clears them", () => {
    document.body.innerHTML = `
      <div role="listitem"><div role="heading">Email</div><input aria-label="Your answer" /></div>
      <div role="button" id="go"><span>Submit</span></div>
    `;
    const storage: Record<string, unknown> = { smartfill_profile: { fields: {} } };
    loadContentScripts(storage);
    const { set } = (window as unknown as { chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } } }).chrome.storage.local;
    const input = document.querySelector("input")!;
    input.value = "ada@example.com";
    document.getElementById("go")!.addEventListener("click", () => { input.value = ""; });
    document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(set).toHaveBeenCalledWith({
      smartfill_profile: expect.objectContaining({ fields: { email: "ada@example.com" } }),
    });
  });

  it("does not learn from ordinary buttons", () => {
    document.body.innerHTML = `
      <div><label for="e">Email</label><input id="e" value="ada@example.com" /></div>
      <button id="b" type="button">Show more</button>
    `;
    loadContentScripts({ smartfill_profile: { fields: {} } });
    const { set } = (window as unknown as { chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } } }).chrome.storage.local;
    document.getElementById("b")!.click();
    expect(set).not.toHaveBeenCalled();
  });

  it("does nothing when SmartFill is disabled", async () => {
    const response = await fillNow(loadContentScripts({ ...profile, enabled: false }));
    expect(["a", "b", "c", "d"].map(value)).toEqual(["", "", "", ""]);
    expect(response).toEqual({ filled: 0, disabled: true });
  });
});

describe("custom fields", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
  });

  type SetMock = ReturnType<typeof vi.fn>;
  const storageSet = () => (window as unknown as { chrome: { storage: { local: { set: SetMock } } } }).chrome.storage.local.set;
  const submit = () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
  const savedProfile = (set: SetMock) => set.mock.calls.at(-1)?.[0]?.smartfill_profile;

  it("learns answers to unknown questions by label", () => {
    document.body.innerHTML = `<form>
      <div><label for="e">Email</label><input id="e" value="ada@example.com" /></div>
      <div><label for="l">Preferred work location *</label><input id="l" value="London" /></div>
    </form>`;
    loadContentScripts({ smartfill_profile: { fields: {} } });
    submit();
    const profile = savedProfile(storageSet());
    expect(profile.fields).toEqual({ email: "ada@example.com" });
    expect(profile.custom).toEqual({
      "preferred work location": { label: "Preferred work location", value: "London", updated_at: expect.any(String) },
    });
  });

  const stored = {
    smartfill_profile: {
      fields: {},
      custom: { "preferred work location": { label: "Preferred work location", value: "London", updated_at: "2026-01-01" } },
    },
  };

  it("refills an identical label", async () => {
    document.body.innerHTML = `<form><div><label for="l">Preferred Work Location</label><input id="l" /></div></form>`;
    expect(await fillNow(loadContentScripts(stored))).toEqual({ filled: 1 });
    expect((document.getElementById("l") as HTMLInputElement).value).toBe("London");
  });

  it("only suggests (badge) for a similar label", async () => {
    document.body.innerHTML = `<form><div><label for="l">Preferred location for work</label><input id="l" /></div></form>`;
    const listener = loadContentScripts({ ...stored, smartfill_settings: { autoFillEnabled: true } });
    expect(await fillNow(listener)).toEqual({ filled: 0 });
    vi.advanceTimersByTime(300); // let the page scan run
    expect((document.getElementById("l") as HTMLInputElement).value).toBe("");
    expect(document.querySelector(".smartfill-badge")).not.toBeNull();
  });

  it.each([
    ["login forms", `<div><label for="u">Workspace</label><input id="u" value="acme" /></div>
      <div><label for="p">Password</label><input id="p" type="password" value="x" /></div>`],
    ["single-field forms", `<div><label for="q">Workspace</label><input id="q" value="acme" /></div>`],
    ["search, coupon and message fields", `<div><label for="a">Search jobs</label><input id="a" value="x" /></div>
      <div><label for="b">Coupon code</label><input id="b" value="SAVE10" /></div>
      <div><label for="c">Message</label><textarea id="c">hi</textarea></div>`],
    ["long answers", `<div><label for="a">Why us?</label><textarea id="a">${"x".repeat(600)}</textarea></div>
      <div><label for="b">Cover letter</label><textarea id="b">${"y".repeat(600)}</textarea></div>`],
  ])("never learns custom fields from %s", (_name, html) => {
    document.body.innerHTML = `<form>${html}</form>`;
    loadContentScripts({ smartfill_profile: { fields: {} } });
    submit();
    expect(storageSet()).not.toHaveBeenCalled();
  });
});
