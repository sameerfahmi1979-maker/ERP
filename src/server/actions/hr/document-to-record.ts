"use server";

/**
 * HR.14B — Document-to-Record Server Actions
 *
 * Creates compliance child records for existing employees
 * from already-uploaded DMS documents.
 *
 * Targets:
 *   - identity_document  (employee_identity_documents)
 *   - medical_insurance  (employee_medical_insurances)
 *   - dependent          (employee_dependents)
 *
 * Security:
 *   - All actions require hr.compliance.manage + dms.documents.view
 *   - Feature flag ERP_AI_HR_DOCUMENT_TO_RECORD must be enabled (system_admin bypasses)
 *   - All reads use RLS-scoped client; writes use an ordinary scoped atomic transaction
 *   - Passport / EID duplicate numbers block identity document save
 *   - No direct AI provider calls; reads existing DMS extraction results only
 *   - Audit metadata never contains full passport/EID numbers
 *   - Human review is mandatory; no auto-save
 */

import { isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import type {DependentSaveContract} from '@/lib/hr/dependent-contract';
import type {DependentSaveResult} from '@/server/dependent-save';
import {mutateEmployeeDependent} from './dependent-mutation';
import { loadLatestDmsExtraction } from "@/lib/hr/compliance/compliance-dms-ocr";
import {
  EMPTY_DEPENDENT_PREFILL,
  mapFieldsToDependentByTypeCode,
  mergeDependentFields,
} from "@/lib/hr/compliance/dependent-dms-map";
import {
  mapDmsTypeCodeToHrIdentityCode,
  mapExtractionToIdentityForm,
  normalizeDateValue,
} from "@/lib/hr/compliance/dms-to-identity-map";
import {
  mapExtractionToMedicalInsuranceFields,
  normalizeMedicalInsuranceAiFields,
} from "@/lib/hr/compliance/medical-insurance-dms-map";
import {
  createDependentFromDmsInputSchema,
  createIdentityDocFromDmsInputSchema,
  createInsuranceFromDmsInputSchema,
  type CreateDependentFromDmsInput,
  type CreateIdentityDocFromDmsInput,
  type CreateInsuranceFromDmsInput,
  type Hr14bTargetType,
  type HrDependentDraft,
  type HrDmsDocForRecord,
  type HrIdentityDocDraft,
  type HrInsuranceDraft,
} from "@/lib/hr/document-to-record/types";
import {mutateHrChild} from "./child-mutation";
import type {ChildSaveContract,ChildSaveResult} from "@/lib/hr/child-save-contract";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature Flag Check
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if HR.14B wizard is enabled (or user is system_admin). */
export async function checkHrDocumentToRecordEnabled(): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    const ctx = await getAuthContext();
    const isAdmin = (ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin")) ?? false;
    const enabled = isAdmin || (await isHrAiFeatureEnabled("ERP_AI_HR_DOCUMENT_TO_RECORD"));
    return { success: true, data: { enabled } };
  } catch {
    return { success: true, data: { enabled: false } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Permission + Feature Flag Check
// ─────────────────────────────────────────────────────────────────────────────

async function checkHr14bAccess(): Promise<{ ctx: Awaited<ReturnType<typeof getAuthContext>>; error?: string }> {
  const ctx = await getAuthContext();
  const isAdmin = ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");

  if (
    !hasPermission(ctx, "hr.compliance.manage") &&
    !hasPermission(ctx, "hr.admin") &&
    !isAdmin
  ) {
    return { ctx, error: "Permission denied: hr.compliance.manage required" };
  }
  // system_admin / group_admin bypass DMS view check (they have full access)
  if (
    !isAdmin &&
    !hasPermission(ctx, "dms.documents.view") &&
    !hasPermission(ctx, "dms.admin")
  ) {
    return { ctx, error: "Permission denied: dms.documents.view required" };
  }
  if (!isAdmin) {
    const flagEnabled = await isHrAiFeatureEnabled("ERP_AI_HR_DOCUMENT_TO_RECORD");
    if (!flagEnabled) {
      return { ctx, error: "The Document-to-Record wizard is not enabled. Enable ERP_AI_HR_DOCUMENT_TO_RECORD in AI Settings." };
    }
  }
  return { ctx };
}

// ─────────────────────────────────────────────────────────────────────────────
// getDmsDocumentsForEmployeeRecord
// Lists DMS documents available for selection in HR.14B wizard.
// Prioritises documents already linked to the employee; falls back to recent.
// ─────────────────────────────────────────────────────────────────────────────

export async function getDmsDocumentsForEmployeeRecord(
  employeeId: number,
  params: { search?: string; limit?: number; targetType?: Hr14bTargetType }
): Promise<ActionResult<HrDmsDocForRecord[]>> {
  try {
    const { ctx, error } = await checkHr14bAccess();
    if (error) return { success: false, error };

    const adminClient = await createClient();
    const limit = params.limit ?? 60;

    // Load docs linked to this employee
    const { data: linkedDocs } = await adminClient
      .from("dms_document_links")
      .select("document_id")
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .is("deleted_at", null)
      .limit(200);

    const linkedIds = new Set((linkedDocs ?? []).map((l) => l.document_id as number));

    // Load recent active docs
    let query = adminClient
      .from("dms_documents")
      .select(
        `id, title, document_no,
        document_type:dms_document_types(code:type_code, name_en),
        issue_date, expiry_date, status,
        dms_ai_extraction_results!dms_ai_extraction_results_document_id_fkey(id),
        dms_document_files!dms_document_files_document_id_fkey(ocr_status)`
      )
      .is("deleted_at", null)
      .not("status", "eq", "archived")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit * 2, 200));

    if (params.search?.trim()) {
      query = query.ilike("title", `%${params.search.trim()}%`);
    }

    const { data: docs } = await query;

    const results: HrDmsDocForRecord[] = (docs ?? []).slice(0, limit).map((d) => {
      const docType = Array.isArray(d.document_type) ? d.document_type[0] : d.document_type;
      const hasExtraction = Array.isArray(d.dms_ai_extraction_results)
        ? d.dms_ai_extraction_results.length > 0
        : false;
      const hasOcr = Array.isArray(d.dms_document_files)
        ? d.dms_document_files.some((f: { ocr_status: string | null }) => f.ocr_status === "done")
        : false;

      return {
        id: d.id as number,
        title: (d.title as string) ?? "",
        document_no: (d.document_no as string | null) ?? null,
        document_type_code: (docType as { code?: string } | null)?.code ?? null,
        document_type_name: (docType as { name_en?: string } | null)?.name_en ?? null,
        issue_date: (d.issue_date as string | null) ?? null,
        expiry_date: (d.expiry_date as string | null) ?? null,
        status: (d.status as string) ?? "active",
        has_extraction: hasExtraction,
        has_ocr: hasOcr,
        is_linked_to_employee: linkedIds.has(d.id as number),
      };
    });

    // Sort: employee-linked first, then by extraction availability
    results.sort((a, b) => {
      if (a.is_linked_to_employee !== b.is_linked_to_employee) {
        return a.is_linked_to_employee ? -1 : 1;
      }
      if (a.has_extraction !== b.has_extraction) return a.has_extraction ? -1 : 1;
      return 0;
    });

    void ctx; // suppress unused warning
    return { success: true, data: results };
  } catch (err) {
    logger.error("getDmsDocumentsForEmployeeRecord error", err);
    return { success: false, error: "Failed to load DMS documents" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateIdentityDocumentFromDms
// Maps a single DMS document's extraction → identity doc draft.
// ─────────────────────────────────────────────────────────────────────────────

export async function aggregateIdentityDocumentFromDms(
  employeeId: number,
  documentId: number
): Promise<ActionResult<HrIdentityDocDraft>> {
  try {
    const { ctx, error } = await checkHr14bAccess();
    if (error) return { success: false, error };

    const adminClient = await createClient();
    const supabase = await createClient();

    // Verify employee exists
    const { data: emp } = await supabase
      .from("employees")
      .select("id, employee_code")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!emp) return { success: false, error: "Employee not found" };

    // Load DMS document
    const { data: doc } = await supabase
      .from("dms_documents")
      .select("id, title, document_no, issue_date, expiry_date, document_type:dms_document_types(code:type_code)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) return { success: false, error: "DMS document not found or access denied" };

    const dmsTypeCode = (Array.isArray(doc.document_type)
      ? (doc.document_type[0] as { code?: string } | undefined)?.code
      : (doc.document_type as { code?: string } | null)?.code) ?? null;

    // Load extraction
    const extraction = await loadLatestDmsExtraction(adminClient, documentId);

    // Load HR identity document types
    const { data: hrTypes } = await adminClient
      .from("hr_identity_document_types")
      .select("id, code")
      .eq("is_active", true);

    const hrIdentityTypes = (hrTypes ?? []) as { id: number; code: string }[];

    // Map extraction → identity doc draft
    const { form: mapped, fieldConfidence } = mapExtractionToIdentityForm({
      extractedFields: extraction?.extracted_fields_json ?? {},
      fieldConfidence: extraction?.field_confidence_json ?? {},
      issueDateSuggestion: extraction?.issue_date_suggestion ?? null,
      expiryDateSuggestion: extraction?.expiry_date_suggestion ?? null,
      dmsTypeCode,
      documentIssueDate: (doc.issue_date as string | null) ?? null,
      documentExpiryDate: (doc.expiry_date as string | null) ?? null,
      documentNo: (doc.document_no as string | null) ?? null,
      hrIdentityTypes,
    });

    // Resolve document_type_code
    const resolvedHrCode = mapDmsTypeCodeToHrIdentityCode(dmsTypeCode, hrIdentityTypes);
    const matchedType = hrIdentityTypes.find((t) => t.code === resolvedHrCode);

    void ctx;
    return {
      success: true,
      data: {
        documentId,
        documentTitle: (doc.title as string) ?? "",
        dms_document_type_code: dmsTypeCode,
        document_type_id: mapped.document_type_id ?? matchedType?.id ?? null,
        document_type_code: resolvedHrCode,
        document_number: mapped.document_number ?? "",
        issue_date: mapped.issue_date ?? normalizeDateValue(doc.issue_date) ?? "",
        expiry_date: mapped.expiry_date ?? normalizeDateValue(doc.expiry_date) ?? "",
        issuing_authority: "",
        issue_country_id: null,
        issuing_emirate_id: null,
        uid_number: mapped.uid_number ?? "",
        visa_file_number: mapped.visa_file_number ?? "",
        labour_card_number: mapped.labour_card_number ?? "",
        work_permit_number: mapped.work_permit_number ?? "",
        mohre_person_code: mapped.mohre_person_code ?? "",
        profession_on_document: mapped.profession_on_document ?? "",
        emirates_id_application_no: mapped.emirates_id_application_no ?? "",
        status: "active",
        notes: "",
        fieldConfidence,
      },
    };
  } catch (err) {
    logger.error("aggregateIdentityDocumentFromDms error", err);
    return { success: false, error: "Failed to build identity document draft" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createIdentityDocumentFromDms
// Saves the reviewed identity document, links DMS doc, logs audit.
// ─────────────────────────────────────────────────────────────────────────────

export async function createIdentityDocumentFromDms(input:CreateIdentityDocFromDmsInput,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const access=await checkHr14bAccess();if(access.error)return{success:false,error:access.error};
 const parsed=createIdentityDocFromDmsInputSchema.safeParse(input);if(!parsed.success)return{success:false,error:parsed.error.issues[0]?.message};
 const {employee_id,totalDocumentsSelected,...values}=parsed.data;void totalDocumentsSelected;
 return mutateHrChild({kind:'identity-document',employeeId:employee_id,id:null,revision:null,action:'create',values:{...values,entry_source:'document',source_document_ids:[values.dms_document_id]}},contract);
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateMedicalInsuranceFromDms
// Maps a single DMS document's extraction → medical insurance draft.
// ─────────────────────────────────────────────────────────────────────────────

export async function aggregateMedicalInsuranceFromDms(
  employeeId: number,
  documentId: number
): Promise<ActionResult<HrInsuranceDraft>> {
  try {
    const { ctx, error } = await checkHr14bAccess();
    if (error) return { success: false, error };

    const adminClient = await createClient();
    const supabase = await createClient();

    // Verify employee
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!emp) return { success: false, error: "Employee not found" };

    // Load DMS document
    const { data: doc } = await supabase
      .from("dms_documents")
      .select("id, title, document_no, issue_date, expiry_date")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) return { success: false, error: "DMS document not found or access denied" };

    const extraction = await loadLatestDmsExtraction(adminClient, documentId);

    const normalized = normalizeMedicalInsuranceAiFields(extraction?.extracted_fields_json ?? {});
    const mapped = mapExtractionToMedicalInsuranceFields(normalized, {
      issueDateSuggestion: extraction?.issue_date_suggestion ?? null,
      expiryDateSuggestion: extraction?.expiry_date_suggestion ?? null,
      documentNo: (doc.document_no as string | null) ?? null,
    });

    void ctx;
    return {
      success: true,
      data: {
        documentId,
        documentTitle: (doc.title as string) ?? "",
        insurance_provider: mapped.insurance_provider,
        tpa: mapped.tpa,
        policy_number: mapped.policy_number,
        insurance_card_number: mapped.insurance_card_number,
        network_class: mapped.network_class,
        issue_date: mapped.issue_date,
        expiry_date: mapped.expiry_date,
        employee_covered: mapped.employee_covered,
        dependent_coverage_included: mapped.dependent_coverage_included,
        dependent_count_covered: mapped.dependent_count_covered,
        notes: mapped.notes,
      },
    };
  } catch (err) {
    logger.error("aggregateMedicalInsuranceFromDms error", err);
    return { success: false, error: "Failed to build medical insurance draft" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createMedicalInsuranceFromDms
// Saves medical insurance record, links DMS doc, logs audit.
// ─────────────────────────────────────────────────────────────────────────────

export async function createMedicalInsuranceFromDms(input:CreateInsuranceFromDmsInput,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const access=await checkHr14bAccess();if(access.error)return{success:false,error:access.error};
 const parsed=createInsuranceFromDmsInputSchema.safeParse(input);if(!parsed.success)return{success:false,error:parsed.error.issues[0]?.message};
 const {employee_id,totalDocumentsSelected,...values}=parsed.data;void totalDocumentsSelected;
 return mutateHrChild({kind:'medical-insurance',employeeId:employee_id,id:null,revision:null,action:'create',values:{...values,entry_source:'document',source_document_ids:[values.dms_document_id]}},contract);
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateDependentFromDms
// Merges one or more DMS documents' extractions → dependent draft.
// ─────────────────────────────────────────────────────────────────────────────

export async function aggregateDependentFromDms(
  employeeId: number,
  documentIds: number[]
): Promise<ActionResult<HrDependentDraft>> {
  try {
    const { ctx, error } = await checkHr14bAccess();
    if (error) return { success: false, error };
    if (!documentIds.length) return { success: false, error: "At least one document is required" };

    const adminClient = await createClient();
    const supabase = await createClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!emp) return { success: false, error: "Employee not found" };

    // Load all selected DMS docs
    const { data: docs } = await supabase
      .from("dms_documents")
      .select("id, title, document_no, expiry_date, document_type:dms_document_types(code:type_code)")
      .in("id", documentIds)
      .is("deleted_at", null);

    if (!docs || docs.length === 0) return { success: false, error: "Selected documents not found" };

    // Merge extraction from all docs into one dependent draft
    let merged = { ...EMPTY_DEPENDENT_PREFILL };
    const docTitles: string[] = [];

    for (const doc of docs) {
      const dmsTypeCode = (Array.isArray(doc.document_type)
        ? (doc.document_type[0] as { code?: string })?.code
        : (doc.document_type as { code?: string } | null)?.code) ?? null;

      docTitles.push((doc.title as string) ?? "");

      const extraction = await loadLatestDmsExtraction(adminClient, doc.id as number);
      const fields = extraction?.extracted_fields_json ?? {};

      const fromDoc = mapFieldsToDependentByTypeCode(dmsTypeCode, fields, {
        title: (doc.title as string | null) ?? null,
        expiry_date: (doc.expiry_date as string | null) ?? null,
      });

      merged = mergeDependentFields(merged, fromDoc, { onlyEmpty: true });
    }

    void ctx;
    return {
      success: true,
      data: {
        documentIds,
        documentTitles: docTitles,
        dependent_name_en: merged.dependent_name_en,
        dependent_name_ar: merged.dependent_name_ar,
        relationship_type_id: null,
        date_of_birth: merged.date_of_birth,
        nationality_id: merged.nationality_id,
        nationality_name: merged.nationality_name,
        passport_number: merged.passport_number,
        passport_expiry: merged.passport_expiry,
        emirates_id_number: merged.emirates_id_number,
        emirates_id_expiry: merged.emirates_id_expiry,
        residence_visa_number: merged.residence_visa_number,
        residence_visa_expiry: merged.residence_visa_expiry,
        medical_insurance_provider: merged.medical_insurance_provider,
        medical_insurance_policy: merged.medical_insurance_policy,
        medical_insurance_card: merged.medical_insurance_card,
        medical_insurance_expiry: merged.medical_insurance_expiry,
        sponsored_by: merged.sponsored_by,
        notes: merged.notes,
      },
    };
  } catch (err) {
    logger.error("aggregateDependentFromDms error", err);
    return { success: false, error: "Failed to build dependent draft" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createDependentFromDms
// Saves dependent record, links DMS docs, logs audit.
// ─────────────────────────────────────────────────────────────────────────────

export async function createDependentFromDms(input:CreateDependentFromDmsInput,contract?:DependentSaveContract):Promise<DependentSaveResult>{
 const access=await checkHr14bAccess();if(access.error)return {success:false,error:access.error};
 const parsed=createDependentFromDmsInputSchema.safeParse(input);if(!parsed.success)return {success:false,error:parsed.error.issues[0]?.message};
 if(!contract||contract.revision!==null||JSON.stringify(contract.addDocumentIds)!==JSON.stringify(parsed.data.dms_document_ids)||(contract.removeDocumentIds?.length??0)>0)return {success:false,error:'Reopen the reviewed source selection before saving this dependent.'};
 const values=Object.fromEntries(Object.entries(parsed.data).filter(([key])=>!['employee_id','dms_document_ids','totalDocumentsSelected'].includes(key)));
 return mutateEmployeeDependent({employeeId:parsed.data.employee_id,id:null,kind:'save',entry:'document',revision:null,values,addDocumentIds:parsed.data.dms_document_ids,removeDocumentIds:[]},contract);
}
