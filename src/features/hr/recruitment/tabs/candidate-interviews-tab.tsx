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
import {useRecruitmentLifecycle}from'../use-recruitment-lifecycle';
import{RecruitmentRecovery}from'../recruitment-recovery';
import{RecruitmentDecisionDialog}from'../recruitment-decision-dialog';
import{RecruitmentAssignee}from'../recruitment-assignee';
import{RecruitmentHistory}from'../recruitment-history';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
import{dubaiAppointmentInput,dubaiAppointmentValue}from'@/lib/hr/recruitment-time';
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState} from "react";
import { toast } from "sonner";

type Props = CandidateChildAdmissionProps & CandidateChildReadProps & {
  candidateId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
};

const ROUND_OPTIONS = [
  { value: "screening", label: "Screening" },
  { value: "first", label: "1st Interview" },
  { value: "second", label: "2nd Interview" },
  { value: "technical", label: "Technical" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
];

const RESULT_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "hold", label: "Hold" },
  { value: "fail", label: "Fail" },
  { value: "pending", label: "Pending" },
];

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
  rescheduled: "bg-purple-100 text-purple-700",
};

const RESULT_COLORS: Record<string, string> = {
  pass: "bg-green-100 text-green-700",
  hold: "bg-amber-100 text-amber-700",
  fail: "bg-red-100 text-red-700",
  pending: "bg-slate-100 text-slate-700",
};

type InterviewForm = {
  interviewer_id:number|null;
  reason:string;
  interview_round: string;
  interview_datetime: string;
  interview_location: string;
  interview_status: string;
  result: string;
  score: string;
  feedback: string;
  next_step: string;
};

const EMPTY_FORM: InterviewForm = {
  interviewer_id:null,
  reason:'',
  interview_round: "first",
  interview_datetime: "",
  interview_location: "",
  interview_status: "scheduled",
  result: "",
  score: "",
  feedback: "",
  next_step: "",
};

export function CandidateInterviewsTab({ candidateId, canManage, authContext, onReadDenied, onChildOpen, mutationAdmitted = true, onRetryMutationAdmission }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateChildDetailMap["interviews"] | null>(null);
  const [form, setForm] = useState<InterviewForm>(EMPTY_FORM);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorGeneration = useRef(0);
  const [unavailableEditor, setUnavailableEditor] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const session=useRecruitmentLifecycle(authContext,candidateId,null,'interview');
  const isPending=transitionPending||session.busy;
  const[decision,setDecision]=useState<RecruitmentLifecycleRequest|null>(null);

  const read = useHrCandidateChildren("interviews", candidateId, {authContext, onReadDenied});
  const interviews = read.rows;
  const mutation = useCandidateChildReadAdmission({canManage, mutationAdmitted, reads: read.reads, onRetryMutationAdmission});
  const {detailUnavailable, closeDetail} = read;
  useEffect(() => {
    if (!detailUnavailable) return;
    setEditorVersion(++editorGeneration.current); setEditing(null); setForm(EMPTY_FORM);
    setDialogOpen(false); setUnavailableEditor(true); closeDetail(); onChildOpen?.(false);
  }, [detailUnavailable, closeDetail, onChildOpen]);

  function openAdd() {
    if (!mutation.canDispatch()||!session.startNew()) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    read.closeDetail();
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  async function openEdit(row: CandidateChildRowMap["interviews"]) {
    if (!mutation.canDispatch()||!session.startNew()) return;
    const interview = await read.loadDetail(row.id);
    if (!interview) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    setEditing(interview);
    setForm({
      interviewer_id:interview.interviewer_id,
      reason:'',
      interview_round: interview.interview_round,
      interview_datetime:dubaiAppointmentInput(interview.interview_datetime),
      interview_location: interview.interview_location ?? "",
      interview_status: interview.interview_status,
      result: interview.result ?? "",
      score: interview.score != null ? String(interview.score) : "",
      feedback: interview.feedback ?? "",
      next_step: interview.next_step ?? "",
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

  const set = (key: keyof InterviewForm, value: string|number|null) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
    startTransition(async () => {
      if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
      const payload = {
        interview_round: form.interview_round as "screening" | "first" | "second" | "technical" | "final" | "other",
        interview_datetime:dubaiAppointmentValue(form.interview_datetime,editing?.interview_datetime??null),
        interviewer_id:form.interviewer_id,
        interview_location: form.interview_location || null,
        interview_status: form.interview_status as "scheduled" | "completed" | "cancelled" | "no_show" | "rescheduled",
        result: (form.result as "pass" | "hold" | "fail" | "pending") || null,
        score: form.score ? parseFloat(form.score) : null,
        feedback: form.feedback || null,
        next_step: form.next_step || null,
      };

      let action:RecruitmentLifecycleRequest['action']=editing?'update':'create';
      if(editing){
        if(form.interview_status!==editing.interview_status)action=({completed:'complete',cancelled:'cancel',no_show:'no-show',rescheduled:'reschedule'}as const)[form.interview_status as'completed']??'update';
        else if(payload.interview_datetime&&Date.parse(payload.interview_datetime)!==Date.parse(editing.interview_datetime??''))action='reschedule';
      }
      const {interview_status,...fields}=payload;void interview_status;
      const res=await session.submit({kind:'interview',candidateId,id:editing?.id??null,revision:editing?String(editing.workspace_revision):null,action,values:['cancel','no-show'].includes(action)?{}:fields,reason:form.reason});
      if(!session.isCurrent())return;

      if (res.success) {
        toast.success(editing ? "Interview updated" : "Interview scheduled");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateInterviews(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "interviews");
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to save interview");
      }
    });
  }

  function handleArchive(id: number) {
    const row=interviews.find(r=>r.id===id);if(!row||!mutation.canDispatch()||!session.startNew())return;
    setDecision({kind:'interview',candidateId,id,revision:String(row.workspace_revision),action:'archive',values:{},reason:''});
  }

  const recovered=()=>{invalidateRecruitmentCandidateReadModels(queryClient,candidateId,'interviews');void queryClient.invalidateQueries({queryKey:candidateChildPrefix('interviews',candidateId)});setDialogOpen(false);setDecision(null);onChildOpen?.(false);};
  const recovery=<RecruitmentRecovery session={session}onSaved={recovered}onRetire={()=>{setForm(EMPTY_FORM);setEditing(null);setDialogOpen(false);setDecision(null);onChildOpen?.(false);}}/>;
  if (read.denied) return <p role="alert">Candidate interview access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
      {!dialogOpen&&!decision&&recovery}
      <RecruitmentDecisionDialog request={decision}busy={isPending}locked={!!session.pending}recovery={recovery}onClose={()=>setDecision(null)}onConfirm={async reason=>{if(!decision||!mutation.canDispatch())return;const r=await session.submit({...decision,reason});if(r.success&&session.isCurrent())recovered();}}/>
      {unavailableEditor && <p role="alert" className="mb-3 text-sm text-destructive">This child record is no longer available. Its private editor entries were removed; your candidate draft is unchanged.</p>}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Interviews</h3>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={!mutation.ready}>
            <Plus className="h-4 w-4 mr-1" /> Schedule Interview
          </Button>
        )}
      </div>

      {read.detailPending && <p role="status">Loading complete interview…</p>}
      {
        <div className="divide-y border rounded-lg">
<RecordCollection presentation="embedded" id="hr.candidate-interviews-tab.CandidateInterviewsTab.interviews" rows={interviews} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"interview_round","path":"interview_round","label":"Interview Round"},{"id":"interview_status","path":"interview_status","label":"Interview Status"},{"id":"interview_datetime","path":"interview_datetime","label":"Interview Datetime (UTC)"}]} renderRecord={(interview) => (
            <div key={interview.id} className="flex items-center gap-3 p-3">
              <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium capitalize">{interview.interview_round.replace(/_/g, " ")} Interview</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[interview.interview_status]}`}>
                    {interview.interview_status}
                  </span>
                  {interview.result && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RESULT_COLORS[interview.result]}`}>
                      {interview.result}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {interview.interview_datetime ? new Date(interview.interview_datetime).toLocaleString() : "No date set"}
                  {interview.interview_location && ` · ${interview.interview_location}`}
                  {interview.score != null && ` · Score: ${interview.score}`}
                </p>
                <RecruitmentHistory candidate={candidateId}kind="interview"id={interview.id}identity={read.identity}/>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button aria-label="Edit record" size="sm" variant="ghost" onClick={() => openEdit(interview)} disabled={!mutation.ready}><Pencil className="h-4 w-4" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" onClick={() => handleArchive(interview.id)} disabled={isPending || !mutation.ready}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title={editing ? "Edit Interview" : "Schedule Interview"}
        subtitle="Record interview details and outcome"
        icon={<Calendar className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isPending}
        closeDisabled={!!session.pending}
        recoveryActions={recovery}
        submitDisabled={!mutation.ready||session.blocked||!!session.pending||!form.reason.trim()}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12"><RequiredLabel required>Interviewer</RequiredLabel><RecruitmentAssignee required candidate={candidateId}value={form.interviewer_id}onChange={id=>set('interviewer_id',id)}identity={read.identity}label="Interviewer"disabled={!dialogOpen||!!session.pending}/></div>
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Interview Round</RequiredLabel>
            <ERPCombobox ariaLabel="Interview Round" required value={form.interview_round || null} onValueChange={(v) => set("interview_round", String(v ?? "first"))} options={ROUND_OPTIONS} placeholder="Select round" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.interview_status || null} onValueChange={(v) => set("interview_status", String(v ?? "scheduled"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Date & Time (Dubai)</Label>
            <Input aria-label="Date & Time" type="datetime-local" required value={form.interview_datetime} onChange={(e) => set("interview_datetime", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Location / Link</Label>
            <Input aria-label="Location / Link" value={form.interview_location} onChange={(e) => set("interview_location", e.target.value)} placeholder="Office / Video link" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Result</Label>
            <ERPCombobox ariaLabel="Result" value={form.result || null} onValueChange={(v) => set("result", String(v ?? ""))} options={RESULT_OPTIONS} placeholder="Select result" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Score (0–100)</Label>
            <Input aria-label="Score (0–100)" type="number" min={0} max={100} value={form.score} onChange={(e) => set("score", e.target.value)} placeholder="e.g. 85" />
          </div>
          <div className="col-span-12">
            <Label>Feedback</Label>
            <Textarea aria-label="Feedback" value={form.feedback} onChange={(e) => set("feedback", e.target.value)} rows={3} placeholder="Interview feedback notes..." />
          </div>
          <div className="col-span-12">
            <RequiredLabel required>Decision / change reason</RequiredLabel><Textarea aria-label="Decision / change reason"required maxLength={2000}value={form.reason}onChange={e=>set('reason',e.target.value)}/>
          </div>
          <div className="col-span-12">
            <Label>Next Step</Label>
            <Input aria-label="Next Step" value={form.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="Next action or recommendation" />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
