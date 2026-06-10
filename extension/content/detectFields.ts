// Canonical field aliases. Lowercase, no punctuation.
const ALIASES = {
  full_name: ["name", "full name", "fullname", "applicant name", "your name", "first and last name", "candidate name"],
  first_name: ["first name", "given name", "fname"],
  last_name: ["last name", "surname", "family name", "lname"],
  email: ["email", "email address", "personal email", "contact email", "work email", "e-mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "cell", "contact number", "telephone"],
  college: ["college", "university", "school", "institution", "alma mater"],
  degree: ["degree", "qualification", "program"],
  cgpa: ["cgpa", "gpa", "current gpa", "academic score", "grade point"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile"],
  github: ["github", "github url", "github profile", "portfolio github"],
  portfolio: ["portfolio", "website", "personal website", "portfolio url"],
  address: ["address", "street address", "mailing address"],
  city: ["city", "town"],
  country: ["country", "nationality"],
  zip: ["zip", "zip code", "postal code", "postcode"],
  resume: ["resume", "cv", "resume url", "cv link"],
};

const FORBIDDEN = [
  "password", "passwd", "pwd", "otp", "one time", "cvv", "cvc", "security code",
  "card number", "credit card", "ssn", "social security", "pin", "verification code"
];

function normalize(s) {
  return (s || "").toString().toLowerCase().replace(/[_\-\[\]\(\):*?]/g, " ").replace(/\s+/g, " ").trim();
}

function isForbidden(el, hints) {
  if (el && el.type === "password") return true;
  const blob = normalize(hints.join(" "));
  return FORBIDDEN.some(k => blob.includes(k));
}

function fieldHints(el) {
  const hints = [];
  if (el.name) hints.push(el.name);
  if (el.id) hints.push(el.id);
  if (el.placeholder) hints.push(el.placeholder);
  if (el.getAttribute && el.getAttribute("aria-label")) hints.push(el.getAttribute("aria-label"));
  if (el.getAttribute && el.getAttribute("autocomplete")) hints.push(el.getAttribute("autocomplete"));
  if (el.type) {
    if (el.type === "email") hints.push("email");
    if (el.type === "tel") hints.push("phone");
    if (el.type === "url") hints.push("url");
  }
  // Find associated label
  try {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) hints.push(lbl.innerText);
    }
    const parentLabel = el.closest && el.closest("label");
    if (parentLabel) hints.push(parentLabel.innerText);
    // aria-labelledby (Google Forms, many SPAs)
    const labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) hints.push(node.innerText);
      }
    }
    const describedBy = el.getAttribute && el.getAttribute("aria-describedby");
    if (describedBy) {
      for (const id of describedBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) hints.push(node.innerText);
      }
    }
    // Walk up to a likely question container and grab heading text.
    // Covers Google Forms (role="listitem"), generic form-row patterns.
    const container = el.closest('[role="listitem"], [role="group"], .freebirdFormviewerComponentsQuestionBaseRoot, fieldset, .form-group, .field, li, .question');
    if (container) {
      const heading = container.querySelector('[role="heading"], h1, h2, h3, h4, h5, h6, legend, .question-title, .freebirdFormviewerComponentsQuestionBaseTitle');
      if (heading && heading.innerText) hints.push(heading.innerText);
    }
  } catch (_) {}
  return hints.filter(Boolean);
}

function classify(el) {
  const hints = fieldHints(el);
  if (isForbidden(el, hints)) return null;
  const blob = normalize(hints.join(" "));
  if (!blob) return null;
  // Score each canonical key by best alias substring match.
  let best = { key: null, score: 0 };
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      const an = normalize(a);
      if (blob === an) { if (10 > best.score) best = { key, score: 10 }; continue; }
      if (blob.includes(an)) {
        const s = an.length + (blob.split(" ").includes(an) ? 2 : 0);
        if (s > best.score) best = { key, score: s };
      } else if (an.includes(blob) && blob.length >= 3) {
        if (blob.length > best.score) best = { key, score: blob.length };
      }
    }
  }
  return best.key;
}

window.__AUTOFLOW__ = { classify, isForbidden, fieldHints, ALIASES };