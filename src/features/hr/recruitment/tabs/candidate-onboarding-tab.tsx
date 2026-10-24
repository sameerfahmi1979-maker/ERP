"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import {CandidateChildReadPause, useCandidateChildReadAdmission, type CandidateChildAdmissionProps} from "../candidate-child-read-admission";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invalidateRecruitmentCandidateReadModels } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import type {CandidateChildDetailMap, CandidateChildRowMap} from "@/lib/reads/hr-candidate-children-schema";
import {useHrCandidateChildren,candidateChildPrefix, type CandidateChildReadProps} from "@/hooks/use-hr-candidate-children";
import{useRecruitmentLifecycle}from'../use-recruitment-lifecycle';
import{RecruitmentRecovery}from'../recruitment-recovery';
import{RecruitmentDecisionDialog}from'../recruitment-decision-dialog';
import{RecruitmentAssignee}from'../recruitment-assignee';
import{RecruitmentHistory}from'../recruitment-history';
import{RecruitmentTaskChoice}from'../recruitment-task-choice';
import{prepareJoiningTask}from'@/server/actions/hr/recruitment-lifecycle';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, CheckSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState} from "react";
import { toast } from "sonner";

type Props = CandidateChildAdmissionProps & CandidateChildReadProps & {
  candidateId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
};

const CATEGORY_OPTIONS = [
  { value: "document", label: "Document" },
  { value: "medical", label: "Medical" },
  { value: "visa", label: "Visa" },
  { value: "training", label: "Training" },
  { value: "site_access", label: "Site Access" },
  { value: "payroll", label: "Payroll" },
  { value: "it", label: "IT" },
  { value: "operations", label: "Operations" },
  { value: "hr", label: "HR" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
  { value: "not_applicable", label: "Not Applicable" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
  not_applicable: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
};

type TaskForm = {
  assigned_to:number|null;completion_criteria:string;is_required:boolean;evidence_required:boolean;dms_document_id:string;prerequisite_task_id:string;reason:string;
  task_title: string;
  task_category: string;
  task_status: string;
  due_date: string;
  notes: string;
};

const EMPTY_FORM: TaskForm = { assigned_to:null,completion_criteria:'',is_required:true,evidence_required:false,dms_document_id:'',prerequisite_task_id:'',reason:'',task_title: "", task_category: "", task_status: "pending", due_date: "", notes: "" };

export function CandidateOnboardingTab({ candidateId, canManage, authContext, onReadDenied, onChildOpen, mutationAdmitted = true, onRetryMutationAdmission }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateChildDetailMap["onboarding"] | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorGeneration = useRef(0);
  const [unavailableEditor, setUnavailableEditor] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const[decision,setDecision]=useState<RecruitmentLifecycleRequest|null>(null);
  const[subjectEmployee,setSubjectEmployee]=useState<number|null>(null);
  const session=useRecruitmentLifecycle(authContext,candidateId,subjectEmployee,'task');
  const isPending=transitionPending||session.busy;
  const[openingTask,setOpeningTask]=useState(false),openingFlight=useRef(false);

  const read = useHrCandidateChildren("onboarding", candidateId, {authContext, onReadDenied});
  const tasks = read.rows;
  const mutation = useCandidateChildReadAdmission({canManage, mutationAdmitted, reads: read.reads, onRetryMutationAdmission});
  const {detailUnavailable, closeDetail} = read;
  useEffect(() => {
    if (!detailUnavailable) return;
    setEditorVersion(++editorGeneration.current); setEditing(null); setForm(EMPTY_FORM);
    setDialogOpen(false); setUnavailableEditor(true); closeDetail(); onChildOpen?.(false);
  }, [detailUnavailable, closeDetail, onChildOpen]);

  async function openAdd() {
    if (openingFlight.current||!mutation.canDispatch()||session.pending||session.blocked||!session.startNew()) return;
    openingFlight.current=true;setOpeningTask(true);
    try{
    const subject=await prepareJoiningTask(candidateId);if(!subject.success||!mutation.canDispatch()||!session.isCurrent()){if(!subject.success)toast.error(subject.error);return;}
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    read.closeDetail();
    setEditing(null);
    setSubjectEmployee(subject.data.employee_id);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
    }finally{openingFlight.current=false;setOpeningTask(false);}
  }

  async function openEdit(row: CandidateChildRowMap["onboarding"]) {
    if (openingFlight.current||!mutation.canDispatch()||session.pending||session.blocked||!session.startNew()) return;
    const task = await read.loadDetail(row.id);
    if (!task) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    setEditing(task);
    setSubjectEmployee(task.employee_id);
    setForm({
      assigned_to:task.assigned_to,completion_criteria:task.completion_criteria??'',is_required:task.is_required,evidence_required:task.evidence_required,dms_document_id:task.dms_document_id?String(task.dms_document_id):'',prerequisite_task_id:task.prerequisite_task_id?String(task.prerequisite_task_id):'',reason:'',
      task_title: task.task_title,
      task_category: task.task_category ?? "",
      task_status: task.task_status,
      due_date: task.due_date ?? "",
      notes: task.notes ?? "",
    });
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function closeDialog() {
    if(session.busy||session.pending)return;
    if (editorVersion !== editorGeneration.current) return;
    setEditorVersion(++editorGeneration.current);
    read.closeDetail();
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof TaskForm, value: string|number|boolean|null) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
    startTransition(async () => {
      if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
      const payload = {
        assigned_to:form.assigned_to,completion_criteria:form.completion_criteria,is_required:form.is_required,evidence_required:form.evidence_required,dms_document_id:form.dms_document_id?Number(form.dms_document_id):null,prerequisite_task_id:form.prerequisite_task_id?Number(form.prerequisite_task_id):null,
        task_title: form.task_title,
        task_category: (form.task_category as "document" | "medical" | "visa" | "training" | "site_access" | "payroll" | "it" | "operations" | "hr" | "other") || null,
        due_date: form.due_date || null,
        notes: form.notes || null,
        candidate_id: candidateId,
        employee_id:subjectEmployee,
      };

      const res=await session.submit({kind:'task',candidateId,employeeId:subjectEmployee,id:editing?.id??null,revision:editing?String(editing.workspace_revision):null,action:editing?'update':'create',values:payload,reason:form.reason});
      if(!session.isCurrent())return;

      if (res.success) {
        toast.success(editing ? "Task updated" : "Task created");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOnboarding(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "onboarding");
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to save task");
      }
    });
  }

  function handleComplete(id: number) {
    decide(id,'complete');
  }

  function handleArchive(id: number) {
    decide(id,'archive');
  }
  function decide(id:number,action:RecruitmentLifecycleRequest['action']){const row=tasks.find(t=>t.id===id);if(openingFlight.current||!row||!mutation.canDispatch()||session.pending||session.blocked||!session.startNew())return;setSubjectEmployee(row.employee_id);setDecision({kind:'task',candidateId,employeeId:row.employee_id,id,revision:String(row.workspace_revision),action,values:{},reason:''});}

  const completedCount = tasks.filter((t) => t.task_status === "completed").length;

  const recovered=()=>{setDialogOpen(false);setDecision(null);onChildOpen?.(false);invalidateRecruitmentCandidateReadModels(queryClient,candidateId,'onboarding');void queryClient.invalidateQueries({queryKey:candidateChildPrefix('onboarding',candidateId)});};
  const recovery=<RecruitmentRecovery session={session}onSaved={recovered}onRetire={()=>{setForm(EMPTY_FORM);setEditing(null);setDialogOpen(false);setDecision(null);onChildOpen?.(false);}}/>;
  if (read.denied) return <p role="alert">Candidate onboarding access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
      {!dialogOpen&&!decision&&recovery}
      <RecruitmentDecisionDialog request={decision}busy={isPending}locked={!!session.pending}recovery={recovery}onClose={()=>setDecision(null)}onConfirm={async reason=>{if(!decision||!mutation.canDispatch())return;const r=await session.submit({...decision,reason});if(r.success&&session.isCurrent())recovered();}}/>
      {unavailableEditor && <p role="alert" className="mb-3 text-sm text-destructive">This child record is no longer available. Its private editor entries were removed; your candidate draft is unchanged.</p>}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Onboarding Tasks</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{completedCount}/{tasks.length} completed on this page</p>
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={openingTask||!mutation.ready}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        )}
      </div>

      {read.detailPending && <p role="status">Loading complete onboarding task…</p>}
      {
        <div className="divide-y border rounded-lg">
<RecordCollection presentation="embedded" id="hr.candidate-onboarding-tab.CandidateOnboardingTab.tasks" rows={tasks} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"task_title","path":"task_title","label":"Task Title"},{"id":"task_status","path":"task_status","label":"Task Status"},{"id":"due_date","path":"due_date","label":"Due Date"}]} renderRecord={(task) => (
            <div key={task.id} className="flex items-center gap-3 p-3">
              <CheckSquare className={`h-4 w-4 flex-shrink-0 ${task.task_status === "completed" ? "text-green-500" : "text-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${task.task_status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.task_title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[task.task_status]}`}>
                    {task.task_status.replace(/_/g, " ")}
                  </span>
                  {task.task_category && <span className="text-xs text-muted-foreground capitalize">{task.task_category}</span>}
                </div>
                {task.due_date && (
                  <p className="text-xs text-muted-foreground mt-0.5">Due: {task.due_date}</p>
                )}
                <RecruitmentHistory candidate={candidateId}employee={task.employee_id}kind="task"id={task.id}identity={read.identity}/>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  {task.task_status !== "completed" && task.task_status !== "not_applicable" && (
                    <Button aria-label="Mark complete" size="sm" variant="ghost" onClick={() => handleComplete(task.id)} disabled={isPending || !mutation.ready} title="Mark complete">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button aria-label="Edit record" size="sm" variant="ghost" onClick={() => openEdit(task)} disabled={!mutation.ready}><Pencil className="h-4 w-4" /></Button>
                  {['completed','cancelled','not_applicable','blocked'].includes(task.task_status)&&<Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>decide(task.id,'reopen')}>Reopen</Button>}
                  {!['completed','cancelled','not_applicable'].includes(task.task_status)&&<><Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>decide(task.id,'not-applicable')}>Not applicable</Button><Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>decide(task.id,'block')}>Block</Button><Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>decide(task.id,'cancel')}>Cancel task</Button></>}
                  <Button aria-label="Archive record" size="sm" variant="ghost" onClick={() => handleArchive(task.id)} disabled={isPending || !mutation.ready}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title={editing ? "Edit Task" : "Add Onboarding Task"}
        subtitle="Track onboarding checklist items"
        icon={<CheckSquare className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        closeDisabled={!!session.pending}
        recoveryActions={recovery}
        submitDisabled={!mutation.ready||session.blocked||!!session.pending||!form.reason.trim()}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12"><RequiredLabel required={form.is_required}>Authorized assignee</RequiredLabel><RecruitmentAssignee required={form.is_required}candidate={candidateId}employee={subjectEmployee}value={form.assigned_to}onChange={id=>set('assigned_to',id)}identity={read.identity}label="Authorized assignee"disabled={!dialogOpen||!!session.pending}/></div>
          <div className="col-span-12">
            <RequiredLabel required>Task Title</RequiredLabel>
            <Input aria-label="Task Title" required value={form.task_title} onChange={(e) => set("task_title", e.target.value)} placeholder="e.g. Collect passport copy" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Category</Label>
            <ERPCombobox ariaLabel="Category" value={form.task_category || null} onValueChange={(v) => set("task_category", String(v ?? ""))} options={CATEGORY_OPTIONS} placeholder="Select category" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" disabled value={form.task_status || null} onValueChange={()=>{}} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Due Date</Label>
            <Input aria-label="Due Date" type="date"required={form.is_required}value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div className="col-span-12">
            <RequiredLabel required>Completion criteria</RequiredLabel><Textarea aria-label="Completion criteria"required maxLength={2000}value={form.completion_criteria}onChange={e=>set('completion_criteria',e.target.value)}/>
            <Label><input type="checkbox"checked={form.is_required}onChange={e=>set('is_required',e.target.checked)}/> Required for joining</Label><Label><input type="checkbox"checked={form.evidence_required}onChange={e=>set('evidence_required',e.target.checked)}/> Document evidence required</Label>
          </div>
          <div className="col-span-12 md:col-span-6"><Label>Evidence document</Label><RecruitmentTaskChoice candidate={candidateId}identity={read.identity}kind="evidence"value={form.dms_document_id}onChange={value=>set('dms_document_id',value)}disabled={!dialogOpen||!!session.pending}/></div>
          <div className="col-span-12 md:col-span-6"><Label>Prerequisite task</Label><RecruitmentTaskChoice candidate={candidateId}identity={read.identity}kind="prerequisite"value={form.prerequisite_task_id}onChange={value=>set('prerequisite_task_id',value)}disabled={!dialogOpen||!!session.pending}exclude={editing?.id}/></div>
          <div className="col-span-12"><RequiredLabel required>Decision / change reason</RequiredLabel><Textarea aria-label="Decision / change reason"required maxLength={2000}value={form.reason}onChange={e=>set('reason',e.target.value)}/></div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
