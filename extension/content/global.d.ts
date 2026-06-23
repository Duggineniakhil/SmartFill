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

  interface SmartFillProfile {
    fields?: Record<string, string>;
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
      executeScript: (details: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
    };
  }

  interface Window {
    __SMARTFILL__: {
      classify: (el: HTMLElement) => SmartFillMatchResult;
      isForbidden: (el: HTMLElement, hints: SmartFillFieldHints) => boolean;
      fieldHints: (el: HTMLElement) => SmartFillFieldHints;
      ALIASES: Record<string, string[]>;
    };
  }
  declare const chrome: ChromeApi;
}
