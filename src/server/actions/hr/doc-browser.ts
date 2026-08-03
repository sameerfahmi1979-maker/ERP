"use server";

/**
 * HR.DOC_BROWSER.1 — HR Employee Document Browser server actions
 *
 * Powers the 3-column document browser at /admin/hr/document-browser.
 * See implementation_Review/HR/HR_DOC_BROWSER_1_EMPLOYEE_DOCUMENT_BROWSER_PLAN.md
 * and .cursor/rules/erp-document-browser-standard.mdc.
 *
 * Actions:
 *  - getHrDocBrowserEmployees:  employee + dependent navigator tree (Column 1)
 *  - getHrDocBrowserDocuments:  unified document list for an entity (Column 2)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type HrDocBrowserDependent = {
  id: number;
  name: string;
  relationship: string | null;
  /** Legacy single-document field (D1 fallback) */
  dmsDocumentId: number | null;
};

export type HrDocBrowserEmployee = {
  id: number;
  employeeCode: string;
  fullNameEn: string;
  /** Drives D3 greyed-out treatment + status filter in Column 1 */
  status: string;
  dependents: HrDocBrowserDependent[];
};

export type HrDocBrowserFile = {
  id: number;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
};

export type HrDocBrowserDocument = {
  /** dms_documents.id — null for HR identity rows without a linked DMS doc */
  id: number | null;
  documentNo: string | null;
  title: string;
  typeNameEn: string | null;
  status: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  source: "dms_link" | "hr_identity" | "dependent_link";
  files: HrDocBrowserFile[];
};

// ── Auth helper ───────────────────────────────────────────────────────────────

async function checkBrowserAccess(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  const canHr =
    hasPermission(ctx, "hr.employees.view") ||
    ctx.roleCodes?.includes("system_admin");
  const canDms =
    hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin");
  if (!canHr) return { ok: false, error: "Permission denied (HR employees view required)" };
  if (!canDms) return { ok: false, error: "Permission denied (DMS documents view required)" };
  return { ok: true };
}

// ── getHrDocBrowserEmployees ──────────────────────────────────────────────────

export async function getHrDocBrowserEmployees(): Promise<
  ActionResult<HrDocBrowserEmployee[]>
> {
  try {
    const access = await checkBrowserAccess();
    if (!access.ok) return { success: false, error: access.error };

    const admin = createAdminClient();

    const [empRes, depRes] = await Promise.all([
      admin
        .from("employees")
        .select("id, employee_code, full_name_en, employee_status")
        .is("deleted_at", null)
        .order("full_name_en", { ascending: true }),
      admin
        .from("employee_dependents")
        .select(
          "id, employee_id, dependent_name_en, dms_document_id, relationship_type:hr_relationship_types(name_en)"
        )
        .is("deleted_at", null)
        .order("dependent_name_en", { ascending: true }),
    ]);

    if (empRes.error) return { success: false, error: empRes.error.message };
    if (depRes.error) return { success: false, error: depRes.error.message };

    // Group dependents by employee
    const depsByEmployee = new Map<number, HrDocBrowserDependent[]>();
    for (const raw of depRes.data ?? []) {
      const d = raw as Record<string, unknown>;
      const rel = d.relationship_type as { name_en?: string } | { name_en?: string }[] | null;
      const relName = Array.isArray(rel) ? rel[0]?.name_en : rel?.name_en;
      const empId = d.employee_id as number;
      const node: HrDocBrowserDependent = {
        id: d.id as number,
        name: (d.dependent_name_en as string) ?? "Unnamed dependent",
        relationship: relName ?? null,
        dmsDocumentId: (d.dms_document_id as number | null) ?? null,
      };
      const list = depsByEmployee.get(empId);
      if (list) list.push(node);
      else depsByEmployee.set(empId, [node]);
    }

    const employees: HrDocBrowserEmployee[] = (empRes.data ?? []).map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: e.id as number,
        employeeCode: (e.employee_code as string) ?? "",
        fullNameEn: (e.full_name_en as string) ?? "",
        status: (e.employee_status as string) ?? "active",
        dependents: depsByEmployee.get(e.id as number) ?? [],
      };
    });

    return { success: true, data: employees };
  } catch (err) {
    logger.error("getHrDocBrowserEmployees error", err);
    return { success: false, error: "Failed to load employees" };
  }
}

// ── getHrDocBrowserDocuments ──────────────────────────────────────────────────

/** Loads full DMS document rows (+ types + files) for a set of document IDs. */
async function loadDmsDocumentsByIds(
  admin: ReturnType<typeof createAdminClient>,
  documentIds: number[],
  source: HrDocBrowserDocument["source"]
): Promise<HrDocBrowserDocument[]> {
  if (documentIds.length === 0) return [];

  const { data, error } = await admin
    .from("dms_documents")
    .select(
      `id, document_no, title, status, issue_date, expiry_date,
       document_type:dms_document_types(name_en),
       files:dms_document_files(id, file_name, mime_type, file_size_bytes, deleted_at)`
    )
    .in("id", documentIds)
    .is("deleted_at", null);

  if (error) {
    logger.error("loadDmsDocumentsByIds error", error);
    return [];
  }

  return (data ?? []).map((raw) => {
    const d = raw as Record<string, unknown>;
    const dt = d.document_type as { name_en?: string } | { name_en?: string }[] | null;
    const typeName = Array.isArray(dt) ? dt[0]?.name_en : dt?.name_en;
    const files = ((d.files as Record<string, unknown>[]) ?? [])
      .filter((f) => f.deleted_at == null)
      .map((f) => ({
        id: f.id as number,
        fileName: (f.file_name as string) ?? "file",
        mimeType: (f.mime_type as string | null) ?? null,
        fileSizeBytes: (f.file_size_bytes as number | null) ?? null,
      }));
    return {
      id: d.id as number,
      documentNo: (d.document_no as string) ?? null,
      title: (d.title as string) ?? "Untitled",
      typeNameEn: typeName ?? null,
      status: (d.status as string) ?? null,
      issueDate: (d.issue_date as string | null) ?? null,
      expiryDate: (d.expiry_date as string | null) ?? null,
      source,
      files,
    };
  });
}

export async function getHrDocBrowserDocuments(
  entityType: "employee" | "employee_dependent",
  entityId: number
): Promise<ActionResult<HrDocBrowserDocument[]>> {
  try {
    const access = await checkBrowserAccess();
    if (!access.ok) return { success: false, error: access.error };
    if (!Number.isInteger(entityId) || entityId <= 0) {
      return { success: false, error: "Invalid entity id" };
    }

    const admin = createAdminClient();
    const results: HrDocBrowserDocument[] = [];
    const seenDocIds = new Set<number>();

    // ── 1. DMS document links for this entity ───────────────────────────────
    const { data: links, error: linksError } = await admin
      .from("dms_document_links")
      .select("document_id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null);

    if (linksError) return { success: false, error: linksError.message };

    const linkedIds = [
      ...new Set((links ?? []).map((l) => (l as Record<string, unknown>).document_id as number)),
    ];
    const linkedDocs = await loadDmsDocumentsByIds(
      admin,
      linkedIds,
      entityType === "employee" ? "dms_link" : "dependent_link"
    );
    for (const doc of linkedDocs) {
      if (doc.id != null) seenDocIds.add(doc.id);
      results.push(doc);
    }

    if (entityType === "employee_dependent") {
      // ── 2. Legacy single-document field on the dependent (D1 fallback) ────
      const { data: dep } = await admin
        .from("employee_dependents")
        .select("dms_document_id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();

      const legacyDocId = (dep as Record<string, unknown> | null)?.dms_document_id as
        | number
        | null;
      if (legacyDocId && !seenDocIds.has(legacyDocId)) {
        const legacyDocs = await loadDmsDocumentsByIds(admin, [legacyDocId], "dependent_link");
        for (const doc of legacyDocs) {
          if (doc.id != null) seenDocIds.add(doc.id);
          results.push(doc);
        }
      }
    } else {
      // ── 3. HR identity documents (D2) ─────────────────────────────────────
      const { data: idDocs, error: idError } = await admin
        .from("employee_identity_documents")
        .select(
          `id, document_number, issue_date, expiry_date, status, dms_document_id,
           doc_type:hr_identity_document_types(name_en)`
        )
        .eq("employee_id", entityId)
        .is("deleted_at", null)
        .order("expiry_date", { ascending: true });

      if (idError) {
        logger.warn("getHrDocBrowserDocuments identity docs load failed", idError);
      }

      // Preload files for identity docs that reference a DMS document
      const identityDmsIds = (idDocs ?? [])
        .map((r) => (r as Record<string, unknown>).dms_document_id as number | null)
        .filter((v): v is number => v != null && !seenDocIds.has(v));
      const identityDmsDocs = await loadDmsDocumentsByIds(admin, identityDmsIds, "hr_identity");
      const dmsDocById = new Map(identityDmsDocs.map((d) => [d.id as number, d]));

      for (const raw of idDocs ?? []) {
        const r = raw as Record<string, unknown>;
        const dt = r.doc_type as { name_en?: string } | { name_en?: string }[] | null;
        const typeName = Array.isArray(dt) ? dt[0]?.name_en : dt?.name_en;
        const dmsId = r.dms_document_id as number | null;

        // Skip identity docs whose DMS document is already listed via a direct link
        if (dmsId && seenDocIds.has(dmsId)) continue;

        const dmsDoc = dmsId ? dmsDocById.get(dmsId) : undefined;
        if (dmsId) seenDocIds.add(dmsId);

        results.push({
          id: dmsDoc?.id ?? null,
          documentNo: dmsDoc?.documentNo ?? (r.document_number as string | null),
          title: dmsDoc?.title ?? `${typeName ?? "Identity Document"}${r.document_number ? ` — ${r.document_number}` : ""}`,
          typeNameEn: typeName ?? dmsDoc?.typeNameEn ?? null,
          status: (r.status as string | null) ?? dmsDoc?.status ?? null,
          issueDate: (r.issue_date as string | null) ?? dmsDoc?.issueDate ?? null,
          expiryDate: (r.expiry_date as string | null) ?? dmsDoc?.expiryDate ?? null,
          source: "hr_identity",
          files: dmsDoc?.files ?? [],
        });
      }
    }

    // Sort: expired/urgent first (expiry ascending, nulls last)
    results.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return a.title.localeCompare(b.title);
    });

    return { success: true, data: results };
  } catch (err) {
    logger.error("getHrDocBrowserDocuments error", err);
    return { success: false, error: "Failed to load documents" };
  }
}
