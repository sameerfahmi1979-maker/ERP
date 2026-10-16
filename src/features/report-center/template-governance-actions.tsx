"use client";

/**
 * Template Governance Actions and History — BRANDING.7
 * Provides the governance dropdown, status badges, and history dialog for templates.
 */

import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ReportTemplate,
  ReportTemplateEvent,
  TemplateGovernanceStatus,
  TemplateSecurityReviewStatus,
} from "@/lib/report-center/types";
import { cn } from "@/lib/utils";
import {getTemplateGovernanceHistory} from "@/server/actions/reports/template-governance";
import {createTemplateGovernanceAttempt} from '@/lib/report-center/template-governance-attempt';
import type {TemplateGovernanceAction,TemplateGovernanceReceipt} from '@/lib/report-center/template-governance-receipt';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Copy,
  Globe,
  History,
  Loader2,
  MoreHorizontal,
  SendHorizonal,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { useState, useTransition, useRef, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Status badge helpers
// ─────────────────────────────────────────────────────────────────────────────

const GOVERNANCE_BADGE: Record<
  TemplateGovernanceStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-muted text-foreground border-input" },
  in_review: { label: "In Review", className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800" },
  published: { label: "Published", className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800" },
  archived: { label: "Archived", className: "bg-zinc-100 text-zinc-500 border-zinc-300" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800" },
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
      <span title="Security review passed" className="text-emerald-600 dark:text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span title="Security review failed" className="text-red-600 dark:text-red-300">
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
  template_created: "bg-muted text-muted-foreground",
  template_updated: "bg-muted text-muted-foreground",
  template_submitted_for_review: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  template_approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  template_rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  template_published: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  template_archived: "bg-zinc-100 text-zinc-500",
  template_new_version_created: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
  template_security_review_failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  template_security_review_passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyDetails(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const data = payload as Record<string, unknown>;
  const details: string[] = [];
  const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (positive(data.version_no)) details.push(`Template version ${data.version_no}`);
  if (positive(data.revision) || (typeof data.revision === "string" && /^[1-9]\d{0,18}$/.test(data.revision))) details.push(`Record revision ${data.revision}`);
  if (positive(data.parent_template_id)) details.push("Created from an earlier template version.");
  if (positive(data.superseded_by_template_id)) details.push("Superseded by a newer template version.");
  // Internal request IDs and arbitrary payloads stay in the protected audit
  // record; they are not useful or safe as raw JSON in the ordinary history UI.
  return details;
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
  const {data:events=[],isLoading:loading,isError,refetch}=useQuery<ReportTemplateEvent[]>({
    queryKey:["template-governance-history",template.id],enabled:open,gcTime:0,retry:false,
    queryFn:async()=>{
      const r=await getTemplateGovernanceHistory(template.id);
      if(!r.success||!Array.isArray(r.data)||r.data.some(event=>!event||!Number.isSafeInteger(event.id)||event.id<=0||event.template_id!==template.id||typeof event.event_type!=="string"||typeof event.occurred_at!=="string"||(event.notes!==null&&typeof event.notes!=="string")))throw Error("History unavailable");
      return r.data;
    },
  });

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Governance History"
      subtitle={template.template_name}
      icon={<History className="h-5 w-5" />}
      mode="view"
      size="lg"
      submitLabel="Close"
      onSubmit={() => onOpenChange(false)}
    >
      {isError ? <div role="alert">Governance history could not be loaded. <Button onClick={() => void refetch()}>Retry governance history</Button></div> : loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
          <span>Loading governance history…</span>
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
                  EVENT_ICON_CLASS[event.event_type] ?? "bg-muted text-muted-foreground"
                )}
              >
                {(EVENT_LABELS[event.event_type] ?? "Template event").charAt(0)}
              </span>
              <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold text-foreground">
                  {EVENT_LABELS[event.event_type] ?? "Template event"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatEventDate(event.occurred_at)}
                </p>
                {event.notes && (
                  <p className="mt-1 text-xs text-foreground/80 whitespace-pre-line">{event.notes}</p>
                )}
                {historyDetails(event.payload_json).map(detail => <p key={detail} className="mt-1 text-xs text-muted-foreground">{detail}</p>)}
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
    if (required && reason.trim().length<5) {
      toast.error("Please provide a reason of at least 5 characters.");
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
          aria-label={label} required={required} minLength={required?5:undefined} maxLength={2000}
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
function governanceRevision(value:unknown):bigint|null{
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<1))return null;
  if(typeof value!=='string'&&typeof value!=='number')return null;
  const text=String(value);return /^[1-9]\d*$/.test(text)?BigInt(text):null;
}

export function GovernanceActionsDropdown(props:GovernanceActionsProps){
  return <GovernanceActionsSession key={props.template.id} {...props}/>;
}
function GovernanceActionsSession({
  template,
  canManage,
  canApprove,
  canPublish,
  onTemplateUpdated,
  onNewVersionCreated,
}: GovernanceActionsProps) {
  const [isPending, transition] = useTransition();
  const flight = useRef(false);
  const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null),liveTemplate=useRef(template);
  useLayoutEffect(()=>{liveTemplate.current=template;},[template]);
  useLayoutEffect(()=>{const token={live:true};activation.current=token;return()=>{token.live=false;};},[owner]);
  const startTransition = (action: (current:()=>boolean) => Promise<void>) => {
    const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
    if (flight.current||!current()||liveTemplate.current!==template) return;
    flight.current = true;
    transition(async () => {
      try { await action(current); }
      catch { if(current())try{toast.error("This view could not be refreshed. Reopen templates to reconcile the result.");}catch{/* Feedback is best effort. */} }
      finally { if(current())flight.current = false; }
    });
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const status = template.governance_status ?? "draft";

  const attempt=useRef(createTemplateGovernanceAttempt());
  const confirmed=useRef<{receipt:TemplateGovernanceReceipt;action:TemplateGovernanceAction;note:string|null;openingRevision:string|null;failed:boolean}|null>(null);
  const [saveError,setSaveError]=useState('');
  const [lastChange,setLastChange]=useState<{action:TemplateGovernanceAction;note:string|null}|null>(null);
  const change=(action:TemplateGovernanceAction,note:string|null=null)=>startTransition(async(current)=>{
    setSaveError('');
    const previous=confirmed.current;
    if(previous&&!previous.failed&&template.id===previous.receipt.source_id){
      // A copy receipt describes the destination; its source retains the
      // revision from the admitted request, even if props advanced on replay.
      const baseline=governanceRevision(previous.receipt.id===previous.receipt.source_id?previous.receipt.revision:previous.openingRevision);
      const currentRevision=governanceRevision(template.workspace_revision);
      if(baseline!==null&&currentRevision!==null&&(currentRevision>baseline||currentRevision===baseline&&action!==previous.action))confirmed.current=null;
    }
    try{
      const saved=confirmed.current;
      const work=saved?attempt.current.reload(saved.receipt,saved.action,current):attempt.current.run(template,action,note,current);
      const admitted=attempt.current.pending;
      if(admitted)setLastChange({action:admitted.action,note:admitted.note});
      const result=await work;
      if(!current())return;
      const witness=confirmed.current??{receipt:result.receipt,action,note,openingRevision:admitted?.id===result.receipt.source_id?admitted.contract.revision:null,failed:false};confirmed.current=witness;
      let failed=false;
      for(const related of result.related){if(current())try{onTemplateUpdated(related);}catch{failed=true;}}
      if(current())try{if(witness.action==='new_version')onNewVersionCreated?.(result.template);else onTemplateUpdated(result.template);}catch{failed=true;}
      if(current())try{attempt.current.acknowledged();}catch{failed=true;}
      if(current()){setRejectDialogOpen(false);setArchiveDialogOpen(false);}
      if(current())try{
        if(result.receipt.review?.passed===false)toast.error('Security review failed ('+result.receipt.review.findings.length+' findings). Correct the content before submission.');
        else if(result.receipt.review?.severity==='warning')toast.warning('Security review passed with warnings. Review the recorded findings before approval.');
        else toast.success(witness.action==='new_version'?'Draft revision created.':!result.receipt.changed?'No changes were needed.':'Template '+result.template.governance_status.replaceAll('_',' ')+'.');
      }catch{failed=true;}
      witness.failed=failed;
      if(current()){setLastChange(failed?{action:witness.action,note:witness.note}:null);if(failed)setSaveError('Saved, but the template display could not be refreshed. Retry to reload without saving again.');}
    }catch(error){
      if(!current())return;
      const receipt=attempt.current.confirmed,admitted=attempt.current.pending;
      if(receipt&&admitted)confirmed.current??={receipt,action:admitted.action,note:admitted.note,openingRevision:admitted.contract.revision,failed:true};
      if(!admitted&&!confirmed.current)setLastChange(null);
      const message=confirmed.current?'Saved, but the current template could not be loaded or displayed. Retry to reload without saving again.':error instanceof Error?error.message:'Change unconfirmed. Retry the same action.';
      setSaveError(message);try{toast.error(message);}catch{/* Keep the existing outcome and retry target. */}
    }
  });
  const handleSubmitForReview=()=>change('submit');
  const handleApprove=()=>change('approve');
  const handleReject=(reason:string)=>change('reject',reason);
  const handlePublish=()=>change('publish');
  const handleArchive=(reason:string)=>change('archive',reason||null);
  const handleCreateNewVersion=()=>change('new_version');
  const handleRunSecurityReview=()=>change('review');

  const canSubmit = template.is_active && canManage && (status === "draft" || status === "rejected");
  const canApproveAction = template.is_active && canApprove && status === "in_review";
  const canRejectAction = template.is_active && canApprove && status === "in_review";
  const canPublishAction =
    template.is_active && (canPublish || canApprove) && status === "approved";
  const canArchiveAction =
    (canManage || canApprove) && status !== "archived";
  const canNewVersion =
    template.is_active && canManage && (status === "approved" || status === "published" || status === "in_review" || status === "draft");
  const canRunReview = template.is_active && (canManage || canApprove) && ["draft","rejected","in_review"].includes(status);

  if (!canManage && !canApprove && !canPublish) return null;

  return (
    <>
      {saveError&&<div role="alert" className="max-w-sm text-xs text-destructive">{saveError}{lastChange&&<Button disabled={isPending} variant="outline" onClick={()=>change(lastChange.action,lastChange.note)}>Retry last action / reload saved result</Button>}</div>}
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
              <SendHorizonal className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
              Submit for Review
            </DropdownMenuItem>
          )}
          {canApproveAction && (
            <DropdownMenuItem onClick={handleApprove} className="gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
              Approve
            </DropdownMenuItem>
          )}
          {canRejectAction && (
            <DropdownMenuItem
              onClick={() => setRejectDialogOpen(true)}
              className="gap-2 text-sm"
            >
              <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-300" />
              Reject
            </DropdownMenuItem>
          )}
          {canPublishAction && (
            <DropdownMenuItem onClick={handlePublish} className="gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
              Publish
            </DropdownMenuItem>
          )}
          {(canSubmit || canApproveAction || canRejectAction || canPublishAction) && (
            <DropdownMenuSeparator />
          )}
          {canNewVersion && (
            <DropdownMenuItem onClick={handleCreateNewVersion} className="gap-2 text-sm">
              <Copy className="h-3.5 w-3.5" />
              {status === "published" || status === "approved" ? "Create Revision" : "Create New Version"}
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
