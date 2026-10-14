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
import {useHrCandidateChildren, type CandidateChildReadProps} from "@/hooks/use-hr-candidate-children";
import { archiveInterview, createInterview, updateInterview } from "@/server/actions/hr/recruitment";
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
  const [isPending, startTransition] = useTransition();

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
    if (!mutation.canDispatch()) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    read.closeDetail();
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  async function openEdit(row: CandidateChildRowMap["interviews"]) {
    if (!mutation.canDispatch()) return;
    const interview = await read.loadDetail(row.id);
    if (!interview) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    setEditing(interview);
    setForm({
      interview_round: interview.interview_round,
      interview_datetime: interview.interview_datetime?.slice(0, 16) ?? "",
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
    if (editorVersion !== editorGeneration.current) return;
    setEditorVersion(++editorGeneration.current);
    read.closeDetail();
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof InterviewForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
    startTransition(async () => {
      if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
      const payload = {
        interview_round: form.interview_round as "screening" | "first" | "second" | "technical" | "final" | "other",
        interview_datetime: form.interview_datetime || null,
        interview_location: form.interview_location || null,
        interview_status: form.interview_status as "scheduled" | "completed" | "cancelled" | "no_show" | "rescheduled",
        result: (form.result as "pass" | "hold" | "fail" | "pending") || null,
        score: form.score ? parseFloat(form.score) : null,
        feedback: form.feedback || null,
        next_step: form.next_step || null,
      };

      const res = editing
        ? await updateInterview(editing.id, payload)
        : await createInterview(candidateId, payload);

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
    if (!mutation.canDispatch()) return;
    startTransition(async () => {
      if (!mutation.canDispatch()) return;
      const res = await archiveInterview(id);
      if (res.success) {
        toast.success("Interview removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateInterviews(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "interviews");
      } else {
        toast.error(res.error ?? "Failed to remove");
      }
    });
  }

  if (read.denied) return <p role="alert">Candidate interview access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
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
<RecordCollection id="hr.candidate-interviews-tab.CandidateInterviewsTab.interviews" rows={interviews} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"interview_round","path":"interview_round","label":"Interview Round"},{"id":"interview_status","path":"interview_status","label":"Interview Status"},{"id":"interview_datetime","path":"interview_datetime","label":"Interview Datetime (UTC)"}]} renderRecord={(interview) => (
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
        submitDisabled={!mutation.ready}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Interview Round</RequiredLabel>
            <ERPCombobox ariaLabel="Interview Round" required value={form.interview_round || null} onValueChange={(v) => set("interview_round", String(v ?? "first"))} options={ROUND_OPTIONS} placeholder="Select round" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.interview_status || null} onValueChange={(v) => set("interview_status", String(v ?? "scheduled"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Date & Time</Label>
            <Input aria-label="Date & Time" type="datetime-local" value={form.interview_datetime} onChange={(e) => set("interview_datetime", e.target.value)} />
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
            <Label>Next Step</Label>
            <Input aria-label="Next Step" value={form.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="Next action or recommendation" />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
