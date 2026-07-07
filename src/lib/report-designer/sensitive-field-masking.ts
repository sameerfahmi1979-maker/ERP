/**
 * Report Designer — Sensitive Field Masking & Official Resolver
 * Phase: REPORT DESIGNER UX.3 — Restricted/Sensitive Field Governance
 *
 * SECURITY INVARIANTS:
 *  - preview/test modes ALWAYS receive masked values for restricted/confidential fields.
 *  - Official mode resolves real values only when all governance gates pass.
 *  - No sensitive values are logged.
 *  - DB queries are read-only SELECT operations.
 *  - Uses adminClient only — never called from client components.
 *
 * This module is server-side only — do NOT import in client components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REPORT_FIELD_REGISTRY,
  getReportFieldByPath,
  getRestrictedFieldMask,
  canFieldResolveInOutputMode,
} from "./field-registry";
import type { ReportRenderContext } from "./field-registry/governance";

// ─────────────────────────────────────────────────────────────────────────────
// Masking (preview / test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace any restricted/confidential field values in the binding map
 * with their safe masked placeholders, unless official gates pass.
 *
 * Should be called AFTER resolving all binding values, before passing
 * the map to the renderer.
 *
 * Returns:
 *  - values: the masked binding map
 *  - maskedPaths: the list of paths that were masked
 */
export function maskSensitiveBindingValues(
  values: Record<string, string>,
  context: ReportRenderContext
): { values: Record<string, string>; maskedPaths: string[] } {
  const result = { ...values };
  const maskedPaths: string[] = [];

  for (const [path, value] of Object.entries(result)) {
    if (!value) continue;

    const entry = getReportFieldByPath(path);
    if (!entry) continue;

    if (
      entry.sensitivityLevel !== "restricted" &&
      entry.sensitivityLevel !== "confidential"
    ) {
      continue;
    }

    // Check if field can resolve in this context
    if (!canFieldResolveInOutputMode(entry, context)) {
      result[path] = getRestrictedFieldMask(entry, context.outputMode);
      maskedPaths.push(path);
    }
  }

  return { values: result, maskedPaths };
}

/**
 * Apply defensive masking to ALL registered restricted/confidential paths —
 * even those not currently in the binding map — by injecting masked placeholders.
 *
 * This serves two purposes:
 *  1. Prevents accidental real-value exposure if a resolver adds a value
 *     that should be gated (overwrite with mask).
 *  2. Ensures restricted chips in test/preview render their governance mask
 *     (e.g. "[Restricted — official output only]") instead of a raw {{path}}
 *     placeholder (inject mask for paths not in the map).
 *
 * Only paths that were overwritten (had a real value) are reported in
 * maskedPaths — injected placeholders are not warnings.
 */
export function applyDefensiveRestrictedMasking(
  values: Record<string, string>,
  outputMode: ReportRenderContext["outputMode"] = "test"
): { values: Record<string, string>; maskedPaths: string[] } {
  const result = { ...values };
  const maskedPaths: string[] = [];

  if (outputMode === "official") return { values: result, maskedPaths };

  for (const entry of REPORT_FIELD_REGISTRY) {
    if (
      entry.sensitivityLevel !== "restricted" &&
      entry.sensitivityLevel !== "confidential"
    ) {
      continue;
    }

    const hadRealValue =
      entry.fieldPath in result && (result[entry.fieldPath] ?? "").length > 0;

    result[entry.fieldPath] = getRestrictedFieldMask(entry, outputMode);

    if (hadRealValue) {
      maskedPaths.push(entry.fieldPath);
    }
  }

  return { values: result, maskedPaths };
}

// ─────────────────────────────────────────────────────────────────────────────
// Official Resolver — Identity Documents
// ─────────────────────────────────────────────────────────────────────────────

interface IdentityDocumentResult {
  passport_number?: string | null;
  emirates_id_number?: string | null;
  residence_visa_number?: string | null;
  visa_expiry_date?: string | null;
}

/**
 * Resolve employee identity documents (passport, EID, visa) for official output.
 * Queries employee_identity_documents joined with hr_identity_document_types.
 * Returns null strings for not-found documents.
 *
 * SECURITY: Only called in official output mode after all governance gates pass.
 */
export async function resolveEmployeeIdentityDocuments(
  employeeId: number,
  supabase: SupabaseClient
): Promise<IdentityDocumentResult> {
  const result: IdentityDocumentResult = {
    passport_number: null,
    emirates_id_number: null,
    residence_visa_number: null,
    visa_expiry_date: null,
  };

  try {
    const { data, error } = await supabase
      .from("employee_identity_documents")
      .select(
        `
        document_number,
        expiry_date,
        document_type:hr_identity_document_types!document_type_id (
          code
        )
        `
      )
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false });

    if (error || !data) return result;

    type DocRow = {
      document_number: string | null;
      expiry_date: string | null;
      document_type: { code: string } | null;
    };

    for (const row of (data as unknown as DocRow[])) {
      const code = row.document_type?.code ?? "";
      const docNum = (row.document_number ?? "").trim();
      const expiry = row.expiry_date ?? null;

      if (code === "EMP_PASSPORT" && !result.passport_number && docNum) {
        result.passport_number = docNum;
      } else if (code === "EMP_EMIRATES_ID" && !result.emirates_id_number && docNum) {
        result.emirates_id_number = docNum;
      } else if (code === "EMP_UAE_VISA" && !result.residence_visa_number && docNum) {
        result.residence_visa_number = docNum;
        if (expiry && !result.visa_expiry_date) {
          result.visa_expiry_date = formatDateForDisplay(expiry);
        }
      }
    }
  } catch {
    // Fail silently — return empty values rather than exposing partial data
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Official Resolver — WPS / Banking
// ─────────────────────────────────────────────────────────────────────────────

interface WpsProfileResult {
  iban?: string | null;
  bank_account_number?: string | null;
}

/**
 * Resolve employee WPS banking details for official output.
 * Queries employee_wps_profiles.
 *
 * SECURITY: Only called in official output mode after all governance gates pass.
 */
export async function resolveEmployeeWpsProfile(
  employeeId: number,
  supabase: SupabaseClient
): Promise<WpsProfileResult> {
  const result: WpsProfileResult = {
    iban: null,
    bank_account_number: null,
  };

  try {
    const { data, error } = await supabase
      .from("employee_wps_profiles")
      .select("iban, account_number")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error || !data) return result;

    const row = data as unknown as { iban: string | null; account_number: string | null };
    result.iban = row.iban?.trim() ?? null;
    result.bank_account_number = row.account_number?.trim() ?? null;
  } catch {
    // Fail silently
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Official Resolver — Salary (stub — full calculation requires payroll engine)
// ─────────────────────────────────────────────────────────────────────────────

interface SalaryResult {
  basic_salary?: string | null;
  total_salary?: string | null;
  net_salary?: string | null;
  last_salary?: string | null;
}

/**
 * Resolve employee salary fields for official output.
 *
 * Queries employee_salary_components JOIN hr_salary_component_types:
 *  - basic_salary  = sum of components where is_basic = true
 *  - total_salary  = sum of all earning components
 *  - net_salary    = earnings − deductions
 *  - last_salary   = alias for total_salary (used in experience letters)
 *
 * SECURITY: Only called in official output mode after all governance gates pass.
 */
export async function resolveEmployeeSalaryFields(
  employeeId: number,
  supabase: SupabaseClient
): Promise<SalaryResult> {
  const result: SalaryResult = {
    basic_salary: null,
    total_salary: null,
    net_salary: null,
    last_salary: null,
  };

  try {
    const { data, error } = await supabase
      .from("employee_salary_components")
      .select(
        `
        amount,
        is_active,
        component_type:hr_salary_component_types!component_type_id (
          component_kind,
          is_basic
        )
        `
      )
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (error || !data) return result;

    type SalaryRow = {
      amount: string | number | null;
      is_active: boolean;
      component_type: { component_kind: string; is_basic: boolean } | null;
    };

    let basicTotal = 0;
    let earningsTotal = 0;
    let deductionsTotal = 0;

    for (const row of (data as unknown as SalaryRow[])) {
      const amt = parseFloat(String(row.amount ?? "0"));
      if (isNaN(amt)) continue;
      const kind = row.component_type?.component_kind ?? "earning";
      const isBasic = row.component_type?.is_basic ?? false;

      if (kind === "earning") {
        earningsTotal += amt;
        if (isBasic) basicTotal += amt;
      } else if (kind === "deduction") {
        deductionsTotal += amt;
      }
    }

    const netTotal = earningsTotal - deductionsTotal;
    const fmt = (n: number) =>
      `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    result.basic_salary = basicTotal > 0 ? fmt(basicTotal) : null;
    result.total_salary = earningsTotal > 0 ? fmt(earningsTotal) : null;
    result.net_salary = earningsTotal > 0 ? fmt(netTotal) : null;
    result.last_salary = earningsTotal > 0 ? fmt(earningsTotal) : null;
  } catch {
    // Fail silently — return empty values rather than exposing partial data
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined official resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve all sensitive (restricted/confidential) field values for a given employee
 * in official output mode. Only resolves values for fields that:
 *   1. Are present in requestedPaths
 *   2. Pass the governance gates in the provided context
 *
 * Returns a partial binding map with only the requested sensitive paths.
 * Never returns all sensitive fields — only the ones actually in the template.
 *
 * SCOPE H: Writes a safe audit log entry (without sensitive values) when fields are resolved.
 */
export async function resolveOfficialSensitiveFields(opts: {
  employeeId: number;
  requestedPaths: string[];
  context: ReportRenderContext;
  supabase: SupabaseClient;
  /** UX.3 Scope H: Audit metadata — templateId, templateCode, issuedBy user profile id */
  auditMeta?: {
    templateId?: number;
    templateCode?: string;
    issuedByProfileId?: string | null;
  };
}): Promise<{
  values: Record<string, string>;
  resolvedPaths: string[];
  warnings: string[];
}> {
  const { employeeId, requestedPaths, context, supabase, auditMeta } = opts;
  const values: Record<string, string> = {};
  const resolvedPaths: string[] = [];
  const warnings: string[] = [];

  if (context.outputMode !== "official") {
    warnings.push("resolveOfficialSensitiveFields called outside official mode — no values resolved.");
    return { values, resolvedPaths, warnings };
  }

  const needsIdentityDocs = requestedPaths.some((p) =>
    ["employee.passport_number", "employee.emirates_id_number", "employee.residence_visa_number", "employee.visa_expiry_date"].includes(p)
  );
  const needsWps = requestedPaths.some((p) =>
    ["employee.iban", "employee.bank_account_number"].includes(p)
  );
  const needsSalary = requestedPaths.some((p) =>
    ["employee.basic_salary", "employee.total_salary", "employee.net_salary", "employee.last_salary"].includes(p)
  );

  // Resolve identity docs
  if (needsIdentityDocs) {
    const docs = await resolveEmployeeIdentityDocuments(employeeId, supabase);
    const idMap: Record<string, string | null | undefined> = {
      "employee.passport_number": docs.passport_number,
      "employee.emirates_id_number": docs.emirates_id_number,
      "employee.residence_visa_number": docs.residence_visa_number,
      "employee.visa_expiry_date": docs.visa_expiry_date,
    };
    for (const path of requestedPaths) {
      if (path in idMap) {
        const entry = getReportFieldByPath(path);
        if (entry && canFieldResolveInOutputMode(entry, context)) {
          const val = idMap[path];
          values[path] = val ?? "";
          if (val) resolvedPaths.push(path);
        }
      }
    }
  }

  // Resolve WPS / banking
  if (needsWps) {
    const wps = await resolveEmployeeWpsProfile(employeeId, supabase);
    const wpsMap: Record<string, string | null | undefined> = {
      "employee.iban": wps.iban,
      "employee.bank_account_number": wps.bank_account_number,
    };
    for (const path of requestedPaths) {
      if (path in wpsMap) {
        const entry = getReportFieldByPath(path);
        if (entry && canFieldResolveInOutputMode(entry, context)) {
          const val = wpsMap[path];
          values[path] = val ?? "";
          if (val) resolvedPaths.push(path);
        }
      }
    }
  }

  // Resolve salary
  if (needsSalary) {
    const salary = await resolveEmployeeSalaryFields(employeeId, supabase);
    const salaryMap: Record<string, string | null | undefined> = {
      "employee.basic_salary": salary.basic_salary,
      "employee.total_salary": salary.total_salary,
      "employee.net_salary": salary.net_salary,
      "employee.last_salary": salary.last_salary,
    };
    for (const path of requestedPaths) {
      if (path in salaryMap) {
        const entry = getReportFieldByPath(path);
        if (entry && canFieldResolveInOutputMode(entry, context)) {
          const val = salaryMap[path];
          values[path] = val ?? "";
          if (val) resolvedPaths.push(path);
        }
      }
    }
  }

  // SCOPE H: Audit log — safe metadata only, NO sensitive values
  if (resolvedPaths.length > 0) {
    try {
      await writeSensitiveFieldAuditLog({
        resolvedPaths,
        employeeId,
        templateId: auditMeta?.templateId,
        templateCode: auditMeta?.templateCode,
        issuedByProfileId: auditMeta?.issuedByProfileId,
        outputMode: context.outputMode,
        templateType: context.templateType,
        userPermissions: context.userPermissions,
        supabase,
      });
    } catch {
      // Audit failure must never break document generation
      warnings.push("Audit log write failed (non-blocking).");
    }
  }

  return { values, resolvedPaths, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope H: Safe audit log writer (no sensitive values)
// ─────────────────────────────────────────────────────────────────────────────

interface SensitiveFieldAuditLogOpts {
  resolvedPaths: string[];
  employeeId: number;
  templateId?: number;
  templateCode?: string;
  issuedByProfileId?: string | null;
  outputMode: string;
  templateType: string;
  userPermissions: string[];
  supabase: SupabaseClient;
}

/**
 * Write a safe audit log entry when sensitive fields are resolved in official output.
 * NEVER logs the actual field values — only metadata (paths, template, employee id, user).
 */
async function writeSensitiveFieldAuditLog(opts: SensitiveFieldAuditLogOpts): Promise<void> {
  const {
    resolvedPaths,
    employeeId,
    templateId,
    templateCode,
    issuedByProfileId,
    outputMode,
    templateType,
    userPermissions,
    supabase,
  } = opts;

  const auditEntry = {
    module_code: "REPORTS",
    entity_name: "sensitive_field_resolution",
    entity_id: templateId ?? 0,
    entity_reference: templateCode ?? "unknown",
    action: "official_sensitive_field_resolution",
    new_values: {
      // Safe metadata only — no field values
      resolved_field_count: resolvedPaths.length,
      resolved_field_paths: resolvedPaths,
      employee_id: employeeId,
      output_mode: outputMode,
      template_type: templateType,
      permissions_active: userPermissions.filter((p) =>
        p.startsWith("reports.sensitive_fields")
      ),
      issued_at: new Date().toISOString(),
    },
    performed_by: issuedByProfileId ?? null,
  };

  // Use the Supabase client to insert directly — this module is server-side only
  // and cannot import the server action (which is "use server" + has cookie dependency).
  await supabase.from("audit_logs").insert({
    module_code: auditEntry.module_code,
    entity_name: auditEntry.entity_name,
    entity_id: auditEntry.entity_id,
    entity_reference: auditEntry.entity_reference,
    action: auditEntry.action,
    new_values: auditEntry.new_values,
    performed_by: auditEntry.performed_by,
    created_at: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateForDisplay(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}
