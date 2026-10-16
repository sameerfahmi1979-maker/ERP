"use server";

/**
 * HR.14A — Document-to-Employee Server Actions
 *
 * Security:
 *   - getDmsDocumentsForEmployeeCreate: requires dms.documents.view
 *   - aggregateEmployeeDraftFromDmsDocuments: requires hr.employees.create + dms.documents.view
 *   - createEmployeeFromDmsDocuments: requires hr.employees.create + dms.documents.view + hr.compliance.manage
 *
 * AI: Does not call AI directly. Reads existing DMS extraction results.
 * Human review is mandatory — no auto-save.
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import {
  type HrDmsDocumentSelection,
} from "@/lib/hr/document-to-record/types";
import {
  classifyDmsDocument,
} from "@/lib/hr/document-to-record/document-classifier";
import { buildEmployeeDraftFromDocuments } from "@/lib/hr/document-to-record/dms-employee-draft-mapper";
import { buildComplianceSuggestions } from "@/lib/hr/document-to-record/dms-compliance-suggestion-mapper";
import { runDuplicateChecks, runIdentityDocumentDuplicateChecks, type DuplicateCheckResult, type IdentityDocCheckInput } from "@/lib/hr/document-to-record/duplicate-checks";
import { isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import {canSaveDocumentEmployee,documentEmployeeContractSchema,documentEmployeeInputSchema,documentEmployeePreparedSourcesSchema,type DocumentEmployeeReview,type DocumentEmployeeResult} from '@/lib/hr/numbered-document-employee-contract';
import {saveNumberedDocumentEmployee} from '@/server/numbered-document-employee-save';

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// getDmsDocumentsForEmployeeCreate
// Lists DMS documents available for selection in the HR.14A wizard.
// ─────────────────────────────────────────────────────────────────────────────

export type DmsDocumentForEmployeeCreate = HrDmsDocumentSelection;

export async function getDmsDocumentsForEmployeeCreate(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<DmsDocumentForEmployeeCreate[]>> {
  try {
    const ctx = await getAuthContext();
    const isAdmin = ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
    if (
      !isAdmin &&
      !hasPermission(ctx, "dms.documents.view") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied: dms.documents.view required" };
    }

    const adminClient = await createClient();

    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    let query = adminClient
      .from("dms_documents")
      .select(`
        id,
        document_no,
        title,
        status,
        expiry_date,
        issue_date,
        created_at,
        document_type:dms_document_types(name_en, code:type_code)
      `)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.search?.trim()) {
      const s = `%${params.search.trim()}%`;
      query = query.or(`document_no.ilike.${s},title.ilike.${s}`);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    // Check extraction status in bulk
    const docIds = (data ?? []).map((d: Record<string, unknown>) => d.id as number);

    const [extractionRows, ocrRows] = await Promise.all([
      docIds.length > 0
        ? adminClient
            .from("dms_ai_extraction_results")
            .select("document_id, extracted_fields_json")
            .in("document_id", docIds)
            .neq("ai_status", "superseded")
            .order("created_at", { ascending: false })
        : { data: [] as Array<{ document_id: number; extracted_fields_json: Record<string, unknown> }>, error: null },
      docIds.length > 0
        ? adminClient
            .from("dms_document_files")
            .select("document_id")
            .in("document_id", docIds)
            .not("ocr_text", "is", null)
            .is("deleted_at", null)
        : { data: [] as Array<{ document_id: number }>, error: null },
    ]);

    const extractionByDocId = new Map<number, Record<string, unknown>>();
    for (const row of (extractionRows.data ?? []) as Array<{ document_id: number; extracted_fields_json: Record<string, unknown> }>) {
      if (!extractionByDocId.has(row.document_id)) {
        extractionByDocId.set(row.document_id, row.extracted_fields_json ?? {});
      }
    }

    const ocrDocIds = new Set(
      (ocrRows.data ?? []).map((r: { document_id: number }) => r.document_id)
    );

    const rows: DmsDocumentForEmployeeCreate[] = (data ?? []).map((d: Record<string, unknown>) => {
      const typeInfo = d.document_type as { name_en?: string; code?: string } | null;
      const typeCode = typeInfo?.code ?? null;
      const title = d.title as string;
      const classification = classifyDmsDocument(typeCode, title);
      const ef = extractionByDocId.get(d.id as number);
      const extractedPersonName =
        ef
          ? (ef.full_name_en as string | null) ??
            (ef.full_name as string | null) ??
            (ef.holder_name as string | null) ??
            (ef.person_name as string | null) ??
            null
          : null;

      return {
        id: d.id as number,
        document_no: d.document_no as string,
        title,
        document_type_name: typeInfo?.name_en ?? null,
        document_type_code: typeCode,
        status: d.status as string,
        expiry_date: (d.expiry_date as string | null) ?? null,
        issue_date: (d.issue_date as string | null) ?? null,
        created_at: d.created_at as string,
        classification,
        has_extraction: extractionByDocId.has(d.id as number),
        has_ocr: ocrDocIds.has(d.id as number),
        extracted_person_name: extractedPersonName,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    logger.error("getDmsDocumentsForEmployeeCreate error", err);
    return { success: false, error: "Failed to load DMS documents" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateEmployeeDraftFromDmsDocuments
// Reads extraction results from selected documents and builds a review payload.
// ─────────────────────────────────────────────────────────────────────────────

export async function aggregateEmployeeDraftFromDmsDocuments(
  documentIds: number[]
): Promise<ActionResult<DocumentEmployeeReview>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.create") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied: hr.employees.create required" };
    }
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: dms.documents.view required" };
    }

    // Feature flag check (system_admin bypasses)
    if (!ctx.roleCodes?.includes("system_admin")) {
      const flagEnabled = await isHrAiFeatureEnabled("ERP_AI_HR_DOCUMENT_TO_EMPLOYEE");
      if (!flagEnabled) {
        return { success: false, error: "The Document-to-Employee wizard is not enabled. Enable ERP_AI_HR_DOCUMENT_TO_EMPLOYEE in AI Settings." };
      }
    }

    if (!documentIds || documentIds.length === 0) {
      return { success: false, error: "No documents selected" };
    }

    const adminClient = await createClient();
    const supabase = await createClient();

    const prepared = await supabase.rpc('prepare_document_employee_sources',{p_ids:documentIds});
    const sources = documentEmployeePreparedSourcesSchema.safeParse(prepared.data);
    if (prepared.error || !sources.success) return {success:false,error:'The selected documents could not be prepared with current source, employee, and numbering access.'};
    const docs = sources.data.map(source=>source.document);

    // Load HR identity document type map
    const { data: identityTypes, error: identityTypesError } = await adminClient
      .from("hr_identity_document_types")
      .select("id, code, name_en");
    if (identityTypesError) return {success:false,error:'Identity document types could not be loaded. Retry preparation.'};

    const hrIdentityTypeMap: Record<string, number> = {};
    for (const t of identityTypes ?? []) {
      const code = (t.code as string)?.toUpperCase();
      if (code) hrIdentityTypeMap[code] = t.id as number;
    }

    // Build doc list and load extractions
    const selectedDocs: HrDmsDocumentSelection[] = (docs ?? []).map((d: Record<string, unknown>) => {
      const typeInfo = d.document_type as { name_en?: string; type_code?: string } | null;
      const typeCode = typeInfo?.type_code ?? null;
      const title = d.title as string;
      return {
        id: d.id as number,
        document_no: d.document_no as string,
        title,
        document_type_name: typeInfo?.name_en ?? null,
        document_type_code: typeCode,
        status: d.status as string,
        expiry_date: (d.expiry_date as string | null) ?? null,
        issue_date: (d.issue_date as string | null) ?? null,
        created_at: d.created_at as string,
        classification: classifyDmsDocument(typeCode, title),
        has_extraction: false,
        has_ocr: false,
        extracted_person_name: null,
      };
    });

    // Use exactly the extraction data read alongside the retained fingerprint.
    const docsWithExtraction = selectedDocs.map((doc) => {
        const extraction = sources.data.find(source=>source.documentId===doc.id)?.extraction;
        return {
          doc: {
            ...doc,
            has_extraction: !!extraction,
          },
          extractedFields: extraction?.extracted_fields_json ?? {},
          fieldConfidence: extraction?.field_confidence_json ?? {},
        };
      });

    // Build employee draft
    const employeeDraft = buildEmployeeDraftFromDocuments(docsWithExtraction);

    // Build compliance suggestions
    const complianceSuggestions = buildComplianceSuggestions(docsWithExtraction, hrIdentityTypeMap);

    // Run duplicate checks using suggested name/dob/mobile
    const duplicates = await runDuplicateChecks(supabase, {
      mobile_number: employeeDraft.mobile_number?.userValue ?? null,
      personal_email: employeeDraft.personal_email?.userValue ?? null,
      full_name_en: employeeDraft.full_name_en?.userValue ?? null,
      date_of_birth: employeeDraft.date_of_birth?.userValue ?? null,
    });

    // Run identity document duplicate checks (passport / EID — blocking)
    const identityDocInputs: IdentityDocCheckInput[] = complianceSuggestions
      .filter(
        (s) =>
          s.kind === "identity_document" &&
          (s.classification === "PASSPORT" || s.classification === "EMIRATES_ID") &&
          typeof s.fields.document_number === "string" &&
          (s.fields.document_number as string).length > 0 &&
          s.fields.document_type_id != null
      )
      .map((s) => ({
        classification: s.classification as "PASSPORT" | "EMIRATES_ID",
        documentNumber: s.fields.document_number as string,
        documentTypeId: s.fields.document_type_id as number,
      }));

    const identityDocDuplicates =
      identityDocInputs.length > 0
        ? await runIdentityDocumentDuplicateChecks(supabase, identityDocInputs)
        : [];

    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: 0,
      entity_reference: "wizard_aggregate",
      action: "document_to_employee.aggregate",
      new_values: {
        selected_document_ids: documentIds,
        conflict_count: employeeDraft.conflicts.length,
        compliance_suggestions: complianceSuggestions.length,
        identity_doc_duplicates_found: identityDocDuplicates.length,
        user_profile_id: ctx.profile?.id ?? null,
      },
    });

    return {
      success: true,
      data: {
        selectedDocumentIds: documentIds,
        selectedDocuments: selectedDocs,
        employeeDraft,
        complianceSuggestions,
        identityDocDuplicates,
        duplicates,
        reviewedSources:sources.data.map(({documentId,fingerprint})=>({documentId,fingerprint})),
      },
    };
  } catch (err) {
    logger.error("aggregateEmployeeDraftFromDmsDocuments error", err);
    return { success: false, error: "Failed to aggregate document data" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// checkDuplicatesForEmployeeCreate
// Server-side duplicate check before final save.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDuplicatesForEmployeeCreate(input: {
  mobile_number?: string | null;
  personal_email?: string | null;
  full_name_en?: string | null;
  date_of_birth?: string | null;
}): Promise<ActionResult<DuplicateCheckResult[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.create") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const results = await runDuplicateChecks(supabase, input);

    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: 0,
      entity_reference: "wizard_duplicate_check",
      action: "document_to_employee.duplicate_check",
      new_values: {
        duplicates_found: results.length,
        user_profile_id: ctx.profile?.id ?? null,
      },
    });

    return { success: true, data: results };
  } catch (err) {
    logger.error("checkDuplicatesForEmployeeCreate error", err);
    return { success: false, error: "Failed to run duplicate check" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createEmployeeFromDmsDocuments
// Atomic save: create employee + compliance records + DMS links.
// ─────────────────────────────────────────────────────────────────────────────

export async function createEmployeeFromDmsDocuments(
  rawInput: unknown,
  rawContract: unknown,
): Promise<DocumentEmployeeResult> {
  const input = documentEmployeeInputSchema.safeParse(rawInput);
  const contract = documentEmployeeContractSchema.safeParse(rawContract);
  if (!input.success || !contract.success) return { success: false, uncertain: false, error: "Check the reviewed sources and every included employee/compliance value." };
  if (JSON.stringify([...input.data.selectedDocumentIds].sort((a,b)=>a-b)) !== JSON.stringify(contract.data.reviewedSources.map(source=>source.documentId).sort((a,b)=>a-b))) {
    return { success: false, uncertain: false, error: "The reviewed sources do not match the selected documents." };
  }
  try {
    const ctx = await getAuthContext();
    if (!canSaveDocumentEmployee(ctx,input.data.owner_company_id,input.data.branch_id ?? null,input.data.complianceRecords.map(child=>child.kind))) {
      return { success: false, uncertain: false, error: "The selected employee, compliance, document, and numbering permissions are required." };
    }
    // The caller-RLS transaction owns current feature/source checks, duplicate
    // rules, allocation/binding, all business writes, audit and immutable receipt.
    const result = await saveNumberedDocumentEmployee(input.data,contract.data);
    if (result.success) {
      try { revalidatePath("/admin/hr/employees"); } catch { /* Receipt is authoritative; refresh failure is not a failed save. */ }
    }
    return result;
  } catch {
    return { success: false, uncertain: true, error: "Save unconfirmed. Retry the retained original request." };
  }
}
