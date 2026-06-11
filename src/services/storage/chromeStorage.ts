// SmartFill — chrome.storage.local wrapper
// Works in both Chrome extension context and web context (falls back to localStorage)

export interface UserProfile {
  full_name: string;
  fields: Record<string, string>; // canonical_field → value (e.g. "email" → "jane@example.com")
  updated_at: string;
}

export interface AppSettings {
  theme: "light" | "dark";
  autoFillEnabled: boolean;
  autoSaveEnabled: boolean;
}

const PROFILE_KEY = "smartfill_profile";
const SETTINGS_KEY = "smartfill_settings";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  autoFillEnabled: true,
  autoSaveEnabled: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isChromeExtension(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.storage !== "undefined" &&
    typeof chrome.storage.local !== "undefined"
  );
}

async function storageGet<T>(key: string): Promise<T | null> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve((result[key] as T) ?? null);
      });
    });
  }
  // Fallback: localStorage (for web dev server)
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function storageSet(key: string, value: unknown): Promise<void> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  localStorage.setItem(key, JSON.stringify(value));
}

async function storageRemove(key: string): Promise<void> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => resolve());
    });
  }
  localStorage.removeItem(key);
}

// ─── Profile ────────────────────────────────────────────────────────────────────

export async function saveProfile(profile: UserProfile): Promise<void> {
  await storageSet(PROFILE_KEY, { ...profile, updated_at: new Date().toISOString() });
}

export async function getProfile(): Promise<UserProfile | null> {
  return storageGet<UserProfile>(PROFILE_KEY);
}

export async function updateProfile(partial: Partial<UserProfile>): Promise<void> {
  const existing = await getProfile();
  const merged: UserProfile = {
    full_name: partial.full_name ?? existing?.full_name ?? "",
    fields: { ...(existing?.fields ?? {}), ...(partial.fields ?? {}) },
    updated_at: new Date().toISOString(),
  };
  await storageSet(PROFILE_KEY, merged);
}

export async function deleteProfile(): Promise<void> {
  await storageRemove(PROFILE_KEY);
}

// ─── Settings ───────────────────────────────────────────────────────────────────

export async function saveSettings(settings: AppSettings): Promise<void> {
  await storageSet(SETTINGS_KEY, settings);
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await storageGet<AppSettings>(SETTINGS_KEY);
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS };
}

// ─── Export / Import ────────────────────────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const profile = await getProfile();
  const settings = await getSettings();
  return JSON.stringify({ profile, settings, exported_at: new Date().toISOString() }, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (data.profile) await saveProfile(data.profile);
  if (data.settings) await saveSettings(data.settings);
}
