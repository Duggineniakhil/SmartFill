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

function fillNow(listener: Listener) {
  let response: unknown;
  listener({ type: "SMARTFILL_FILL_NOW" }, {}, (value) => { response = value; });
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

  it("fills only matches at or above the 0.75 threshold", () => {
    const response = fillNow(loadContentScripts(profile));
    expect(value("a")).toBe("Ada Lovelace");
    expect(value("b")).toBe("Cambridge");
    // "Company Name" only weakly matches full_name, so it must stay empty.
    expect(value("c")).toBe("");
    expect(value("d")).toBe("ada@example.com");
    expect(response).toEqual({ filled: 3 });
  });

  it("does nothing when SmartFill is disabled", () => {
    const response = fillNow(loadContentScripts({ ...profile, enabled: false }));
    expect(["a", "b", "c", "d"].map(value)).toEqual(["", "", "", ""]);
    expect(response).toEqual({ filled: 0, disabled: true });
  });
});
