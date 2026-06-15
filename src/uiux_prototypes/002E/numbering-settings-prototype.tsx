"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Binary, 
  Lock, 
  Unlock, 
  History, 
  Sparkles,
  Save,
  AlertTriangle
} from "lucide-react";

export default function NumberingSettingsPrototype() {
  const [prefix, setPrefix] = useState("EMP-");
  const [currentVal, setCurrentVal] = useState("000452");
  const [resetRule, setResetRule] = useState("never");
  const [padding, setPadding] = useState("6");
  const [isLocked, setIsLocked] = useState(true);

  // Generate real-time sequence preview
  const generatePreview = () => {
    let yearPart = "";
    if (prefix.includes("[YYYY]")) {
      yearPart = "2026";
    }
    const formattedPrefix = prefix.replace("[YYYY]", yearPart);
    return `${formattedPrefix}${currentVal}`;
  };

  const auditLogs = [
    { date: "2026-05-27 12:44:10", user: "sameer@alliancegulf.ae", action: "Sequence updated", detail: "Prefix changed to EMP-" },
    { date: "2026-05-20 09:15:32", user: "system", action: "Auto sequence rollover", detail: "Sequence reset triggered by fiscal calendar check" },
    { date: "2026-01-01 00:00:01", user: "system", action: "Annual Sequence Reset", detail: "Reset prefix DOC-2025- to DOC-2026-" },
  ];

  return (
    <div className="p-8 bg-background min-h-screen text-foreground flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col h-[75vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Binary className="h-5 w-5 text-indigo-500" />
            <div className="text-left">
              <h2 className="font-bold text-foreground text-sm">Entity Numbering Engine Settings</h2>
              <p className="text-[10px] text-muted-foreground">Configure auto-indexing schemas, prefixes, date padding, and rollover parameters.</p>
            </div>
          </div>
          <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-semibold shadow-xs">
            <Save className="h-4 w-4" /> Save Sequence Rule
          </Button>
        </div>

        {/* Content columns */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Settings Parameters */}
          <div className="w-[480px] border-r border-border p-6 overflow-y-auto space-y-5 shrink-0 bg-muted/10 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Configuration Panel</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsLocked(!isLocked)}
                className={`h-7 px-2 text-[10px] font-semibold border ${
                  isLocked 
                    ? "border-border text-muted-foreground hover:text-foreground" 
                    : "border-amber-500/20 bg-amber-500/10 text-amber-550 hover:bg-amber-500/20"
                }`}
              >
                {isLocked ? (
                  <>
                    <Lock className="h-3 w-3 mr-1" /> Locks Sequence
                  </>
                ) : (
                  <>
                    <Unlock className="h-3 w-3 mr-1" /> Unlocked Sequence
                  </>
                )}
              </Button>
            </div>

            {isLocked && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg flex gap-2.5 items-start text-[10px] text-amber-650 leading-normal font-medium">
                <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <span className="font-bold block">Engine Rule is Locked</span>
                  This sequence is currently generating live records in the database. Editing fields requires manual unlock authorization.
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="entity_type" className="text-muted-foreground">Target ERP Entity</Label>
                <select 
                  id="entity_type" 
                  disabled={isLocked}
                  className="w-full h-9 px-3 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="emp">Employee Record (HRMS)</option>
                  <option value="veh">Vehicle Fleet (FLMS)</option>
                  <option value="doc">DMS Documents (DMS)</option>
                  <option value="inv">Accounts Invoice (FIN)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prefix" className="text-muted-foreground">Sequence Prefix Format</Label>
                <Input 
                  id="prefix" 
                  value={prefix} 
                  onChange={(e) => setPrefix(e.target.value)}
                  disabled={isLocked}
                  placeholder="e.g. EMP-" 
                  className="bg-background border-input text-foreground font-mono disabled:opacity-50 h-9"
                />
                <span className="text-[9px] text-muted-foreground">Insert `[YYYY]` to inject year, or `[MM]` to inject month.</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current" className="text-muted-foreground">Current Index Value</Label>
                  <Input 
                    id="current" 
                    value={currentVal} 
                    onChange={(e) => setCurrentVal(e.target.value)}
                    disabled={isLocked}
                    className="bg-background border-input text-foreground font-mono disabled:opacity-50 h-9" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="padding" className="text-muted-foreground">Numerical Padding</Label>
                  <Input 
                    id="padding" 
                    type="number"
                    value={padding} 
                    onChange={(e) => setPadding(e.target.value)}
                    disabled={isLocked}
                    className="bg-background border-input text-foreground disabled:opacity-50 h-9" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reset" className="text-muted-foreground">Sequence Reset Rollover Interval</Label>
                <select 
                  id="reset" 
                  value={resetRule} 
                  onChange={(e) => setResetRule(e.target.value)}
                  disabled={isLocked}
                  className="w-full h-9 px-3 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="never">Never reset (Continuous counter)</option>
                  <option value="yearly">Reset to 1 annually (e.g. every Jan 1st)</option>
                  <option value="monthly">Reset to 1 monthly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Real-time Preview & Audit Log Column */}
          <div className="flex-1 p-6 flex flex-col min-h-0 space-y-6">
            
            {/* Real-time generator output card */}
            <Card className="bg-card border-border text-foreground shadow-xs">
              <CardHeader className="py-4 flex flex-row items-center justify-between text-left">
                <div>
                  <CardTitle className="text-foreground text-xs font-bold uppercase tracking-wider">Live Generator Output</CardTitle>
                  <CardDescription className="text-muted-foreground text-[10px]">Real-time formatting preview of the next database record</CardDescription>
                </div>
                <Sparkles className="h-5 w-5 text-indigo-500 shrink-0" />
              </CardHeader>
              <CardContent className="py-2.5 flex items-center justify-center bg-muted/20 border-t border-border rounded-b-lg">
                <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 py-6 tracking-wide select-none">
                  {generatePreview()}
                </div>
              </CardContent>
            </Card>

            {/* Sequence Audit Log */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2 text-left">
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <History className="h-4 w-4 text-muted-foreground/80" />
                <span>Sequence Modifications Log</span>
              </div>
              
              <div className="border border-border rounded-lg overflow-hidden bg-background/50 flex-1 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border hover:bg-muted/30">
                      <TableHead className="text-muted-foreground text-[10px] font-bold py-1.5">Timestamp</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] font-bold py-1.5">User</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] font-bold py-1.5">Action</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] font-bold py-1.5">Detail Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log, index) => (
                      <TableRow key={index} className="border-border hover:bg-muted/20 text-[10px] text-foreground/80">
                        <TableCell className="py-2 font-mono text-muted-foreground">{log.date}</TableCell>
                        <TableCell className="py-2 font-semibold">{log.user}</TableCell>
                        <TableCell className="py-2 text-foreground font-medium">{log.action}</TableCell>
                        <TableCell className="py-2 text-muted-foreground">{log.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
