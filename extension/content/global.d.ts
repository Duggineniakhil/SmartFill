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

  interface SmartFillApplication {
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
      tracker?: {
        jobInfo: () => Promise<{ job: SmartFillJobInfo; application: SmartFillApplication | null } | null>;
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
