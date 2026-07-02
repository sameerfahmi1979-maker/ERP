"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPCombobox } from "@/components/erp/combobox";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import { listWorkSites } from "@/server/actions/common-master-data/work-sites";
import {
  listHrEmployeeCategories,
  listHrEmploymentTypes,
  listHrMohreEstablishments,
  listHrRelationshipTypes,
} from "@/server/actions/hr/settings";
import type { EmployeeListRow } from "@/server/actions/hr/employees";
import type { UseWorkspaceFormDraftReturn } from "@/hooks/use-workspace-form-draft";

type Props = {
  employee: EmployeeListRow | null;
  mode: "add" | "edit" | "view";
  formId: string;
  getDraftDefault: UseWorkspaceFormDraftReturn["getDraftDefault"];
  syncDraft: UseWorkspaceFormDraftReturn["syncDraft"];
  writeDraftField: UseWorkspaceFormDraftReturn["writeDraftField"];
  // Controlled state for comboboxes (not capturable by FormData)
  form: EmployeeProfileFormState;
  setForm: (updater: (prev: EmployeeProfileFormState) => EmployeeProfileFormState) => void;
};

export type EmployeeProfileFormState = {
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  employee_status: string;
  nationality_id: number | null;
  reporting_manager_id: number | null;
  supervisor_id: number | null;
  primary_work_site_id: number | null;
  sponsor_company_id: number | null;
  mohre_establishment_id: number | null;
  gender: string;
  marital_status: string;
  blood_group: string;
  contract_type: string;
  emergency_contact_relationship_type_id: number | null;
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const MARITAL_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

const BLOOD_GROUP_OPTIONS = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "on_leave", label: "On Leave" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "limited", label: "Limited" },
  { value: "unlimited", label: "Unlimited" },
];

export function EmployeeProfileTab({
  employee,
  mode,
  formId,
  getDraftDefault,
  syncDraft,
  form,
  setForm,
}: Props) {
  const disabled = mode === "view";

  // Freeze all defaultValue computations on first render so Base UI's FieldControl
  // never sees a changing defaultValue prop (which triggers an uncontrolled→controlled
  // warning). Re-initialised naturally on full unmount/remount (tab switch, new record).
  const initialDefaultsRef = useRef<Record<string, string> | null>(null);
  if (initialDefaultsRef.current === null) {
    initialDefaultsRef.current = {
      full_name_en:             getDraftDefault("full_name_en",             employee?.full_name_en              ?? ""),
      full_name_ar:             getDraftDefault("full_name_ar",             employee?.full_name_ar              ?? ""),
      known_name:               getDraftDefault("known_name",               employee?.known_name                ?? ""),
      date_of_birth:            getDraftDefault("date_of_birth",            employee?.date_of_birth             ?? ""),
      mobile_number:            getDraftDefault("mobile_number",            employee?.mobile_number             ?? ""),
      personal_email:           getDraftDefault("personal_email",           employee?.personal_email            ?? ""),
      uae_address:              getDraftDefault("uae_address",              employee?.uae_address               ?? ""),
      home_country_address:     getDraftDefault("home_country_address",     employee?.home_country_address      ?? ""),
      joining_date:             getDraftDefault("joining_date",             employee?.joining_date              ?? ""),
      actual_joining_date:      getDraftDefault("actual_joining_date",      employee?.actual_joining_date       ?? ""),
      contract_start_date:      getDraftDefault("contract_start_date",      employee?.contract_start_date       ?? ""),
      contract_end_date:        getDraftDefault("contract_end_date",        employee?.contract_end_date         ?? ""),
      probation_start_date:     getDraftDefault("probation_start_date",     employee?.probation_start_date      ?? ""),
      probation_end_date:       getDraftDefault("probation_end_date",       employee?.probation_end_date        ?? ""),
      notice_period_days:       getDraftDefault("notice_period_days",       employee?.notice_period_days?.toString() ?? ""),
      emergency_contact_name:   getDraftDefault("emergency_contact_name",   employee?.emergency_contact_name   ?? ""),
      emergency_contact_mobile: getDraftDefault("emergency_contact_mobile", employee?.emergency_contact_mobile ?? ""),
    };
  }
  const d = initialDefaultsRef.current;

  // ── Lookup Queries ──────────────────────────────────────────────────────────

  const { data: departments } = useQuery({
    queryKey: ["departments", "list"],
    queryFn: async () => {
      const r = await listDepartments({ is_active: true });
      return r.data ?? [];
    },
  });

  const { data: designations } = useQuery({
    queryKey: ["designations", "list"],
    queryFn: async () => {
      const r = await listDesignations({ is_active: true });
      return r.data ?? [];
    },
  });

  const { data: workSites } = useQuery({
    queryKey: ["work-sites", "list"],
    queryFn: async () => {
      const r = await listWorkSites({ status: "active" });
      return r.data ?? [];
    },
  });

  const { data: employeeCategories } = useQuery({
    queryKey: ["hr", "settings", "employee-categories"],
    queryFn: async () => {
      const r = await listHrEmployeeCategories({ is_active: true });
      return r.success && r.data ? r.data.data : [];
    },
  });

  const { data: employmentTypes } = useQuery({
    queryKey: ["hr", "settings", "employment-types"],
    queryFn: async () => {
      const r = await listHrEmploymentTypes({ is_active: true });
      return r.success && r.data ? r.data.data : [];
    },
  });

  const { data: mohreEstablishments } = useQuery({
    queryKey: ["hr", "settings", "mohre-establishments", form.owner_company_id],
    queryFn: async () => {
      const r = await listHrMohreEstablishments({
        status: "active",
        owner_company_id: form.owner_company_id ?? undefined,
        page_size: 200,
      });
      return r.success && r.data ? r.data.data : [];
    },
    enabled: !!form.owner_company_id,
  });

  /** Always include the employee's currently linked establishment (even if inactive or filtered out). */
  const mohreEstablishmentOptions = useMemo(() => {
    const fromList = (mohreEstablishments ?? []).map((m) => ({
      value: m.id,
      label: m.establishment_name,
      code: m.establishment_number,
      description: m.establishment_number,
    }));

    const linked = employee?.mohre_establishment;
    if (linked && !fromList.some((o) => o.value === linked.id)) {
      fromList.unshift({
        value: linked.id,
        label: linked.establishment_name,
        code: linked.establishment_number,
        description: linked.establishment_number,
      });
    }

    return fromList;
  }, [mohreEstablishments, employee?.mohre_establishment]);

  const { data: relationshipTypes } = useQuery({
    queryKey: ["hr", "settings", "relationship-types"],
    queryFn: async () => {
      const r = await listHrRelationshipTypes({ is_active: true });
      return r.success && r.data ? r.data.data : [];
    },
  });

  const f = (k: keyof EmployeeProfileFormState) =>
    (v: number | null | string) =>
      setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-8 p-6">
      {/* ── Personal Information ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Personal Information
        </h3>
        <div className="grid grid-cols-12 gap-4">
          {/* Employee Code (read-only always) */}
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="employee_code_display">Employee Code</Label>
            <Input
              id="employee_code_display"
              value={employee?.employee_code ?? "(Auto-generated)"}
              readOnly
              disabled
              className="bg-muted/50 font-mono"
            />
          </div>

          <div className="col-span-8" /> {/* spacer */}

          <div className="col-span-6 space-y-1.5">
            <RequiredLabel htmlFor="full_name_en">Full Name (English)</RequiredLabel>
            <Input
              id="full_name_en"
              name="full_name_en"
              defaultValue={d.full_name_en}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-6 space-y-1.5">
            <Label htmlFor="full_name_ar">Full Name (Arabic)</Label>
            <Input
              id="full_name_ar"
              name="full_name_ar"
              dir="rtl"
              defaultValue={d.full_name_ar}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="known_name">Known Name</Label>
            <Input
              id="known_name"
              name="known_name"
              defaultValue={d.known_name}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="gender">Gender</RequiredLabel>
            <ERPCombobox
              value={form.gender}
              onValueChange={(v) => setForm((p) => ({ ...p, gender: v as string }))}
              options={GENDER_OPTIONS}
              placeholder="Select gender..."
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="marital_status">Marital Status</Label>
            <ERPCombobox
              value={form.marital_status}
              onValueChange={(v) => setForm((p) => ({ ...p, marital_status: v as string }))}
              options={MARITAL_OPTIONS}
              placeholder="Select..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="nationality_id">Nationality</Label>
            <CountrySelect
              value={form.nationality_id}
              onValueChange={(v) => setForm((p) => ({ ...p, nationality_id: v })) }
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="date_of_birth">Date of Birth</RequiredLabel>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              defaultValue={d.date_of_birth}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="blood_group">Blood Group</Label>
            <ERPCombobox
              value={form.blood_group}
              onValueChange={(v) => setForm((p) => ({ ...p, blood_group: v as string }))}
              options={BLOOD_GROUP_OPTIONS}
              placeholder="Select..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="mobile_number">Mobile Number</RequiredLabel>
            <Input
              id="mobile_number"
              name="mobile_number"
              defaultValue={d.mobile_number}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="personal_email">Personal Email</Label>
            <Input
              id="personal_email"
              name="personal_email"
              type="email"
              defaultValue={d.personal_email}
              disabled={disabled}
            />
          </div>
          <div className="col-span-6 space-y-1.5">
            <Label htmlFor="uae_address">UAE Address</Label>
            <Textarea
              id="uae_address"
              name="uae_address"
              rows={2}
              defaultValue={d.uae_address}
              disabled={disabled}
            />
          </div>
          <div className="col-span-6 space-y-1.5">
            <Label htmlFor="home_country_address">Home Country Address</Label>
            <Textarea
              id="home_country_address"
              name="home_country_address"
              rows={2}
              defaultValue={d.home_country_address}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* ── Employment Details ────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Employment Details
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 space-y-1.5">
            <RequiredLabel htmlFor="owner_company_id">Employer Company</RequiredLabel>
            <OwnerCompanySelect
              value={form.owner_company_id}
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  owner_company_id: v,
                  // MOHRE establishment is company-scoped — clear when employer changes
                  mohre_establishment_id: null,
                }))
              }
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-6 space-y-1.5">
            <Label htmlFor="branch_id">Branch</Label>
            <BranchSelect
              value={form.branch_id}
              onValueChange={(v) => setForm((p) => ({ ...p, branch_id: v }))}
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Department</Label>
            <ERPCombobox
              value={form.department_id}
              onValueChange={(v) => setForm((p) => ({ ...p, department_id: Number(v) || null }))}
              options={(departments ?? []).map((d) => ({ value: d.id, label: d.department_name_en }))}
              placeholder="Select department..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Designation</Label>
            <ERPCombobox
              value={form.designation_id}
              onValueChange={(v) => setForm((p) => ({ ...p, designation_id: Number(v) || null }))}
              options={(designations ?? []).map((d) => ({ value: d.id, label: d.designation_name_en }))}
              placeholder="Select designation..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Employee Category</Label>
            <ERPCombobox
              value={form.employee_category_id}
              onValueChange={(v) => setForm((p) => ({ ...p, employee_category_id: Number(v) || null }))}
              options={(employeeCategories ?? []).map((c) => ({ value: c.id, label: c.name_en }))}
              placeholder="Select category..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Employment Type</Label>
            <ERPCombobox
              value={form.employment_type_id}
              onValueChange={(v) => setForm((p) => ({ ...p, employment_type_id: Number(v) || null }))}
              options={(employmentTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }))}
              placeholder="Select type..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="joining_date">Joining Date</RequiredLabel>
            <Input
              id="joining_date"
              name="joining_date"
              type="date"
              defaultValue={d.joining_date}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="actual_joining_date">Actual Joining Date</Label>
            <Input
              id="actual_joining_date"
              name="actual_joining_date"
              type="date"
              defaultValue={d.actual_joining_date}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel>Employee Status</RequiredLabel>
            <ERPCombobox
              value={form.employee_status}
              onValueChange={(v) => setForm((p) => ({ ...p, employee_status: v as string }))}
              options={STATUS_OPTIONS}
              placeholder="Select status..."
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Primary Work Site</Label>
            <ERPCombobox
              value={form.primary_work_site_id}
              onValueChange={(v) => setForm((p) => ({ ...p, primary_work_site_id: Number(v) || null }))}
              options={(workSites ?? []).map((s) => ({ value: s.id, label: s.site_name }))}
              placeholder="Select work site..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Sponsor Company</Label>
            <OwnerCompanySelect
              value={form.sponsor_company_id}
              onValueChange={(v) => setForm((p) => ({ ...p, sponsor_company_id: v }))}
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>MOHRE Establishment</Label>
            <ERPCombobox
              value={form.mohre_establishment_id}
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  mohre_establishment_id: v ? Number(v) : null,
                }))
              }
              options={mohreEstablishmentOptions}
              placeholder={
                form.owner_company_id
                  ? "Select MOHRE establishment..."
                  : "Select employer company first"
              }
              disabled={disabled || !form.owner_company_id}
              allowClear
              showCode
            />
            {!form.owner_company_id && (
              <p className="text-[11px] text-muted-foreground">
                Link this employee to an employer company, then choose a MOHRE establishment registered for that company in HR Settings.
              </p>
            )}
            {form.owner_company_id && mohreEstablishmentOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No MOHRE establishments for this company. Add one under HR Settings → MOHRE Establishments.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Contract / Probation ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Contract & Probation
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-1.5">
            <Label>Contract Type</Label>
            <ERPCombobox
              value={form.contract_type}
              onValueChange={(v) => setForm((p) => ({ ...p, contract_type: v as string }))}
              options={CONTRACT_TYPE_OPTIONS}
              placeholder="Select..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="contract_start_date">Contract Start Date</Label>
            <Input
              id="contract_start_date"
              name="contract_start_date"
              type="date"
              defaultValue={d.contract_start_date}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="contract_end_date">Contract End Date</Label>
            <Input
              id="contract_end_date"
              name="contract_end_date"
              type="date"
              defaultValue={d.contract_end_date}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="probation_start_date">Probation Start Date</Label>
            <Input
              id="probation_start_date"
              name="probation_start_date"
              type="date"
              defaultValue={d.probation_start_date}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="probation_end_date">Probation End Date</Label>
            <Input
              id="probation_end_date"
              name="probation_end_date"
              type="date"
              defaultValue={d.probation_end_date}
              disabled={disabled}
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label htmlFor="notice_period_days">Notice Period (Days)</Label>
            <Input
              id="notice_period_days"
              name="notice_period_days"
              type="number"
              min={0}
              defaultValue={d.notice_period_days}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* ── Emergency Contact ────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Emergency Contact
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="emergency_contact_name">Contact Name</RequiredLabel>
            <Input
              id="emergency_contact_name"
              name="emergency_contact_name"
              defaultValue={d.emergency_contact_name}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="emergency_contact_mobile">Contact Mobile</RequiredLabel>
            <Input
              id="emergency_contact_mobile"
              name="emergency_contact_mobile"
              defaultValue={d.emergency_contact_mobile}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-4 space-y-1.5">
            <Label>Relationship</Label>
            <ERPCombobox
              value={form.emergency_contact_relationship_type_id}
              onValueChange={(v) => setForm((p) => ({ ...p, emergency_contact_relationship_type_id: Number(v) || null }))}
              options={(relationshipTypes ?? []).map((r) => ({ value: r.id, label: r.name_en }))}
              placeholder="Select relationship..."
              disabled={disabled}
              allowClear
            />
          </div>
        </div>
      </section>
    </div>
  );
}
