"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listJobRequisitions, createJobRequisition, updateJobRequisition, archiveJobRequisition, changeJobRequisitionStatus } from "@/server/actions/hr/recruitment";
import type { JobRequisitionRow } from "@/server/actions/hr/recruitment";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Briefcase, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";

type Props = { authContext: AuthContext };

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
  requisition_title: "",
  vacancies_count: "1",
  requisition_status: "draft",
  priority: "normal",
  target_start_date: "",
  job_description: "",
  requirements: "",
  notes: "",
};

export function RequisitionsPageClient({ authContext }: Props) {
  const queryClient = useQueryClient();
  const canManage = authContext.permissionCodes.includes("hr.recruitment.manage") || authContext.roleCodes.includes("system_admin");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JobRequisitionRow | null>(null);
  const [form, setForm] = useState<ReqForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.requisitions({ search, status: statusFilter }),
    queryFn: () => listJobRequisitions({ search: search || undefined, status: statusFilter ?? undefined, pageSize: 100 }),
    staleTime: 30_000,
  });
  const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];

  const set = (key: keyof ReqForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(req: JobRequisitionRow) {
    setEditing(req);
    setForm({
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

  function handleSave() {
    startTransition(async () => {
      const payload = {
        requisition_title: form.requisition_title,
        vacancies_count: parseInt(form.vacancies_count) || 1,
        requisition_status: form.requisition_status as "draft" | "open" | "on_hold" | "filled" | "cancelled" | "closed",
        priority: form.priority as "low" | "normal" | "high" | "urgent",
        target_start_date: form.target_start_date || null,
        job_description: form.job_description || null,
        requirements: form.requirements || null,
        notes: form.notes || null,
      };

      const res = editing
        ? await updateJobRequisition(editing.id, payload)
        : await createJobRequisition(payload);

      if (res.success) {
        toast.success(editing ? "Requisition updated" : "Requisition created");
        queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.requisitions() });
        setDialogOpen(false);
      } else {
        toast.error(res.error ?? "Failed to save requisition");
      }
    });
  }

  function handleArchive(id: number) {
    startTransition(async () => {
      const res = await archiveJobRequisition(id);
      if (res.success) {
        toast.success("Requisition archived");
        queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.requisitions() });
      } else {
        toast.error(res.error ?? "Failed to archive");
      }
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Job Requisitions</h1>
          <p className="text-sm text-muted-foreground">{res?.data?.totalCount ?? 0} total</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> New Requisition
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search requisitions..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <ERPCombobox
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ? String(v) : null)}
          options={[{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS]}
          placeholder="Filter by status"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No requisitions found.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <Briefcase className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {row.requisition_code && <span className="text-xs font-mono text-muted-foreground">{row.requisition_code}</span>}
                  <span className="text-sm font-medium">{row.requisition_title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.requisition_status]}`}>{row.requisition_status.replace(/_/g, " ")}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[row.priority]}`}>{row.priority}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.vacancies_count} {row.vacancies_count === 1 ? "vacancy" : "vacancies"}
                  {row.department && ` · ${row.department.department_name_en}`}
                  {row.designation && ` · ${row.designation.designation_name_en}`}
                  {row.target_start_date && ` · Target: ${row.target_start_date}`}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(row.id)} disabled={isPending}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Requisition" : "New Job Requisition"}
        subtitle="Create or edit a hiring request"
        icon={<Briefcase className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isPending}
        onSubmit={handleSave}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <RequiredLabel required>Requisition Title</RequiredLabel>
            <Input value={form.requisition_title} onChange={(e) => set("requisition_title", e.target.value)} placeholder="e.g. Senior Software Engineer" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Status</Label>
            <ERPCombobox value={form.requisition_status || null} onValueChange={(v) => set("requisition_status", String(v ?? "draft"))} options={STATUS_OPTIONS} placeholder="Status" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Priority</Label>
            <ERPCombobox value={form.priority || null} onValueChange={(v) => set("priority", String(v ?? "normal"))} options={PRIORITY_OPTIONS} placeholder="Priority" />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Vacancies</Label>
            <Input type="number" min={1} value={form.vacancies_count} onChange={(e) => set("vacancies_count", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Target Start</Label>
            <Input type="date" value={form.target_start_date} onChange={(e) => set("target_start_date", e.target.value)} />
          </div>
          <div className="col-span-12">
            <Label>Job Description</Label>
            <Textarea value={form.job_description} onChange={(e) => set("job_description", e.target.value)} rows={4} placeholder="Describe the role, responsibilities, and context..." />
          </div>
          <div className="col-span-12">
            <Label>Requirements</Label>
            <Textarea value={form.requirements} onChange={(e) => set("requirements", e.target.value)} rows={3} placeholder="Skills, qualifications, experience required..." />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Internal notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
