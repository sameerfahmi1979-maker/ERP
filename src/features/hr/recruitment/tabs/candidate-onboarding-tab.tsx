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
import { archiveOnboardingTask, completeOnboardingTask, createOnboardingTask, updateOnboardingTask } from "@/server/actions/hr/recruitment";
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
  task_title: string;
  task_category: string;
  task_status: string;
  due_date: string;
  notes: string;
};

const EMPTY_FORM: TaskForm = { task_title: "", task_category: "", task_status: "pending", due_date: "", notes: "" };

export function CandidateOnboardingTab({ candidateId, canManage, authContext, onReadDenied, onChildOpen, mutationAdmitted = true, onRetryMutationAdmission }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateChildDetailMap["onboarding"] | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorGeneration = useRef(0);
  const [unavailableEditor, setUnavailableEditor] = useState(false);
  const [isPending, startTransition] = useTransition();

  const read = useHrCandidateChildren("onboarding", candidateId, {authContext, onReadDenied});
  const tasks = read.rows;
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

  async function openEdit(row: CandidateChildRowMap["onboarding"]) {
    if (!mutation.canDispatch()) return;
    const task = await read.loadDetail(row.id);
    if (!task) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    setEditing(task);
    setForm({
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
    if (editorVersion !== editorGeneration.current) return;
    setEditorVersion(++editorGeneration.current);
    read.closeDetail();
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof TaskForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
    startTransition(async () => {
      if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
      const payload = {
        task_title: form.task_title,
        task_category: (form.task_category as "document" | "medical" | "visa" | "training" | "site_access" | "payroll" | "it" | "operations" | "hr" | "other") || null,
        task_status: form.task_status as "pending" | "in_progress" | "completed" | "blocked" | "not_applicable" | "cancelled",
        due_date: form.due_date || null,
        notes: form.notes || null,
        candidate_id: candidateId,
      };

      const res = editing
        ? await updateOnboardingTask(editing.id, payload)
        : await createOnboardingTask(payload);

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
    if (!mutation.canDispatch()) return;
    startTransition(async () => {
      if (!mutation.canDispatch()) return;
      const res = await completeOnboardingTask(id);
      if (res.success) {
        toast.success("Task completed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOnboarding(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "onboarding");
      } else {
        toast.error(res.error ?? "Failed to complete task");
      }
    });
  }

  function handleArchive(id: number) {
    if (!mutation.canDispatch()) return;
    startTransition(async () => {
      if (!mutation.canDispatch()) return;
      const res = await archiveOnboardingTask(id);
      if (res.success) {
        toast.success("Task removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOnboarding(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "onboarding");
      } else {
        toast.error(res.error ?? "Failed to remove task");
      }
    });
  }

  const completedCount = tasks.filter((t) => t.task_status === "completed").length;

  if (read.denied) return <p role="alert">Candidate onboarding access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
      {unavailableEditor && <p role="alert" className="mb-3 text-sm text-destructive">This child record is no longer available. Its private editor entries were removed; your candidate draft is unchanged.</p>}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Onboarding Tasks</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{completedCount}/{tasks.length} completed on this page</p>
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={!mutation.ready}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        )}
      </div>

      {read.detailPending && <p role="status">Loading complete onboarding task…</p>}
      {
        <div className="divide-y border rounded-lg">
<RecordCollection id="hr.candidate-onboarding-tab.CandidateOnboardingTab.tasks" rows={tasks} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"task_title","path":"task_title","label":"Task Title"},{"id":"task_status","path":"task_status","label":"Task Status"},{"id":"due_date","path":"due_date","label":"Due Date"}]} renderRecord={(task) => (
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
              </div>
              {canManage && (
                <div className="flex gap-1">
                  {task.task_status !== "completed" && task.task_status !== "not_applicable" && (
                    <Button aria-label="Mark complete" size="sm" variant="ghost" onClick={() => handleComplete(task.id)} disabled={isPending || !mutation.ready} title="Mark complete">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button aria-label="Edit record" size="sm" variant="ghost" onClick={() => openEdit(task)} disabled={!mutation.ready}><Pencil className="h-4 w-4" /></Button>
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
        submitDisabled={!mutation.ready}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        <div className="grid grid-cols-12 gap-4">
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
            <ERPCombobox ariaLabel="Status" value={form.task_status || null} onValueChange={(v) => set("task_status", String(v ?? "pending"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Due Date</Label>
            <Input aria-label="Due Date" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
