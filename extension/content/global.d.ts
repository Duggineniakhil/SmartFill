export {};

declare global {
  interface SmartFillFieldHints {
    label: string;
    placeholder: string;
    name: string;
    id: string;
    ariaLabel: string;
  }

  interface SmartFillMatchResult {
    canonicalField: string | null;
    confidence: number;
  }

  interface SmartFillCustomField {
    label: string;
    value: string;
    updated_at: string;
  }

  interface SmartFillProfile {
    fields?: Record<string, string>;
    // Fields with no canonical type, keyed by normalized label text.
    custom?: Record<string, SmartFillCustomField>;
    updated_at?: string;
    [key: string]: unknown;
  }

  interface SmartFillSettings {
    autoFillEnabled?: boolean;
    autoSaveEnabled?: boolean;
  }

  type SmartFillApplicationStatus = "interested" | "applied" | "interview" | "offer" | "rejected" | "withdrawn";

  interface SmartFillJobInfo {
    key: string;
    url: string;
    title: string;
    company: string;
    location: string;
    platform: string;
  }

  interface SmartFillSkillRef { id: string; label: string }

  interface SmartFillRequirements {
    required: SmartFillSkillRef[];
    preferred: SmartFillSkillRef[];
    years: number | null;
    degree: number | null; // 1 diploma, 2 bachelor's, 3 master's, 4 PhD
  }

  interface SmartFillUserFacts {
    skills: SmartFillSkillRef[];
    years: number | null;
    yearsSource: "profile" | "cv" | "dates" | null;
    degree: number | null;
    hasData: boolean;
  }

  interface SmartFillMatch {
    score: number | null;
    level: "strong" | "partial" | "weak" | "none";
    matched: string[];
    missing: string[];
    missingPreferred: string[];
    yearsNote: string | null;
    degreeNote: string | null;
    lowConfidence: boolean;
    needsProfile: boolean;
  }

  interface SmartFillResume { text: string; updated_at: string }

  interface SmartFillApplication {
    requirements?: SmartFillRequirements;
    id: string;
    url: string;
    title: string;
    company: string;
    location: string;
    platform: string;
    status: SmartFillApplicationStatus;
    createdAt: string;
    updatedAt: string;
    appliedAt?: string;
    history: Array<{ status: SmartFillApplicationStatus; at: string }>;
    notes: string;
  }

  interface SmartFillStorageData {
    smartfill_applications?: Record<string, SmartFillApplication>;
    smartfill_resume?: SmartFillResume;
    smartfill_job_requirements?: Record<string, { requirements: SmartFillRequirements; at: string }>;
    profile?: Record<string, string>;
    smartfill_profile?: SmartFillProfile;
    smartfill_settings?: SmartFillSettings;
    enabled?: boolean;
    autoFill?: boolean;
  }

  interface ChromeApi {
    storage: {
      local: {
        get: (
          keys: string | string[] | SmartFillStorageData,
          callback: (data: SmartFillStorageData) => void,
        ) => void;
        set: (items: Record<string, unknown>, callback?: () => void) => void;
      };
      onChanged: {
        addListener: (callback: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void) => void;
      };
    };
    runtime: {
      lastError?: Error;
      getURL: (path: string) => string;
      onMessage: {
        addListener: (
          callback: (
            message: unknown,
            sender: unknown,
            sendResponse: (response?: unknown) => void,
          ) => boolean | void,
        ) => void;
      };
    };
    tabs: {
      query: (queryInfo: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string }>>;
      create: (details: { url: string }) => Promise<unknown>;
      sendMessage: (tabId: number, message: unknown, callback: (response: unknown) => void) => void;
    };
    scripting: {
      executeScript: <T = unknown>(details: {
        target: { tabId: number; allFrames?: boolean; frameIds?: number[] };
        files?: string[];
        func?: (...args: never[]) => T | Promise<T>;
        args?: unknown[];
      }) => Promise<Array<{ frameId?: number; result?: Awaited<T> }>>;
    };
  }

  interface Window {
    __SMARTFILL__: {
      classify: (el: HTMLElement) => SmartFillMatchResult;
      isForbidden: (el: HTMLElement, hints: SmartFillFieldHints) => boolean;
      fieldHints: (el: HTMLElement) => SmartFillFieldHints;
      customFieldKey: (el: HTMLElement) => { key: string; label: string } | null;
      labelSimilarity: (a: string, b: string) => number;
      ALIASES: Record<string, string[]>;
      fillNow?: () => Promise<{ filled: number; disabled?: boolean }>;
      match?: {
        extractRequirements: (text: string, userSkills?: string) => SmartFillRequirements;
        userFacts: (fields?: Record<string, string>, resume?: string) => SmartFillUserFacts;
        score: (req: SmartFillRequirements, facts: SmartFillUserFacts) => SmartFillMatch;
        yearsFromRanges: (text: string, now?: Date) => number | null;
      };
      tracker?: {
        jobInfo: () => Promise<{
          job: SmartFillJobInfo;
          application: SmartFillApplication | null;
          requirements: SmartFillRequirements | null;
        } | null>;
        pageRequirements: () => Promise<SmartFillRequirements | null>;
        jobDescription: (doc: Document) => string;
        track: (status: SmartFillApplicationStatus) => Promise<SmartFillApplication | null>;
        jobKey: (href: string) => string;
        jobLink: (href: string) => string;
        extractJob: (doc: Document, href: string) => SmartFillJobInfo;
        isJobPage: (doc: Document, href: string) => boolean;
        mergeApplication: (
          existing: SmartFillApplication | undefined,
          job: SmartFillJobInfo,
          status: SmartFillApplicationStatus,
          now: string,
        ) => SmartFillApplication;
        splitTitle: (raw: string) => { title: string; company: string };
      };
    };
  }
  declare const chrome: ChromeApi;
}
