"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listCandidateOnboardingTasks, createOnboardingTask, updateOnboardingTask, completeOnboardingTask, blockOnboardingTask, markOnboardingTaskNotApplicable, archiveOnboardingTask } from "@/server/actions/hr/recruitment";
import type { OnboardingTaskRow } from "@/server/actions/hr/recruitment";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, CheckSquare, CheckCircle, XCircle, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";

type Props = {
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

export function CandidateOnboardingTab({ candidateId, canManage, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OnboardingTaskRow | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.candidateOnboarding(candidateId),
    queryFn: () => listCandidateOnboardingTasks(candidateId),
    staleTime: 30_000,
  });
  const tasks = Array.isArray(res?.data) ? res.data : [];

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function openEdit(task: OnboardingTaskRow) {
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
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof TaskForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    startTransition(async () => {
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
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to save task");
      }
    });
  }

  function handleComplete(id: number) {
    startTransition(async () => {
      const res = await completeOnboardingTask(id);
      if (res.success) {
        toast.success("Task completed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOnboarding(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to complete task");
      }
    });
  }

  function handleArchive(id: number) {
    startTransition(async () => {
      const res = await archiveOnboardingTask(id);
      if (res.success) {
        toast.success("Task removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOnboarding(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to remove task");
      }
    });
  }

  const pendingCount = tasks.filter((t) => t.task_status === "pending" || t.task_status === "in_progress").length;
  const completedCount = tasks.filter((t) => t.task_status === "completed").length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Onboarding Tasks</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{completedCount}/{tasks.length} completed</p>
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No onboarding tasks yet.
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {tasks.map((task) => (
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
                    <Button size="sm" variant="ghost" onClick={() => handleComplete(task.id)} disabled={isPending} title="Mark complete">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(task)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(task.id)} disabled={isPending}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title={editing ? "Edit Task" : "Add Onboarding Task"}
        subtitle="Track onboarding checklist items"
        icon={<CheckSquare className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        onSubmit={handleSave}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <RequiredLabel required>Task Title</RequiredLabel>
            <Input value={form.task_title} onChange={(e) => set("task_title", e.target.value)} placeholder="e.g. Collect passport copy" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Category</Label>
            <ERPCombobox value={form.task_category || null} onValueChange={(v) => set("task_category", String(v ?? ""))} options={CATEGORY_OPTIONS} placeholder="Select category" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Status</Label>
            <ERPCombobox value={form.task_status || null} onValueChange={(v) => set("task_status", String(v ?? "pending"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
