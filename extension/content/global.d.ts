export {};

declare global {
  interface Window {
    __SMARTFILL__: {
      classify: (el: HTMLElement) => { canonicalField: string | null; confidence: number };
      isForbidden: (el: HTMLElement, hints: any) => boolean;
      fieldHints: (el: HTMLElement) => any;
      ALIASES: Record<string, string[]>;
    };
  }
  declare const chrome: any;
}
