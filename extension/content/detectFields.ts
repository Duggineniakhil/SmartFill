// SmartFill Content Script - Field Detection Engine
// Runs isolated in the webpage

const ALIASES = {
  full_name: ['full name', 'applicant name', 'your name', 'candidate name', 'name'],
  first_name: ['first name', 'given name', 'fname'],
  last_name: ['last name', 'family name', 'surname', 'lname'],
  email: ['email address', 'email', 'work email', 'personal email', 'e-mail'],
  phone: ['phone', 'mobile number', 'contact number', 'cell phone', 'phone number', 'tel', 'telephone'],
  address: ['address', 'street address', 'address line 1', 'home address', 'residential address'],
  city: ['city', 'town', 'municipality'],
  state: ['state', 'province', 'region', 'county'],
  country: ['country', 'nation'],
  postal_code: ['postal code', 'zip code', 'zip', 'post code', 'postcode'],
  linkedin: ['linkedin profile', 'linkedin url', 'linkedin'],
  github: ['github profile', 'github url', 'github'],
  portfolio: ['portfolio', 'personal website', 'website', 'blog url'],
  university: ['university', 'college', 'school', 'institution'],
  degree: ['degree', 'qualification', 'major', 'program of study'],
  graduation_year: ['graduation year', 'grad year', 'class of', 'year of graduation'],
  skills: ['skills', 'core competencies', 'technical skills', 'technologies'],
};

const FORBIDDEN = [
  'password', 'passwd', 'pwd', 'otp', 'one time', 'cvv', 'cvc', 'security code',
  'card number', 'credit card', 'ssn', 'social security', 'pin', 'verification code',
];

function normalize(s: string | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const COMMON_PLACEHOLDERS = new Set([
  'your answer',
  'short answer',
  'paragraph answer',
  'select an option',
  'choose',
  'choose an option',
  'answer',
  'optional',
]);

function isCommonPlaceholder(text: string): boolean {
  return COMMON_PLACEHOLDERS.has(normalize(text));
}

function addTextHint(target: FieldHints, text: string | null | undefined) {
  if (!text) return;
  if (isCommonPlaceholder(text)) return;
  const candidate = text.trim();
  if (!candidate) return;
  const existing = target.label.split('\n').map(normalize);
  if (!existing.includes(normalize(candidate))) {
    target.label += (target.label ? '\n' : '') + candidate;
  }
}

function elementText(node: Element): string {
  return ((node as HTMLElement).innerText || node.textContent || '').trim();
}

interface FieldHints {
  label: string;
  placeholder: string;
  name: string;
  id: string;
  ariaLabel: string;
}

function isForbidden(el: HTMLElement, hints: FieldHints): boolean {
  if ((el as HTMLInputElement).type === 'password') return true;
  const blob = normalize(hints.label + ' ' + hints.ariaLabel + ' ' + hints.placeholder + ' ' + hints.name + ' ' + hints.id);
  return FORBIDDEN.some((k) => blob.includes(k));
}

function fieldHints(el: HTMLElement): FieldHints {
  const hints: FieldHints = { label: '', placeholder: '', name: '', id: '', ariaLabel: '' };
  if ((el as HTMLInputElement).name) hints.name = (el as HTMLInputElement).name;
  if (el.id) hints.id = el.id;
  if ((el as HTMLInputElement).placeholder) hints.placeholder = (el as HTMLInputElement).placeholder;
  if (el.getAttribute && el.getAttribute('aria-label')) hints.ariaLabel = el.getAttribute('aria-label')!;

  try {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) addTextHint(hints, elementText(lbl));
    }
    const parentLabel = el.closest && el.closest('label');
    if (parentLabel) addTextHint(hints, elementText(parentLabel));

    const labelledBy = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) addTextHint(hints, elementText(node));
      }
    }

    const describedBy = el.getAttribute && el.getAttribute('aria-describedby');
    if (describedBy) {
      for (const id of describedBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) addTextHint(hints, elementText(node));
      }
    }

    let container: HTMLElement | null = el;
    for (let depth = 0; depth < 5 && container; depth += 1) {
      if (container !== el) {
        if (container.getAttribute('aria-labelledby')) {
          for (const id of container.getAttribute('aria-labelledby')!.split(/\s+/)) {
            const node = document.getElementById(id);
            if (node) addTextHint(hints, elementText(node));
          }
        }
        if (container.getAttribute('aria-label')) {
          addTextHint(hints, container.getAttribute('aria-label'));
        }
      }

      const heading = container.querySelector('[role="heading"], h1, h2, h3, h4, h5, h6, legend, .question-title, .freebirdFormviewerComponentsQuestionBaseTitle, .freebirdFormviewerComponentsQuestionBaseText, .M7eMe');
      if (heading) addTextHint(hints, elementText(heading));

      const childTexts = Array.from(container.querySelectorAll('label, legend, [role="heading"], [aria-level], .question-title, .freebirdFormviewerComponentsQuestionBaseTitle, .freebirdFormviewerComponentsQuestionBaseText, .M7eMe')) as HTMLElement[];
      for (const node of childTexts) {
        addTextHint(hints, elementText(node));
      }

      // The nearest labelled container owns this field. Going higher can mix in
      // labels from sibling questions, which is common in Google Forms.
      if (heading || childTexts.length > 0) break;

      container = container.parentElement;
    }
  } catch (_) {}

  return hints;
}

interface MatchResult {
  canonicalField: string | null;
  confidence: number;
}

function evaluateRules(inputTokens: string[]): MatchResult {
  let bestMatch: MatchResult = { canonicalField: null, confidence: 0 };

  for (const [canonicalField, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);

      for (const token of inputTokens) {
        if (!token) continue;

        if (token === normalizedAlias) {
          return { canonicalField, confidence: 0.95 };
        }

        if (normalizedAlias.length > 3 && token.length > 3) {
          if (token.includes(normalizedAlias) || normalizedAlias.includes(token)) {
            const ratio = Math.min(token.length, normalizedAlias.length) / Math.max(token.length, normalizedAlias.length);
            const confidence = 0.5 + (ratio * 0.3);

            if (confidence > bestMatch.confidence) {
              bestMatch = { canonicalField, confidence };
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

function classify(el: HTMLElement): MatchResult {
  const hints = fieldHints(el);

  if (isForbidden(el, hints)) {
    return { canonicalField: null, confidence: 0 };
  }

  const normalizedSources = {
    labels: hints.label.split('\n').map(normalize).filter(Boolean),
    ariaLabel: normalize(hints.ariaLabel),
    placeholder: normalize(hints.placeholder),
    name: normalize(hints.name),
    id: normalize(hints.id),
  };

  let result = evaluateRules([...normalizedSources.labels, normalizedSources.ariaLabel]);
  if (result.confidence >= 0.5) return result;

  result = evaluateRules([normalizedSources.placeholder]);
  if (result.confidence >= 0.5) return result;

  result = evaluateRules([normalizedSources.name, normalizedSources.id]);
  if (result.confidence >= 0.5) return result;

  return { canonicalField: null, confidence: 0 };
}

(window as any).__SMARTFILL__ = { classify, isForbidden, fieldHints, ALIASES };
