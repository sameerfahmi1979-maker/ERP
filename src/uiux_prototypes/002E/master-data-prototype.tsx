"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Globe, 
  Plus, 
  Search, 
  SlidersHorizontal, 
  FileDown, 
  ChevronRight, 
  Trash2, 
  Paperclip, 
  Upload,
  Calendar,
  AlertCircle
} from "lucide-react";

export default function MasterDataPrototype() {
  const [showAttachments, setShowAttachments] = useState(true);
  
  const mockMasterData = [
    { code: "AE", name: "United Arab Emirates", currency: "AED", emirates: 7, status: "Active" },
    { code: "SA", name: "Saudi Arabia", currency: "SAR", emirates: 13, status: "Active" },
    { code: "OM", name: "Oman", currency: "OMR", emirates: 11, status: "Active" },
    { code: "QA", name: "Qatar", currency: "QAR", emirates: 8, status: "Active" },
    { code: "BH", name: "Bahrain", currency: "BHD", emirates: 4, status: "Active" },
    { code: "KW", name: "Kuwait", currency: "KWD", emirates: 6, status: "Active" },
  ];

  const mockAttachments = [
    { id: 1, name: "Trade_License_Alliance_Gulf.pdf", type: "Trade License", expiry: "2026-06-15", status: "Expiring Soon" },
    { id: 2, name: "VAT_Certificate_AGT.pdf", type: "Tax Registration", expiry: "2029-10-24", status: "Valid" },
    { id: 3, name: "Establishment_Card_AbuDhabi.pdf", type: "Immigration File", expiry: "2026-03-01", status: "Expired" },
  ];

  return (
    <div className="p-8 bg-background min-h-screen text-foreground flex flex-col items-center justify-center">
      <div className="w-full max-w-6xl bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col h-[75vh]">
        
        {/* Header Toolbar */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-500" />
            <h2 className="text-sm font-bold text-foreground">Global Shared Master Data</h2>
            <Badge className="bg-muted text-muted-foreground border-border font-medium">Countries & Jurisdictions</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 border-border text-foreground hover:bg-muted font-semibold">
              <FileDown className="h-4 w-4 mr-1.5 opacity-80" /> Export Data
            </Button>
            <Button 
              size="sm" 
              onClick={() => setShowAttachments(!showAttachments)}
              className="h-8 border border-indigo-550/20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-semibold"
            >
              <Paperclip className="h-4 w-4 mr-1.5" />
              {showAttachments ? "Hide DMS Panel" : "Show DMS Panel"}
            </Button>
            <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs">
              <Plus className="h-4 w-4 mr-1" /> Add Country
            </Button>
          </div>
        </div>

        {/* Data Canvas */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Main Table Grid Column */}
          <div className="flex-1 p-6 flex flex-col overflow-y-auto min-h-0 space-y-4">
            
            {/* Search/Filter Bar */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search countries, ISO codes, currencies..." className="pl-9 h-9" />
              </div>
              <Button variant="outline" size="sm" className="h-9 border-border text-foreground hover:bg-muted font-semibold">
                <SlidersHorizontal className="h-4 w-4 mr-1.5 opacity-80" /> Filters
              </Button>
            </div>

            {/* Tight Data Table */}
            <div className="border border-border rounded-lg overflow-hidden flex-1 bg-background/50">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-border hover:bg-muted/30">
                    <TableHead className="text-muted-foreground text-xs font-bold py-2">ISO Code</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-bold py-2">Country Name</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-bold py-2">Base Currency</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-bold py-2">Sub-States / Emirates</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-bold py-2">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-bold py-2 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockMasterData.map((row) => (
                    <TableRow key={row.code} className="border-border hover:bg-muted/20 text-xs text-foreground/90">
                      <TableCell className="py-2.5 font-bold text-muted-foreground">{row.code}</TableCell>
                      <TableCell className="py-2.5">{row.name}</TableCell>
                      <TableCell className="py-2.5 font-mono text-[10px] text-muted-foreground">{row.currency}</TableCell>
                      <TableCell className="py-2.5">{row.emirates} jurisdictions</TableCell>
                      <TableCell className="py-2.5">
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] py-0 px-2 font-medium">
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <ChevronRight className="h-4.5 w-4.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Right Column: Attachment Readiness DMS Panel */}
          {showAttachments && (
            <div className="w-[360px] border-l border-border bg-muted/20 p-5 flex flex-col h-full overflow-hidden shrink-0">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4 shrink-0 text-left">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Document Attachments</h3>
                  <p className="text-[9px] text-muted-foreground font-normal">Pre-DMS compliance verification</p>
                </div>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-550/20 text-[10px] font-medium">DMS Ready</Badge>
              </div>

              {/* Upload Drop Zone Area */}
              <div className="border border-dashed border-border hover:border-muted bg-background p-4 rounded-lg flex flex-col items-center justify-center text-center space-y-2 shrink-0 transition-colors cursor-pointer mb-4">
                <Upload className="h-6.5 w-6.5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-bold text-foreground">Drag supporting files here</p>
                  <p className="text-[9px] text-muted-foreground">PDF, PNG, Excel up to 5MB</p>
                </div>
              </div>

              {/* Attachments List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-1 text-left">
                {mockAttachments.map((doc) => (
                  <Card key={doc.id} className="bg-background border-border text-foreground text-xs shadow-xs">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2 max-w-[200px]">
                          <Paperclip className="h-4.5 w-4.5 text-indigo-500 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-foreground truncate" title={doc.name}>{doc.name}</div>
                            <div className="text-[9px] text-muted-foreground font-medium">{doc.type}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-border text-[9px] text-muted-foreground">
                        <div className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3 w-3" />
                          <span>Expires: {doc.expiry}</span>
                        </div>
                        
                        {doc.status === "Valid" && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] py-0 px-1 font-normal">
                            Valid
                          </Badge>
                        )}
                        {doc.status === "Expiring Soon" && (
                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] py-0 px-1 font-normal flex items-center gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" />
                            Expiring
                          </Badge>
                        )}
                        {doc.status === "Expired" && (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[8px] py-0 px-1 font-normal flex items-center gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" />
                            Expired
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
