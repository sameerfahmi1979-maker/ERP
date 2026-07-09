/**
 * HR.14A — Duplicate check utilities (server-side, used in server action)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateCheckResult = {
  hasDuplicate: boolean;
  severity: "block" | "warn" | "none";
  reason: string | null;
  existingEmployeeId: number | null;
  existingEmployeeCode: string | null;
  existingEmployeeName: string | null;
};

type DuplicateCheckInput = {
  mobile_number?: string | null;
  personal_email?: string | null;
  full_name_en?: string | null;
  date_of_birth?: string | null;
};

export async function runDuplicateChecks(
  db: SupabaseClient,
  input: DuplicateCheckInput
): Promise<DuplicateCheckResult[]> {
  const results: DuplicateCheckResult[] = [];

  if (input.mobile_number) {
    const { data } = await db
      .from("employees")
      .select("id, employee_code, full_name_en")
      .eq("mobile_number", input.mobile_number)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (data) {
      results.push({
        hasDuplicate: true,
        severity: "warn",
        reason: `Existing employee ${data.employee_code} — ${data.full_name_en} has the same mobile number.`,
        existingEmployeeId: data.id as number,
        existingEmployeeCode: data.employee_code as string,
        existingEmployeeName: data.full_name_en as string,
      });
    }
  }

  if (input.personal_email) {
    const { data } = await db
      .from("employees")
      .select("id, employee_code, full_name_en")
      .eq("personal_email", input.personal_email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (data) {
      results.push({
        hasDuplicate: true,
        severity: "warn",
        reason: `Existing employee ${data.employee_code} — ${data.full_name_en} has the same personal email.`,
        existingEmployeeId: data.id as number,
        existingEmployeeCode: data.employee_code as string,
        existingEmployeeName: data.full_name_en as string,
      });
    }
  }

  if (input.full_name_en && input.date_of_birth) {
    const { data } = await db
      .from("employees")
      .select("id, employee_code, full_name_en")
      .ilike("full_name_en", input.full_name_en)
      .eq("date_of_birth", input.date_of_birth)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (data) {
      results.push({
        hasDuplicate: true,
        severity: "warn",
        reason: `Existing employee ${data.employee_code} — ${data.full_name_en} has the same name and date of birth.`,
        existingEmployeeId: data.id as number,
        existingEmployeeCode: data.employee_code as string,
        existingEmployeeName: data.full_name_en as string,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity Document Duplicate Checks (HR.14A FIX)
//
// Checks passport / Emirates ID numbers against existing employee_identity_documents.
// Returns severity "block" on match — prevents employee creation.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a document number for comparison.
 * Removes hyphens, spaces, and uppercases the value.
 * Safe for both Emirates ID (784-XXXX-XXXXXXX-X) and passport (XX1234567) formats.
 */
export function normalizeDocumentNumber(num: string): string {
  return num.trim().toUpperCase().replace(/[\s\-]/g, "");
}

export type IdentityDocCheckInput = {
  /** HR classification e.g. "PASSPORT" | "EMIRATES_ID" */
  classification: "PASSPORT" | "EMIRATES_ID";
  /** Raw document number from extraction or user input */
  documentNumber: string | null;
  /** FK to hr_identity_document_types.id — used to scope the DB query */
  documentTypeId: number | null;
};

/**
 * Check passport and Emirates ID numbers against existing employee_identity_documents.
 * Returns blocking duplicates when found.
 *
 * Security:
 *   - Uses the RLS-enforced supabase client.
 *   - Reason strings do NOT include document numbers.
 *   - Called from server actions only after permission checks.
 */
export async function runIdentityDocumentDuplicateChecks(
  db: SupabaseClient,
  docs: IdentityDocCheckInput[]
): Promise<DuplicateCheckResult[]> {
  const results: DuplicateCheckResult[] = [];

  for (const doc of docs) {
    if (!doc.documentNumber || !doc.documentTypeId) continue;

    const normalizedInput = normalizeDocumentNumber(doc.documentNumber);
    if (!normalizedInput) continue;

    // Load existing identity documents of the same type
    // Using limit(500) to stay performant while covering typical org sizes.
    const { data: existingDocs } = await db
      .from("employee_identity_documents")
      .select(`
        employee_id,
        document_number,
        status,
        employee:employees(employee_code, full_name_en)
      `)
      .eq("document_type_id", doc.documentTypeId)
      .is("deleted_at", null)
      .in("status", ["active", "pending"])
      .limit(500);

    for (const row of (existingDocs ?? []) as unknown[]) {
      const existing = row as {
        employee_id: number;
        document_number: string | null;
        status: string;
        employee: { employee_code: string; full_name_en: string } | { employee_code: string; full_name_en: string }[] | null;
      };
      if (!existing.document_number) continue;

      const normalizedExisting = normalizeDocumentNumber(existing.document_number);
      if (normalizedInput !== normalizedExisting) continue;

      const typeLabel = doc.classification === "EMIRATES_ID" ? "Emirates ID" : "Passport";
      // PostgREST returns many-to-one as object; guard against array shape just in case
      const empRow = Array.isArray(existing.employee)
        ? existing.employee[0] ?? null
        : existing.employee;
      const empCode = empRow?.employee_code ?? "unknown";
      const empName = empRow?.full_name_en ?? "unknown";

      results.push({
        hasDuplicate: true,
        severity: "block",
        reason: `${typeLabel} number already linked to employee ${empCode} — ${empName}. Duplicate identity documents are not allowed.`,
        existingEmployeeId: existing.employee_id,
        existingEmployeeCode: empCode,
        existingEmployeeName: empName,
      });

      break; // One match per document type is enough
    }
  }

  return results;
}
