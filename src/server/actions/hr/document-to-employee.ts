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
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import {
  createEmployeeFromDmsDocumentsInputSchema,
  type CreateEmployeeFromDmsDocumentsInput,
  type CreateEmployeeFromDmsDocumentsResult,
  type HrDmsDocumentSelection,
  type HrDocumentToEmployeeReviewPayload,
} from "@/lib/hr/document-to-record/types";
import {
  classifyDmsDocument,
} from "@/lib/hr/document-to-record/document-classifier";
import { buildEmployeeDraftFromDocuments } from "@/lib/hr/document-to-record/dms-employee-draft-mapper";
import { buildComplianceSuggestions } from "@/lib/hr/document-to-record/dms-compliance-suggestion-mapper";
import { runDuplicateChecks, runIdentityDocumentDuplicateChecks, type DuplicateCheckResult, type IdentityDocCheckInput } from "@/lib/hr/document-to-record/duplicate-checks";
import {
  loadLatestDmsExtraction,
} from "@/lib/hr/compliance/compliance-dms-ocr";
import { isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";

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

    const adminClient = createAdminClient();

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
): Promise<ActionResult<HrDocumentToEmployeeReviewPayload & { duplicates: DuplicateCheckResult[] }>> {
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

    const adminClient = createAdminClient();
    const supabase = await createClient();

    // Load selected documents (adminClient — permission already verified above)
    const { data: docs, error: docsError } = await adminClient
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
      .in("id", documentIds)
      .is("deleted_at", null);

    if (docsError) return { success: false, error: docsError.message };

    // Load HR identity document type map
    const { data: identityTypes } = await adminClient
      .from("hr_identity_document_types")
      .select("id, code, name_en");

    const hrIdentityTypeMap: Record<string, number> = {};
    for (const t of identityTypes ?? []) {
      const code = (t.code as string)?.toUpperCase();
      if (code) hrIdentityTypeMap[code] = t.id as number;
    }

    // Build doc list and load extractions
    const selectedDocs: HrDmsDocumentSelection[] = (docs ?? []).map((d: Record<string, unknown>) => {
      const typeInfo = d.document_type as { name_en?: string; code?: string } | null;
      const typeCode = typeInfo?.code ?? null;
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

    // Load extractions for each doc
    const docsWithExtraction = await Promise.all(
      selectedDocs.map(async (doc) => {
        const extraction = await loadLatestDmsExtraction(adminClient, doc.id);
        return {
          doc: {
            ...doc,
            has_extraction: !!extraction,
          },
          extractedFields: extraction?.extracted_fields_json ?? {},
          fieldConfidence: extraction?.field_confidence_json ?? {},
        };
      })
    );

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
  rawInput: CreateEmployeeFromDmsDocumentsInput
): Promise<ActionResult<CreateEmployeeFromDmsDocumentsResult>> {
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

    const parsed = createEmployeeFromDmsDocumentsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
      };
    }

    const input = parsed.data;
    const adminClient = createAdminClient();
    const supabase = await createClient();
    const warnings: string[] = [];

    // Server-side duplicate check (mobile / email / name+DOB)
    const duplicates = await runDuplicateChecks(supabase, {
      mobile_number: input.mobile_number,
      personal_email: input.personal_email ?? null,
      full_name_en: input.full_name_en,
      date_of_birth: input.date_of_birth,
    });

    const blockingDuplicate = duplicates.find((d) => d.severity === "block");
    if (blockingDuplicate) {
      return { success: false, error: `Duplicate employee: ${blockingDuplicate.reason}` };
    }

    for (const dup of duplicates.filter((d) => d.severity === "warn")) {
      warnings.push(dup.reason ?? "Possible duplicate found");
    }

    // Server-side identity document duplicate check (passport / EID — blocking)
    const identityRecordsToCheck = input.complianceRecords.filter(
      (r) => r.kind === "identity_document" && r.document_number
    );

    if (identityRecordsToCheck.length > 0) {
      // Load type codes for the document_type_ids in the included records
      const typeIds = identityRecordsToCheck.map((r) =>
        r.kind === "identity_document" ? r.document_type_id : 0
      );

      const { data: identityTypes } = await adminClient
        .from("hr_identity_document_types")
        .select("id, code")
        .in("id", typeIds);

      const typeCodeMap: Record<number, string> = {};
      for (const t of identityTypes ?? []) {
        typeCodeMap[t.id as number] = (t.code as string)?.toUpperCase() ?? "";
      }

      const identityDocInputs: IdentityDocCheckInput[] = identityRecordsToCheck
        .filter((r) => {
          if (r.kind !== "identity_document") return false;
          const code = typeCodeMap[r.document_type_id];
          return code === "PASSPORT" || code === "EMIRATES_ID";
        })
        .map((r) => {
          if (r.kind !== "identity_document") throw new Error("unreachable");
          return {
            classification: (typeCodeMap[r.document_type_id] as "PASSPORT" | "EMIRATES_ID"),
            documentNumber: r.document_number,
            documentTypeId: r.document_type_id,
          };
        });

      if (identityDocInputs.length > 0) {
        const identityDuplicates = await runIdentityDocumentDuplicateChecks(
          supabase,
          identityDocInputs
        );
        const blockingIdentityDup = identityDuplicates.find((d) => d.severity === "block");
        if (blockingIdentityDup) {
          return {
            success: false,
            error:
              "Employee creation blocked: duplicate identity document found. " +
              (blockingIdentityDup.reason ?? "An existing employee has the same document."),
          };
        }
      }
    }

    // Step 1: Generate employee code
    const { data: numData, error: numError } = await adminClient.rpc(
      "generate_next_reference_number",
      {
        p_rule_code: "HR_EMPLOYEE",
        p_document_type_code: null,
        p_target_table_name: "employees",
        p_target_record_id: null,
        p_generation_reason: "Employee created from DMS documents (HR.14A)",
        p_generated_by: ctx.profile?.id ?? null,
      }
    );

    if (numError || !numData || numData.length === 0) {
      logger.error("Employee code generation error", numError);
      return { success: false, error: "Failed to generate employee code" };
    }

    const employeeCode: string = numData[0].generated_reference_number;

    // Step 2: Create employee
    const { data: employee, error: insertError } = await adminClient
      .from("employees")
      .insert({
        full_name_en: input.full_name_en,
        full_name_ar: input.full_name_ar ?? null,
        gender: input.gender,
        date_of_birth: input.date_of_birth,
        nationality_id: input.nationality_id ?? null,
        mobile_number: input.mobile_number,
        personal_email: input.personal_email ?? null,
        owner_company_id: input.owner_company_id,
        branch_id: input.branch_id ?? null,
        department_id: input.department_id ?? null,
        designation_id: input.designation_id ?? null,
        employee_category_id: input.employee_category_id ?? null,
        employment_type_id: input.employment_type_id ?? null,
        joining_date: input.joining_date,
        employee_status: input.employee_status ?? "active",
        reporting_manager_id: input.reporting_manager_id ?? null,
        emergency_contact_name: input.emergency_contact_name,
        emergency_contact_mobile: input.emergency_contact_mobile,
        emergency_contact_relationship_type_id: input.emergency_contact_relationship_type_id ?? null,
        employee_code: employeeCode,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, employee_code")
      .single();

    if (insertError) {
      logger.error("createEmployee insert error (HR.14A)", insertError);
      return { success: false, error: insertError.message };
    }

    const employeeId = employee.id as number;

    // Step 3: Initial status event
    await adminClient.from("employee_status_events").insert({
      employee_id: employeeId,
      old_status: null,
      new_status: input.employee_status ?? "active",
      reason: "Employee created from DMS documents (HR.14A)",
      effective_date: input.joining_date,
      created_by: ctx.profile?.id ?? null,
    });

    // Step 4: Create compliance child records
    let complianceRecordsCreated = 0;
    for (const rec of input.complianceRecords) {
      try {
        if (rec.kind === "identity_document") {
          const { error: cidErr } = await adminClient
            .from("employee_identity_documents")
            .insert({
              employee_id: employeeId,
              document_type_id: rec.document_type_id,
              document_number: rec.document_number,
              issue_date: rec.issue_date ?? null,
              expiry_date: rec.expiry_date ?? null,
              issuing_authority: rec.issuing_authority ?? null,
              issuing_authority_party_id: rec.issuing_authority_party_id ?? null,
              issue_country_id: rec.issue_country_id ?? null,
              issuing_emirate_id: rec.issuing_emirate_id ?? null,
              status: rec.status ?? "active",
              verification_status: rec.verification_status ?? "unverified",
              renewal_status: rec.renewal_status ?? "not_required",
              emirates_id_application_no: rec.emirates_id_application_no ?? null,
              visa_file_number: rec.visa_file_number ?? null,
              uid_number: rec.uid_number ?? null,
              labour_card_number: rec.labour_card_number ?? null,
              work_permit_number: rec.work_permit_number ?? null,
              mohre_person_code: rec.mohre_person_code ?? null,
              profession_on_document: rec.profession_on_document ?? null,
              sponsor_company_id: rec.sponsor_company_id ?? null,
              place_of_issue: rec.place_of_issue ?? null,
              notes: rec.notes ?? null,
              dms_document_id: rec.dms_document_id ?? null,
              created_by: ctx.profile?.id ?? null,
              updated_by: ctx.profile?.id ?? null,
            });
          if (cidErr) {
            warnings.push(`Identity document not saved: ${cidErr.message}`);
          } else {
            complianceRecordsCreated++;
          }
        } else if (rec.kind === "medical_insurance") {
          const { error: miErr } = await adminClient
            .from("employee_medical_insurances")
            .insert({
              employee_id: employeeId,
              insurance_provider: rec.insurance_provider,
              tpa: rec.tpa ?? null,
              policy_number: rec.policy_number,
              insurance_card_number: rec.insurance_card_number ?? null,
              network_class: rec.network_class ?? null,
              issue_date: rec.issue_date ?? null,
              expiry_date: rec.expiry_date,
              employee_covered: rec.employee_covered ?? true,
              dependent_coverage_included: rec.dependent_coverage_included ?? false,
              status: rec.status ?? "active",
              verification_status: rec.verification_status ?? "unverified",
              renewal_status: rec.renewal_status ?? "pending",
              notes: rec.notes ?? null,
              dms_document_id: rec.dms_document_id ?? null,
              created_by: ctx.profile?.id ?? null,
              updated_by: ctx.profile?.id ?? null,
            });
          if (miErr) {
            warnings.push(`Medical insurance not saved: ${miErr.message}`);
          } else {
            complianceRecordsCreated++;
          }
        } else if (rec.kind === "training_certificate") {
          const { error: tcErr } = await adminClient
            .from("employee_training_certificates")
            .insert({
              employee_id: employeeId,
              training_type_id: rec.training_type_id,
              training_category_id: rec.training_category_id ?? null,
              provider: rec.provider ?? null,
              certificate_number: rec.certificate_number ?? null,
              issue_date: rec.issue_date ?? null,
              expiry_date: rec.expiry_date ?? null,
              status: rec.status ?? "valid",
              verification_status: rec.verification_status ?? "unverified",
              renewal_status: rec.renewal_status ?? "not_required",
              notes: rec.notes ?? null,
              dms_document_id: rec.dms_document_id ?? null,
              created_by: ctx.profile?.id ?? null,
              updated_by: ctx.profile?.id ?? null,
            });
          if (tcErr) {
            warnings.push(`Training certificate not saved: ${tcErr.message}`);
          } else {
            complianceRecordsCreated++;
          }
        }
      } catch (recErr) {
        logger.error("HR.14A compliance record insert error", recErr);
        warnings.push(`A compliance record could not be saved`);
      }
    }

    // Step 5: Link all selected DMS documents to employee (idempotent)
    let documentsLinked = 0;
    for (const docId of input.selectedDocumentIds) {
      try {
        const { data: existing } = await adminClient
          .from("dms_document_links")
          .select("id")
          .eq("document_id", docId)
          .eq("entity_type", "employee")
          .eq("entity_id", employeeId)
          .is("deleted_at", null)
          .maybeSingle();

        if (!existing) {
          const { error: linkErr } = await adminClient.from("dms_document_links").insert({
            document_id: docId,
            entity_type: "employee",
            entity_id: employeeId,
            is_primary: false,
            link_role: "hr14a_source",
            notes: "Linked during HR.14A Employee Creation wizard",
            linked_by: ctx.profile?.id ?? null,
          });
          if (!linkErr) {
            documentsLinked++;
            await adminClient.from("dms_document_events").insert({
              document_id: docId,
              event_type: "party_document_link_created",
              description: `Linked to employee #${employeeId} via HR.14A wizard`,
              performed_by: ctx.profile?.id ?? null,
            });
          } else {
            warnings.push(`Document ${docId} could not be linked: ${linkErr.message}`);
          }
        } else {
          documentsLinked++;
        }
      } catch (linkErr) {
        logger.error("HR.14A DMS link error", linkErr);
        warnings.push(`Document ${docId} could not be linked`);
      }
    }

    // Step 6: Audit
    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: employeeId,
      entity_reference: employeeCode,
      action: "document_to_employee.create",
      new_values: {
        employee_code: employeeCode,
        employee_name: input.full_name_en,
        selected_document_ids: input.selectedDocumentIds,
        created_child_record_counts: complianceRecordsCreated,
        documents_linked: documentsLinked,
        conflict_count: input.conflictsReviewed,
        user_profile_id: ctx.profile?.id ?? null,
        source: "HR.14A",
      },
    });

    revalidatePath("/admin/hr/employees");

    return {
      success: true,
      data: {
        employeeId,
        employeeCode: employee.employee_code as string,
        complianceRecordsCreated,
        documentsLinked,
        warnings,
      },
    };
  } catch (err) {
    logger.error("createEmployeeFromDmsDocuments error", err);
    return { success: false, error: "Failed to create employee from documents" };
  }
}
