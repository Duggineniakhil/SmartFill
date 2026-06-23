/// <reference types="vite/client" />

interface ViteChromeStorageArea {
  get: (keys: unknown, callback: (data: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
}

interface ViteChromeApi {
  storage?: {
    local: ViteChromeStorageArea;
  };
}

declare const chrome: ViteChromeApi | undefined;
