"use client";

/**
 * ERP HR.6 — Employee Operations & Readiness Tab
 *
 * 7 sections:
 *   1. Assignments
 *   2. Site Readiness
 *   3. Role Requirements
 *   4. Operational Blocks
 *   5. Assets
 *   6. PPE
 *   7. Accommodation
 */

import { useState, useTransition, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin, Briefcase, ShieldCheck, AlertOctagon, Package, HardHat, Home,
  Plus, Edit2, Archive, CheckCircle, XCircle, RefreshCw,
  Lock, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { queryKeys } from "@/lib/query/query-keys";
import { getBlockStatusBadge, getAssignmentStatusBadge, getReadinessStatusBadge } from "@/lib/hr/operations/status";
import type { BlockStatus, AssignmentStatus } from "@/lib/hr/operations/status";
import {
  listEmployeeAssignments,
  createEmployeeAssignment,
  updateEmployeeAssignment,
  archiveEmployeeAssignment,
  listEmployeeRoleRequirements,
  createEmployeeRoleRequirement,
  updateEmployeeRoleRequirement,
  archiveEmployeeRoleRequirement,
  waiveEmployeeRoleRequirement,
  recalculateEmployeeRoleRequirements,
  listEmployeeSiteReadiness,
  recalculateEmployeeSiteReadiness,
  listEmployeeOperationalBlocks,
  createEmployeeOperationalBlock,
  releaseEmployeeOperationalBlock,
  listEmployeeAssets,
  createEmployeeAsset,
  updateEmployeeAsset,
  returnEmployeeAsset,
  archiveEmployeeAsset,
  listEmployeePpeIssues,
  createEmployeePpeIssue,
  updateEmployeePpeIssue,
  returnEmployeePpeIssue,
  archiveEmployeePpeIssue,
  listEmployeeAccommodationRecords,
  createEmployeeAccommodationRecord,
  updateEmployeeAccommodationRecord,
  endEmployeeAccommodationRecord,
  archiveEmployeeAccommodationRecord,
} from "@/server/actions/hr/operations";
import {
  invalidateHrEmployeeAssignments,
  invalidateHrEmployeeReadiness,
  invalidateHrEmployeeBlocks,
  invalidateHrEmployeeAssets,
  invalidateHrEmployeePpe,
  invalidateHrEmployeeAccommodation,
} from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";

// ─── Types ─────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

function checkPerm(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes?.includes(code) ||
    ctx.roleCodes?.includes("system_admin") ||
    false
  );
}

// ─── Section Wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-base">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Main Tab ──────────────────────────────────────────────────────────────

export function EmployeeOperationsTab({ employeeId, authContext, onChildOpen }: Props) {
  const canView = checkPerm(authContext, "hr.assignments.view");
  const canManage = checkPerm(authContext, "hr.assignments.manage");

  if (!canView) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span>You do not have permission to view operations data.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <AssignmentsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <SiteReadinessSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <RoleRequirementsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <OperationalBlocksSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <AssetsSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <PpeSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
      <AccommodationSection employeeId={employeeId} canManage={canManage} onChildOpen={onChildOpen} />
    </div>
  );
}

// ─── Assignments Section ────────────────────────────────────────────────────

function AssignmentsSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    assignment_type: "primary",
    assignment_status: "active",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  const setIsOpen = useCallback(
    (open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.assignments(employeeId),
    queryFn: () => listEmployeeAssignments(employeeId),
  });

  const assignments = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function openAdd() {
    setEditing(null);
    setForm({ assignment_type: "primary", assignment_status: "active", effective_from: new Date().toISOString().slice(0, 10) });
    setIsOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setForm({ ...row });
    setIsOpen(true);
  }

  function handleSubmit() {
    startTransition(async () => {
      const action = editing
        ? updateEmployeeAssignment(editing.id as number, form)
        : createEmployeeAssignment(employeeId, form);
      const result = await action;
      if (!result.success) { toast.error(result.error); return; }
      toast.success(editing ? "Assignment updated" : "Assignment created");
      invalidateHrEmployeeAssignments(qc, employeeId);
      setIsOpen(false);
    });
  }

  return (
    <Section
      title="Assignments"
      icon={<MapPin className="h-5 w-5 text-primary" />}
      action={canManage ? (
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Assignment
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No assignment records</p>
      ) : (
        <div className="divide-y">
          {assignments.map((a) => {
            const badge = getAssignmentStatusBadge(a.assignment_status as AssignmentStatus);
            const dept = (a.departments as Record<string, unknown> | null)?.name_en;
            const desg = (a.designations as Record<string, unknown> | null)?.name_en;
            const site = (a.work_sites as Record<string, unknown> | null)?.name_en;
            return (
              <div key={a.id as number} className="flex items-start justify-between py-3 px-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{String(a.assignment_type)}</span>
                  </div>
                  <p className="text-sm font-medium">{[dept, desg, site].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(a.effective_from)} {a.effective_to ? `→ ${String(a.effective_to)}` : "→ ongoing"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      startTransition(async () => {
                        const r = await archiveEmployeeAssignment(a.id as number);
                        if (!r.success) { toast.error(r.error); return; }
                        toast.success("Archived");
                        invalidateHrEmployeeAssignments(qc, employeeId);
                      });
                    }}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={isOpen}
        onOpenChange={setIsOpen}
        title={editing ? "Edit Assignment" : "Add Assignment"}
        subtitle="Employee operational assignment"
        icon={<MapPin className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Assignment Type</Label>
            <ERPCombobox
              value={form.assignment_type as string}
              onValueChange={(v) => setForm((f) => ({ ...f, assignment_type: v }))}
              options={["primary", "temporary", "project", "site", "department", "relief"].map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              placeholder="Select type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox
              value={form.assignment_status as string}
              onValueChange={(v) => setForm((f) => ({ ...f, assignment_status: v }))}
              options={["active", "planned", "completed", "cancelled"].map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              placeholder="Select status..."
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_from as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Effective To</Label>
            <Input type="date" value={form.effective_to as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value || null }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── Site Readiness Section ─────────────────────────────────────────────────

function SiteReadinessSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [siteId, setSiteId] = useState<string>("");

  const setIsOpen = useCallback(
    (open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.siteReadiness(employeeId),
    queryFn: () => listEmployeeSiteReadiness(employeeId),
  });

  const records = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function handleRecalculate() {
    if (!siteId) { toast.error("Enter a work site ID to recalculate"); return; }
    startTransition(async () => {
      const result = await recalculateEmployeeSiteReadiness(employeeId, Number(siteId));
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Readiness recalculated: ${result.data.status}`);
      invalidateHrEmployeeReadiness(qc, employeeId);
      setIsOpen(false);
    });
  }

  return (
    <Section
      title="Site Readiness"
      icon={<ShieldCheck className="h-5 w-5 text-primary" />}
      action={canManage ? (
        <Button size="sm" onClick={() => setIsOpen(true)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Check Readiness
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No site readiness calculated yet</p>
      ) : (
        <div className="divide-y">
          {records.map((r) => {
            const badge = getReadinessStatusBadge(r.readiness_status as string);
            const site = (r.work_sites as Record<string, unknown> | null)?.name_en;
            return (
              <div key={r.id as number} className="flex items-start justify-between py-3 px-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-sm font-medium">{String(site ?? "Unknown site")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Checked: {String(r.checked_at ?? "—").slice(0, 10)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Recalculate Site Readiness"
        subtitle="Run deterministic readiness check for a work site"
        icon={<ShieldCheck className="h-5 w-5" />}
        mode="add"
        isSubmitting={isPending}
        onSubmit={handleRecalculate}
        submitLabel="Calculate"
        size="sm"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Work Site ID <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              placeholder="Enter work site ID"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Enter the numeric ID of the work site to evaluate.</p>
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── Role Requirements Section ──────────────────────────────────────────────

function RoleRequirementsSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [waiverOpen, setWaiverOpenRaw] = useState(false);
  const [waiverTarget, setWaiverTarget] = useState<number | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    requirement_type: "document",
    is_required: true,
    is_met: false,
    status: "missing",
    requirement_name: "",
  });

  const setIsOpen = useCallback(
    (open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const setWaiverOpen = useCallback(
    (open: boolean) => { setWaiverOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.roleRequirements(employeeId),
    queryFn: () => listEmployeeRoleRequirements(employeeId),
  });

  const reqs = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function openAdd() {
    setEditing(null);
    setForm({ requirement_type: "document", is_required: true, is_met: false, status: "missing", requirement_name: "" });
    setIsOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setForm({ ...row });
    setIsOpen(true);
  }

  function handleSubmit() {
    startTransition(async () => {
      const action = editing
        ? updateEmployeeRoleRequirement(editing.id as number, form)
        : createEmployeeRoleRequirement(employeeId, form);
      const result = await action;
      if (!result.success) { toast.error(result.error); return; }
      toast.success(editing ? "Requirement updated" : "Requirement created");
      invalidateHrEmployeeReadiness(qc, employeeId);
      setIsOpen(false);
    });
  }

  function openWaiver(id: number) {
    setWaiverTarget(id);
    setWaiverReason("");
    setWaiverOpen(true);
  }

  function handleWaiver() {
    if (!waiverTarget) return;
    startTransition(async () => {
      const result = await waiveEmployeeRoleRequirement(waiverTarget, waiverReason);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Requirement waived");
      invalidateHrEmployeeReadiness(qc, employeeId);
      setWaiverOpen(false);
    });
  }

  const statusColors: Record<string, string> = {
    met: "text-green-600",
    missing: "text-destructive",
    expired: "text-destructive",
    expiring_soon: "text-amber-600",
    waived: "text-muted-foreground",
    not_required: "text-muted-foreground",
  };

  return (
    <Section
      title="Role Requirements"
      icon={<Briefcase className="h-5 w-5 text-primary" />}
      action={canManage ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            startTransition(async () => {
              const r = await recalculateEmployeeRoleRequirements(employeeId);
              if (!r.success) { toast.error(r.error); return; }
              toast.success("Requirements recalculated");
              invalidateHrEmployeeReadiness(qc, employeeId);
            });
          }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Recalculate
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Requirement
          </Button>
        </div>
      ) : undefined}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : reqs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No role requirements tracked</p>
      ) : (
        <div className="divide-y">
          {reqs.map((r) => (
            <div key={r.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase ${statusColors[r.status as string] ?? ""}`}>{String(r.status)}</span>
                  <span className="text-xs text-muted-foreground capitalize">{String(r.requirement_type)}</span>
                </div>
                <p className="text-sm font-medium">{String(r.requirement_name)}</p>
                {r.expiry_date ? <p className="text-xs text-muted-foreground">Expires: {String(r.expiry_date)}</p> : null}
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {r.status !== "waived" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Waive" onClick={() => openWaiver(r.id as number)}>
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    startTransition(async () => {
                      const res = await archiveEmployeeRoleRequirement(r.id as number);
                      if (!res.success) { toast.error(res.error); return; }
                      toast.success("Requirement archived");
                      invalidateHrEmployeeReadiness(qc, employeeId);
                    });
                  }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={isOpen}
        onOpenChange={setIsOpen}
        title={editing ? "Edit Requirement" : "Add Role Requirement"}
        icon={<Briefcase className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Requirement Name <span className="text-destructive">*</span></Label>
            <Input value={form.requirement_name as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, requirement_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Type</Label>
            <ERPCombobox
              value={form.requirement_type as string}
              onValueChange={(v) => setForm((f) => ({ ...f, requirement_type: v }))}
              options={["document", "training", "medical", "access_card", "license", "other"].map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))}
              placeholder="Select type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox
              value={form.status as string}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              options={["met", "missing", "expired", "expiring_soon", "waived", "not_required"].map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))}
              placeholder="Select status..."
            />
          </div>
          <div className="col-span-6">
            <Label>Expiry Date</Label>
            <Input type="date" value={form.expiry_date as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value || null }))} />
          </div>
          <div className="col-span-6">
            <Label>Is Required</Label>
            <ERPCombobox
              value={form.is_required ? "yes" : "no"}
              onValueChange={(v) => setForm((f) => ({ ...f, is_required: v === "yes" }))}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              placeholder="Select..."
            />
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm
        open={waiverOpen}
        onOpenChange={setWaiverOpen}
        title="Waive Requirement"
        subtitle="Document the reason for waiving this requirement"
        icon={<CheckCircle className="h-5 w-5" />}
        mode="add"
        submitLabel="Waive"
        isSubmitting={isPending}
        onSubmit={handleWaiver}
        size="sm"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Waiver Reason <span className="text-destructive">*</span></Label>
            <Textarea value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── Operational Blocks Section ─────────────────────────────────────────────

function OperationalBlocksSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [releaseOpen, setReleaseOpenRaw] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    block_type: "operations",
    block_reason: "",
    block_status: "active",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  const setIsOpen = useCallback(
    (open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const setReleaseOpen = useCallback(
    (open: boolean) => { setReleaseOpenRaw(open); onChildOpen?.(open); },
    [onChildOpen]
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.blocks(employeeId),
    queryFn: () => listEmployeeOperationalBlocks(employeeId),
  });

  const blocks = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function handleSubmit() {
    startTransition(async () => {
      const result = await createEmployeeOperationalBlock(employeeId, form);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Operational block created");
      invalidateHrEmployeeBlocks(qc, employeeId);
      setIsOpen(false);
    });
  }

  function openRelease(id: number) {
    setReleaseTarget(id);
    setReleaseReason("");
    setReleaseOpen(true);
  }

  function handleRelease() {
    if (!releaseTarget) return;
    startTransition(async () => {
      const result = await releaseEmployeeOperationalBlock(releaseTarget, releaseReason);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Block released");
      invalidateHrEmployeeBlocks(qc, employeeId);
      setReleaseOpen(false);
    });
  }

  return (
    <Section
      title="Operational Blocks"
      icon={<AlertOctagon className="h-5 w-5 text-destructive" />}
      action={canManage ? (
        <Button size="sm" variant="destructive" onClick={() => setIsOpen(true)}>
          <Flag className="h-3.5 w-3.5 mr-1" />Add Block
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No operational blocks</p>
      ) : (
        <div className="divide-y">
          {blocks.map((b) => {
            const badge = getBlockStatusBadge(b.block_status as BlockStatus);
            return (
              <div key={b.id as number} className="flex items-start justify-between py-3 px-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{String(b.block_type).replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-sm">{String(b.block_reason)}</p>
                  <p className="text-xs text-muted-foreground">
                    From: {String(b.effective_from)}{b.effective_to ? ` → ${String(b.effective_to)}` : ""}
                  </p>
                </div>
                {canManage && b.block_status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => openRelease(b.id as number)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" />Release
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Add Operational Block"
        subtitle="Create an operational block for this employee"
        icon={<AlertOctagon className="h-5 w-5" />}
        mode="add"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Block Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={form.block_type as string}
              onValueChange={(v) => setForm((f) => ({ ...f, block_type: v }))}
              options={["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"].map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))}
              placeholder="Select type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_from as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Effective To</Label>
            <Input type="date" value={form.effective_to as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value || null }))} />
          </div>
          <div className="col-span-12">
            <Label>Block Reason <span className="text-destructive">*</span></Label>
            <Textarea value={form.block_reason as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, block_reason: e.target.value }))} rows={3} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title="Release Block"
        subtitle="Provide reason for releasing this operational block"
        icon={<XCircle className="h-5 w-5" />}
        mode="add"
        submitLabel="Release"
        isSubmitting={isPending}
        onSubmit={handleRelease}
        size="sm"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Release Reason <span className="text-destructive">*</span></Label>
            <Textarea value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── Assets Section ─────────────────────────────────────────────────────────

function AssetsSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [returnOpen, setReturnOpenRaw] = useState(false);
  const [returnTarget, setReturnTarget] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    asset_type: "other",
    asset_description: "",
    issued_date: new Date().toISOString().slice(0, 10),
    status: "issued",
  });

  const setIsOpen = useCallback((open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setReturnOpen = useCallback((open: boolean) => { setReturnOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.assets(employeeId),
    queryFn: () => listEmployeeAssets(employeeId),
  });

  const assets = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function openAdd() {
    setEditing(null);
    setForm({ asset_type: "other", asset_description: "", issued_date: new Date().toISOString().slice(0, 10), status: "issued" });
    setIsOpen(true);
  }

  function openEdit(row: Record<string, unknown>) { setEditing(row); setForm({ ...row }); setIsOpen(true); }

  function handleSubmit() {
    startTransition(async () => {
      const action = editing ? updateEmployeeAsset(editing.id as number, form) : createEmployeeAsset(employeeId, form);
      const result = await action;
      if (!result.success) { toast.error(result.error); return; }
      toast.success(editing ? "Asset updated" : "Asset issued");
      invalidateHrEmployeeAssets(qc, employeeId);
      setIsOpen(false);
    });
  }

  function handleReturn() {
    if (!returnTarget) return;
    startTransition(async () => {
      const result = await returnEmployeeAsset(returnTarget, { returned_date: returnDate });
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Asset returned");
      invalidateHrEmployeeAssets(qc, employeeId);
      setReturnOpen(false);
    });
  }

  return (
    <Section
      title="Assets"
      icon={<Package className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Issue Asset</Button> : undefined}
    >
      {isLoading ? <Skeleton className="h-20 w-full" /> : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No assets issued</p>
      ) : (
        <div className="divide-y">
          {assets.map((a) => (
            <div key={a.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === "issued" ? "default" : "outline"}>{String(a.status)}</Badge>
                  <span className="text-xs text-muted-foreground capitalize">{String(a.asset_type).replace(/_/g, " ")}</span>
                </div>
                <p className="text-sm font-medium">{String(a.asset_description)}</p>
                {a.asset_reference ? <p className="text-xs text-muted-foreground">Ref: {String(a.asset_reference)}</p> : null}
                <p className="text-xs text-muted-foreground">Issued: {String(a.issued_date)}</p>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {a.status === "issued" ? (
                    <Button size="sm" variant="outline" onClick={() => { setReturnTarget(a.id as number); setReturnDate(new Date().toISOString().slice(0, 10)); setReturnOpen(true); }}>Return</Button>
                  ) : null}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    startTransition(async () => {
                      const r = await archiveEmployeeAsset(a.id as number);
                      if (!r.success) { toast.error(r.error); return; }
                      toast.success("Asset archived");
                      invalidateHrEmployeeAssets(qc, employeeId);
                    });
                  }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm open={isOpen} onOpenChange={setIsOpen} title={editing ? "Edit Asset" : "Issue Asset"} icon={<Package className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Asset Type <span className="text-destructive">*</span></Label>
            <ERPCombobox value={form.asset_type as string} onValueChange={(v) => setForm((f) => ({ ...f, asset_type: v }))} options={["id_card", "phone", "sim", "laptop", "vehicle", "tool", "key", "other"].map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))} placeholder="Select type..." />
          </div>
          <div className="col-span-6">
            <Label>Asset Reference</Label>
            <Input value={form.asset_reference as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, asset_reference: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Input value={form.asset_description as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, asset_description: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Issued Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.issued_date as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Return Due Date</Label>
            <Input type="date" value={form.return_due_date as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, return_due_date: e.target.value || null }))} />
          </div>
          <div className="col-span-12">
            <Label>Condition on Issue</Label>
            <Input value={form.condition_on_issue as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, condition_on_issue: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm open={returnOpen} onOpenChange={setReturnOpen} title="Return Asset" icon={<Package className="h-5 w-5" />} mode="edit" submitLabel="Confirm Return" isSubmitting={isPending} onSubmit={handleReturn} size="sm">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Return Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── PPE Section ────────────────────────────────────────────────────────────

function PpeSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [returnOpen, setReturnOpenRaw] = useState(false);
  const [returnTarget, setReturnTarget] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    ppe_item: "",
    quantity: 1,
    issued_date: new Date().toISOString().slice(0, 10),
    status: "issued",
  });

  const setIsOpen = useCallback((open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setReturnOpen = useCallback((open: boolean) => { setReturnOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.ppe(employeeId),
    queryFn: () => listEmployeePpeIssues(employeeId),
  });

  const ppe = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function openAdd() { setEditing(null); setForm({ ppe_item: "", quantity: 1, issued_date: new Date().toISOString().slice(0, 10), status: "issued" }); setIsOpen(true); }
  function openEdit(row: Record<string, unknown>) { setEditing(row); setForm({ ...row }); setIsOpen(true); }

  function handleSubmit() {
    startTransition(async () => {
      const action = editing ? updateEmployeePpeIssue(editing.id as number, form) : createEmployeePpeIssue(employeeId, form);
      const result = await action;
      if (!result.success) { toast.error(result.error); return; }
      toast.success(editing ? "PPE updated" : "PPE issued");
      invalidateHrEmployeePpe(qc, employeeId);
      setIsOpen(false);
    });
  }

  function handleReturn() {
    if (!returnTarget) return;
    startTransition(async () => {
      const result = await returnEmployeePpeIssue(returnTarget, { returned_date: returnDate });
      if (!result.success) { toast.error(result.error); return; }
      toast.success("PPE returned");
      invalidateHrEmployeePpe(qc, employeeId);
      setReturnOpen(false);
    });
  }

  return (
    <Section
      title="PPE Issued"
      icon={<HardHat className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Issue PPE</Button> : undefined}
    >
      {isLoading ? <Skeleton className="h-20 w-full" /> : ppe.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No PPE issued</p>
      ) : (
        <div className="divide-y">
          {ppe.map((p) => (
            <div key={p.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "issued" ? "default" : "outline"}>{String(p.status)}</Badge>
                  {p.standard_or_size ? <span className="text-xs text-muted-foreground">Size: {String(p.standard_or_size)}</span> : null}
                </div>
                <p className="text-sm font-medium">{String(p.ppe_item)}</p>
                <p className="text-xs text-muted-foreground">Qty: {String(p.quantity)} · Issued: {String(p.issued_date)}</p>
                {p.expiry_or_replacement_date ? <p className="text-xs text-muted-foreground">Expiry: {String(p.expiry_or_replacement_date)}</p> : null}
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {p.status === "issued" ? (
                    <Button size="sm" variant="outline" onClick={() => { setReturnTarget(p.id as number); setReturnDate(new Date().toISOString().slice(0, 10)); setReturnOpen(true); }}>Return</Button>
                  ) : null}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    startTransition(async () => {
                      const r = await archiveEmployeePpeIssue(p.id as number);
                      if (!r.success) { toast.error(r.error); return; }
                      toast.success("PPE archived");
                      invalidateHrEmployeePpe(qc, employeeId);
                    });
                  }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm open={isOpen} onOpenChange={setIsOpen} title={editing ? "Edit PPE" : "Issue PPE"} icon={<HardHat className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <Label>PPE Item <span className="text-destructive">*</span></Label>
            <Input value={form.ppe_item as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, ppe_item: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Quantity <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} step={0.01} value={String(form.quantity ?? 1)} onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))} />
          </div>
          <div className="col-span-4">
            <Label>Standard / Size</Label>
            <Input value={form.standard_or_size as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, standard_or_size: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Issued Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.issued_date as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Expiry / Replace Date</Label>
            <Input type="date" value={form.expiry_or_replacement_date as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, expiry_or_replacement_date: e.target.value || null }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm open={returnOpen} onOpenChange={setReturnOpen} title="Return PPE" icon={<HardHat className="h-5 w-5" />} mode="edit" submitLabel="Confirm Return" isSubmitting={isPending} onSubmit={handleReturn} size="sm">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Return Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}

// ─── Accommodation Section ──────────────────────────────────────────────────

function AccommodationSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpenRaw] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [endOpen, setEndOpenRaw] = useState(false);
  const [endTarget, setEndTarget] = useState<number | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, unknown>>({
    accommodation_type: "company_camp",
    assigned_from: new Date().toISOString().slice(0, 10),
    status: "active",
  });

  const setIsOpen = useCallback((open: boolean) => { setIsOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setEndOpen = useCallback((open: boolean) => { setEndOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.accommodation(employeeId),
    queryFn: () => listEmployeeAccommodationRecords(employeeId),
  });

  const records = data?.success ? (data.data as Record<string, unknown>[]) : [];

  function openAdd() { setEditing(null); setForm({ accommodation_type: "company_camp", assigned_from: new Date().toISOString().slice(0, 10), status: "active" }); setIsOpen(true); }
  function openEdit(row: Record<string, unknown>) { setEditing(row); setForm({ ...row }); setIsOpen(true); }

  function handleSubmit() {
    startTransition(async () => {
      const action = editing
        ? updateEmployeeAccommodationRecord(editing.id as number, form)
        : createEmployeeAccommodationRecord(employeeId, form);
      const result = await action;
      if (!result.success) { toast.error(result.error); return; }
      toast.success(editing ? "Accommodation updated" : "Accommodation assigned");
      invalidateHrEmployeeAccommodation(qc, employeeId);
      setIsOpen(false);
    });
  }

  function handleEnd() {
    if (!endTarget) return;
    startTransition(async () => {
      const result = await endEmployeeAccommodationRecord(endTarget, { assigned_to: endDate });
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Accommodation ended");
      invalidateHrEmployeeAccommodation(qc, employeeId);
      setEndOpen(false);
    });
  }

  return (
    <Section
      title="Accommodation"
      icon={<Home className="h-5 w-5 text-primary" />}
      action={canManage ? <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Assign Accommodation</Button> : undefined}
    >
      {isLoading ? <Skeleton className="h-20 w-full" /> : records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No accommodation records</p>
      ) : (
        <div className="divide-y">
          {records.map((r) => (
            <div key={r.id as number} className="flex items-start justify-between py-3 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "active" ? "default" : "outline"}>{String(r.status)}</Badge>
                  {r.accommodation_type ? <span className="text-xs text-muted-foreground capitalize">{String(r.accommodation_type).replace(/_/g, " ")}</span> : null}
                </div>
                <p className="text-sm font-medium">{String(r.accommodation_location ?? "—")}</p>
                {r.room_or_bed_no ? <p className="text-xs text-muted-foreground">Room/Bed: {String(r.room_or_bed_no)}</p> : null}
                <p className="text-xs text-muted-foreground">
                  From: {String(r.assigned_from)} {r.assigned_to ? `→ ${String(r.assigned_to)}` : "→ ongoing"}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {r.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => { setEndTarget(r.id as number); setEndDate(new Date().toISOString().slice(0, 10)); setEndOpen(true); }}>End</Button>
                  ) : null}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    startTransition(async () => {
                      const res = await archiveEmployeeAccommodationRecord(r.id as number);
                      if (!res.success) { toast.error(res.error); return; }
                      toast.success("Record archived");
                      invalidateHrEmployeeAccommodation(qc, employeeId);
                    });
                  }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm open={isOpen} onOpenChange={setIsOpen} title={editing ? "Edit Accommodation" : "Assign Accommodation"} icon={<Home className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Accommodation Type</Label>
            <ERPCombobox value={form.accommodation_type as string ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, accommodation_type: v }))} options={["company_camp", "rented_room", "allowance", "other"].map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))} placeholder="Select type..." />
          </div>
          <div className="col-span-6">
            <Label>Room / Bed No.</Label>
            <Input value={form.room_or_bed_no as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, room_or_bed_no: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Location</Label>
            <Input value={form.accommodation_location as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, accommodation_location: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Assigned From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.assigned_from as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, assigned_from: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Assigned To</Label>
            <Input type="date" value={form.assigned_to as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value || null }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes as string ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm open={endOpen} onOpenChange={setEndOpen} title="End Accommodation" icon={<Home className="h-5 w-5" />} mode="edit" submitLabel="Confirm End" isSubmitting={isPending} onSubmit={handleEnd} size="sm">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>End Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </ERPChildDialogForm>
    </Section>
  );
}
