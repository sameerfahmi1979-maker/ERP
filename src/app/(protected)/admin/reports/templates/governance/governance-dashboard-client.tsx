"use client";

/**
 * Template Governance Dashboard Client — BRANDING.8
 * Status cards, approver queue, failed security review list.
 */

import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GovernanceStatusBadge, SecurityReviewBadge } from "@/features/report-center/template-governance-actions";
import type { ReportTemplate,ReportBrandingProfile } from "@/lib/report-center/types";
import {templateCapabilities,noTemplateCapabilities,type TemplateCapabilities} from '@/lib/report-center/template-capabilities';
import { cn } from "@/lib/utils";
import {getGovernanceSummary} from "@/server/actions/reports/template-governance";
import {createTemplateGovernanceAttempt} from '@/lib/report-center/template-governance-attempt';
import type {TemplateGovernanceAction} from '@/lib/report-center/template-governance-receipt';
import {
  ArrowLeft,
  Loader2,
  SendHorizonal,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Status card config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CARDS: Array<{
  key: string;
  label: string;
  description: string;
  colorClass: string;
}> = [
  { key: "draft", label: "Draft", description: "Being edited, not submitted", colorClass: "border-slate-300 bg-slate-50 text-slate-700" },
  { key: "in_review", label: "In Review", description: "Awaiting approver decision", colorClass: "border-amber-300 bg-amber-50 text-amber-800" },
  { key: "approved", label: "Approved", description: "Ready to publish", colorClass: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  { key: "published", label: "Published", description: "Live for formal output", colorClass: "border-blue-300 bg-blue-50 text-blue-800" },
  { key: "rejected", label: "Rejected", description: "Needs rework and resubmission", colorClass: "border-red-300 bg-red-50 text-red-700" },
  { key: "archived", label: "Archived", description: "No longer active", colorClass: "border-zinc-300 bg-zinc-50 text-zinc-500" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reject reason dialog
// ─────────────────────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}
      title="Reject Template"
      size="sm"
      mode="edit"
      isSubmitting={isSubmitting}
      onSubmit={() => { if (reason.trim().length<5) { toast.error("Provide a reason of at least 5 characters."); return; } onSubmit(reason); }}
      submitLabel="Reject"
    >
      <div className="col-span-12">
        <label className="text-sm font-medium block mb-1.5">Rejection reason (required)</label>
        <textarea aria-label="Rejection reason" required minLength={5} maxLength={2000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe what needs to be fixed…"
        />
      </div>
    </ERPChildDialogForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row component for approver queue and security review list
// ─────────────────────────────────────────────────────────────────────────────

function GovernanceQueue({rows,canApprove,canPublish,canManage,onAction,busy,tableId,profiles,globalTemplateCapabilities}: {
  rows:Partial<ReportTemplate>[]; canApprove:boolean; canPublish:boolean; canManage:boolean;
  onAction:(id:number,action:string)=>void; busy:boolean; tableId:string;
  profiles:ReportBrandingProfile[];globalTemplateCapabilities:TemplateCapabilities;
}) {
  const columns:ColumnDef<Partial<ReportTemplate>>[]=[
    {accessorKey:"template_name",header:"Template",size:240},
    {accessorKey:"template_code",header:"Code",size:170},
    {accessorKey:"version_no",header:"Version",size:100},
    {accessorKey:"governance_status",header:"Status",size:160,cell:({row})=><GovernanceStatusBadge status={row.original.governance_status}/>},
    {accessorKey:"security_review_status",header:"Security review",size:160,cell:({row})=><span className="flex gap-2"><SecurityReviewBadge status={row.original.security_review_status}/>{row.original.security_review_status??"Pending"}</span>},
    {accessorKey:"rejection_reason",header:"Rejection reason",size:200},
    {id:"actions",header:"Actions",size:240,enableSorting:false,cell:({row})=>{
      const t=row.original;
      const capability=t.branding_profile_id===undefined?noTemplateCapabilities:templateCapabilities({branding_profile_id:t.branding_profile_id},profiles,globalTemplateCapabilities);
      const disabled=busy||!t.workspace_revision||t.is_active!==true;
      return <div className="flex flex-wrap gap-2">
        {t.is_active!==true&&<span className="basis-full text-xs text-muted-foreground">{t.is_active===false?'Inactive — history retained; changes unavailable.':'Availability unavailable — reload before acting.'}</span>}
        {t.id && t.governance_status==="in_review" && canApprove && capability.approve && <><Button disabled={disabled} size="sm" variant="outline" onClick={()=>onAction(t.id!,"approve")}>Approve</Button><Button disabled={disabled} size="sm" variant="outline" onClick={()=>onAction(t.id!,"reject")}>Reject</Button></>}
        {t.id && t.governance_status==="approved" && canPublish && capability.publish && <Button disabled={disabled} size="sm" variant="outline" onClick={()=>onAction(t.id!,"publish")}>Publish</Button>}
        {t.id && t.security_review_status==="failed" && canManage && capability.manage && <Button disabled={disabled} size="sm" variant="outline" onClick={()=>onAction(t.id!,"rerun_security")}>Re-run review</Button>}
      </div>;
    }},
  ];
  return <ERPDataTable tableId={tableId} columns={columns} data={rows} enableRowSelection={false} searchPlaceholder="Search loaded templates…" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main client component
// ─────────────────────────────────────────────────────────────────────────────

interface GovernanceDashboardClientProps {
  counts: Record<string, number>;
  inReviewTemplates: Partial<ReportTemplate>[];
  failedSecurityReviewTemplates: Partial<ReportTemplate>[];
  canApprove: boolean;
  canPublish: boolean;
  canManage: boolean;
  profiles?:ReportBrandingProfile[];
  globalTemplateCapabilities?:TemplateCapabilities;
}

export function GovernanceDashboardClient({
  counts: initialCounts,
  inReviewTemplates: initialInReview,
  failedSecurityReviewTemplates: initialFailed,
  canApprove,
  canPublish,
  canManage,
  profiles=[],
  globalTemplateCapabilities=noTemplateCapabilities,
}: GovernanceDashboardClientProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [inReview, setInReview] = useState(initialInReview);
  const [failedSecurity, setFailedSecurity] = useState(initialFailed);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [isPending, transition] = useTransition();
  const flight = useRef(false);
  const startTransition = (action:()=>Promise<void>)=>{
    if(flight.current)return;flight.current=true;
    transition(async()=>{try{await action();}catch{toast.error("Change unconfirmed. Refresh before retrying; your reason is retained.");}finally{flight.current=false;}});
  };

  const attempt=useRef(createTemplateGovernanceAttempt());
  const [saveError,setSaveError]=useState('');
  const [lastChange,setLastChange]=useState<{row:ReportTemplate;action:TemplateGovernanceAction;note:string|null}|null>(null);
  const change=(row:ReportTemplate,action:TemplateGovernanceAction,note:string|null=null)=>startTransition(async()=>{
    setSaveError('');setLastChange({row,action,note});
    try{
      const result=await attempt.current.run(row,action,note);
      const summary=await getGovernanceSummary();
      if(!summary.success||!summary.data)throw Error('Saved, but the governance queue could not be refreshed. Retry to reload without saving again.');
      setCounts(summary.data.counts);setInReview(summary.data.inReviewTemplates);setFailedSecurity(summary.data.failedSecurityReviewTemplates);
      attempt.current.acknowledged();setRejectTarget(null);setLastChange(null);
      if(result.receipt.review?.passed===false)toast.error('Security review failed ('+result.receipt.review.findings.length+' findings).');
      else toast.success('Template '+result.template.governance_status.replaceAll('_',' ')+'.');
    }catch(error){const message=error instanceof Error?error.message:'Change unconfirmed. Retry the same action.';setSaveError(message);toast.error(message);}
  });
  const handleAction=(id:number,action:string)=>{
    const row=[...inReview,...failedSecurity].find(t=>t.id===id);
    if(!row?.id||!row.workspace_revision||row.is_active!==true||flight.current)return;
    const capability=row.branding_profile_id===undefined?noTemplateCapabilities:templateCapabilities({branding_profile_id:row.branding_profile_id},profiles,globalTemplateCapabilities);
    if(action==='approve'||action==='reject'){
      if(!canApprove||!capability.approve)return;
      if(action==='reject'){setRejectTarget(id);return;}
      change(row as ReportTemplate,'approve');
    }else if(action==='publish'&&canPublish&&capability.publish)change(row as ReportTemplate,'publish');
    else if(action==='rerun_security'&&canManage&&capability.manage)change(row as ReportTemplate,'review');
  };
  const handleReject=(reason:string)=>{
    const row=inReview.find(t=>t.id===rejectTarget);
    if(!row?.id||!row.workspace_revision||row.is_active!==true||!canApprove||flight.current||row.branding_profile_id===undefined)return;
    if(!templateCapabilities({branding_profile_id:row.branding_profile_id},profiles,globalTemplateCapabilities).approve)return;
    change(row as ReportTemplate,'reject',reason);
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6">
      <ERPPageHeader
        title="Template Governance"
        description="Review status, approver queue, and security checks for report templates"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Templates", href: "/admin/reports/templates" },
          { label: "Governance" },
        ]}
        actions={
          <Link href="/admin/reports/templates">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Templates
            </Button>
          </Link>
        }
      />

      {saveError&&<div role="alert" className="text-destructive">{saveError}{lastChange&&<Button disabled={isPending} variant="outline" onClick={()=>change(lastChange.row,lastChange.action,lastChange.note)}>Retry last action / reload saved result</Button>}</div>}
      {/* Status count cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Template Status ({total} total)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STATUS_CARDS.map(({ key, label, description, colorClass }) => (
            <div
              key={key}
              className={cn(
                "rounded-xl border p-4 text-center",
                colorClass
              )}
            >
              <div className="text-3xl font-bold">{counts[key] ?? 0}</div>
              <div className="text-xs font-semibold mt-1">{label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Approver queue */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <SendHorizonal className="h-3.5 w-3.5" />
          Approver Queue
          {inReview.length > 0 && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
              {inReview.length} pending
            </Badge>
          )}
        </h2>
        {isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating…
          </div>
        ) : inReview.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
            No templates pending review.
          </div>
        ) : (
          <GovernanceQueue rows={inReview} tableId="template-governance.inReview" canApprove={canApprove} canPublish={canPublish} canManage={canManage} onAction={handleAction} busy={isPending} profiles={profiles} globalTemplateCapabilities={globalTemplateCapabilities} />
        )}
      </div>

      {/* Failed security review */}
      {failedSecurity.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
            Failed Security Reviews
            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">
              {failedSecurity.length} template{failedSecurity.length !== 1 ? "s" : ""}
            </Badge>
          </h2>
          <GovernanceQueue rows={failedSecurity} tableId="template-governance.failedSecurity" canApprove={canApprove} canPublish={canPublish} canManage={canManage} onAction={handleAction} busy={isPending} profiles={profiles} globalTemplateCapabilities={globalTemplateCapabilities} />
        </div>
      )}

      <RejectDialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) setRejectTarget(null); }}
        onSubmit={handleReject}
        isSubmitting={isPending}
      />
    </div>
  );
}
