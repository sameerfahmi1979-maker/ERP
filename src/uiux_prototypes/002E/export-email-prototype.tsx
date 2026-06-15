"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, 
  Send, 
  Paperclip, 
  Loader2, 
  CheckCircle2, 
  Building,
} from "lucide-react";

export default function ExportEmailPrototype() {
  const [open, setOpen] = useState(true);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [letterhead, setLetterhead] = useState("agt");

  const handleSend = () => {
    setSendStatus("sending");
    setTimeout(() => {
      setSendStatus("success");
    }, 2000);
  };

  const resetState = () => {
    setSendStatus("idle");
  };

  return (
    <div className="p-8 bg-background min-h-screen text-foreground flex flex-col items-center justify-center">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Phase 002E: Export / Share via Email Prototype</h1>
        <p className="text-sm text-muted-foreground">
          This prototype demonstrates the theme-aware email client composition window, letterhead selector, attachment previews, and asynchronous loading states.
        </p>
        <Button onClick={() => { setOpen(true); resetState(); }} size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs">
          Launch Share via Email
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl bg-popover border-border text-popover-foreground p-0 overflow-hidden flex flex-col max-h-[85vh] shadow-2xl rounded-xl">
          {/* Main Layout Grid */}
          <div className="grid grid-cols-12 flex-1 overflow-hidden">
            {/* Left Column: Email Compose */}
            <div className="col-span-7 p-6 space-y-4 overflow-y-auto border-r border-border">
              <DialogHeader className="p-0">
                <DialogTitle className="text-foreground flex items-center gap-2 font-bold">
                  <Mail className="h-5 w-5 text-indigo-500" />
                  <span>Email Document Share</span>
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs font-normal">
                  Generate transaction reports and dispatch them directly from Supabase Mail Engine.
                </DialogDescription>
              </DialogHeader>

              {sendStatus === "idle" && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 space-y-1.5 text-left">
                      <Label htmlFor="letterhead" className="text-muted-foreground text-xs font-semibold">Select Company Identity / Letterhead</Label>
                      <select
                        id="letterhead"
                        value={letterhead}
                        onChange={(e) => setLetterhead(e.target.value)}
                        className="w-full h-10 px-3 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="agt">Alliance Gulf Transport & Construction L.L.C</option>
                        <option value="ast">Alliance Scrap Trading L.L.C</option>
                        <option value="pgg">Pan Gulf Contracting Group</option>
                      </select>
                    </div>

                    <div className="col-span-12 space-y-1.5 text-left">
                      <Label htmlFor="to" className="text-muted-foreground text-xs font-semibold">To</Label>
                      <Input id="to" className="h-9 text-xs" defaultValue="partner@gulfconstruction.ae" />
                    </div>

                    <div className="col-span-6 space-y-1.5 text-left">
                      <Label htmlFor="cc" className="text-muted-foreground text-xs font-semibold">CC</Label>
                      <Input id="cc" className="h-9 text-xs" defaultValue="finance@alliancegulf.ae" />
                    </div>

                    <div className="col-span-6 space-y-1.5 text-left">
                      <Label htmlFor="bcc" className="text-muted-foreground text-xs font-semibold">BCC (Audit)</Label>
                      <Input id="bcc" className="h-9 text-xs" defaultValue="audit-logs@alliancegulf.ae" />
                    </div>

                    <div className="col-span-12 space-y-1.5 text-left">
                      <Label htmlFor="subject" className="text-muted-foreground text-xs font-semibold">Subject</Label>
                      <Input id="subject" className="h-9 text-xs" defaultValue="Audit Statement & Branch Records - Alliance Gulf Transport" />
                    </div>

                    <div className="col-span-12 space-y-1.5 text-left">
                      <Label htmlFor="body" className="text-muted-foreground text-xs font-semibold">Message</Label>
                      <Textarea 
                        id="body" 
                        rows={6}
                        className="text-xs" 
                        defaultValue={`Dear Partners,\n\nPlease find attached the company details and legal records for Alliance Gulf Transport & Construction L.L.C.\n\nShould you have any questions, please contact our administrative desk.\n\nBest Regards,\nSameer Fahmi\nOperations Director`}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button variant="outline" onClick={() => setOpen(false)} className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold">
                      Cancel
                    </Button>
                    <Button onClick={handleSend} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold h-9 px-4 text-xs shadow-xs">
                      <Send className="h-4 w-4 mr-1.5" /> Send Document
                    </Button>
                  </div>
                </div>
              )}

              {sendStatus === "sending" && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Assembling PDF Attachment...</p>
                    <p className="text-xs text-muted-foreground mt-1">Applying {letterhead.toUpperCase()} letterhead metadata and digital seal stamps.</p>
                  </div>
                </div>
              )}

              {sendStatus === "success" && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
                  <div className="text-center space-y-2">
                    <p className="text-base font-semibold text-foreground">Email Dispatched Successfully</p>
                    <p className="text-xs text-muted-foreground">Document statement has been sent to partner@gulfconstruction.ae.</p>
                  </div>
                  <Button onClick={resetState} className="bg-muted hover:bg-muted/80 text-foreground border border-border mt-4 text-xs font-semibold h-9 px-4">
                    Send Another
                  </Button>
                </div>
              )}
            </div>

            {/* Right Column: PDF Preview Mock */}
            <div className="col-span-5 bg-muted/30 p-6 flex flex-col h-full overflow-hidden">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between shrink-0">
                <span>Attachment Preview</span>
                <Badge className="bg-muted text-muted-foreground hover:bg-muted border-border font-medium">PDF File</Badge>
              </div>

              {/* PDF Document Visual Representation */}
              <div className="flex-1 bg-white text-zinc-950 p-6 rounded-md shadow-lg overflow-y-auto space-y-4 text-[9px] leading-relaxed select-none border border-zinc-200">
                {/* PDF Header */}
                <div className="border-b-2 border-zinc-800 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Building className="h-5 w-5 text-zinc-900" />
                    <div className="text-left">
                      <div className="font-bold text-[10px] tracking-tight uppercase">
                        {letterhead === "agt" && "ALLIANCE GULF TRANSPORT & CONST. L.L.C"}
                        {letterhead === "ast" && "ALLIANCE SCRAP TRADING L.L.C"}
                        {letterhead === "pgg" && "PAN GULF CONTRACTING GROUP L.L.C"}
                      </div>
                      <div className="text-zinc-500 text-[7px]">Abu Dhabi HQ, Sector 18, UAE</div>
                    </div>
                  </div>
                  <div className="text-right text-[7px] text-zinc-600">
                    <div>TRN: 100452390100003</div>
                    <div>Lic: CN-1029485</div>
                  </div>
                </div>

                {/* PDF Content Title */}
                <div className="text-center py-2 space-y-1">
                  <div className="font-bold text-[11px] uppercase tracking-wide decoration-zinc-300 underline underline-offset-4">
                    Company Registration Statement
                  </div>
                  <div className="text-zinc-400 text-[7px]">Date Generated: 2026-05-27</div>
                </div>

                {/* PDF Content Fields */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-200 pt-3 text-left">
                  <div>
                    <span className="font-bold block text-zinc-500 text-[6px]">LEGAL NAME (ENGLISH)</span>
                    <span className="font-medium text-[8px]">
                      {letterhead === "agt" && "Alliance Gulf Transport & Construction"}
                      {letterhead === "ast" && "Alliance Scrap Trading"}
                      {letterhead === "pgg" && "Pan Gulf Contracting Group"}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold block text-zinc-500 text-[6px]">LEGAL NAME (ARABIC)</span>
                    <span className="font-medium text-[8px]">
                      {letterhead === "agt" && "تحالف الخليج للنقل والمقاولات"}
                      {letterhead === "ast" && "تحالف لتجارة السكراب"}
                      {letterhead === "pgg" && "مجموعة بان الخليج للمقاولات"}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold block text-zinc-500 text-[6px]">PRIMARY TRN</span>
                    <span className="font-medium text-[8px]">100452390100003</span>
                  </div>
                  <div>
                    <span className="font-bold block text-zinc-500 text-[6px]">COUNTRY</span>
                    <span className="font-medium text-[8px]">United Arab Emirates</span>
                  </div>
                </div>

                {/* Stamp Space */}
                <div className="pt-10 flex items-center justify-between">
                  <div className="text-[7px] text-zinc-400">Page 1 of 1</div>
                  <div className="flex flex-col items-center">
                    {/* Stamp Circle representation */}
                    <div className="h-12 w-12 rounded-full border border-dashed border-indigo-400/40 flex items-center justify-center text-center bg-indigo-500/5 text-[5px] text-indigo-400 relative">
                      <div className="absolute inset-1 rounded-full border border-indigo-400/20"></div>
                      <span className="font-bold rotate-12 scale-90">ALLIANCE<br/>SEAL</span>
                    </div>
                    <div className="text-[6px] text-zinc-400 mt-1">Authorized Stamp</div>
                  </div>
                </div>
              </div>

              {/* Attachment Footer Card */}
              <div className="bg-background p-2.5 rounded border border-border mt-3 flex items-center justify-between shrink-0 text-left">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-foreground font-medium truncate max-w-[150px]">company_profile.pdf</div>
                    <div className="text-[9px] text-muted-foreground">124.5 KB</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[8px] bg-muted border-border text-muted-foreground font-normal">PDF</Badge>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
