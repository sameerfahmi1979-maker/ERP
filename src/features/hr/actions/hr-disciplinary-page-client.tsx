"use client";

import { useState, useEffect, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listGlobalDisciplinaryRecords,
  updateEmployeeDisciplinaryRecord,
  archiveEmployeeDisciplinaryRecord,
  acknowledgeEmployeeDisciplinaryRecord,
  closeEmployeeDisciplinaryRecord,
  type DisciplinaryRow,
} from "@/server/actions/hr/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import {
  AlertTriangle, Search, Eye, Pencil, Trash2, RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = { authContext: AuthContext };

type EditForm = {
  disciplinary_type: string;
  incident_date: string;
  record_date: string;
  severity: string;
  subject: string;
  description: string;
  action_taken: string;
  status: string;
  acknowledged_by_employee: boolean;
  creates_operational_block: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  low:      "bg-slate-100 text-slate-600 border-slate-200",
  medium:   "bg-amber-100 text-amber-700 border-amber-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_BADGE: Record<string, string> = {
  open:         "bg-blue-100 text-blue-700 border-blue-200",
  under_review: "bg-amber-100 text-amber-700 border-amber-200",
  closed:       "bg-slate-100 text-slate-600 border-slate-200",
  cancelled:    "bg-slate-100 text-slate-500 border-slate-200",
};

const DISCIPLINARY_TYPES = [
  { value: "verbal_warning",   label: "Verbal Warning" },
  { value: "written_warning",  label: "Written Warning" },
  { value: "final_warning",    label: "Final Warning" },
  { value: "suspension_notice",label: "Suspension Notice" },
  { value: "incident",         label: "Incident" },
  { value: "other",            label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "low",      label: "Low" },
  { value: "medium",   label: "Medium" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "open",         label: "Open" },
  { value: "under_review", label: "Under Review" },
  { value: "closed",       label: "Closed" },
  { value: "cancelled",    label: "Cancelled" },
];

function label(val: string) {
  return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Detail / Edit Dialog ───────────────────────────────────────────────────────

interface DetailDialogProps {
  record: DisciplinaryRow | null;
  open: boolean;
  mode: "view" | "edit";
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => void;
}

function toForm(r: DisciplinaryRow | null): EditForm {
  return {
    disciplinary_type:         r?.disciplinary_type ?? "verbal_warning",
    incident_date:             r?.incident_date ?? "",
    record_date:               r?.record_date ?? "",
    severity:                  r?.severity ?? "medium",
    subject:                   r?.subject ?? "",
    description:               r?.description ?? "",
    action_taken:              r?.action_taken ?? "",
    status:                    r?.status ?? "open",
    acknowledged_by_employee:  r?.acknowledged_by_employee ?? false,
    creates_operational_block: r?.creates_operational_block ?? false,
  };
}

function DetailDialog({ record, open, mode, canManage, onClose, onEdit, onSaved }: DetailDialogProps) {
  const [form, setForm] = useState<EditForm>(() => toForm(record));
  const [isPending, startTransition] = useTransition();

  // Re-initialise form whenever the selected record changes
  useEffect(() => {
    setForm(toForm(record));
  }, [record?.id]);

  const handleSave = () => {
    if (!record) return;
    startTransition(async () => {
      const result = await updateEmployeeDisciplinaryRecord(record.id, {
        disciplinary_type: form.disciplinary_type,
        incident_date: form.incident_date || null,
        record_date: form.record_date,
        severity: form.severity,
        subject: form.subject,
        description: form.description || null,
        action_taken: form.action_taken || null,
        status: form.status,
        acknowledged_by_employee: form.acknowledged_by_employee,
        creates_operational_block: form.creates_operational_block,
      });
      if (result.success) {
        toast.success("Disciplinary record updated");
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    });
  };

  if (!record) return null;

  const employeeName = record.employee?.full_name_en ?? `Employee #${record.employee_id}`;
  const employeeCode = record.employee?.employee_code ?? "";

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={mode === "edit" ? "Edit Disciplinary Record" : "Disciplinary Record Details"}
      subtitle={`${employeeName}${employeeCode ? ` · ${employeeCode}` : ""}`}
      icon={<AlertTriangle className="h-5 w-5" />}
      mode={mode === "edit" ? "edit" : "view"}
      size="lg"
      isSubmitting={isPending}
      onSubmit={mode === "edit" ? handleSave : undefined}
      submitLabel="Save Changes"
    >
      {mode === "view" ? (
        /* ── VIEW MODE ──────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Header badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 border ${SEVERITY_BADGE[record.severity]}`}>
              {label(record.severity)}
            </Badge>
            <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 border ${STATUS_BADGE[record.status]}`}>
              {label(record.status)}
            </Badge>
            <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-slate-50 text-slate-700 border-slate-200">
              {label(record.disciplinary_type)}
            </Badge>
            {record.acknowledged_by_employee && (
              <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-green-50 text-green-700 border-green-200">
                Acknowledged
              </Badge>
            )}
            {record.creates_operational_block && (
              <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-red-50 text-red-700 border-red-200">
                Operational Block
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm font-medium">{record.subject}</p>
            </div>

            <div className="col-span-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Record Date</p>
              <p className="text-sm">{record.record_date}</p>
            </div>
            <div className="col-span-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Incident Date</p>
              <p className="text-sm">{record.incident_date ?? "—"}</p>
            </div>

            {record.issued_by_profile && (
              <div className="col-span-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Issued By</p>
                <p className="text-sm">{record.issued_by_profile.display_name}</p>
              </div>
            )}

            {record.acknowledged_at && (
              <div className="col-span-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Acknowledged At</p>
                <p className="text-sm">{new Date(record.acknowledged_at).toLocaleString()}</p>
              </div>
            )}

            {record.description && (
              <div className="col-span-12">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{record.description}</p>
              </div>
            )}

            {record.action_taken && (
              <div className="col-span-12">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Action Taken</p>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{record.action_taken}</p>
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit Record
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* ── EDIT MODE ──────────────────────────────────────────── */
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label className="text-xs font-semibold">Subject <span className="text-destructive">*</span></Label>
            <Input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief description of the incident / warning"
              className="mt-1"
            />
          </div>

          <div className="col-span-6">
            <Label className="text-xs font-semibold">Type <span className="text-destructive">*</span></Label>
            <select
              value={form.disciplinary_type}
              onChange={e => setForm(f => ({ ...f, disciplinary_type: e.target.value }))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {DISCIPLINARY_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="col-span-6">
            <Label className="text-xs font-semibold">Severity <span className="text-destructive">*</span></Label>
            <select
              value={form.severity}
              onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="col-span-6">
            <Label className="text-xs font-semibold">Status <span className="text-destructive">*</span></Label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="col-span-6">
            <Label className="text-xs font-semibold">Record Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={form.record_date}
              onChange={e => setForm(f => ({ ...f, record_date: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div className="col-span-6">
            <Label className="text-xs font-semibold">Incident Date</Label>
            <Input
              type="date"
              value={form.incident_date}
              onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div className="col-span-12">
            <Label className="text-xs font-semibold">Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Full description of the incident or behaviour..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          <div className="col-span-12">
            <Label className="text-xs font-semibold">Action Taken</Label>
            <Textarea
              value={form.action_taken}
              onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))}
              placeholder="What action was taken in response..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          <div className="col-span-6 flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="acknowledged"
              checked={form.acknowledged_by_employee}
              onChange={e => setForm(f => ({ ...f, acknowledged_by_employee: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="acknowledged" className="text-xs font-semibold cursor-pointer">
              Acknowledged by Employee
            </Label>
          </div>

          <div className="col-span-6 flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="opblock"
              checked={form.creates_operational_block}
              onChange={e => setForm(f => ({ ...f, creates_operational_block: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="opblock" className="text-xs font-semibold cursor-pointer">
              Creates Operational Block
            </Label>
          </div>
        </div>
      )}
    </ERPChildDialogForm>
  );
}

// ── Main Page Client ───────────────────────────────────────────────────────────

export function HrDisciplinaryPageClient({ authContext }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<DisciplinaryRow | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisciplinaryRow | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const canManage =
    authContext.permissionCodes.includes("hr.actions.manage") ||
    authContext.roleCodes.includes("system_admin") ||
    authContext.roleCodes.includes("group_admin");

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.hr.actions.globalDisciplinary(),
    queryFn: () => listGlobalDisciplinaryRecords(),
  });

  const filtered = items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.subject.toLowerCase().includes(q) ||
      (item.employee?.full_name_en ?? "").toLowerCase().includes(q) ||
      (item.employee?.employee_code ?? "").toLowerCase().includes(q) ||
      item.disciplinary_type.toLowerCase().includes(q)
    );
  });

  const openView = (record: DisciplinaryRow) => {
    setSelectedRecord(record);
    setDialogMode("view");
    setDialogOpen(true);
  };

  const openEdit = (record: DisciplinaryRow) => {
    setSelectedRecord(record);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: queryKeys.hr.actions.globalDisciplinary() });
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startDeleteTransition(async () => {
      const result = await archiveEmployeeDisciplinaryRecord(deleteTarget.id);
      if (result.success) {
        toast.success("Disciplinary record deleted");
        qc.invalidateQueries({ queryKey: queryKeys.hr.actions.globalDisciplinary() });
        setDeleteTarget(null);
        if (selectedRecord?.id === deleteTarget.id) setDialogOpen(false);
      } else {
        toast.error(result.error ?? "Failed to delete");
        setDeleteTarget(null);
      }
    });
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Disciplinary & Warnings</h1>
            <p className="text-muted-foreground text-xs">All employee disciplinary records and warnings.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by employee, subject, type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 opacity-30 mx-auto mb-2" />
          <p className="text-sm">{search ? "No records match your search." : "No disciplinary records found."}</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs" style={{ tableLayout: "fixed", minWidth: "750px" }}>
            <colgroup>
              <col style={{ width: "200px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "104px" }} />
            </colgroup>
            <thead className="border-b border-border bg-muted/30 hover:bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Employee</th>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Subject</th>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Type</th>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Severity</th>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Status</th>
                <th className="px-3 py-2 text-left font-medium overflow-hidden">Date</th>
                <th className="px-3 py-2 text-right font-medium overflow-hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => openView(item)}
                >
                  <td className="px-3 py-2 overflow-hidden">
                    <p className="font-medium truncate">{item.employee?.full_name_en ?? `Employee #${item.employee_id}`}</p>
                    <p className="text-muted-foreground truncate font-mono text-[10px]">{item.employee?.employee_code ?? ""}</p>
                  </td>
                  <td className="px-3 py-2 overflow-hidden truncate font-medium">{item.subject}</td>
                  <td className="px-3 py-2 overflow-hidden truncate text-muted-foreground capitalize">
                    {label(item.disciplinary_type)}
                  </td>
                  <td className="px-3 py-2 overflow-hidden">
                    <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0.5 border ${SEVERITY_BADGE[item.severity] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {label(item.severity)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 overflow-hidden">
                    <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0.5 border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {label(item.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 overflow-hidden truncate text-muted-foreground">{item.record_date}</td>
                  <td className="px-3 py-2 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-6 w-6" title="View details" onClick={() => openView(item)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => openEdit(item)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Result count */}
      {!isLoading && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {items.length} records
        </p>
      )}

      {/* Detail / Edit Dialog */}
      <DetailDialog
        record={selectedRecord}
        open={dialogOpen}
        mode={dialogMode}
        canManage={canManage}
        onClose={() => setDialogOpen(false)}
        onEdit={() => setDialogMode("edit")}
        onSaved={handleSaved}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Disciplinary Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record <strong>"{deleteTarget?.subject}"</strong> for{" "}
              <strong>{deleteTarget?.employee?.full_name_en ?? `Employee #${deleteTarget?.employee_id}`}</strong>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
