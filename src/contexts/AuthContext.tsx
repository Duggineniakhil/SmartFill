import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getProfile,
  saveProfile,
  updateProfile,
  deleteProfile,
  getSettings,
  saveSettings,
  type UserProfile,
  type AppSettings,
} from "@/services/storage/chromeStorage";

interface AuthContextType {
  profile: UserProfile | null;
  settings: AppSettings;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateUserProfile: (partial: Partial<UserProfile>) => Promise<void>;
  clearAllData: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>({
    theme: "dark",
    autoFillEnabled: true,
    autoSaveEnabled: true,
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [p, s] = await Promise.all([getProfile(), getSettings()]);
    setProfile(p);
    setSettingsState(s);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const refreshProfile = async () => {
    const p = await getProfile();
    setProfile(p);
  };

  const updateUserProfile = async (partial: Partial<UserProfile>) => {
    await updateProfile(partial);
    await refreshProfile();
  };

  const clearAllData = async () => {
    await deleteProfile();
    setProfile(null);
  };

  const updateSettings = async (newSettings: AppSettings) => {
    await saveSettings(newSettings);
    setSettingsState(newSettings);
  };

  return (
    <AuthContext.Provider
      value={{ profile, settings, loading, refreshProfile, updateUserProfile, clearAllData, updateSettings }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
