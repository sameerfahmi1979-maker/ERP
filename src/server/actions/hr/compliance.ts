"use server";

/**
 * ERP HR.3 — Employee Compliance Server Actions
 *
 * Handles all compliance child record CRUD for:
 *   - employee_identity_documents
 *   - employee_medical_insurances
 *   - employee_dependents
 *   - employee_access_cards
 *   - employee_training_certificates
 *   - employee_medical_records (restricted: hr.medical.view / hr.medical.manage)
 *   - Compliance summary + alerts
 *
 * Security model:
 *   - All reads use createClient() (RLS enforced)
 *   - All writes use createAdminClient() with explicit permission + employee-access check
 *   - Medical records require hr.medical.view/manage separately from hr.compliance.view/manage
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

// ── Shared ────────────────────────────────────────────────────────────────────

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Row Types ─────────────────────────────────────────────────────────────────

export type EmployeeIdentityDocumentRow = {
  id: number;
  employee_id: number;
  document_type_id: number;
  document_number: string;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  issuing_authority_party_id: number | null;
  issue_country_id: number | null;
  issuing_emirate_id: number | null;
  issue_city_id: number | null;
  status: string;
  verification_status: string;
  verified_by: number | null;
  verified_at: string | null;
  dms_document_id: number | null;
  renewal_status: string;
  emirates_id_application_no: string | null;
  visa_file_number: string | null;
  uid_number: string | null;
  labour_card_number: string | null;
  work_permit_number: string | null;
  mohre_person_code: string | null;
  profession_on_document: string | null;
  sponsor_company_id: number | null;
  place_of_issue: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  document_type?: { id: number; name_en: string } | null;
  issue_country?: { id: number; name_en: string } | null;
  issuing_emirate?: { id: number; name_en: string } | null;
  issue_city?: { id: number; name_en: string } | null;
  issuing_authority_party?: { id: number; display_name: string; party_code: string } | null;
  sponsor_company?: { id: number; legal_name_en: string } | null;
};

export type EmployeeMedicalInsuranceRow = {
  id: number;
  employee_id: number;
  insurance_provider: string;
  tpa: string | null;
  policy_number: string;
  insurance_card_number: string | null;
  network_class: string | null;
  issue_date: string | null;
  expiry_date: string;
  employee_covered: boolean;
  dependent_coverage_included: boolean;
  dependent_count_covered: number | null;
  status: string;
  verification_status: string;
  renewal_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeDependentRow = {
  id: number;
  employee_id: number;
  dependent_name_en: string;
  dependent_name_ar: string | null;
  relationship_type_id: number;
  date_of_birth: string | null;
  nationality_id: number | null;
  passport_number: string | null;
  passport_expiry: string | null;
  emirates_id_number: string | null;
  emirates_id_expiry: string | null;
  residence_visa_number: string | null;
  residence_visa_expiry: string | null;
  medical_insurance_provider: string | null;
  medical_insurance_policy: string | null;
  medical_insurance_card: string | null;
  medical_insurance_expiry: string | null;
  sponsored_by: string | null;
  is_active: boolean;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  relationship_type?: { id: number; name_en: string } | null;
  nationality?: { id: number; name_en: string } | null;
};

export type EmployeeAccessCardRow = {
  id: number;
  employee_id: number;
  access_type_id: number;
  client_authority: string | null;
  work_site_id: number | null;
  card_number: string | null;
  application_reference: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  access_level: string | null;
  renewal_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  access_type?: { id: number; name_en: string } | null;
  work_site?: { id: number; site_name: string } | null;
};

export type EmployeeTrainingCertificateRow = {
  id: number;
  employee_id: number;
  training_category_id: number | null;
  training_type_id: number;
  provider: string | null;
  approval_body: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  validity_months: number | null;
  required_for_designation: boolean;
  required_for_site: boolean;
  status: string;
  verification_status: string;
  renewal_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  training_category?: { id: number; name_en: string } | null;
  training_type?: { id: number; name_en: string } | null;
};

export type EmployeeMedicalRecordRow = {
  id: number;
  employee_id: number;
  medical_record_type_id: number;
  medical_center: string | null;
  report_number: string | null;
  examination_date: string;
  result: string;
  fit_for_work: boolean;
  work_restrictions: boolean;
  restriction_details: string | null;
  expiry_date: string | null;
  required_for_visa: boolean;
  required_for_site: boolean;
  required_for_offshore: boolean;
  dms_document_id: number | null;
  confidentiality_level: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  medical_record_type?: { id: number; name_en: string } | null;
};

export type EmployeeComplianceSummary = {
  identityDocuments: { total: number; active: number; expiringSoon: number; expired: number };
  medicalInsurances: { total: number; active: number; expiringSoon: number; expired: number };
  dependents: { total: number; active: number };
  accessCards: { total: number; active: number; expiringSoon: number; expired: number };
  trainingCertificates: { total: number; valid: number; expiringSoon: number; expired: number };
  medicalRecords: { total: number; fit: number; lastExaminationDate: string | null } | null;
  dmsDocuments: { total: number };
};

// ── Helper: load employee for audit context ───────────────────────────────────

import { getEmployeeCtxAdmin as loadEmployeeForAudit } from "./_shared/employee-context";
import { ensureDmsDocumentLinkedToEntity } from "@/server/actions/dms/entity-documents";

function revalidateEmployeePath(employeeId: number) {
  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  revalidatePath("/admin/hr/employees");
}

type ComplianceDmsLinkKind =
  | "legal_document"
  | "medical_insurance"
  | "dependent"
  | "access_card"
  | "training_certificate"
  | "medical_record";

const COMPLIANCE_DMS_LINK_NOTES: Record<ComplianceDmsLinkKind, string> = {
  legal_document: "Auto-linked from HR legal document (compliance)",
  medical_insurance: "Auto-linked from HR medical insurance (compliance)",
  dependent: "Auto-linked from HR dependent record (compliance)",
  access_card: "Auto-linked from HR access card (compliance)",
  training_certificate: "Auto-linked from HR training certificate (compliance)",
  medical_record: "Auto-linked from HR medical record (compliance)",
};

async function linkComplianceDmsDocument(
  employeeId: number,
  dmsDocumentId: number,
  kind: ComplianceDmsLinkKind
): Promise<ActionResult<{ created: boolean }>> {
  const linkResult = await ensureDmsDocumentLinkedToEntity(
    dmsDocumentId,
    "employee",
    employeeId,
    {
      link_role: "compliance",
      notes: COMPLIANCE_DMS_LINK_NOTES[kind],
    }
  );
  if (!linkResult.success) return { success: false, error: linkResult.error };
  return { success: true, data: { created: linkResult.data?.created ?? false } };
}

async function validateIdentityDocumentGeography(input: {
  issue_country_id?: number | null;
  issuing_emirate_id?: number | null;
  issue_city_id?: number | null;
}): Promise<string | null> {
  const admin = await createAdminClient();

  if (input.issue_city_id && !input.issuing_emirate_id) {
    return "Place of issue (city) requires an issuing region to be selected";
  }
  if (input.issuing_emirate_id && !input.issue_country_id) {
    return "Issuing region requires an issue country to be selected";
  }

  if (input.issuing_emirate_id && input.issue_country_id) {
    const { data: emirate } = await admin
      .from("emirates")
      .select("id, country_id")
      .eq("id", input.issuing_emirate_id)
      .maybeSingle();
    if (!emirate) return "Selected issuing region was not found";
    if (emirate.country_id !== input.issue_country_id) {
      return "Issuing region does not belong to the selected issue country";
    }
  }

  if (input.issue_city_id && input.issuing_emirate_id) {
    const { data: city } = await admin
      .from("cities")
      .select("id, emirate_id")
      .eq("id", input.issue_city_id)
      .maybeSingle();
    if (!city) return "Selected place of issue (city) was not found";
    if (city.emirate_id !== input.issuing_emirate_id) {
      return "Place of issue does not belong to the selected issuing region";
    }
  }

  return null;
}

// ── IDENTITY DOCUMENTS ────────────────────────────────────────────────────────

const identityDocumentSchema = z.object({
  document_type_id: z.number().int().positive({ message: "Document type is required" }),
  document_number: z.string().min(1, "Document number is required"),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  issuing_authority: z.string().nullish(),
  issuing_authority_party_id: z.number().int().positive().nullish(),
  issue_country_id: z.number().int().positive().nullish(),
  issuing_emirate_id: z.number().int().positive().nullish(),
  issue_city_id: z.number().int().positive().nullish(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("not_required"),
  emirates_id_application_no: z.string().nullish(),
  visa_file_number: z.string().nullish(),
  uid_number: z.string().nullish(),
  labour_card_number: z.string().nullish(),
  work_permit_number: z.string().nullish(),
  mohre_person_code: z.string().nullish(),
  profession_on_document: z.string().nullish(),
  sponsor_company_id: z.number().int().positive().nullish(),
  place_of_issue: z.string().nullish(),
  notes: z.string().nullish(),
  dms_document_id: z.number().int().positive().nullish(),
});

export async function listEmployeeIdentityDocuments(
  employeeId: number
): Promise<ActionResult<EmployeeIdentityDocumentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_identity_documents")
      .select(
        "*,document_type:hr_identity_document_types(id,name_en),issue_country:countries(id,name_en),issuing_emirate:emirates(id,name_en),issue_city:cities(id,name_en),issuing_authority_party:parties(id,display_name,party_code),sponsor_company:owner_companies!employee_identity_documents_sponsor_company_id_fkey(id,legal_name_en)"
      )
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeIdentityDocumentRow[] };
  } catch {
    return { success: false, error: "Failed to load identity documents" };
  }
}

export async function createEmployeeIdentityDocument(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = identityDocumentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const geoError = await validateIdentityDocumentGeography(parsed.data);
    if (geoError) return { success: false, error: geoError };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await ensureDmsDocumentLinkedToEntity(
        parsed.data.dms_document_id,
        "employee",
        employeeId,
        {
          link_role: "compliance",
          notes: "Auto-linked from HR legal document (compliance)",
        }
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_identity_documents")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_identity_documents",
      entity_id: data.id,
      entity_reference: parsed.data.document_number,
      action: "create",
      new_values: { document_type_id: parsed.data.document_type_id, status: parsed.data.status },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create identity document" };
  }
}

export async function updateEmployeeIdentityDocument(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = identityDocumentSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_identity_documents")
      .select("id, employee_id, document_number, issue_country_id, issuing_emirate_id, issue_city_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const mergedGeo = {
      issue_country_id: parsed.data.issue_country_id ?? existing.issue_country_id,
      issuing_emirate_id: parsed.data.issuing_emirate_id ?? existing.issuing_emirate_id,
      issue_city_id: parsed.data.issue_city_id ?? existing.issue_city_id,
    };
    const geoError = await validateIdentityDocumentGeography(mergedGeo);
    if (geoError) return { success: false, error: geoError };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await ensureDmsDocumentLinkedToEntity(
        parsed.data.dms_document_id,
        "employee",
        existing.employee_id,
        {
          link_role: "compliance",
          notes: "Auto-linked from HR legal document (compliance)",
        }
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const emp = await loadEmployeeForAudit(existing.employee_id);
    const { error } = await admin
      .from("employee_identity_documents")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_identity_documents",
      entity_id: id,
      entity_reference: existing.document_number,
      action: "update",
      new_values: parsed.data,
    });
    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update identity document" };
  }
}

export async function archiveEmployeeIdentityDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_identity_documents")
      .select("id, employee_id, document_number")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const emp = await loadEmployeeForAudit(existing.employee_id);
    const { error } = await admin
      .from("employee_identity_documents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_identity_documents",
      entity_id: id,
      entity_reference: existing.document_number,
      action: "archive",
    });
    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive identity document" };
  }
}

export async function verifyEmployeeIdentityDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_identity_documents")
      .select("id, employee_id, document_number")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_identity_documents")
      .update({ verification_status: "verified", verified_by: ctx.profile?.id, verified_at: new Date().toISOString(), updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to verify identity document" };
  }
}

export async function updateIdentityDocumentRenewalStatus(
  id: number,
  renewalStatus: "not_required" | "pending" | "in_progress" | "complete"
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_identity_documents")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_identity_documents")
      .update({ renewal_status: renewalStatus, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update renewal status" };
  }
}

// ── MEDICAL INSURANCE ─────────────────────────────────────────────────────────

const medicalInsuranceSchema = z.object({
  insurance_provider: z.string().min(1, "Insurance provider is required"),
  tpa: z.string().nullish(),
  policy_number: z.string().min(1, "Policy number is required"),
  insurance_card_number: z.string().nullish(),
  network_class: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().min(1, "Expiry date is required"),
  employee_covered: z.boolean().default(true),
  dependent_coverage_included: z.boolean().default(false),
  dependent_count_covered: z.number().int().min(0).nullish(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("pending"),
  dms_document_id: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

export async function listEmployeeMedicalInsurances(
  employeeId: number
): Promise<ActionResult<EmployeeMedicalInsuranceRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_medical_insurances")
      .select("*")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeMedicalInsuranceRow[] };
  } catch {
    return { success: false, error: "Failed to load medical insurances" };
  }
}

export async function createEmployeeMedicalInsurance(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = medicalInsuranceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        employeeId,
        parsed.data.dms_document_id,
        "medical_insurance"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_medical_insurances")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_medical_insurances",
      entity_id: data.id,
      entity_reference: parsed.data.policy_number,
      action: "create",
      new_values: { insurance_provider: parsed.data.insurance_provider, status: parsed.data.status, expiry_date: parsed.data.expiry_date },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create medical insurance" };
  }
}

export async function updateEmployeeMedicalInsurance(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = medicalInsuranceSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_insurances")
      .select("id, employee_id, policy_number")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        existing.employee_id,
        parsed.data.dms_document_id,
        "medical_insurance"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
    }

    const { error } = await admin
      .from("employee_medical_insurances")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update medical insurance" };
  }
}

export async function archiveEmployeeMedicalInsurance(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_insurances")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_medical_insurances")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive medical insurance" };
  }
}

export async function verifyEmployeeMedicalInsurance(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_insurances")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_medical_insurances")
      .update({ verification_status: "verified", updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to verify medical insurance" };
  }
}

export async function updateMedicalInsuranceRenewalStatus(
  id: number,
  renewalStatus: "not_required" | "pending" | "in_progress" | "complete"
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_insurances")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_medical_insurances")
      .update({ renewal_status: renewalStatus, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update renewal status" };
  }
}

// ── DEPENDENTS ────────────────────────────────────────────────────────────────

const dependentSchema = z.object({
  dependent_name_en: z.string().min(1, "Dependent name is required"),
  dependent_name_ar: z.string().nullish(),
  relationship_type_id: z.number().int().positive({ message: "Relationship type is required" }),
  date_of_birth: z.string().nullish(),
  nationality_id: z.number().int().positive().nullish(),
  passport_number: z.string().nullish(),
  passport_expiry: z.string().nullish(),
  emirates_id_number: z.string().nullish(),
  emirates_id_expiry: z.string().nullish(),
  residence_visa_number: z.string().nullish(),
  residence_visa_expiry: z.string().nullish(),
  medical_insurance_provider: z.string().nullish(),
  medical_insurance_policy: z.string().nullish(),
  medical_insurance_card: z.string().nullish(),
  medical_insurance_expiry: z.string().nullish(),
  sponsored_by: z.enum(["employee", "company"]).nullish(),
  is_active: z.boolean().default(true),
  dms_document_id: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

export async function listEmployeeDependents(
  employeeId: number
): Promise<ActionResult<EmployeeDependentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_dependents")
      .select("*,relationship_type:hr_relationship_types(id,name_en),nationality:countries(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("dependent_name_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeDependentRow[] };
  } catch {
    return { success: false, error: "Failed to load dependents" };
  }
}

export async function createEmployeeDependent(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = dependentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        employeeId,
        parsed.data.dms_document_id,
        "dependent"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_dependents")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_dependents",
      entity_id: data.id,
      entity_reference: parsed.data.dependent_name_en,
      action: "create",
      new_values: { relationship_type_id: parsed.data.relationship_type_id },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create dependent" };
  }
}

export async function updateEmployeeDependent(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = dependentSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_dependents")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        existing.employee_id,
        parsed.data.dms_document_id,
        "dependent"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
    }

    const { error } = await admin
      .from("employee_dependents")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update dependent" };
  }
}

export async function archiveEmployeeDependent(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_dependents")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_dependents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive dependent" };
  }
}

// ── ACCESS CARDS ──────────────────────────────────────────────────────────────

const accessCardSchema = z.object({
  access_type_id: z.number().int().positive({ message: "Access type is required" }),
  client_authority: z.string().nullish(),
  work_site_id: z.number().int().positive().nullish(),
  card_number: z.string().nullish(),
  application_reference: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  status: z.enum(["active", "expired", "cancelled", "suspended", "pending", "in_application"]).default("pending"),
  access_level: z.string().nullish(),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("not_required"),
  dms_document_id: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

export async function listEmployeeAccessCards(
  employeeId: number
): Promise<ActionResult<EmployeeAccessCardRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_access_cards")
      .select("*,access_type:hr_access_card_types(id,name_en),work_site:work_sites(id,site_name)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeAccessCardRow[] };
  } catch {
    return { success: false, error: "Failed to load access cards" };
  }
}

export async function createEmployeeAccessCard(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = accessCardSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        employeeId,
        parsed.data.dms_document_id,
        "access_card"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_access_cards")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_access_cards",
      entity_id: data.id,
      entity_reference: parsed.data.card_number ?? `access_type:${parsed.data.access_type_id}`,
      action: "create",
      new_values: { access_type_id: parsed.data.access_type_id, status: parsed.data.status },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create access card" };
  }
}

export async function updateEmployeeAccessCard(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = accessCardSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_access_cards")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        existing.employee_id,
        parsed.data.dms_document_id,
        "access_card"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
    }

    const { error } = await admin
      .from("employee_access_cards")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update access card" };
  }
}

export async function archiveEmployeeAccessCard(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_access_cards")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_access_cards")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive access card" };
  }
}

export async function updateAccessCardRenewalStatus(
  id: number,
  renewalStatus: "not_required" | "pending" | "in_progress" | "complete"
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_access_cards")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_access_cards")
      .update({ renewal_status: renewalStatus, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update renewal status" };
  }
}

// ── TRAINING CERTIFICATES ─────────────────────────────────────────────────────

const trainingCertificateSchema = z.object({
  training_category_id: z.number().int().positive().nullish(),
  training_type_id: z.number().int().positive({ message: "Training type is required" }),
  provider: z.string().nullish(),
  approval_body: z.string().nullish(),
  certificate_number: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  validity_months: z.number().int().min(0).nullish(),
  required_for_designation: z.boolean().default(false),
  required_for_site: z.boolean().default(false),
  status: z.enum(["valid", "expired", "pending", "in_progress"]).default("valid"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("not_required"),
  dms_document_id: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

export async function listEmployeeTrainingCertificates(
  employeeId: number
): Promise<ActionResult<EmployeeTrainingCertificateRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_training_certificates")
      .select("*,training_category:hr_training_categories(id,name_en),training_type:hr_training_types(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeTrainingCertificateRow[] };
  } catch {
    return { success: false, error: "Failed to load training certificates" };
  }
}

export async function createEmployeeTrainingCertificate(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = trainingCertificateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        employeeId,
        parsed.data.dms_document_id,
        "training_certificate"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_training_certificates")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_training_certificates",
      entity_id: data.id,
      entity_reference: parsed.data.certificate_number ?? `training_type:${parsed.data.training_type_id}`,
      action: "create",
      new_values: { training_type_id: parsed.data.training_type_id, status: parsed.data.status },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create training certificate" };
  }
}

export async function updateEmployeeTrainingCertificate(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = trainingCertificateSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_training_certificates")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        existing.employee_id,
        parsed.data.dms_document_id,
        "training_certificate"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
    }

    const { error } = await admin
      .from("employee_training_certificates")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update training certificate" };
  }
}

export async function archiveEmployeeTrainingCertificate(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_training_certificates")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_training_certificates")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive training certificate" };
  }
}

export async function verifyEmployeeTrainingCertificate(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_training_certificates")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_training_certificates")
      .update({ verification_status: "verified", updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to verify training certificate" };
  }
}

export async function updateTrainingCertificateRenewalStatus(
  id: number,
  renewalStatus: "not_required" | "pending" | "in_progress" | "complete"
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_training_certificates")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_training_certificates")
      .update({ renewal_status: renewalStatus, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update renewal status" };
  }
}

// ── MEDICAL RECORDS (RESTRICTED) ──────────────────────────────────────────────

const medicalRecordSchema = z.object({
  medical_record_type_id: z.number().int().positive({ message: "Medical record type is required" }),
  medical_center: z.string().nullish(),
  report_number: z.string().nullish(),
  examination_date: z.string().min(1, "Examination date is required"),
  result: z.enum(["fit", "unfit", "conditionally_fit", "under_review"]),
  fit_for_work: z.boolean().default(false),
  work_restrictions: z.boolean().default(false),
  restriction_details: z.string().nullish(),
  expiry_date: z.string().nullish(),
  required_for_visa: z.boolean().default(false),
  required_for_site: z.boolean().default(false),
  required_for_offshore: z.boolean().default(false),
  dms_document_id: z.number().int().positive().nullish(),
  confidentiality_level: z.enum(["internal", "restricted", "medical_only"]).default("restricted"),
  notes: z.string().nullish(),
});

export async function listEmployeeMedicalRecords(
  employeeId: number
): Promise<ActionResult<EmployeeMedicalRecordRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Medical records restricted" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_medical_records")
      .select("*,medical_record_type:hr_medical_record_types(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("examination_date", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeMedicalRecordRow[] };
  } catch {
    return { success: false, error: "Failed to load medical records" };
  }
}

export async function createEmployeeMedicalRecord(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number; dmsLinkCreated?: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Medical record management permission required" };
    }
    const parsed = medicalRecordSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const emp = await loadEmployeeForAudit(employeeId);
    if (!emp) return { success: false, error: "Employee not found" };

    let dmsLinkCreated = false;
    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        employeeId,
        parsed.data.dms_document_id,
        "medical_record"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
      dmsLinkCreated = linkResult.data?.created ?? false;
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("employee_medical_records")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "HR",
      entity_name: "employee_medical_records",
      entity_id: data.id,
      entity_reference: parsed.data.report_number ?? parsed.data.examination_date,
      action: "create",
      new_values: {
        medical_record_type_id: parsed.data.medical_record_type_id,
        result: parsed.data.result,
        examination_date: parsed.data.examination_date,
        confidentiality_level: parsed.data.confidentiality_level,
      },
    });
    revalidateEmployeePath(employeeId);
    return { success: true, data: { id: data.id, dmsLinkCreated } };
  } catch {
    return { success: false, error: "Failed to create medical record" };
  }
}

export async function updateEmployeeMedicalRecord(
  id: number,
  input: unknown
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Medical record management permission required" };
    }
    const parsed = medicalRecordSchema.partial().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_records")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    if (parsed.data.dms_document_id) {
      const linkResult = await linkComplianceDmsDocument(
        existing.employee_id,
        parsed.data.dms_document_id,
        "medical_record"
      );
      if (!linkResult.success) return { success: false, error: linkResult.error };
    }

    const { error } = await admin
      .from("employee_medical_records")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update medical record" };
  }
}

export async function archiveEmployeeMedicalRecord(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Medical record management permission required" };
    }
    const admin = await createAdminClient();
    const { data: existing } = await admin
      .from("employee_medical_records")
      .select("id, employee_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { success: false, error: "Record not found" };

    const { error } = await admin
      .from("employee_medical_records")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidateEmployeePath(existing.employee_id);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive medical record" };
  }
}

// ── COMPLIANCE SUMMARY ────────────────────────────────────────────────────────

export async function getEmployeeComplianceSummary(
  employeeId: number
): Promise<ActionResult<EmployeeComplianceSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const soonDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [idDocs, medIns, deps, accessCards, trainCerts, dmsLinks] = await Promise.all([
      admin.from("employee_identity_documents").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_medical_insurances").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_dependents").select("id, is_active").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_access_cards").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_training_certificates").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_document_links").select("id").eq("employee_id", employeeId).is("deleted_at", null),
    ]);

    const countSummary = (rows: Array<{ status?: string | null; expiry_date?: string | null }>) => {
      let active = 0, expiringSoon = 0, expired = 0;
      for (const r of rows) {
        if (r.status === "expired") { expired++; continue; }
        if (r.status === "active" || r.status === "valid") {
          if (r.expiry_date && r.expiry_date < today) { expired++; }
          else if (r.expiry_date && r.expiry_date <= soonDate) { expiringSoon++; active++; }
          else { active++; }
        }
      }
      return { total: rows.length, active, expiringSoon, expired };
    };

    let medicalRecords: EmployeeComplianceSummary["medicalRecords"] = null;
    if (hasPermission(ctx, "hr.medical.view")) {
      const { data: medRows } = await admin
        .from("employee_medical_records")
        .select("id, result, examination_date")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("examination_date", { ascending: false });
      const rows = medRows ?? [];
      medicalRecords = {
        total: rows.length,
        fit: rows.filter((r) => r.result === "fit").length,
        lastExaminationDate: rows[0]?.examination_date ?? null,
      };
    }

    return {
      success: true,
      data: {
        identityDocuments: countSummary(idDocs.data ?? []),
        medicalInsurances: countSummary(medIns.data ?? []),
        dependents: { total: deps.data?.length ?? 0, active: deps.data?.filter((d) => d.is_active).length ?? 0 },
        accessCards: countSummary(accessCards.data ?? []),
        trainingCertificates: {
          total: trainCerts.data?.length ?? 0,
          valid: trainCerts.data?.filter((r) => r.status === "valid").length ?? 0,
          expiringSoon: trainCerts.data?.filter((r) => r.expiry_date && r.expiry_date > today && r.expiry_date <= soonDate).length ?? 0,
          expired: trainCerts.data?.filter((r) => r.status === "expired" || (r.expiry_date && r.expiry_date < today)).length ?? 0,
        },
        medicalRecords,
        dmsDocuments: { total: dmsLinks.data?.length ?? 0 },
      },
    };
  } catch {
    return { success: false, error: "Failed to load compliance summary" };
  }
}
