"use client";

/**
 * ERP HR.5 — Employee Payroll & WPS Tab
 *
 * 5 sections:
 *   1. Salary Profile
 *   2. Salary Components
 *   3. Salary Revision History (append-only)
 *   4. WPS / Bank Details
 *   5. Payroll Holds
 *
 * Security:
 *   - Tab content hidden unless user has hr.payroll.view
 *   - Mutation buttons hidden unless user has hr.payroll.manage
 *   - IBAN/account always masked
 *   - Salary amounts redacted server-side for unauthorized
 *   - No workspace draft for payroll sensitive fields
 */

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DollarSign, CreditCard, History, Landmark, PauseCircle,
  Plus, Edit2, Archive, CheckCircle, AlertTriangle, Lock,
  Eye, EyeOff,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { BankSelect } from "@/components/erp/finance-basics/bank-select";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getWpsReadinessLabel,
  getWpsReadinessBadgeVariant,
} from "@/lib/hr/payroll/wps-readiness";
import {
  getEmployeePayrollProfile,
  createOrUpdateEmployeePayrollProfile,
  archiveEmployeePayrollProfile,
  listEmployeeSalaryComponents,
  createEmployeeSalaryComponent,
  updateEmployeeSalaryComponent,
  archiveEmployeeSalaryComponent,
  calculateEmployeeGrossSalary,
  listEmployeeSalaryRevisions,
  createEmployeeSalaryRevision,
  listEmployeePayrollHolds,
  placeEmployeePayrollHold,
  releaseEmployeePayrollHold,
  archiveEmployeePayrollHold,
  getEmployeeWpsProfile,
  createOrUpdateEmployeeWpsProfile,
  getEmployeeWpsReadiness,
  listHrSalaryComponentTypesForPayroll,
  listHrPayrollGroupsForPayroll,
  listHrMohreEstablishmentsForPayroll,
  type PayrollProfileRow,
  type SalaryComponentRow,
  type SalaryRevisionRow,
  type PayrollHoldRow,
  type WpsProfileRow,
} from "@/server/actions/hr/payroll";
import {
  invalidateHrEmployeePayroll,
  invalidateHrEmployeeSalaryComponents,
  invalidateHrEmployeeSalaryRevisions,
  invalidateHrEmployeePayrollHolds,
  invalidateHrEmployeeWps,
} from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ── Permission helper ──────────────────────────────────────────────────────────

function checkPerm(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes.includes(code) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function fmtMoney(amount: number | null | undefined, currency = "AED"): string {
  if (amount === null || amount === undefined) return "*** Restricted ***";
  return `${currency} ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function payrollStatusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "hold": return "secondary";
    case "inactive": return "outline";
    default: return "outline";
  }
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function EmployeePayrollTab({ employeeId, authContext, onChildOpen }: Props) {
  const canView = checkPerm(authContext, "hr.payroll.view");
  const canManage = checkPerm(authContext, "hr.payroll.manage");

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p className="text-sm font-medium">Payroll information is restricted.</p>
        <p className="text-xs">You need the <code className="bg-muted px-1 rounded">hr.payroll.view</code> permission to access this tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <SalaryProfileSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <SalaryComponentsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <SalaryRevisionSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <WpsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <PayrollHoldsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
    </div>
  );
}

// ── 1. Salary Profile Section ──────────────────────────────────────────────────

function SalaryProfileSection({ employeeId, canManage, onChildOpen }: { employeeId: number; canManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpenState] = useState(false);

  const setDialogOpen = (open: boolean) => {
    setDialogOpenState(open);
    onChildOpen?.(open);
  };

  const [form, setForm] = useState({
    payroll_group_id: "" as string,
    effective_date: new Date().toISOString().slice(0, 10),
    currency: "AED",
    payroll_status: "active" as string,
    notes: "",
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.profile(employeeId),
    queryFn: () => getEmployeePayrollProfile(employeeId),
  });

  const { data: grossRes } = useQuery({
    queryKey: queryKeys.hr.payroll.salaryComponents(employeeId),
    queryFn: () => calculateEmployeeGrossSalary(employeeId),
  });

  const { data: payrollGroups } = useQuery({
    queryKey: queryKeys.hr.payrollGroups(),
    queryFn: () => listHrPayrollGroupsForPayroll(),
  });

  const profileData = profile?.data ?? null;

  const openEdit = () => {
    if (profileData) {
      setForm({
        payroll_group_id: profileData.payroll_group_id?.toString() ?? "",
        effective_date: profileData.effective_date,
        currency: profileData.currency,
        payroll_status: profileData.payroll_status,
        notes: profileData.notes ?? "",
      });
    } else {
      setForm({ payroll_group_id: "", effective_date: new Date().toISOString().slice(0, 10), currency: "AED", payroll_status: "active", notes: "" });
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await createOrUpdateEmployeePayrollProfile(employeeId, {
        ...form,
        payroll_group_id: form.payroll_group_id ? Number(form.payroll_group_id) : null,
      });
      if (res.success) {
        toast.success("Payroll profile saved");
        setDialogOpen(false);
        invalidateHrEmployeePayroll(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  };

  const gross = grossRes?.data?.gross ?? 0;
  const currency = profileData?.currency ?? "AED";
  const groups = payrollGroups?.data ?? [];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Profile</h3>
          {profileData && (
            <Badge variant={payrollStatusBadgeVariant(profileData.payroll_status)} className="capitalize">
              {profileData.payroll_status}
            </Badge>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {profileData ? "Edit Profile" : "Setup Profile"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : profileData ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><span className="text-muted-foreground">Payroll Group:</span> <span className="font-medium">{profileData.payroll_group?.name_en ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Effective Date:</span> <span className="font-medium">{fmtDate(profileData.effective_date)}</span></div>
          <div><span className="text-muted-foreground">Currency:</span> <span className="font-medium">{profileData.currency}</span></div>
          <div><span className="text-muted-foreground">Calculated Gross:</span> <span className="font-medium text-green-700">{fmtMoney(gross, currency)}</span></div>
          {profileData.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span>{profileData.notes}</span></div>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No payroll profile configured yet.</p>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={profileData ? "Edit Salary Profile" : "Setup Salary Profile"}
        subtitle="Configure payroll group, currency, and status"
        icon={<DollarSign className="h-5 w-5" />}
        mode={profileData ? "edit" : "add"}
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Payroll Group</Label>
            <ERPCombobox
              value={form.payroll_group_id ? Number(form.payroll_group_id) : null}
              onValueChange={(v) => setForm(f => ({ ...f, payroll_group_id: String(v ?? "") }))}
              options={groups.map(g => ({ value: g.id, label: g.name_en, code: g.code }))}
              placeholder="Select payroll group..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Effective Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} required />
          </div>
          <div className="col-span-6">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} maxLength={10} />
          </div>
          <div className="col-span-6">
            <Label>Payroll Status</Label>
            <ERPCombobox
              value={form.payroll_status}
              onValueChange={(v) => setForm(f => ({ ...f, payroll_status: String(v ?? "active") }))}
              options={[
                { value: "active", label: "Active" },
                { value: "hold", label: "On Hold" },
                { value: "inactive", label: "Inactive" },
                { value: "not_configured", label: "Not Configured" },
              ]}
            />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} maxLength={2000} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 2. Salary Components Section ───────────────────────────────────────────────

type SalaryComponentForm = {
  component_type_id: string;
  amount: string;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  notes: string;
};

function SalaryComponentsSection({ employeeId, canManage, onChildOpen }: { employeeId: number; canManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpenState] = useState(false);
  const [editing, setEditing] = useState<SalaryComponentRow | null>(null);

  const setDialogOpen = (open: boolean) => {
    setDialogOpenState(open);
    onChildOpen?.(open);
  };

  const emptyForm: SalaryComponentForm = {
    component_type_id: "",
    amount: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
    is_active: true,
    notes: "",
  };

  const [form, setForm] = useState<SalaryComponentForm>(emptyForm);

  const { data: compsRes, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.salaryComponents(employeeId),
    queryFn: () => listEmployeeSalaryComponents(employeeId),
  });

  const { data: typesRes } = useQuery({
    queryKey: queryKeys.hr.salaryComponentTypes(),
    queryFn: () => listHrSalaryComponentTypesForPayroll(),
  });

  const components = Array.isArray(compsRes?.data) ? compsRes.data : [];
  const types = Array.isArray(typesRes?.data) ? typesRes.data : [];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (comp: SalaryComponentRow) => {
    setEditing(comp);
    setForm({
      component_type_id: comp.component_type_id.toString(),
      amount: comp.amount?.toString() ?? "",
      effective_from: comp.effective_from,
      effective_to: comp.effective_to ?? "",
      is_active: comp.is_active,
      notes: comp.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = {
        component_type_id: Number(form.component_type_id),
        amount: parseFloat(form.amount),
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        is_active: form.is_active,
        notes: form.notes || null,
      };

      const res = editing
        ? await updateEmployeeSalaryComponent(editing.id, payload)
        : await createEmployeeSalaryComponent(employeeId, payload);

      if (res.success) {
        toast.success(editing ? "Component updated" : "Component added");
        setDialogOpen(false);
        invalidateHrEmployeeSalaryComponents(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  };

  const handleArchive = (id: number) => {
    startTransition(async () => {
      const res = await archiveEmployeeSalaryComponent(id);
      if (res.success) {
        toast.success("Component archived");
        invalidateHrEmployeeSalaryComponents(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to archive");
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Components</h3>
          <Badge variant="outline">{components.length}</Badge>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Component
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : components.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No salary components configured.</p>
      ) : (
        <div className="divide-y text-sm">
          {components.map((comp) => (
            <div key={comp.id} className="flex items-center justify-between py-2.5 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{comp.component_type?.name_en ?? `Type #${comp.component_type_id}`}</span>
                  <Badge variant={comp.component_type?.component_kind === "earning" ? "default" : "secondary"} className="text-xs capitalize">
                    {comp.component_type?.component_kind ?? "earning"}
                  </Badge>
                  {!comp.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {fmtDate(comp.effective_from)} — {comp.effective_to ? fmtDate(comp.effective_to) : "ongoing"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-green-700">{fmtMoney(comp.amount)}</div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(comp)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleArchive(comp.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Salary Component" : "Add Salary Component"}
        subtitle="Configure amount and effective period"
        icon={<DollarSign className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Component Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={form.component_type_id ? Number(form.component_type_id) : null}
              onValueChange={(v) => setForm(f => ({ ...f, component_type_id: String(v ?? "") }))}
              options={types.map(t => ({ value: t.id, label: t.name_en, code: t.code, extra: t.component_kind }))}
              placeholder="Select component type..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label>Amount (AED) <span className="text-destructive">*</span></Label>
            <Input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div className="col-span-6">
            <Label>Active</Label>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-sm">{form.is_active ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <div className="col-span-6">
            <Label>Effective From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} required />
          </div>
          <div className="col-span-6">
            <Label>Effective To</Label>
            <Input type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} maxLength={1000} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 3. Salary Revision History Section ────────────────────────────────────────

function SalaryRevisionSection({ employeeId, canManage, onChildOpen }: { employeeId: number; canManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpenState] = useState(false);

  const setDialogOpen = (open: boolean) => {
    setDialogOpenState(open);
    onChildOpen?.(open);
  };

  const [form, setForm] = useState({
    effective_date: new Date().toISOString().slice(0, 10),
    revision_reason: "",
    old_gross: "",
    new_gross: "",
  });

  const { data: revisionsRes, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.salaryRevisions(employeeId),
    queryFn: () => listEmployeeSalaryRevisions(employeeId),
  });

  const revisions = Array.isArray(revisionsRes?.data) ? revisionsRes.data : [];

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await createEmployeeSalaryRevision(employeeId, {
        effective_date: form.effective_date,
        revision_reason: form.revision_reason || null,
        old_gross: form.old_gross ? parseFloat(form.old_gross) : null,
        new_gross: form.new_gross ? parseFloat(form.new_gross) : null,
      });
      if (res.success) {
        toast.success("Salary revision recorded");
        setDialogOpen(false);
        invalidateHrEmployeeSalaryRevisions(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Salary Revision History</h3>
          <Badge variant="outline">{revisions.length}</Badge>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setForm({ effective_date: new Date().toISOString().slice(0, 10), revision_reason: "", old_gross: "", new_gross: "" }); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Record Revision
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Lock className="h-3 w-3" /> Append-only history — records cannot be edited or deleted.
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No salary revisions recorded.</p>
      ) : (
        <div className="divide-y text-sm">
          {revisions.map((rev) => (
            <div key={rev.id} className="py-2.5 grid grid-cols-4 gap-2">
              <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{fmtDate(rev.effective_date)}</span></div>
              <div><span className="text-muted-foreground">Old Gross:</span> <span>{fmtMoney(rev.old_gross)}</span></div>
              <div><span className="text-muted-foreground">New Gross:</span> <span className="text-green-700 font-semibold">{fmtMoney(rev.new_gross)}</span></div>
              <div><span className="text-muted-foreground">By:</span> <span>{rev.approver?.display_name ?? "—"}</span></div>
              {rev.revision_reason && <div className="col-span-4 text-muted-foreground">{rev.revision_reason}</div>}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Record Salary Revision"
        subtitle="Add a salary revision entry to the append-only history"
        icon={<History className="h-5 w-5" />}
        mode="add"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
        submitLabel="Record"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Effective Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} required />
          </div>
          <div className="col-span-6">
            <Label>Old Gross (AED)</Label>
            <Input type="number" min={0} step={0.01} value={form.old_gross} onChange={e => setForm(f => ({ ...f, old_gross: e.target.value }))} placeholder="Previous gross" />
          </div>
          <div className="col-span-6">
            <Label>New Gross (AED)</Label>
            <Input type="number" min={0} step={0.01} value={form.new_gross} onChange={e => setForm(f => ({ ...f, new_gross: e.target.value }))} placeholder="New gross" />
          </div>
          <div className="col-span-12">
            <Label>Revision Reason</Label>
            <Textarea value={form.revision_reason} onChange={e => setForm(f => ({ ...f, revision_reason: e.target.value }))} rows={2} maxLength={1000} placeholder="Reason for salary revision..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 4. WPS / Bank Details Section ─────────────────────────────────────────────

function WpsSection({ employeeId, canManage, onChildOpen }: { employeeId: number; canManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpenState] = useState(false);

  const setDialogOpen = (open: boolean) => {
    setDialogOpenState(open);
    onChildOpen?.(open);
  };

  const [form, setForm] = useState({
    wps_applicable: true,
    wps_status: "active",
    bank_id: null as number | null,
    account_holder_name: "",
    account_number: "",
    iban: "",
    exchange_house: "",
    salary_payment_method: "bank_transfer",
    labour_card_number: "",
    mohre_person_code: "",
    mohre_establishment_id: null as number | null,
    salary_effective_date: "",
  });

  const { data: wpsRes, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.wpsProfile(employeeId),
    queryFn: () => getEmployeeWpsProfile(employeeId),
  });

  const { data: readinessRes } = useQuery({
    queryKey: queryKeys.hr.payroll.wpsReadiness(employeeId),
    queryFn: () => getEmployeeWpsReadiness(employeeId),
  });

  const { data: mohreRes } = useQuery({
    queryKey: queryKeys.hr.mohreEstablishments(),
    queryFn: () => listHrMohreEstablishmentsForPayroll(),
  });

  const wps = wpsRes?.data ?? null;
  const readiness = readinessRes?.data ?? null;
  const mohreOptions = Array.isArray(mohreRes?.data) ? mohreRes.data : [];

  const openEdit = () => {
    setForm({
      wps_applicable: wps?.wps_applicable ?? true,
      wps_status: wps?.wps_status ?? "active",
      bank_id: wps?.bank_id ?? null,
      account_holder_name: wps?.account_holder_name ?? "",
      account_number: "",   // raw never pre-filled — masked in UI
      iban: "",             // raw never pre-filled — masked in UI
      exchange_house: wps?.exchange_house ?? "",
      salary_payment_method: wps?.salary_payment_method ?? "bank_transfer",
      labour_card_number: wps?.labour_card_number ?? "",
      mohre_person_code: wps?.mohre_person_code ?? "",
      mohre_establishment_id: wps?.mohre_establishment_id ?? null,
      salary_effective_date: wps?.salary_effective_date ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = {
        ...form,
        account_number: form.account_number || undefined,
        iban: form.iban || undefined,
        exchange_house: form.exchange_house || null,
        labour_card_number: form.labour_card_number || null,
        mohre_person_code: form.mohre_person_code || null,
        salary_effective_date: form.salary_effective_date || null,
      };
      const res = await createOrUpdateEmployeeWpsProfile(employeeId, payload);
      if (res.success) {
        toast.success("WPS profile saved");
        setDialogOpen(false);
        invalidateHrEmployeeWps(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  };

  const wpsStatusVariant = (status: string | null): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "active": return "default";
      case "hold": return "secondary";
      case "exempt": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">WPS / Bank Details</h3>
          {wps && <Badge variant={wpsStatusVariant(wps.wps_status)} className="capitalize">{wps.wps_status}</Badge>}
          {readiness && (
            <Badge variant={getWpsReadinessBadgeVariant(readiness.status)}>
              {getWpsReadinessLabel(readiness.status)}
            </Badge>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {wps ? "Edit WPS Profile" : "Setup WPS Profile"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : wps ? (
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">WPS Applicable:</span> <span className="font-medium">{wps.wps_applicable ? "Yes" : "No"}</span></div>
            <div><span className="text-muted-foreground">Payment Method:</span> <span className="font-medium capitalize">{wps.salary_payment_method?.replace("_", " ")}</span></div>
            <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{wps.bank?.bank_name_en ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Account Holder:</span> <span className="font-medium">{wps.account_holder_name ?? "—"}</span></div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">IBAN:</span>
              <span className="font-mono font-medium">{wps.iban_masked || "—"}</span>
              <EyeOff className="h-3 w-3 text-muted-foreground ml-1" aria-label="IBAN is always masked" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Account No:</span>
              <span className="font-mono font-medium">{wps.account_number_masked || "—"}</span>
              <EyeOff className="h-3 w-3 text-muted-foreground ml-1" />
            </div>
            {wps.labour_card_number && <div><span className="text-muted-foreground">Labour Card:</span> <span className="font-medium">{wps.labour_card_number}</span></div>}
            {wps.mohre_person_code && <div><span className="text-muted-foreground">MOHRE Code:</span> <span className="font-medium">{wps.mohre_person_code}</span></div>}
          </div>
          {readiness && readiness.missingRequirements.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <div className="font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Missing requirements:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {readiness.missingRequirements.map((req, i) => <li key={i}>{req}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground italic">No WPS profile configured yet.</p>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={wps ? "Edit WPS / Bank Details" : "Setup WPS / Bank Details"}
        subtitle="Configure WPS enrollment and bank details"
        icon={<Landmark className="h-5 w-5" />}
        mode={wps ? "edit" : "add"}
        size="xl"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>WPS Applicable</Label>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={form.wps_applicable} onCheckedChange={(v) => setForm(f => ({ ...f, wps_applicable: v }))} />
              <span className="text-sm">{form.wps_applicable ? "Yes" : "No (Exempt)"}</span>
            </div>
          </div>
          <div className="col-span-6">
            <Label>WPS Status</Label>
            <ERPCombobox
              value={form.wps_status}
              onValueChange={(v) => setForm(f => ({ ...f, wps_status: String(v ?? "active") }))}
              options={[
                { value: "active", label: "Active" },
                { value: "hold", label: "On Hold" },
                { value: "exempt", label: "Exempt" },
                { value: "not_enrolled", label: "Not Enrolled" },
              ]}
            />
          </div>
          <div className="col-span-6">
            <Label>Salary Payment Method</Label>
            <ERPCombobox
              value={form.salary_payment_method}
              onValueChange={(v) => setForm(f => ({ ...f, salary_payment_method: String(v ?? "bank_transfer") }))}
              options={[
                { value: "bank_transfer", label: "Bank Transfer" },
                { value: "exchange_house", label: "Exchange House" },
                { value: "cheque", label: "Cheque" },
              ]}
            />
          </div>
          <div className="col-span-6">
            <Label>Bank</Label>
            <BankSelect
              value={form.bank_id}
              onValueChange={(v) => setForm(f => ({ ...f, bank_id: v }))}
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Account Holder Name</Label>
            <Input value={form.account_holder_name} onChange={e => setForm(f => ({ ...f, account_holder_name: e.target.value }))} maxLength={200} />
          </div>
          <div className="col-span-6">
            <Label>
              IBAN
              <span className="text-muted-foreground text-xs ml-2 font-normal flex items-center gap-1 inline-flex">
                <EyeOff className="h-3 w-3" /> Always masked in display
              </span>
            </Label>
            <Input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} maxLength={34} placeholder="AE..." />
          </div>
          <div className="col-span-6">
            <Label>
              Account Number
              <span className="text-muted-foreground text-xs ml-2 font-normal flex items-center gap-1 inline-flex">
                <EyeOff className="h-3 w-3" /> Always masked in display
              </span>
            </Label>
            <Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} maxLength={50} />
          </div>
          {form.salary_payment_method === "exchange_house" && (
            <div className="col-span-6">
              <Label>Exchange House</Label>
              <Input value={form.exchange_house} onChange={e => setForm(f => ({ ...f, exchange_house: e.target.value }))} maxLength={200} />
            </div>
          )}
          <div className="col-span-6">
            <Label>Labour Card Number</Label>
            <Input value={form.labour_card_number} onChange={e => setForm(f => ({ ...f, labour_card_number: e.target.value }))} maxLength={100} />
          </div>
          <div className="col-span-6">
            <Label>MOHRE Person Code</Label>
            <Input value={form.mohre_person_code} onChange={e => setForm(f => ({ ...f, mohre_person_code: e.target.value }))} maxLength={100} />
          </div>
          <div className="col-span-6">
            <Label>MOHRE Establishment</Label>
            <ERPCombobox
              value={form.mohre_establishment_id}
              onValueChange={(v) => setForm(f => ({ ...f, mohre_establishment_id: v ? Number(v) : null }))}
              options={mohreOptions.map(m => ({ value: m.id, label: m.establishment_name, code: m.establishment_number }))}
              placeholder="Select MOHRE establishment..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Salary Effective Date</Label>
            <Input type="date" value={form.salary_effective_date} onChange={e => setForm(f => ({ ...f, salary_effective_date: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 5. Payroll Holds Section ───────────────────────────────────────────────────

function PayrollHoldsSection({ employeeId, canManage, onChildOpen }: { employeeId: number; canManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpenState] = useState(false);

  const setDialogOpen = (open: boolean) => {
    setDialogOpenState(open);
    onChildOpen?.(open);
  };

  const [form, setForm] = useState({
    hold_reason: "",
    hold_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const { data: holdsRes, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.holds(employeeId),
    queryFn: () => listEmployeePayrollHolds(employeeId),
  });

  const holds = Array.isArray(holdsRes?.data) ? holdsRes.data : [];

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await placeEmployeePayrollHold(employeeId, {
        hold_reason: form.hold_reason,
        hold_date: form.hold_date,
        notes: form.notes || null,
      });
      if (res.success) {
        toast.success("Payroll hold placed");
        setDialogOpen(false);
        invalidateHrEmployeePayrollHolds(qc, employeeId);
        invalidateHrEmployeePayroll(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to place hold");
      }
    });
  };

  const handleRelease = (id: number) => {
    startTransition(async () => {
      const res = await releaseEmployeePayrollHold(id);
      if (res.success) {
        toast.success("Payroll hold released");
        invalidateHrEmployeePayrollHolds(qc, employeeId);
        invalidateHrEmployeePayroll(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to release hold");
      }
    });
  };

  const handleArchive = (id: number) => {
    startTransition(async () => {
      const res = await archiveEmployeePayrollHold(id);
      if (res.success) {
        toast.success("Hold archived");
        invalidateHrEmployeePayrollHolds(qc, employeeId);
      } else {
        toast.error(res.error ?? "Failed to archive");
      }
    });
  };

  const activeHolds = holds.filter(h => h.is_active);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Payroll Holds</h3>
          {activeHolds.length > 0 && (
            <Badge variant="destructive">{activeHolds.length} Active</Badge>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => { setForm({ hold_reason: "", hold_date: new Date().toISOString().slice(0, 10), notes: "" }); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Place Hold
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : holds.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No payroll holds recorded.</p>
      ) : (
        <div className="divide-y text-sm">
          {holds.map((hold) => (
            <div key={hold.id} className="flex items-start justify-between py-2.5 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{hold.hold_reason}</span>
                  <Badge variant={hold.is_active ? "destructive" : "outline"} className="text-xs">
                    {hold.is_active ? "Active" : "Released"}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Placed: {fmtDate(hold.hold_date)}
                  {hold.release_date && ` • Released: ${fmtDate(hold.release_date)}`}
                  {hold.releaser && ` by ${hold.releaser.display_name}`}
                </div>
                {hold.notes && <div className="text-xs text-muted-foreground mt-0.5">{hold.notes}</div>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  {hold.is_active && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRelease(hold.id)} disabled={isPending}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Release
                    </Button>
                  )}
                  {!hold.is_active && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleArchive(hold.id)} disabled={isPending}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Place Payroll Hold"
        subtitle="Employee will be excluded from payroll processing"
        icon={<PauseCircle className="h-5 w-5" />}
        mode="add"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
        submitLabel="Place Hold"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Hold Reason <span className="text-destructive">*</span></Label>
            <Input value={form.hold_reason} onChange={e => setForm(f => ({ ...f, hold_reason: e.target.value }))} maxLength={500} required placeholder="Reason for payroll hold..." />
          </div>
          <div className="col-span-6">
            <Label>Hold Date</Label>
            <Input type="date" value={form.hold_date} onChange={e => setForm(f => ({ ...f, hold_date: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} maxLength={1000} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
