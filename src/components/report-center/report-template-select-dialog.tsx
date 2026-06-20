"use client";

/**
 * ReportTemplateSelectDialog
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Used when a report covers multiple companies or when branding_strategy = 'manual_required'.
 * Presents the user with a list of active report templates to choose from before export.
 * Generic — no hardcoded company names or logos.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, FileText, Layers, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { listReportTemplatesForSelection } from "@/server/actions/reports/templates";
import type { ReportTemplateForSelection } from "@/server/actions/reports/templates";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportTemplateSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms a template selection */
  onSelect: (templateId: number, template: ReportTemplateForSelection) => void;
  /** Pre-filter: only show templates usable for these owner company IDs */
  ownerCompanyIds?: number[];
  /** Title shown in the dialog header */
  dialogTitle?: string;
  /** Description shown below the title */
  dialogDescription?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile type badge colours
// ─────────────────────────────────────────────────────────────────────────────

const profileTypeBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  company: { label: "Company", variant: "default" },
  group: { label: "Group", variant: "secondary" },
  neutral: { label: "Neutral", variant: "outline" },
  custom: { label: "Custom", variant: "outline" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReportTemplateSelectDialog({
  open,
  onOpenChange,
  onSelect,
  ownerCompanyIds,
  dialogTitle = "Select Report Template",
  dialogDescription = "Choose the branding template to use for this export.",
}: ReportTemplateSelectDialogProps) {
  const [templates, setTemplates] = useState<ReportTemplateForSelection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Load templates when dialog opens
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setSelectedId(null);
    listReportTemplatesForSelection({ ownerCompanyIds })
      .then((res) => {
        if (res.success && res.data) setTemplates(res.data);
        else setTemplates([]);
      })
      .catch(() => setTemplates([]))
      .finally(() => setIsLoading(false));
  }, [open, ownerCompanyIds]);

  const handleConfirm = () => {
    if (!selectedId) return;
    const template = templates.find((t) => t.id === selectedId);
    if (!template) return;
    onSelect(selectedId, template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading templates…</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm">No active templates found.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="flex flex-col gap-2 pr-2">
                {templates.map((tpl) => {
                  const isSelected = selectedId === tpl.id;
                  const profileMeta = profileTypeBadge[tpl.branding_profile_type ?? "neutral"] ?? profileTypeBadge.neutral;

                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedId(tpl.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors w-full",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted/60"
                      )}
                    >
                      {/* Logo thumbnail or palette icon */}
                      <div className="mt-0.5 shrink-0">
                        {tpl.logo_url ? (
                          <img
                            src={tpl.logo_url}
                            alt=""
                            className="h-8 w-8 rounded object-contain border bg-white"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded border bg-muted flex items-center justify-center">
                            <Palette className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Template details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{tpl.template_name}</span>
                          {tpl.is_default && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Default
                            </Badge>
                          )}
                          <Badge variant={profileMeta.variant} className="text-[10px] px-1.5 py-0">
                            {profileMeta.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {tpl.branding_profile_name ?? "No branding profile"}
                          {tpl.company_name && ` — ${tpl.company_name}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {tpl.template_type} · {tpl.template_code}
                        </p>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId || isLoading}>
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
