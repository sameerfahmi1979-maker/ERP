"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  MapPin, 
  ShieldCheck, 
  FileCode2, 
  ScrollText, 
  Clock, 
  Check, 
  Save, 
  X,
  Mail,
  Printer,
  FileDown
} from "lucide-react";

export default function DrawerFormPrototype() {
  const [open, setOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("basic");
  const [isSaved, setIsSaved] = useState(false);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "address", label: "Address & Contact", icon: MapPin },
    { id: "legal", label: "Legal & Licensing", icon: ShieldCheck },
    { id: "tax", label: "Tax & Compliance", icon: FileCode2 },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
  ];

  return (
    <div className="p-8 bg-background min-h-screen text-foreground flex flex-col items-center justify-center">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Phase 002E: Right-Side Drawer Form Prototype</h1>
        <p className="text-sm text-muted-foreground">
          This is a theme-aware visual-only prototype showcasing the 80% viewport width sliding drawer, side-nav, and sticky headers/footers.
        </p>
        <Button onClick={() => setOpen(true)} size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs">
          Launch Drawer Form Demo
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent 
          side="right" 
          showCloseButton={false}
          className="p-0 border-l border-border bg-background text-foreground flex flex-col h-screen max-w-[1450px] min-w-[320px] md:min-w-[960px] w-[80vw] focus:outline-none shadow-2xl"
        >
          {/* Sticky Header */}
          <SheetHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between bg-card shrink-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-foreground font-bold text-base leading-none">Edit Organization Details</SheetTitle>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs py-0 px-2 font-medium">
                  Draft
                </Badge>
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs py-0 px-2 font-medium">
                  ORG-10492
                </Badge>
              </div>
              <SheetDescription className="text-muted-foreground text-xs font-normal">
                Manage Alliance Gulf Transport & Construction L.L.C details
              </SheetDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 border-border text-foreground hover:bg-muted text-xs font-medium">
                <Printer className="h-3.5 w-3.5 mr-1.5 opacity-80" /> Print
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-border text-foreground hover:bg-muted text-xs font-medium">
                <FileDown className="h-3.5 w-3.5 mr-1.5 opacity-80" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-border text-foreground hover:bg-muted text-xs font-medium">
                <Mail className="h-3.5 w-3.5 mr-1.5 opacity-80 text-indigo-600 dark:text-indigo-400" /> Email
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setOpen(false)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* Body with Section Navigation */}
          <div className="flex-1 flex overflow-hidden min-h-0 bg-background">
            {/* Left Nav */}
            <div className="w-[240px] border-r border-border bg-muted/30 p-4 space-y-1 shrink-0">
              <div className="text-[10px] font-bold text-muted-foreground/80 tracking-wider uppercase px-2 mb-2">Form Sections</div>
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md transition-all text-left font-medium ${
                      activeSection === section.id
                        ? "bg-indigo-600 text-white font-semibold shadow-sm dark:bg-indigo-500"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
              
              <div className="pt-6 border-t border-border mt-6 px-2 space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground/80 tracking-wider uppercase mb-1">Record Info</div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Modified today by Sameer</span>
                </div>
              </div>
            </div>

            {/* Right Fields Panel */}
            <ScrollArea className="flex-1 p-6">
              {activeSection === "basic" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 mb-4">Basic Information</h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="legal_name_en" className="text-muted-foreground text-xs">Legal Name (English) *</Label>
                        <Input id="legal_name_en" className="h-9 text-xs" defaultValue="Alliance Gulf Transport & Construction L.L.C" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="legal_name_ar" className="text-muted-foreground text-xs">Legal Name (Arabic)</Label>
                        <Input id="legal_name_ar" className="h-9 text-xs" defaultValue="تحالف الخليج للنقل والمقاولات ذ.م.م" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="company_code" className="text-muted-foreground text-xs">Company Code *</Label>
                        <Input id="company_code" className="h-9 text-xs uppercase" defaultValue="AGT" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="short_name" className="text-muted-foreground text-xs">Short Name</Label>
                        <Input id="short_name" className="h-9 text-xs" defaultValue="Alliance Gulf" />
                      </div>
                      <div className="col-span-4 space-y-1.5">
                        <Label htmlFor="legal_form" className="text-muted-foreground text-xs">Legal Form</Label>
                        <Input id="legal_form" className="h-9 text-xs" defaultValue="LLC" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="country" className="text-muted-foreground text-xs">Country</Label>
                        <Input id="country" className="h-9 text-xs" defaultValue="United Arab Emirates" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="default_currency" className="text-muted-foreground text-xs">Default Currency</Label>
                        <Input id="default_currency" className="h-9 text-xs" defaultValue="AED" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "address" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 mb-4">Address & Contacts</h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="emirate" className="text-muted-foreground text-xs">Emirate</Label>
                        <Input id="emirate" className="h-9 text-xs" defaultValue="Abu Dhabi" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="city" className="text-muted-foreground text-xs">City</Label>
                        <Input id="city" className="h-9 text-xs" defaultValue="Mussafah" />
                      </div>
                      <div className="col-span-12 space-y-1.5">
                        <Label htmlFor="address_1" className="text-muted-foreground text-xs">Address Line 1</Label>
                        <Input id="address_1" className="h-9 text-xs" defaultValue="Mussafah Industrial Area M-12, Sector 18" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="phone" className="text-muted-foreground text-xs">Primary Phone</Label>
                        <Input id="phone" className="h-9 text-xs" defaultValue="+971 2 555 1234" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="email" className="text-muted-foreground text-xs">Primary Email</Label>
                        <Input id="email" className="h-9 text-xs" defaultValue="info@alliancegulf.ae" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "legal" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 mb-4">Licensing & Operations</h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="license" className="text-muted-foreground text-xs">Trade License Number</Label>
                        <Input id="license" className="h-9 text-xs" defaultValue="CN-1029485" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="auth" className="text-muted-foreground text-xs">Licensing Authority</Label>
                        <Input id="auth" className="h-9 text-xs" defaultValue="Abu Dhabi DED" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="issue" className="text-muted-foreground text-xs">Issue Date</Label>
                        <Input type="date" id="issue" className="h-9 text-xs" defaultValue="2025-01-10" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="expiry" className="text-muted-foreground text-xs">Expiry Date</Label>
                        <Input type="date" id="expiry" className="h-9 text-xs" defaultValue="2026-01-09" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "tax" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 mb-4">Tax & Compliance Settings</h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="trn" className="text-muted-foreground text-xs">Tax Registration Number (TRN) *</Label>
                        <Input id="trn" className="h-9 text-xs" defaultValue="100452390100003" />
                      </div>
                      <div className="col-span-6 space-y-1.5">
                        <Label htmlFor="corp_tax" className="text-muted-foreground text-xs">Corporate Tax Ref No</Label>
                        <Input id="corp_tax" className="h-9 text-xs" defaultValue="CT-9082348" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "notes" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 mb-4">Internal Notes</h3>
                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes & Comments</Label>
                      <Textarea 
                        id="notes" 
                        rows={8} 
                        className="text-xs" 
                        defaultValue="This profile contains the main group parent organization. Letterhead configuration must use the Primary alliance logo with physical address in Abu Dhabi."
                      />
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-xs text-muted-foreground font-semibold">Unsaved changes in fields (Basic Info, Legal)</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => setOpen(false)}
                className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsSaved(true);
                  setTimeout(() => setIsSaved(false), 2000);
                }}
                className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold"
              >
                <Save className="h-4 w-4 mr-1.5 opacity-80" />
                {isSaved ? "Draft Saved!" : "Save as Draft"}
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs">
                {isSaved ? <Check className="h-4.5 w-4.5 mr-1" /> : null}
                Finalize & Submit
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
