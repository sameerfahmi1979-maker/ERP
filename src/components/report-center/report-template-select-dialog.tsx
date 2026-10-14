"use client";

/**
 * ReportTemplateSelectDialog
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Used when a report covers multiple companies or when branding_strategy = 'manual_required'.
 * Presents the user with a list of active report templates to choose from before export.
 * Generic — no hardcoded company names or logos.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReportTemplateForSelection } from "@/server/actions/reports/templates";
import type { AuthContext } from "@/lib/rbac/check";
import { reportTemplateSelectionIdentity } from "@/lib/reads/report-template-selection-schema";
import { useReportTemplateSelection } from "@/hooks/use-report-template-selection";
import { CheckCircle2, FileText, Layers, Loader2, Palette } from "lucide-react";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportTemplateSelectDialogProps {
  authContext: AuthContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms a template selection */
  onSelect: (templateId: number, template: ReportTemplateForSelection) => void;
  /** Pre-filter: only show templates usable for these owner company IDs */
  ownerCompanyIds?: number[];
  /** Existing authorized inactive metadata remains visible, never newly usable. */
  selectedTemplateId?: number | null;
  issuableOnly?: boolean;
  readGeneration?: string;
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

export function ReportTemplateSelectDialog(props: ReportTemplateSelectDialogProps) {
  const identity = JSON.stringify([reportTemplateSelectionIdentity(props.authContext), [...new Set(props.ownerCompanyIds ?? [])].sort((a, b) => a - b), props.issuableOnly ?? false, props.readGeneration ?? ""]);
  return props.open ? <ReportTemplateSelection key={identity} {...props} /> : null;
}

function ReportTemplateSelection({
  open,
  onOpenChange,
  onSelect,
  ownerCompanyIds,
  authContext,
  selectedTemplateId,
  issuableOnly,
  readGeneration,
  dialogTitle = "Select Report Template",
  dialogDescription = "Choose the branding template to use for this export.",
}: ReportTemplateSelectDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(selectedTemplateId ?? null);
  const read = useReportTemplateSelection(authContext, {ownerCompanyIds, issuableOnly, selectedId, enabled: open, generation: readGeneration});
  const templates = [...read.rows, ...(read.selected && !read.rows.some(row => row.id === read.selected!.id) ? [read.selected] : [])];
  const isLoading = read.busy;

  const handleConfirm = () => {
    const template = read.getSelectedNow();
    if (!template) return;
    onSelect(template.id, template);
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
          <Input aria-label="Search report templates" value={read.search} onChange={event => read.setSearch(event.target.value)} placeholder="Search templates…" className="mb-3" disabled={read.denied} />
          {read.denied ? <p role="alert">Your access to report templates could not be verified.</p> : read.invalid ? <p role="alert">Template search is too long or its criteria are invalid.</p> : read.error ? <div role="alert"><p>Could not load report templates.</p><Button variant="outline" onClick={read.retry}>Retry templates</Button></div> : isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading templates…</span>
            </div>
          ) : read.ready && templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm">No active templates match these choices.</p>
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
                      disabled={!tpl.selectable}
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
                          {!tpl.selectable && <Badge variant="outline">Unavailable for new output</Badge>}
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
          {read.selectionUnavailable && <p role="status" className="mt-2 text-sm">The previous template is unavailable or no longer authorized. Choose another template.</p>}
          {read.totalCount !== null && <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <Button variant="outline" disabled={!read.ready || read.page <= 1} onClick={() => read.move(read.page - 1)}>Previous</Button>
            <span>{read.totalCount} templates · Page {read.page}</span>
            <Button variant="outline" disabled={!read.ready || read.page * read.pageSize >= read.totalCount} onClick={() => read.move(read.page + 1)}>Next</Button>
          </div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!read.ready || !read.selected?.selectable}>
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
