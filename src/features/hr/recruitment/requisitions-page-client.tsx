"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/query/query-keys";
import type {RecruitmentRequisitionDetail} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {useRecruitmentInquiry, useRecruitmentInquiryIdentity, type RecruitmentInquiryProps} from "@/hooks/use-hr-recruitment-inquiry";
import {RecruitmentInquiryTable} from "./recruitment-inquiry-table";
import{useRecruitmentLifecycle}from'./use-recruitment-lifecycle';
import{RecruitmentRecovery}from'./recruitment-recovery';
import{RecruitmentDecisionDialog}from'./recruitment-decision-dialog';
import{RequisitionCapacity}from'./requisition-capacity';
import{RecruitmentReceiptHistory,RecruitmentHistory}from'./recruitment-history';
import{OwnerCompanySelect}from'@/components/erp/organizations/owner-company-select';
import{BranchSelect}from'@/components/erp/organizations/branch-select';
import{requisitionEditValues,type RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
import { useQueryClient } from "@tanstack/react-query";
import {canCreateRecruitmentDestination,requisitionCreationSchema} from '@/lib/hr/numbered-recruitment-contract';
import {useNumberedRecruitmentSession} from './use-numbered-recruitment-session';
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { useState} from "react";
import { toast } from "sonner";

type Props = RecruitmentInquiryProps;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "filled", label: "Filled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  open: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  filled: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  closed: "bg-gray-100 text-gray-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

type ReqForm = {
  ownerCompanyId:number|null;branchId:number|null;
  reason:string;
  requisition_title: string;
  vacancies_count: string;
  requisition_status: string;
  priority: string;
  target_start_date: string;
  job_description: string;
  requirements: string;
  notes: string;
};

const EMPTY_FORM: ReqForm = {
  ownerCompanyId:null,branchId:null,
  reason:'',
  requisition_title: "",
  vacancies_count: "1",
  requisition_status: "draft",
  priority: "normal",
  target_start_date: "",
  job_description: "",
  requirements: "",
  notes: "",
};

export function RequisitionsPageClient(props: Props) {
  const identity = useRecruitmentInquiryIdentity("requisitions", props.authContext);
  return <RequisitionsSession key={identity} {...props} identity={identity} />;
}
function RequisitionsSession(props: Props & {identity: string}) {
  const read = useRecruitmentInquiry("requisitions", props, props.identity);
  // Keep the read owner mounted so denial stays latched, but retire every
  // private editor value and action with its child when this session is denied.
  // A transient read failure does not unmount the child or discard its draft.
  if (read.denied) return <p role="alert">Recruitment records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  return <PermittedRequisitionsSession {...props} read={read} />;
}
function PermittedRequisitionsSession(props: Props & {identity: string; read: ReturnType<typeof useRecruitmentInquiry<"requisitions">>}) {
  const {authContext, read} = props;
  const queryClient = useQueryClient();
  const canManage = authContext.permissionCodes.includes("hr.recruitment.manage") || authContext.roleCodes.includes("system_admin");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentRequisitionDetail | null>(null);
  const [form, setForm] = useState<ReqForm>(EMPTY_FORM);
  const [transitionPending, startTransition] = useTransition();
  const editSession=useRecruitmentLifecycle(authContext,null,null,'requisition');
  const isPending=transitionPending||editSession.busy;
  const[decision,setDecision]=useState<RecruitmentLifecycleRequest|null>(null);
  const creation=useNumberedRecruitmentSession('requisition',authContext.profile?.id);
  const canCreate=canCreateRecruitmentDestination(authContext,form.ownerCompanyId,form.branchId);
  const canCreateSomeScope=canCreateRecruitmentDestination(authContext,null,null)||!!authContext.roleAssignments?.some(r=>canCreateRecruitmentDestination(authContext,r.ownerCompanyId,r.branchId));

  const set = (key: keyof ReqForm, value: string|number|null) => setForm((p) => ({ ...p, [key]: value }));

  function openAdd() {
    if(editSession.pending||editSession.blocked)return;
    if (read.denied || (!creation.pending && (read.busy || read.isError || read.invalid))) return;
    setEditing(null);
    const pending=creation.pending;
    if(pending?.kind==='requisition'){
      const value=pending.payload;
      setForm({ownerCompanyId:value.owner_company_id??null,branchId:value.branch_id??null,reason:'',requisition_title:value.requisition_title,vacancies_count:String(value.vacancies_count),requisition_status:value.requisition_status,priority:value.priority,target_start_date:value.target_start_date??'',job_description:value.job_description??'',requirements:value.requirements??'',notes:value.notes??''});
    }else{if(!creation.startNew())return;setForm(EMPTY_FORM);}
    setDialogOpen(true);
  }

  async function openEdit(id: number) {
    if (creation.pending || creation.saving||!editSession.startNew()) return;
    const req = await read.loadRequisition(id);
    if (!req) return;
    setEditing(req);
    setForm({
      ownerCompanyId:null,branchId:null,
      reason:'',
      requisition_title: req.requisition_title,
      vacancies_count: String(req.vacancies_count),
      requisition_status: req.requisition_status,
      priority: req.priority,
      target_start_date: req.target_start_date ?? "",
      job_description: req.job_description ?? "",
      requirements: req.requirements ?? "",
      notes: req.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (read.denied || ((!creation.pending || editing) && (read.busy || read.isError || read.invalid || editing && !read.data.some(row => row.id === editing.id)))) return;
    if(!editing){
      const parsed=requisitionCreationSchema.safeParse({...(form.ownerCompanyId!==null?{owner_company_id:form.ownerCompanyId,branch_id:form.branchId}:{}),requisition_title:form.requisition_title,vacancies_count:Number(form.vacancies_count),requisition_status:form.requisition_status,priority:form.priority,target_start_date:form.target_start_date||null,job_description:form.job_description||null,requirements:form.requirements||null,notes:form.notes||null});
      if(!creation.pending&&!parsed.success){toast.error(parsed.error.issues[0]?.message??'Check requisition values.');return;}
      const value=creation.pending?.kind==='requisition'?creation.pending.payload:parsed.success?parsed.data:null;
      if(!value)return;
      const receipt=await creation.submit(value,null);
      if(!receipt||!creation.isCurrent())return;
      toast.success('Requisition created');setDialogOpen(false);
      try{await queryClient.invalidateQueries({queryKey:queryKeys.recruitment.requisitions()});}catch{toast.message('Saved. Refresh the list to see the requisition.');}
      return;
    }
    startTransition(async () => {
      const payload = {
        requisition_title: form.requisition_title,
        vacancies_count: Number(form.vacancies_count),
        requisition_status: form.requisition_status as "draft" | "open" | "on_hold" | "filled" | "cancelled" | "closed",
        priority: form.priority as "low" | "normal" | "high" | "urgent",
        target_start_date: form.target_start_date || null,
        job_description: form.job_description || null,
        requirements: form.requirements || null,
        notes: form.notes || null,
      };

      const parsed=requisitionEditValues.safeParse(payload);if(!parsed.success){toast.error('Check the required fields, date and positive whole vacancy count.');return;}
      const res=await editSession.submit({kind:'requisition',candidateId:null,id:editing.id,revision:String(editing.workspace_revision),action:'update',values:parsed.data,reason:form.reason});
      if(!editSession.isCurrent())return;

      if (res.success) {
        toast.success(editing ? "Requisition updated" : "Requisition created");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.requisitions() });
        setDialogOpen(false);
      } else {
        toast.error(res.error ?? "Failed to save requisition");
      }
    });
  }

  async function handleArchive(id: number) {
    if (read.denied || read.busy || read.isError || read.invalid || !read.data.some(row => row.id === id)) return;
    if(creation.pending||creation.saving||!editSession.startNew())return;const row=await read.loadRequisition(id);if(!row)return;
    setDecision({kind:'requisition',candidateId:null,id,revision:String(row.workspace_revision),action:'archive',values:{},reason:''});
  }
  const recovered=()=>{setDialogOpen(false);setDecision(null);void queryClient.invalidateQueries({queryKey:queryKeys.recruitment.requisitions()});};
  const recovery=<RecruitmentRecovery session={editSession}onSaved={recovered}onRetire={()=>{setForm(EMPTY_FORM);setEditing(null);setDialogOpen(false);setDecision(null);}}/>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {!dialogOpen&&!decision&&recovery}
      {canManage&&<RecruitmentReceiptHistory candidate={null}identity={props.identity}/>}
      <RecruitmentDecisionDialog request={decision}busy={isPending}locked={!!editSession.pending}recovery={recovery}onClose={()=>setDecision(null)}onConfirm={async reason=>{if(!decision||read.denied||read.busy||read.isError||read.invalid)return;const r=await editSession.submit({...decision,reason});if(r.success&&editSession.isCurrent())recovered();}}/>
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Job Requisitions</h1>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={creation.saving||creation.blocked||(!canCreateSomeScope&&!creation.pending)}>
            <Plus className="h-4 w-4 mr-1" /> {creation.pending?'Recover Requisition':'New Requisition'}
          </Button>
        )}
      </div>
      {!canCreate&&canManage&&!creation.pending&&<p className="text-sm text-amber-700">Creating an unscoped requisition requires global recruitment management and numbering generation.</p>}
      {creation.error&&!dialogOpen&&<p role="alert" className="text-sm text-destructive">{creation.error}</p>}

      <RecruitmentInquiryTable kind="requisitions" identity={props.identity} read={read} columns={[
        {id: "requisition_code", header: "Code", accessorKey: "requisition_code", enableHiding: false, size: 150},
        {id: "requisition_title", header: "Requisition", accessorKey: "requisition_title", enableHiding: false, size: 240},
        {id: "requisition_status", header: "Status", accessorKey: "requisition_status", size: 150, cell: ({row}) => <span className={STATUS_COLORS[row.original.requisition_status]}>{row.original.requisition_status.replaceAll("_", " ")}</span>},
        {id: "priority", header: "Priority", accessorKey: "priority", size: 130, cell: ({row}) => <span className={PRIORITY_COLORS[row.original.priority]}>{row.original.priority}</span>},
        {id: "vacancies_count", header: "Vacancies", accessorKey: "vacancies_count", enableSorting: false, size: 180,cell:({row})=><RequisitionCapacity id={row.original.id}vacancies={row.original.vacancies_count}identity={props.identity}/>},
        {id: "department", header: "Department", accessorFn: row => row.department?.department_name_en ?? "—", enableSorting: false, size: 200},
        {id: "designation", header: "Designation", accessorFn: row => row.designation?.designation_name_en ?? "—", enableSorting: false, size: 200},
        {id: "target_start_date", header: "Target start", accessorFn: row => row.target_start_date ?? "—", size: 150},
        {id: "actions", header: "Actions", enableSorting: false, cell: ({row}) => canManage && <div className="flex gap-1">
          <Button aria-label="Edit record" size="sm" variant="ghost" onClick={() => void openEdit(row.original.id)} disabled={read.detailPending || isPending || creation.saving || !!creation.pending}><Pencil className="h-4 w-4" /></Button>
          <Button aria-label="Archive record" size="sm" variant="ghost" onClick={() => handleArchive(row.original.id)} disabled={isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>},
      ]} />

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={open=>{if(!editSession.pending&&!editSession.busy)setDialogOpen(open);}}
        title={editing ? "Edit Requisition" : "New Job Requisition"}
        subtitle="Create or edit a hiring request"
        icon={<Briefcase className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isPending||creation.saving}
        closeDisabled={!!editSession.pending}
        recoveryActions={recovery}
        submitDisabled={editing?(read.busy||read.isError||read.invalid||editSession.blocked||!!editSession.pending||!form.reason.trim()):(!creation.pending&&!canCreate)}
        onSubmit={handleSave}
        submitLabel={!editing&&creation.pending?'Retry Original Request':undefined}
      >
        {(read.busy||read.isError||read.invalid)&&<div role="status">The current list could not be verified. Your fields are retained; saving is paused.<Button type="button"variant="outline"disabled={read.busy}onClick={()=>void read.refetch()}>Retry required checks</Button></div>}
        {!editing&&creation.error&&<p role="alert" className="text-sm text-destructive">{creation.error}</p>}
        <fieldset disabled={!editing&&(creation.saving||!!creation.pending||creation.blocked)} className="grid grid-cols-12 gap-4">
          {!editing&&<><div className="col-span-12 md:col-span-6"><Label>Employer company</Label><OwnerCompanySelect ariaLabel="Requisition employer company"value={form.ownerCompanyId}onValueChange={id=>setForm(p=>({...p,ownerCompanyId:id,branchId:null}))}/></div><div className="col-span-12 md:col-span-6"><Label>Branch</Label><BranchSelect value={form.branchId}ownerCompanyId={form.ownerCompanyId}onValueChange={id=>set('branchId',id)}allowClear disabled={form.ownerCompanyId===null}/></div></>}
          {editing&&<div className="col-span-12"><RequiredLabel required>Decision / change reason</RequiredLabel><Textarea aria-label="Decision / change reason"required maxLength={2000}value={form.reason}onChange={e=>set('reason',e.target.value)}/></div>}
          {editing&&<div className="col-span-12"><RecruitmentHistory candidate={null}kind="requisition"id={editing.id}identity={props.identity}/></div>}
          <div className="col-span-12">
            <RequiredLabel required>Requisition Title</RequiredLabel>
            <Input aria-label="Requisition Title" required value={form.requisition_title} onChange={(e) => set("requisition_title", e.target.value)} placeholder="e.g. Senior Software Engineer" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.requisition_status || null} onValueChange={(v) => set("requisition_status", String(v ?? "draft"))} options={STATUS_OPTIONS} placeholder="Status" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Priority</Label>
            <ERPCombobox ariaLabel="Priority" value={form.priority || null} onValueChange={(v) => set("priority", String(v ?? "normal"))} options={PRIORITY_OPTIONS} placeholder="Priority" />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Vacancies</Label>
            <Input aria-label="Vacancies" type="number" min={1} value={form.vacancies_count} onChange={(e) => set("vacancies_count", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Target Start</Label>
            <Input aria-label="Target Start" type="date" value={form.target_start_date} onChange={(e) => set("target_start_date", e.target.value)} />
          </div>
          <div className="col-span-12">
            <Label>Job Description</Label>
            <Textarea aria-label="Job Description" value={form.job_description} onChange={(e) => set("job_description", e.target.value)} rows={4} placeholder="Describe the role, responsibilities, and context..." />
          </div>
          <div className="col-span-12">
            <Label>Requirements</Label>
            <Textarea aria-label="Requirements" value={form.requirements} onChange={(e) => set("requirements", e.target.value)} rows={3} placeholder="Skills, qualifications, experience required..." />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Internal notes..." />
          </div>
        </fieldset>
      </ERPChildDialogForm>
    </div>
  );
}
