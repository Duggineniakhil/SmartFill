import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function loadScripts(storage: Record<string, unknown>) {
  Object.assign(window, {
    __SMARTFILL__: undefined,
    chrome: {
      storage: {
        local: {
          get: (_keys: unknown, callback: (data: unknown) => void) => callback(storage),
          set: vi.fn(),
        },
      },
      runtime: { onMessage: { addListener: () => {} } },
    },
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  window.eval(readFileSync(resolve("extension/content/detectFields.js"), "utf8"));
  window.eval(readFileSync(resolve("extension/content/autofill.js"), "utf8"));
}

const statusOf = (id: string) => (document.getElementById(id) as HTMLElement).dataset.smartfillStatus;

describe("SmartFill field status outlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0, x: 0, y: 0, toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("marks filled fields green and recognised fields with no saved value red", () => {
    document.body.innerHTML = `
      <form>
        <div><label for="name">Full name</label><input id="name" /></div>
        <div><label for="email">Email</label><input id="email" /></div>
        <div><label for="phone">Phone number</label><input id="phone" /></div>
        <div><label for="why">Why do you want to work here?</label><textarea id="why" required></textarea></div>
        <div><label for="notes">Anything else?</label><textarea id="notes"></textarea></div>
      </form>`;
    loadScripts({
      smartfill_profile: { fields: { full_name: "Ada Lovelace", email: "ada@example.com" } },
      smartfill_settings: { autoFillEnabled: true },
    });
    vi.advanceTimersByTime(300);

    expect(statusOf("name")).toBe("filled");
    expect(statusOf("email")).toBe("filled");
    expect(statusOf("phone")).toBe("missing");
    expect(statusOf("why")).toBe("missing");
    expect(statusOf("notes")).toBeUndefined();
    expect((document.getElementById("name") as HTMLElement).style.getPropertyValue("outline")).toContain("solid");
    expect((document.getElementById("phone") as HTMLElement).title).toMatch(/nothing saved/);
  });

  it("marks weaker suggestions amber", () => {
    document.body.innerHTML = `
      <form>
        <div><label for="name">Full name</label><input id="name" /></div>
        <div><label for="motivation">Why do you want this role at Acme?</label><input id="motivation" /></div>
      </form>`;
    loadScripts({
      smartfill_profile: {
        fields: { full_name: "Ada Lovelace" },
        custom: { "why do you want this role": { label: "Why do you want this role?", value: "Because.", updated_at: "2026-01-01" } },
      },
      smartfill_settings: { autoFillEnabled: true },
    });
    vi.advanceTimersByTime(300);

    expect(statusOf("name")).toBe("filled");
    expect(statusOf("motivation")).toBe("review");
  });

  it("does not paint pages SmartFill has nothing to fill on", () => {
    document.body.innerHTML = `
      <form>
        <div><label for="email">Email</label><input id="email" required /></div>
        <div><label for="msg">Message</label><textarea id="msg" required></textarea></div>
      </form>`;
    loadScripts({ smartfill_profile: { fields: {} }, smartfill_settings: { autoFillEnabled: true } });
    vi.advanceTimersByTime(300);

    expect(statusOf("email")).toBeUndefined();
    expect(statusOf("msg")).toBeUndefined();
  });
});
