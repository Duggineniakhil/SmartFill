import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, type UserProfile } from "@/services/storage/chromeStorage";
import { Loader2, Database, Clock, Hash } from "lucide-react";

export default function Dashboard() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const fields = profile?.fields ? Object.entries(profile.fields) : [];
  const fieldCount = fields.length;
  const lastUpdated = profile?.updated_at
    ? new Date(profile.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Profile Viewer</h1>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border rounded-md overflow-hidden">
              <div className="bg-background p-4 flex items-center gap-3">
                <Database className="h-4 w-4 text-cyan-400" />
                <div>
                  <p className="text-[12px] text-muted-foreground">Stored fields</p>
                  <p className="text-2xl font-medium mt-0.5">{fieldCount}</p>
                </div>
              </div>
              <div className="bg-background p-4 flex items-center gap-3">
                <Hash className="h-4 w-4 text-cyan-400" />
                <div>
                  <p className="text-[12px] text-muted-foreground">Profile name</p>
                  <p className="text-lg font-medium mt-0.5">{profile?.full_name || "Not set"}</p>
                </div>
              </div>
              <div className="bg-background p-4 flex items-center gap-3">
                <Clock className="h-4 w-4 text-cyan-400" />
                <div>
                  <p className="text-[12px] text-muted-foreground">Last updated</p>
                  <p className="text-[13px] font-medium mt-0.5">{lastUpdated}</p>
                </div>
              </div>
            </div>

            {/* Fields table */}
            {fieldCount === 0 ? (
              <div className="border border-dashed border-border rounded-md p-12 text-center">
                <Database className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-[13px] text-muted-foreground">
                  No autofill data stored yet.
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Fill a form on any website with the SmartFill extension enabled to start learning.
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Field</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Stored Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(([key, value]) => (
                      <tr key={key} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[12px]">{key}</td>
                        <td className="px-3 py-2 font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
