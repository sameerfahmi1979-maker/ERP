"use client";

/**
 * Template Governance Actions and History — BRANDING.7
 * Provides the governance dropdown, status badges, and history dialog for templates.
 */

import { useState, useTransition } from "react";
import {
  SendHorizonal,
  CheckCircle2,
  XCircle,
  Globe,
  Archive,
  Copy,
  History,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { toast } from "sonner";
import type {
  ReportTemplate,
  ReportTemplateEvent,
  TemplateGovernanceStatus,
  TemplateSecurityReviewStatus,
} from "@/lib/report-center/types";
import {
  submitTemplateForReview,
  approveTemplate,
  rejectTemplate,
  publishTemplate,
  archiveTemplate,
  createTemplateDraftVersion,
  getTemplateGovernanceHistory,
  runTemplateSecurityReviewAction,
} from "@/server/actions/reports/template-governance";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Status badge helpers
// ─────────────────────────────────────────────────────────────────────────────

const GOVERNANCE_BADGE: Record<
  TemplateGovernanceStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  in_review: { label: "In Review", className: "bg-amber-100 text-amber-800 border-amber-300" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  published: { label: "Published", className: "bg-blue-100 text-blue-800 border-blue-300" },
  archived: { label: "Archived", className: "bg-zinc-100 text-zinc-500 border-zinc-300" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-300" },
};

export function GovernanceStatusBadge({
  status,
}: {
  status: TemplateGovernanceStatus | undefined;
}) {
  const s = status ?? "draft";
  const cfg = GOVERNANCE_BADGE[s] ?? GOVERNANCE_BADGE.draft;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5", cfg.className)}
    >
      {cfg.label}
    </Badge>
  );
}

export function SecurityReviewBadge({
  status,
}: {
  status: TemplateSecurityReviewStatus | undefined;
}) {
  if (!status || status === "pending") {
    return (
      <span title="Security review pending" className="text-muted-foreground/60">
        <ShieldQuestion className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "passed") {
    return (
      <span title="Security review passed" className="text-emerald-600">
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span title="Security review failed" className="text-red-600">
        <ShieldAlert className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span title="Security review skipped" className="text-muted-foreground/60">
      <ShieldQuestion className="h-3.5 w-3.5" />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance history dialog
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  template_created: "Created",
  template_updated: "Updated",
  template_submitted_for_review: "Submitted for Review",
  template_approved: "Approved",
  template_rejected: "Rejected",
  template_published: "Published",
  template_archived: "Archived",
  template_new_version_created: "New Version Created",
  template_security_review_failed: "Security Review Failed",
  template_security_review_passed: "Security Review Passed",
};

const EVENT_ICON_CLASS: Record<string, string> = {
  template_created: "bg-slate-200 text-slate-600",
  template_updated: "bg-slate-200 text-slate-600",
  template_submitted_for_review: "bg-amber-100 text-amber-700",
  template_approved: "bg-emerald-100 text-emerald-700",
  template_rejected: "bg-red-100 text-red-700",
  template_published: "bg-blue-100 text-blue-700",
  template_archived: "bg-zinc-100 text-zinc-500",
  template_new_version_created: "bg-purple-100 text-purple-700",
  template_security_review_failed: "bg-red-100 text-red-700",
  template_security_review_passed: "bg-emerald-100 text-emerald-700",
};

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface HistoryDialogProps {
  template: ReportTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateGovernanceHistoryDialog({
  template,
  open,
  onOpenChange,
}: HistoryDialogProps) {
  const [events, setEvents] = useState<ReportTemplateEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && events.length === 0) {
      setLoading(true);
      const result = await getTemplateGovernanceHistory(template.id);
      setLoading(false);
      if (result.success) setEvents(result.data ?? []);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleOpen}
      title="Governance History"
      subtitle={template.template_name}
      icon={<History className="h-5 w-5" />}
      mode="view"
      size="lg"
      submitLabel="Close"
      onSubmit={() => onOpenChange(false)}
      cancelLabel=""
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No governance events recorded yet.
        </p>
      ) : (
        <ol className="relative border-l border-muted ml-3 space-y-0">
          {events.map((event) => (
            <li key={event.id} className="mb-4 ml-5">
              <span
                className={cn(
                  "absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold border",
                  EVENT_ICON_CLASS[event.event_type] ?? "bg-slate-100 text-slate-500"
                )}
              >
                {event.event_type.charAt(9).toUpperCase()}
              </span>
              <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold text-foreground">
                  {EVENT_LABELS[event.event_type] ?? event.event_type}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatEventDate(event.occurred_at)}
                </p>
                {event.notes && (
                  <p className="mt-1 text-xs text-foreground/80 whitespace-pre-line">{event.notes}</p>
                )}
                {Object.keys(event.payload_json ?? {}).length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">
                    {JSON.stringify(event.payload_json)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </ERPChildDialogForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject / Archive reason dialog (shared pattern)
// ─────────────────────────────────────────────────────────────────────────────

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  required?: boolean;
  isSubmitting: boolean;
  onSubmit: (reason: string) => void;
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  label,
  required = false,
  isSubmitting,
  onSubmit,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (required && !reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    onSubmit(reason);
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}
      title={title}
      size="sm"
      mode="edit"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Confirm"
    >
      <div className="col-span-12">
        <label className="text-sm font-medium block mb-1.5">{label}</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={required ? "Required…" : "Optional…"}
        />
      </div>
    </ERPChildDialogForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main governance actions dropdown
// ─────────────────────────────────────────────────────────────────────────────

interface GovernanceActionsProps {
  template: ReportTemplate;
  canManage: boolean;
  canApprove: boolean;
  canPublish: boolean;
  onTemplateUpdated: (updated: Partial<ReportTemplate> & { id: number }) => void;
  onNewVersionCreated?: (newTemplate: Partial<ReportTemplate> & { id: number }) => void;
}

export function GovernanceActionsDropdown({
  template,
  canManage,
  canApprove,
  canPublish,
  onTemplateUpdated,
  onNewVersionCreated,
}: GovernanceActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const status = template.governance_status ?? "draft";

  const handleSubmitForReview = () =>
    startTransition(async () => {
      const res = await submitTemplateForReview(template.id);
      if (res.success) {
        toast.success("Template submitted for review.");
        onTemplateUpdated({ id: template.id, governance_status: "in_review" });
      } else {
        toast.error(res.error ?? "Failed to submit for review.");
      }
    });

  const handleApprove = () =>
    startTransition(async () => {
      const res = await approveTemplate({ templateId: template.id });
      if (res.success) {
        toast.success("Template approved.");
        onTemplateUpdated({ id: template.id, governance_status: "approved" });
      } else {
        toast.error(res.error ?? "Failed to approve.");
      }
    });

  const handleReject = (reason: string) =>
    startTransition(async () => {
      const res = await rejectTemplate({ templateId: template.id, reason });
      setRejectDialogOpen(false);
      if (res.success) {
        toast.success("Template rejected.");
        onTemplateUpdated({ id: template.id, governance_status: "rejected", rejection_reason: reason });
      } else {
        toast.error(res.error ?? "Failed to reject.");
      }
    });

  const handlePublish = () =>
    startTransition(async () => {
      const res = await publishTemplate(template.id);
      if (res.success) {
        toast.success("Template published.");
        onTemplateUpdated({ id: template.id, governance_status: "published" });
      } else {
        toast.error(res.error ?? "Failed to publish.");
      }
    });

  const handleArchive = (reason: string) =>
    startTransition(async () => {
      const res = await archiveTemplate({ templateId: template.id, reason: reason || undefined });
      setArchiveDialogOpen(false);
      if (res.success) {
        toast.success("Template archived.");
        onTemplateUpdated({ id: template.id, governance_status: "archived", archive_reason: reason || null });
      } else {
        toast.error(res.error ?? "Failed to archive.");
      }
    });

  const handleCreateNewVersion = () =>
    startTransition(async () => {
      const res = await createTemplateDraftVersion(template.id);
      if (res.success && res.data) {
        const newId = res.data.id;
        // Add the new draft to the table with minimal known fields so it renders immediately
        const draftTemplate: Partial<ReportTemplate> & { id: number } = {
          id: newId,
          template_code: `${template.template_code}_V${(template.version_no ?? 1) + 1}`,
          template_name: `${template.template_name} (v${(template.version_no ?? 1) + 1})`,
          template_type: template.template_type,
          governance_status: "draft",
          security_review_status: "pending",
          version_no: (template.version_no ?? 1) + 1,
          parent_template_id: template.id,
          is_active: true,
          is_default: false,
        };
        onNewVersionCreated?.(draftTemplate);
        toast.success(`New draft v${(template.version_no ?? 1) + 1} created. Edit it in the templates list.`, {
          action: {
            label: "View Draft",
            onClick: () => {
              // Scroll to or highlight — handled by parent via onNewVersionCreated
            },
          },
        });
      } else {
        toast.error(res.error ?? "Failed to create new version.");
      }
    });

  const handleRunSecurityReview = () =>
    startTransition(async () => {
      const res = await runTemplateSecurityReviewAction(template.id);
      if (res.success) {
        const review = res.data!;
        if (review.passed) {
          toast.success(`Security review passed${review.severity === "warning" ? " (with warnings)" : ""}.`);
          onTemplateUpdated({ id: template.id, security_review_status: "passed" });
        } else {
          toast.error(`Security review failed — ${review.findings.length} issue(s) found.`);
          onTemplateUpdated({ id: template.id, security_review_status: "failed" });
        }
      } else {
        toast.error(res.error ?? "Security review failed.");
      }
    });

  const canSubmit = canManage && (status === "draft" || status === "rejected");
  const canApproveAction = canApprove && status === "in_review";
  const canRejectAction = canApprove && status === "in_review";
  const canPublishAction =
    (canPublish || canApprove) && status === "approved";
  const canArchiveAction =
    (canManage || canApprove) && status !== "archived";
  const canNewVersion =
    canManage && (status === "approved" || status === "published" || status === "in_review" || status === "draft" || status === "rejected");
  const canRunReview = canManage || canApprove;

  if (!canManage && !canApprove && !canPublish) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isPending}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">Governance actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canSubmit && (
            <DropdownMenuItem onClick={handleSubmitForReview} className="gap-2 text-sm">
              <SendHorizonal className="h-3.5 w-3.5 text-amber-600" />
              Submit for Review
            </DropdownMenuItem>
          )}
          {canApproveAction && (
            <DropdownMenuItem onClick={handleApprove} className="gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Approve
            </DropdownMenuItem>
          )}
          {canRejectAction && (
            <DropdownMenuItem
              onClick={() => setRejectDialogOpen(true)}
              className="gap-2 text-sm"
            >
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              Reject
            </DropdownMenuItem>
          )}
          {canPublishAction && (
            <DropdownMenuItem onClick={handlePublish} className="gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-blue-600" />
              Publish
            </DropdownMenuItem>
          )}
          {(canSubmit || canApproveAction || canRejectAction || canPublishAction) && (
            <DropdownMenuSeparator />
          )}
          {canNewVersion && (
            <DropdownMenuItem onClick={handleCreateNewVersion} className="gap-2 text-sm">
              <Copy className="h-3.5 w-3.5" />
              Create New Version
            </DropdownMenuItem>
          )}
          {canRunReview && (
            <DropdownMenuItem onClick={handleRunSecurityReview} className="gap-2 text-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Run Security Review
            </DropdownMenuItem>
          )}
          {canArchiveAction && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setArchiveDialogOpen(true)}
                className="gap-2 text-sm text-muted-foreground"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setHistoryOpen(true)}
            className="gap-2 text-sm"
          >
            <History className="h-3.5 w-3.5" />
            View History
            <ChevronRight className="h-3 w-3 ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateGovernanceHistoryDialog
        template={template}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      <ReasonDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        title="Reject Template"
        label="Rejection reason (required)"
        required
        isSubmitting={isPending}
        onSubmit={handleReject}
      />

      <ReasonDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title="Archive Template"
        label="Archive reason (optional)"
        required={false}
        isSubmitting={isPending}
        onSubmit={handleArchive}
      />
    </>
  );
}
