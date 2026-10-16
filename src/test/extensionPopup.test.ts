import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const popupHtml = readFileSync(resolve("extension/popup/popup.html"), "utf8");

function loadPopup(fields: Record<string, string>) {
  document.body.innerHTML = new DOMParser().parseFromString(popupHtml, "text/html").body.innerHTML;
  Object.assign(window, {
    chrome: {
      storage: {
        local: {
          get: (defaults: Record<string, unknown>, callback: (data: unknown) => void) =>
            callback({ ...defaults, smartfill_profile: { fields } }),
          set: vi.fn(),
        },
      },
    },
  });
  window.eval(readFileSync(resolve("extension/popup/popup.js"), "utf8"));
}

describe("popup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders stored values as text, not HTML", () => {
    const payload = `<img src=x onerror="window.__pwned=1">"quoted"`;
    loadPopup({ full_name: payload, "<b>key</b>": "v" });

    const container = document.getElementById("profile")!;
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();

    const vals = Array.from(container.querySelectorAll(".val"));
    expect(vals[0].textContent).toBe(payload);
    expect(vals[0].getAttribute("title")).toBe(payload);
    expect(Array.from(container.querySelectorAll(".key"), (k) => k.textContent)).toEqual(["Full name", "<b>key</b>"]);
  });

  it("offers resume and cgpa in the add/edit select", () => {
    loadPopup({});
    const options = Array.from(document.querySelectorAll("#newKey option"), (o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(expect.arrayContaining(["resume", "cgpa"]));
  });

  it("popup.js is in sync with popup.tsx", () => {
    // popup.js is generated from popup.tsx (tsconfig only compiles content/**),
    // so guard against editing one without the other.
    const js = readFileSync(resolve("extension/popup/popup.js"), "utf8");
    expect(js).not.toMatch(/\.innerHTML\s*=/);
    expect(js).toContain("SmartFill is disabled");
  });
});
