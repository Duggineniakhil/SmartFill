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

  interface SmartFillStorageData {
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
    };
    runtime: {
      lastError?: Error;
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
      query: (queryInfo: Record<string, unknown>) => Promise<Array<{ id?: number }>>;
      sendMessage: (tabId: number, message: unknown, callback: (response: unknown) => void) => void;
    };
    scripting: {
      executeScript: <T = unknown>(details: {
        target: { tabId: number; allFrames?: boolean; frameIds?: number[] };
        files?: string[];
        func?: () => T | Promise<T>;
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
    };
  }
  declare const chrome: ChromeApi;
}
