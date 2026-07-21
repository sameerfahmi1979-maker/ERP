"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ERPCombobox } from "@/components/erp/combobox";

import {
  adminCreateApprovalWorkflow,
  adminUpdateApprovalWorkflow,
  type WorkflowWithSteps,
} from "@/server/actions/dms/document-approvals";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";

// ── Step type ─────────────────────────────────────────────────────────────────

type StepDraft = {
  _id: string;          // client-only temp ID
  step_code: string;
  step_name: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  requires_role: string;
  is_active: boolean;
};

function newStep(index: number): StepDraft {
  return {
    _id: `step-${Date.now()}-${index}`,
    step_code: "",
    step_name: "",
    sort_order: index,
    is_initial: index === 0,
    is_final: false,
    requires_role: "",
    is_active: true,
  };
}

function normalizeOrders(steps: StepDraft[]): StepDraft[] {
  return steps.map((s, i) => ({ ...s, sort_order: i }));
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
  code: string,
  nameEn: string,
  steps: StepDraft[],
): string | null {
  if (!code.trim()) return "Workflow code is required.";
  if (!/^[A-Z0-9_]+$/.test(code.trim())) return "Workflow code must be uppercase letters, digits, or underscores only.";
  if (!nameEn.trim()) return "Workflow name is required.";
  const active = steps.filter((s) => s.is_active);
  if (active.length === 0) return "At least one active step is required.";
  const initials = active.filter((s) => s.is_initial);
  if (initials.length !== 1) return "Exactly one step must be marked as Initial.";
  const finals = active.filter((s) => s.is_final);
  if (finals.length !== 1) return "Exactly one step must be marked as Final.";
  for (const s of active) {
    if (!s.step_code.trim()) return `Step "${s.step_name || "(unnamed)"}" is missing a step code.`;
    if (!s.step_name.trim()) return `Step with code "${s.step_code}" is missing a name.`;
  }
  const codes = active.map((s) => s.step_code.trim().toLowerCase());
  if (new Set(codes).size !== codes.length) return "Step codes must be unique within the workflow.";
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: WorkflowWithSteps | null;
  documentTypes: DmsDocumentTypeRow[];
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApprovalWorkflowFormDialog({
  open,
  onOpenChange,
  editing,
  documentTypes,
  onSuccess,
}: Props) {
  const isEdit = !!editing;

  // ── Form state ─────────────────────────────────────────────────────────────

  const [code, setCode] = useState(editing?.workflowCode ?? "");
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [docTypeId, setDocTypeId] = useState<number | null>(editing?.documentTypeId ?? null);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [steps, setSteps] = useState<StepDraft[]>(
    editing?.steps?.length
      ? editing.steps.map((s, i) => ({
          _id: `step-edit-${s.id ?? i}`,
          step_code: s.stepCode,
          step_name: s.stepName,
          sort_order: s.sortOrder,
          is_initial: s.isInitial,
          is_final: s.isFinal,
          requires_role: s.requiresRole ?? "",
          is_active: s.isActive,
        }))
      : [{ ...newStep(0), is_initial: true }, { ...newStep(1), is_final: true }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Reset on open ──────────────────────────────────────────────────────────

  function handleOpenChange(o: boolean) {
    if (!o && !submitting) {
      setCode(editing?.workflowCode ?? "");
      setNameEn(editing?.nameEn ?? "");
      setNameAr(editing?.nameAr ?? "");
      setDescription(editing?.description ?? "");
      setDocTypeId(editing?.documentTypeId ?? null);
      setIsActive(editing?.isActive ?? true);
      setSteps(
        editing?.steps?.length
          ? editing.steps.map((s, i) => ({
              _id: `step-edit-${s.id ?? i}`,
              step_code: s.stepCode,
              step_name: s.stepName,
              sort_order: s.sortOrder,
              is_initial: s.isInitial,
              is_final: s.isFinal,
              requires_role: s.requiresRole ?? "",
              is_active: s.isActive,
            }))
          : [{ ...newStep(0), is_initial: true }, { ...newStep(1), is_final: true }],
      );
      setValidationError(null);
      onOpenChange(false);
    } else if (o) {
      onOpenChange(true);
    }
  }

  // ── Step helpers ───────────────────────────────────────────────────────────

  const updateStep = (id: string, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s) => s._id === id ? { ...s, ...patch } : s));
  };

  const setOnlyInitial = (id: string) => {
    setSteps((prev) => prev.map((s) => ({ ...s, is_initial: s._id === id })));
  };

  const setOnlyFinal = (id: string) => {
    setSteps((prev) => prev.map((s) => ({ ...s, is_final: s._id === id })));
  };

  const addStep = () => {
    setSteps((prev) => normalizeOrders([...prev, newStep(prev.length)]));
  };

  const removeStep = (id: string) => {
    setSteps((prev) => normalizeOrders(prev.filter((s) => s._id !== id)));
  };

  const moveStep = (id: string, dir: "up" | "down") => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s._id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return normalizeOrders(next);
    });
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setValidationError(null);
    const err = validate(code, nameEn, steps);
    if (err) { setValidationError(err); return; }

    setSubmitting(true);
    try {
      const activeSteps = steps.filter((s) => s.is_active).map((s, i) => ({
        step_code: s.step_code.trim(),
        step_name: s.step_name.trim(),
        sort_order: i,
        is_initial: s.is_initial,
        is_final: s.is_final,
        requires_role: s.requires_role.trim() || undefined,
      }));

      let result: { success: boolean; error?: string };

      if (isEdit && editing) {
        result = await adminUpdateApprovalWorkflow(editing.id, {
          name_en: nameEn.trim(),
          name_ar: nameAr.trim() || undefined,
          description: description.trim() || undefined,
          document_type_id: docTypeId ?? undefined,
          is_active: isActive,
          steps: activeSteps,
        });
      } else {
        result = await adminCreateApprovalWorkflow({
          workflow_code: code.trim().toUpperCase(),
          name_en: nameEn.trim(),
          name_ar: nameAr.trim() || undefined,
          description: description.trim() || undefined,
          document_type_id: docTypeId ?? undefined,
          steps: activeSteps,
        });
      }

      if (result.success) {
        toast.success(isEdit ? "Workflow updated." : "Workflow created.");
        handleOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error ?? "Failed to save workflow.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const docTypeOptions = documentTypes
    .filter((dt) => dt.is_active)
    .map((dt) => ({ value: dt.id, label: `${dt.type_code} — ${dt.name_en}` }));

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? "Edit Approval Workflow" : "New Approval Workflow"}
      subtitle={isEdit ? "Update workflow configuration and steps." : "Configure a new document approval workflow."}
      mode={isEdit ? "edit" : "add"}
      size="xl"
      isSubmitting={submitting}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-12 gap-4">

        {/* ── Basic Fields ───────────────────────────────────────────────── */}

        {/* Workflow Code — readonly in edit */}
        <div className="col-span-4">
          <RequiredLabel required>Workflow Code</RequiredLabel>
          {isEdit ? (
            <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
              {code}
            </div>
          ) : (
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              placeholder="INVOICE_APPROVAL"
              className="mt-1 font-mono uppercase"
              maxLength={100}
              disabled={submitting}
            />
          )}
        </div>

        <div className="col-span-5">
          <RequiredLabel required>Workflow Name (EN)</RequiredLabel>
          <Input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Invoice Approval"
            className="mt-1"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div className="col-span-3">
          <Label className="text-xs text-muted-foreground">Active</Label>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={submitting}
            />
            <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Inactive"}</span>
          </div>
        </div>

        <div className="col-span-6">
          <Label className="text-xs text-muted-foreground">Workflow Name (AR) <span className="text-muted-foreground/60">(optional)</span></Label>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="Arabic name..."
            className="mt-1"
            maxLength={200}
            disabled={submitting}
            dir="rtl"
          />
        </div>

        <div className="col-span-6">
          <Label className="text-xs text-muted-foreground">Document Type <span className="text-muted-foreground/60">(optional)</span></Label>
          <ERPCombobox
            value={docTypeId ?? null}
            onValueChange={(v) => setDocTypeId(v ? Number(v) : null)}
            options={docTypeOptions}
            placeholder="Any document type"
            className="mt-1"
            allowClear
          />
        </div>

        <div className="col-span-12">
          <Label className="text-xs text-muted-foreground">Description <span className="text-muted-foreground/60">(optional)</span></Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe when this workflow applies..."
            className="mt-1 text-sm resize-none"
            rows={2}
            maxLength={1000}
            disabled={submitting}
          />
        </div>

        {/* ── Steps Editor ───────────────────────────────────────────────── */}

        <div className="col-span-12">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Approval Steps
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={addStep}
              disabled={submitting}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add Step
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide w-6">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Step Code</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Step Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide w-32">Required Role</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wide w-16">Initial</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wide w-14">Final</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wide w-12">Active</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {steps.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-4 text-center text-muted-foreground text-xs">
                      No steps yet. Click "Add Step" to begin.
                    </td>
                  </tr>
                ) : (
                  steps.map((step, idx) => (
                    <tr key={step._id} className={step.is_active ? "" : "opacity-50 bg-muted/20"}>
                      <td className="px-3 py-2 text-muted-foreground/60">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Input
                          value={step.step_code}
                          onChange={(e) => updateStep(step._id, { step_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                          placeholder="REVIEW"
                          className="h-7 text-xs font-mono w-28"
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={step.step_name}
                          onChange={(e) => updateStep(step._id, { step_name: e.target.value })}
                          placeholder="Review & Approve"
                          className="h-7 text-xs"
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={step.requires_role}
                          onChange={(e) => updateStep(step._id, { requires_role: e.target.value })}
                          placeholder="role_code"
                          className="h-7 text-xs font-mono w-28"
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name="initial_step"
                          checked={step.is_initial}
                          onChange={() => setOnlyInitial(step._id)}
                          disabled={submitting || !step.is_active}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name="final_step"
                          checked={step.is_final}
                          onChange={() => setOnlyFinal(step._id)}
                          disabled={submitting || !step.is_active}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch
                          checked={step.is_active}
                          onCheckedChange={(v) => updateStep(step._id, { is_active: v })}
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveStep(step._id, "up")}
                            disabled={idx === 0 || submitting}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveStep(step._id, "down")}
                            disabled={idx === steps.length - 1 || submitting}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeStep(step._id)}
                            disabled={submitting}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            Required Role: enter the <code className="bg-muted px-1 rounded text-[10px]">role_code</code> string (e.g. <code className="bg-muted px-1 rounded text-[10px]">dms_manager</code>). Leave blank for any eligible approver.
          </p>
        </div>

        {/* ── Validation error ───────────────────────────────────────────── */}
        {validationError && (
          <div className="col-span-12">
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{validationError}</p>
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
