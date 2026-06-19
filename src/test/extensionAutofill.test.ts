import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SmartFill content scripts", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div role="listitem">
        <div role="heading" class="M7eMe">Name <span>*</span></div>
        <input aria-label="Your answer" placeholder="Your answer" />
      </div>
      <div role="listitem">
        <div role="heading" class="M7eMe">Email <span>*</span></div>
        <input aria-label="Your answer" placeholder="Your answer" />
      </div>
      <div role="listitem">
        <div role="heading" class="M7eMe">Phone Number <span>*</span></div>
        <input aria-label="Your answer" placeholder="Your answer" />
      </div>
    `;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 40,
      top: 0,
      right: 300,
      bottom: 40,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  it("fills Google Forms-style fields from the saved profile", () => {
    let messageListener: ((message: unknown, sender: unknown, send: (response: unknown) => void) => boolean) | undefined;
    const chromeMock = {
      storage: {
        local: {
          get: (_keys: unknown, callback: (data: unknown) => void) => callback({
            smartfill_profile: {
              fields: {
                full_name: "Duggineni Akhil",
                email: "akhilwork611@gmail.com",
                phone: "9876543210",
              },
            },
            smartfill_settings: { autoFillEnabled: false, autoSaveEnabled: true },
          }),
          set: vi.fn(),
        },
      },
      runtime: {
        onMessage: {
          addListener: (listener: typeof messageListener) => { messageListener = listener; },
        },
      },
    };

    Object.assign(window, {
      chrome: chromeMock,
      ResizeObserver: class { observe() {} },
    });

    window.eval(readFileSync(resolve("extension/content/detectFields.js"), "utf8"));
    window.eval(readFileSync(resolve("extension/content/autofill.js"), "utf8"));

    let response: { filled: number } | undefined;
    messageListener?.(
      { type: "SMARTFILL_FILL_NOW" },
      {},
      (value) => { response = value as { filled: number }; },
    );

    const values = Array.from(document.querySelectorAll("input"), (input) => input.value);
    expect(values).toEqual(["Duggineni Akhil", "akhilwork611@gmail.com", "9876543210"]);
    expect(response).toEqual({ filled: 3 });
  });
});
