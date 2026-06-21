import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";

import { Loader2, Database, Clock, Hash, TestTube, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { matchField, type MatchResult } from "@/services/autofill/fieldMatcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const { profile, loading } = useAuth();
  
  // Tester state
  const [testInput, setTestInput] = useState({ label: "", placeholder: "", name: "", id: "" });
  const [matchResult, setMatchResult] = useState<MatchResult>({ canonicalField: null, confidence: 0 });

  useEffect(() => {
    // Run matcher whenever inputs change
    const result = matchField(testInput);
    setMatchResult(result);
  }, [testInput]);

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
                        <td className="px-3 py-2 font-medium">{value as string}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Field Matcher Tester */}
            <div className="mt-12 pt-8 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <TestTube className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-medium">Smart Field Detection Tester</h2>
              </div>
              <p className="text-[13px] text-muted-foreground mb-6">
                Type into the fields below to see how the matcher scores and resolves the canonical field.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Inputs */}
                <div className="space-y-4 p-4 border border-border rounded-md bg-muted/10">
                  <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Mock Form Input</h3>
                  <div className="space-y-2">
                    <Label className="text-[12px]">Label text</Label>
                    <Input 
                      placeholder="e.g. Applicant Name" 
                      value={testInput.label}
                      onChange={(e) => setTestInput({...testInput, label: e.target.value})}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px]">Placeholder</Label>
                    <Input 
                      placeholder="e.g. Jane Doe" 
                      value={testInput.placeholder}
                      onChange={(e) => setTestInput({...testInput, placeholder: e.target.value})}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[12px]">Name attribute</Label>
                      <Input 
                        placeholder="e.g. first_name" 
                        value={testInput.name}
                        onChange={(e) => setTestInput({...testInput, name: e.target.value})}
                        className="h-8 text-[13px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[12px]">ID attribute</Label>
                      <Input 
                        placeholder="e.g. input-name" 
                        value={testInput.id}
                        onChange={(e) => setTestInput({...testInput, id: e.target.value})}
                        className="h-8 text-[13px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div className="p-4 border border-border rounded-md bg-muted/10 flex flex-col justify-center">
                  <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-4">Detection Result</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-[12px] text-muted-foreground mb-1">Canonical Field</p>
                      <div className="text-lg font-mono font-medium">
                        {matchResult.canonicalField ? (
                          <span className="text-cyan-400">{matchResult.canonicalField}</span>
                        ) : (
                          <span className="text-muted-foreground opacity-50">null</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[12px] text-muted-foreground mb-1">Confidence Score</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold ${
                          matchResult.confidence >= 0.75 ? "text-green-400" :
                          matchResult.confidence >= 0.50 ? "text-yellow-400" :
                          "text-red-400"
                        }`}>
                          {(matchResult.confidence * 100).toFixed(0)}%
                        </span>
                        
                        {matchResult.confidence >= 0.75 && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                        {matchResult.confidence >= 0.50 && matchResult.confidence < 0.75 && <AlertCircle className="h-4 w-4 text-yellow-400" />}
                        {matchResult.confidence < 0.50 && <XCircle className="h-4 w-4 text-red-400" />}
                        
                        <span className="text-[12px] text-muted-foreground ml-2">
                          {matchResult.confidence >= 0.75 ? "(Autofill)" :
                           matchResult.confidence >= 0.50 ? "(Suggest)" :
                           "(Ignore)"}
                        </span>
                      </div>
                    </div>

                    {matchResult.confidence > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[11px] text-muted-foreground">
                          Matched <span className="text-foreground">"{matchResult.matchedAlias}"</span> via {matchResult.matchSource}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
