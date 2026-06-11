// SmartFill - Field Matcher Service

export interface MatchResult {
  canonicalField: string | null;
  confidence: number;
  matchSource?: string;
  matchedAlias?: string;
}

export interface PartialInputInfo {
  label?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
}

// Phase 1: Rule-based aliases
const FIELD_ALIASES: Record<string, string[]> = {
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

// Normalize string for matching
function normalize(str: string | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, ' ') // Condense whitespace
    .trim();
}

function evaluateRules(inputTokens: string[]): MatchResult {
  let bestMatch: MatchResult = { canonicalField: null, confidence: 0 };

  for (const [canonicalField, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      
      for (const token of inputTokens) {
        if (!token) continue;
        
        // Exact match
        if (token === normalizedAlias) {
          return { canonicalField, confidence: 0.95, matchedAlias: alias };
        }

        // Partial match (e.g., token contains alias or alias contains token)
        // We only consider it a partial match if it's reasonably long to avoid false positives
        if (normalizedAlias.length > 3 && token.length > 3) {
          if (token.includes(normalizedAlias) || normalizedAlias.includes(token)) {
             // Calculate a simple confidence based on string length ratio
             const ratio = Math.min(token.length, normalizedAlias.length) / Math.max(token.length, normalizedAlias.length);
             const confidence = 0.5 + (ratio * 0.3); // Base 0.5, max 0.8 for partial
             
             if (confidence > bestMatch.confidence) {
               bestMatch = { canonicalField, confidence, matchedAlias: alias };
             }
          }
        }
      }
    }
  }

  return bestMatch;
}

export function matchField(input: HTMLElement | PartialInputInfo): MatchResult {
  let info: PartialInputInfo = {};

  if (input instanceof HTMLElement) {
    // In a real content script, extract from DOM element
    // For now, we cast assuming it's an input-like element
    const el = input as any;
    info = {
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      // Note: extracting label from real DOM is more complex (finding associated <label> or traversing tree)
    };
  } else {
    // Used for dashboard testing
    info = input;
  }

  // Normalize all available sources
  const normalizedSources = {
    label: normalize(info.label),
    ariaLabel: normalize(info.ariaLabel),
    placeholder: normalize(info.placeholder),
    name: normalize(info.name),
    id: normalize(info.id),
  };

  // Evaluate rules against all sources, prioritizing them
  // 1. Label/AriaLabel are usually the most descriptive
  let result = evaluateRules([normalizedSources.label, normalizedSources.ariaLabel]);
  if (result.confidence > 0) {
    result.matchSource = 'Label / Aria-Label';
    return result;
  }

  // 2. Placeholder
  result = evaluateRules([normalizedSources.placeholder]);
  if (result.confidence > 0) {
    result.matchSource = 'Placeholder';
    return result;
  }

  // 3. Name / ID (often technical, e.g., 'first_name', 'usr_eml')
  result = evaluateRules([normalizedSources.name, normalizedSources.id]);
  if (result.confidence > 0) {
     result.matchSource = 'Name / ID attributes';
     return result;
  }

  // Phase 2 (Future): if confidence < threshold, call evaluateEmbeddings(info) here

  return { canonicalField: null, confidence: 0 };
}
