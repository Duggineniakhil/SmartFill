import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { matchField } from "@/services/autofill/fieldMatcher";

type Classify = (el: HTMLElement) => { canonicalField: string | null; confidence: number };
type IsForbidden = (el: HTMLElement, hints: Record<string, string>) => boolean;

let classify: Classify;
let isForbidden: IsForbidden;

beforeAll(() => {
  window.eval(readFileSync(resolve("extension/content/detectFields.js"), "utf8"));
  ({ classify, isForbidden } = (window as unknown as { __SMARTFILL__: { classify: Classify; isForbidden: IsForbidden } }).__SMARTFILL__);
});

function labelled(label: string): HTMLInputElement {
  document.body.innerHTML = `<label for="f">${label}</label><input id="f" />`;
  return document.getElementById("f") as HTMLInputElement;
}

const hints = (overrides: Record<string, string>) => ({ label: "", placeholder: "", name: "", id: "", ariaLabel: "", ...overrides });

describe("alias matching: generic 'name'", () => {
  it.each([
    ["College Name", "university"],
    ["School Name", "university"],
    ["University Name", "university"],
  ])("classifies %s as %s, not full_name", (label, expected) => {
    expect(matchField({ label }).canonicalField).toBe(expected);
    expect(classify(labelled(label)).canonicalField).toBe(expected);
  });

  it.each(["Company Name", "Father's Name", "Project Name"])("keeps %s below the 0.75 autofill threshold", (label) => {
    expect(matchField({ label }).confidence).toBeLessThan(0.75);
    expect(classify(labelled(label)).confidence).toBeLessThan(0.75);
  });

  it.each([
    ["Name", 0.95],
    ["Full Name", 0.95],
    ["Name of applicant", 0.85],
    ["Full Name (as on ID)", 0.85],
  ])("still classifies %s as full_name", (label, confidence) => {
    expect(matchField({ label })).toMatchObject({ canonicalField: "full_name", confidence });
    expect(classify(labelled(label))).toEqual({ canonicalField: "full_name", confidence });
  });

  it("prefers the longer alias on a confidence tie", () => {
    // 'phone' and 'phone number' both whole-word match; the longer one is reported.
    expect(matchField({ label: "Your phone number please" }).matchedAlias).toBe("phone number");
  });

  it("dashboard matcher and content script agree", () => {
    const labels = [
      "College Name", "Company Name", "Name", "Email Address", "Phone Number", "Shipping Address",
      "LinkedIn Profile URL", "Graduation Year", "Resume Drive Link", "CGPA", "Username", "Student Name",
    ];
    for (const label of labels) {
      const dashboard = matchField({ label });
      const content = classify(labelled(label));
      // classify() drops matches under 0.5; compare only the matches it keeps.
      if (dashboard.confidence < 0.5) {
        expect(content.canonicalField, label).toBeNull();
      } else {
        expect(content, label).toEqual({ canonicalField: dashboard.canonicalField, confidence: dashboard.confidence });
      }
    }
  });
});

describe("FORBIDDEN list", () => {
  const input = document.createElement("input");

  it.each(["Shipping Address", "Footprint", "Spinner color", "Hotpot preference", "Opinion"])(
    "does not block %s",
    (label) => {
      expect(isForbidden(input, hints({ label }))).toBe(false);
    },
  );

  it.each([
    hints({ label: "PIN" }),
    hints({ label: "Enter OTP" }),
    hints({ label: "CVV" }),
    hints({ label: "Card Number" }),
    hints({ placeholder: "One time code" }),
    hints({ name: "otpCode" }),
    hints({ id: "cardNumber" }),
    hints({ name: "newpassword" }),
    hints({ name: "user_pwd" }),
  ])("blocks %o", (h) => {
    expect(isForbidden(input, h)).toBe(true);
  });

  it("classify returns no match for a forbidden field", () => {
    expect(classify(labelled("Enter OTP"))).toEqual({ canonicalField: null, confidence: 0 });
    expect(classify(labelled("Shipping Address")).canonicalField).toBe("address");
  });
});
