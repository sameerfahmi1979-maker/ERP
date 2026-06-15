"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Building, 
  Settings, 
  Binary, 
  Mail, 
  Image as ImageIcon, 
  Upload, 
  Check, 
  FileText,
  Save,
  Globe2
} from "lucide-react";

export default function AppSettingsPrototype() {
  const [activeTab, setActiveTab] = useState("company");
  const [stampUploaded, setStampUploaded] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const menuItems = [
    { id: "company", label: "Company Profile", icon: Building },
    { id: "numbering", label: "Numbering Sequences", icon: Binary },
    { id: "email", label: "SMTP & Notifications", icon: Mail },
    { id: "ui", label: "UI & Formatting", icon: Globe2 },
  ];

  return (
    <div className="p-8 bg-background min-h-screen text-foreground flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col h-[75vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-card border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Settings className="h-5 w-5 animate-spin" />
            </div>
            <div className="text-left">
              <h2 className="font-bold text-foreground text-sm">ERP Global Configurations</h2>
              <p className="text-[10px] text-muted-foreground">Configure multi-company branding, numbering engine formats, and interface parameters</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={() => {
              setIsSaved(true);
              setTimeout(() => setIsSaved(false), 2000);
            }}
            className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Save className="h-4 w-4" /> 
            {isSaved ? "Saved!" : "Save Configuration"}
          </Button>
        </div>

        {/* Workspace Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar Nav */}
          <div className="w-[220px] bg-muted/20 border-r border-border p-4 space-y-1 shrink-0">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md transition-all text-left font-semibold ${
                    activeTab === item.id
                      ? "bg-muted text-foreground border border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings Canvas */}
          <div className="flex-1 p-6 overflow-y-auto bg-background/50">
            {activeTab === "company" && (
              <div className="space-y-6">
                <Card className="bg-card border-border text-foreground shadow-xs">
                  <CardHeader className="py-4 text-left">
                    <CardTitle className="text-foreground text-sm font-bold">Alliance Gulf Transport & Construction LLC</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      Set up physical company details to display on legal forms, PDF headers, invoices, and letterheads.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-left">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="c_en" className="text-muted-foreground">English Brand Name</Label>
                        <Input id="c_en" className="h-9" defaultValue="Alliance Gulf Transport" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="c_ar" className="text-muted-foreground">Arabic Brand Name</Label>
                        <Input id="c_ar" className="h-9" defaultValue="تحالف الخليج للنقل" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="c_trn" className="text-muted-foreground">Corporate TRN *</Label>
                        <Input id="c_trn" className="h-9" defaultValue="100452390100003" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="c_lic" className="text-muted-foreground">Trade License No</Label>
                        <Input id="c_lic" className="h-9" defaultValue="CN-1029485" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="c_cur" className="text-muted-foreground">Trading Currency</Label>
                        <Input id="c_cur" className="h-9" defaultValue="AED" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Graphic Assets Card */}
                <Card className="bg-card border-border text-foreground shadow-xs">
                  <CardHeader className="py-4 text-left">
                    <CardTitle className="text-foreground text-sm font-bold">Stamp & Digital Signatures</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      Upload corporate stamps and authorized signatures. These will automatically sign exported system documents.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-6 text-xs">
                    {/* Stamp Upload Box */}
                    <div className="border border-dashed border-border bg-background p-4 rounded-lg flex flex-col items-center justify-center text-center space-y-3">
                      <div className="h-14 w-14 rounded-full bg-indigo-500/5 border border-dashed border-indigo-400/30 flex items-center justify-center relative">
                        {stampUploaded ? (
                          <Check className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-indigo-500/60" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Corporate Seal / Stamp</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">Transparent PNG, max 1MB</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setStampUploaded(!stampUploaded)}
                        className="h-8 border-border text-foreground text-xs font-semibold"
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        {stampUploaded ? "Change Stamp" : "Upload PNG"}
                      </Button>
                    </div>

                    {/* Signature Upload Box */}
                    <div className="border border-dashed border-border bg-background p-4 rounded-lg flex flex-col items-center justify-center text-center space-y-3">
                      <div className="h-14 w-14 rounded-full bg-indigo-500/5 border border-dashed border-indigo-400/30 flex items-center justify-center relative">
                        <FileText className="h-6 w-6 text-indigo-500/60" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Authorized Signature</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">Scanned black/blue ink, max 1MB</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 border-border text-foreground text-xs font-semibold"
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Upload PNG
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "numbering" && (
              <div className="space-y-6">
                <Card className="bg-card border-border text-foreground shadow-xs">
                  <CardHeader className="py-4 text-left">
                    <CardTitle className="text-foreground text-sm font-bold">Serial Number Configuration</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      Set numbering schemas, current numbers, prefixes, and reset conditions for ERP database engines.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-left">
                    <div className="space-y-3">
                      {/* EMP Sequence */}
                      <div className="grid grid-cols-12 gap-3 items-center p-3 rounded-lg bg-background border border-border">
                        <div className="col-span-3 font-semibold text-foreground">Employee Records</div>
                        <div className="col-span-2">
                          <Label className="text-[10px] text-muted-foreground block mb-1">Prefix</Label>
                          <Input className="h-8 text-xs font-mono" defaultValue="EMP-" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[10px] text-muted-foreground block mb-1">Current Val</Label>
                          <Input className="h-8 text-xs font-mono" defaultValue="00832" />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-[10px] text-muted-foreground block mb-1">Reset Period</Label>
                          <select className="w-full h-8 px-2 bg-background border border-input text-foreground rounded text-xs focus:outline-none">
                            <option>Never Reset</option>
                            <option>Reset Yearly</option>
                            <option>Reset Monthly</option>
                          </select>
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="text-[9px] block text-muted-foreground">Preview:</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold font-mono">EMP-00833</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "email" && (
              <div className="space-y-6">
                <Card className="bg-card border-border text-foreground shadow-xs">
                  <CardHeader className="py-4 text-left">
                    <CardTitle className="text-foreground text-sm font-bold">SMTP Dispatch Configurations</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      Set SMTP parameters to handle direct transaction shares and mail outputs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-left">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="smtp_host" className="text-muted-foreground">SMTP Host</Label>
                        <Input id="smtp_host" className="h-9" defaultValue="smtp.alliancegulf.ae" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="smtp_port" className="text-muted-foreground">Port Number</Label>
                        <Input id="smtp_port" className="h-9" defaultValue="587" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "ui" && (
              <div className="space-y-6">
                <Card className="bg-card border-border text-foreground shadow-xs">
                  <CardHeader className="py-4 text-left">
                    <CardTitle className="text-foreground text-sm font-bold">System Localization</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      Define regional formatting scales, currency notations, and layout compact densities.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-left">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-foreground">Compact View Density</div>
                        <div className="text-[10px] text-muted-foreground">Reduces page margins and cell padding for data-intensive views.</div>
                      </div>
                      <Switch id="compact_view" defaultChecked />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
