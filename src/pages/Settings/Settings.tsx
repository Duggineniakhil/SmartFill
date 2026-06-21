import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { exportAllData, importAllData, deleteProfile } from "@/services/storage/chromeStorage";
import { toast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, Sun, Moon, Zap, Save,
  Trash2, Download, Upload, Loader2, AlertTriangle,
} from "lucide-react";

export default function Settings() {
  const { settings, updateSettings, clearAllData, refreshProfile } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Theme ──────────────────────────────────────────────
  const handleThemeChange = (value: string) => {
    const newTheme = value as "light" | "dark";
    updateSettings({ ...settings, theme: newTheme });
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // ─── Toggles ────────────────────────────────────────────
  const toggleAutoFill = () => {
    const next = !settings.autoFillEnabled;
    updateSettings({ ...settings, autoFillEnabled: next });
    toast({ title: next ? "Auto-fill enabled" : "Auto-fill disabled" });
  };

  const toggleAutoSave = () => {
    const next = !settings.autoSaveEnabled;
    updateSettings({ ...settings, autoSaveEnabled: next });
    toast({ title: next ? "Auto-save enabled" : "Auto-save disabled" });
  };

  // ─── Export ─────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `smartfill-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Data exported", description: "Your profile data has been downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ─── Import ─────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      await importAllData(text);
      await refreshProfile();
      toast({ title: "Data imported", description: "Profile data restored successfully." });
    } catch {
      toast({ title: "Import failed", description: "Invalid backup file.", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Clear ──────────────────────────────────────────────
  const handleClear = async () => {
    setClearing(true);
    await clearAllData();
    toast({ title: "All data cleared", description: "Your stored profile has been deleted." });
    setClearing(false);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 md:px-6 h-11 border-b border-border flex items-center shrink-0">
          <h1 className="text-[13px] font-medium">Settings</h1>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-lg divide-y divide-border">
            {/* Appearance */}
            <div className="px-4 md:px-6 py-4">
              <p className="text-[12px] text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5" /> Appearance
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[13px]">Theme</span>
                <Select value={settings.theme} onValueChange={handleThemeChange}>
                  <SelectTrigger className="w-[100px] h-7 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Autofill */}
            <div className="px-4 md:px-6 py-4">
              <p className="text-[12px] text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Autofill Behavior
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[13px]">Auto-fill</span>
                    <p className="text-[11px] text-muted-foreground">Automatically show fill suggestions on forms</p>
                  </div>
                  <Switch checked={settings.autoFillEnabled} onCheckedChange={toggleAutoFill} className="scale-90" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[13px]">Auto-save</span>
                    <p className="text-[11px] text-muted-foreground">Learn new fields when you submit forms</p>
                  </div>
                  <Switch checked={settings.autoSaveEnabled} onCheckedChange={toggleAutoSave} className="scale-90" />
                </div>
              </div>
            </div>

            {/* Data Management */}
            <div className="px-4 md:px-6 py-4">
              <p className="text-[12px] text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
                <Save className="h-3.5 w-3.5" /> Data Management
              </p>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-[12px]" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Export profile data
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-[12px]" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Import profile data
                </Button>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              </div>
            </div>

            {/* Danger Zone */}
            <div className="px-4 md:px-6 py-4">
              <p className="text-[12px] text-destructive font-medium mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
              </p>
              <div className="flex items-center justify-between border border-destructive/20 rounded-md p-3">
                <div>
                  <p className="text-[13px] font-medium">Clear all stored data</p>
                  <p className="text-[12px] text-muted-foreground">Permanently delete your autofill profile.</p>
                </div>
                <Button variant="destructive" size="sm" className="h-7 text-[12px] gap-1" onClick={handleClear} disabled={clearing}>
                  {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
