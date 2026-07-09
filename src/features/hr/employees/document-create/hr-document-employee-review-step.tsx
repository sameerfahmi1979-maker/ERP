"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, User, Info, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ERPCombobox } from "@/components/erp/combobox";
import { cn } from "@/lib/utils";
import type {
  HrEmployeeDraftFromDocuments,
  HrDocumentFieldSuggestion,
  HrDocumentConflict,
} from "@/lib/hr/document-to-record/types";
import { HrDocumentConfidenceBadge } from "./hr-document-confidence-badge";
import { HrDocumentConflictCard } from "./hr-document-conflict-card";
import { useOwnerCompaniesQuery, useBranchesQuery } from "@/hooks/lookups/use-org-queries";
import { useCountriesQuery } from "@/hooks/lookups/use-geography-queries";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import {
  listHrEmployeeCategories,
  listHrEmploymentTypes,
} from "@/server/actions/hr/settings";
import type { DuplicateCheckResult } from "@/lib/hr/document-to-record/duplicate-checks";

type EmployeeFormState = {
  full_name_en: string;
  full_name_ar: string;
  gender: "male" | "female" | "";
  date_of_birth: string;
  nationality_id: number | null;
  mobile_number: string;
  personal_email: string;
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  joining_date: string;
  emergency_contact_name: string;
  emergency_contact_mobile: string;
};

type Props = {
  draft: HrEmployeeDraftFromDocuments;
  form: EmployeeFormState;
  setForm: (patch: Partial<EmployeeFormState>) => void;
  conflicts: HrDocumentConflict[];
  onResolveConflict: (fieldName: string, value: string, docId: number) => void;
  duplicates: DuplicateCheckResult[];
  identityDocDuplicates: DuplicateCheckResult[];
  onNext: () => void;
  onBack: () => void;
};

function SuggestedField({
  label,
  suggestion,
  value,
  onChange,
  required,
  inputType = "text",
}: {
  label: string;
  suggestion: HrDocumentFieldSuggestion | null;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputType?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Label className="text-xs font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {suggestion && <HrDocumentConfidenceBadge confidence={suggestion.confidence} />}
        {suggestion && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
            {suggestion.sourceDocumentTitle}
          </span>
        )}
      </div>
      <Input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={suggestion ? `Suggested: ${suggestion.suggestedValue ?? ""}` : undefined}
        className={cn("h-8 text-sm", suggestion && !value && "border-yellow-400")}
      />
    </div>
  );
}

export function HrDocumentEmployeeReviewStep({
  draft,
  form,
  setForm,
  conflicts,
  onResolveConflict,
  duplicates,
  identityDocDuplicates,
  onNext,
  onBack,
}: Props) {
  const { options: companyOptions } = useOwnerCompaniesQuery();
  const { options: countryOptions } = useCountriesQuery();

  // Branch — filtered by selected company
  const { options: branchOptions } = useBranchesQuery({
    ownerCompanyId: form.owner_company_id,
    enabled: !!form.owner_company_id,
  });

  // Department
  const { data: departmentOptions } = useQuery({
    queryKey: ["departments", "list"],
    queryFn: async () => {
      const r = await listDepartments({ is_active: true });
      return (r.data ?? []).map((d) => ({
        value: d.id,
        label: d.department_name_en,
        description: d.department_code ?? undefined,
      }));
    },
  });

  // Designation
  const { data: designationOptions } = useQuery({
    queryKey: ["designations", "list"],
    queryFn: async () => {
      const r = await listDesignations({ is_active: true });
      return (r.data ?? []).map((d) => ({
        value: d.id,
        label: d.designation_name_en,
        description: d.designation_code ?? undefined,
      }));
    },
  });

  // Employee Category
  const { data: categoryOptions } = useQuery({
    queryKey: ["hr", "settings", "employee-categories"],
    queryFn: async () => {
      const r = await listHrEmployeeCategories({ is_active: true });
      const rows = r.success && r.data ? r.data.data : [];
      return rows.map((c) => ({
        value: c.id,
        label: c.name_en,
        description: c.code ?? undefined,
      }));
    },
  });

  // Employment Type
  const { data: employmentTypeOptions } = useQuery({
    queryKey: ["hr", "settings", "employment-types"],
    queryFn: async () => {
      const r = await listHrEmploymentTypes({ is_active: true });
      const rows = r.success && r.data ? r.data.data : [];
      return rows.map((t) => ({
        value: t.id,
        label: t.name_en,
        description: t.code ?? undefined,
      }));
    },
  });

  const hasBlockingIdentityDuplicates = identityDocDuplicates.some(
    (d) => d.severity === "block"
  );

  const isValid =
    form.full_name_en.trim() &&
    (form.gender === "male" || form.gender === "female") &&
    form.date_of_birth.trim() &&
    form.mobile_number.trim() &&
    form.owner_company_id &&
    form.joining_date.trim() &&
    form.emergency_contact_name.trim() &&
    form.emergency_contact_mobile.trim() &&
    !hasBlockingIdentityDuplicates;

  const unresolvedConflicts = conflicts.filter((c) => !c.resolvedValue);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Review Employee Draft</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fields pre-filled from documents are shown with confidence scores. Review and complete all
          required fields before continuing. You can edit any suggested value.
        </p>
      </div>

      {/* Blocking identity document duplicates — red, prevents Next */}
      {hasBlockingIdentityDuplicates && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-xs font-semibold text-red-800 dark:text-red-300">
              Duplicate Identity Document — Cannot Proceed
            </span>
          </div>
          {identityDocDuplicates
            .filter((d) => d.severity === "block")
            .map((d, i) => (
              <p key={i} className="text-[11px] text-red-700 dark:text-red-400 ml-6">
                {d.reason}
              </p>
            ))}
          <p className="text-[11px] text-red-600 dark:text-red-500 ml-6">
            An employee record with this document already exists. Do not create a duplicate.
            If this is a different person, verify the document number is correct.
          </p>
        </div>
      )}

      {/* Soft duplicate warnings — yellow, allows Next */}
      {duplicates.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
              Possible Duplicate{duplicates.length > 1 ? "s" : ""} Found
            </span>
          </div>
          {duplicates.map((d, i) => (
            <p key={i} className="text-[11px] text-yellow-700 dark:text-yellow-400 ml-6">
              {d.reason}
            </p>
          ))}
          <p className="text-[11px] text-yellow-600 ml-6">
            Review carefully. You may still proceed if these are different people.
          </p>
        </div>
      )}

      {unresolvedConflicts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
            {unresolvedConflicts.length} unresolved conflict{unresolvedConflicts.length > 1 ? "s" : ""} — choose the correct value below.
          </p>
          {conflicts.map((c) => (
            <HrDocumentConflictCard
              key={c.fieldName}
              conflict={c}
              onResolve={(value, docId) => onResolveConflict(c.fieldName, value, docId)}
            />
          ))}
        </div>
      )}

      {/* Core personal fields */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Personal Information
        </p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <SuggestedField
              label="Full Name (English)"
              suggestion={draft.full_name_en}
              value={form.full_name_en}
              onChange={(v) => setForm({ full_name_en: v })}
              required
            />
          </div>
          <div className="col-span-6">
            <SuggestedField
              label="Full Name (Arabic)"
              suggestion={draft.full_name_ar}
              value={form.full_name_ar}
              onChange={(v) => setForm({ full_name_ar: v })}
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs font-medium mb-1 block">
              Gender <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm({ gender: g })}
                  className={cn(
                    "flex-1 rounded border px-3 py-1.5 text-xs capitalize transition-colors",
                    form.gender === g
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-medium"
                      : "border-border bg-background hover:bg-muted/40"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
            {draft.gender && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Suggested: {draft.gender.suggestedValue}{" "}
                <HrDocumentConfidenceBadge confidence={draft.gender.confidence} className="ml-0.5" />
              </p>
            )}
          </div>
          <div className="col-span-4">
            <SuggestedField
              label="Date of Birth"
              suggestion={draft.date_of_birth}
              value={form.date_of_birth}
              onChange={(v) => setForm({ date_of_birth: v })}
              required
              inputType="date"
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs font-medium mb-1 block">Nationality</Label>
            <ERPCombobox
              value={form.nationality_id}
              onValueChange={(v) => setForm({ nationality_id: v == null ? null : Number(v) })}
              options={countryOptions}
              placeholder="Select nationality..."
              searchPlaceholder="Search..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <SuggestedField
              label="Mobile Number"
              suggestion={draft.mobile_number}
              value={form.mobile_number}
              onChange={(v) => setForm({ mobile_number: v })}
              required
            />
          </div>
          <div className="col-span-6">
            <SuggestedField
              label="Personal Email"
              suggestion={draft.personal_email}
              value={form.personal_email}
              onChange={(v) => setForm({ personal_email: v })}
              inputType="email"
            />
          </div>
        </div>
      </div>

      {/* Employment fields */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Employment Details
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
            <Info className="h-2.5 w-2.5" />
            Must be entered manually
          </span>
        </div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">
              Employer Company <span className="text-destructive">*</span>
            </Label>
            <ERPCombobox
              value={form.owner_company_id}
              onValueChange={(v) => {
                setForm({
                  owner_company_id: v == null ? null : Number(v),
                  branch_id: null,
                });
              }}
              options={companyOptions}
              placeholder="Select company..."
              searchPlaceholder="Search..."
              required
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">
              Joining Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm({ joining_date: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Branch</Label>
            <ERPCombobox
              value={form.branch_id}
              onValueChange={(v) => setForm({ branch_id: v == null ? null : Number(v) })}
              options={branchOptions}
              placeholder={form.owner_company_id ? "Select branch..." : "Select company first"}
              searchPlaceholder="Search..."
              allowClear
              disabled={!form.owner_company_id}
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Department</Label>
            <ERPCombobox
              value={form.department_id}
              onValueChange={(v) => setForm({ department_id: v == null ? null : Number(v) })}
              options={departmentOptions ?? []}
              placeholder="Select department..."
              searchPlaceholder="Search..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Designation</Label>
            <ERPCombobox
              value={form.designation_id}
              onValueChange={(v) => setForm({ designation_id: v == null ? null : Number(v) })}
              options={designationOptions ?? []}
              placeholder="Select designation..."
              searchPlaceholder="Search..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Employee Category</Label>
            <ERPCombobox
              value={form.employee_category_id}
              onValueChange={(v) => setForm({ employee_category_id: v == null ? null : Number(v) })}
              options={categoryOptions ?? []}
              placeholder="Select category..."
              searchPlaceholder="Search..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Employment Type</Label>
            <ERPCombobox
              value={form.employment_type_id}
              onValueChange={(v) => setForm({ employment_type_id: v == null ? null : Number(v) })}
              options={employmentTypeOptions ?? []}
              placeholder="Select employment type..."
              searchPlaceholder="Search..."
              allowClear
            />
          </div>
        </div>
      </div>

      {/* Emergency contact */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Emergency Contact
        </p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">
              Contact Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.emergency_contact_name}
              onChange={(e) => setForm({ emergency_contact_name: e.target.value })}
              className="h-8 text-sm"
              placeholder="e.g. Father, Spouse..."
            />
          </div>
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">
              Contact Mobile <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.emergency_contact_mobile}
              onChange={(e) => setForm({ emergency_contact_mobile: e.target.value })}
              className="h-8 text-sm"
              placeholder="+971..."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onNext} disabled={!isValid}>
          Review Compliance Records
        </Button>
      </div>
    </div>
  );
}

export type { EmployeeFormState };
