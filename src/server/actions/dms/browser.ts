"use server";

/**
 * DMS.BROWSER.1 — Smart Document Browser search server actions.
 *
 * Layer 1 (metadata) + Layer 2 (content FTS) are combined here.
 * Layer 3 (AI intent) is delegated to ai-search.ts → askDmsDocumentsQuestion.
 * Layer 4 (semantic) is delegated to semantic-search.ts → semanticSearchDmsDocuments.
 *
 * Hard rules:
 *  - content_text is NEVER returned to the client — only 120-char excerpts.
 *  - RLS is enforced via the user Supabase client (never admin for reads).
 *  - Confidentiality levels are respected per getDmsDocuments logic.
 *  - Archived / deleted documents are excluded unless is_archived filter is set.
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getAllowedConfidentialityLevels } from "@/lib/dms/confidentiality";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Row type returned to browser UI ───────────────────────────────────────────

export type DmsBrowserDocument = {
  id: number;
  documentNo: string;
  title: string;
  typeNameEn: string | null;
  typeCode: string | null;
  status: string;
  issueDate: string | null;
  expiryDate: string | null;
  /** "metadata" = found by title/doc_no; "content" = found inside OCR text; "both" */
  matchSource: "metadata" | "content" | "both";
  /** ~120-char excerpt from OCR text (only present when matchSource includes "content") */
  contentExcerpt: string | null;
  files: DmsBrowserFile[];
};

export type DmsBrowserFile = {
  id: number;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
};

export type DmsBrowserFilters = {
  query: string;
  /** Document type IDs to include (empty = all) */
  documentTypeIds?: number[];
  /** Status filter e.g. "active", "expired" (empty = all) */
  status?: string;
  /** Issue date from (ISO date) */
  issueDateFrom?: string;
  /** Issue date to (ISO date) */
  issueDateTo?: string;
  /** Filter by linked entity type e.g. "employee" */
  linkedEntityType?: string;
  /** Pagination offset (index of first result) */
  offset?: number;
  /** Page size */
  limit?: number;
};

const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a ~120-character excerpt around the first match of `query` in `text`.
 * Returned text has leading/trailing whitespace trimmed and is safe to render as plain text.
 * Returns null if text is empty or query not found.
 */
function extractExcerpt(text: string | null, query: string): string | null {
  if (!text || !query.trim()) return null;
  const lower = text.toLowerCase();
  const queryLower = query.trim().toLowerCase();
  // try to find the first word of the query
  const firstWord = queryLower.split(/\s+/)[0];
  const idx = lower.indexOf(firstWord);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + 80);
  let excerpt = text.slice(start, end).trim();
  if (start > 0) excerpt = "…" + excerpt;
  if (end < text.length) excerpt = excerpt + "…";
  return excerpt;
}

// ── Main browser search action ────────────────────────────────────────────────

export async function searchDmsBrowser(
  filters: DmsBrowserFilters
): Promise<ActionResult<{ rows: DmsBrowserDocument[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const profileId = ctx.profile?.id ?? null;
    const allowedLevels = getAllowedConfidentialityLevels(ctx);

    const rawQuery = (filters.query ?? "").trim();
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? PAGE_SIZE;

    // ── Content FTS (Layer 2): find document IDs via dms_document_content ─────
    let contentMatchIds: Set<number> = new Set();
    const contentExcerptMap = new Map<number, string>(); // docId → excerpt

    if (rawQuery.length >= 2) {
      // Query content table — Supabase textSearch uses PostgreSQL FTS
      const { data: contentRows } = await supabase
        .from("dms_document_content")
        .select("document_id, content_text")
        .textSearch("content_text", rawQuery, { type: "plain", config: "simple" })
        .limit(200);

      if (contentRows) {
        for (const row of contentRows) {
          const r = row as { document_id: number; content_text: string | null };
          if (!r.document_id) continue;
          contentMatchIds.add(r.document_id);
          const excerpt = extractExcerpt(r.content_text, rawQuery);
          if (excerpt) contentExcerptMap.set(r.document_id, excerpt);
        }
      }
    }

    // ── Build main document query (Layer 1 metadata + combined filters) ───────
    let q = supabase
      .from("dms_documents")
      .select(`
        id, document_no, title, status, issue_date, expiry_date, is_archived, deleted_at,
        document_type:dms_document_types(type_code, name_en),
        files:dms_document_files(id, file_name, mime_type, file_size_bytes)
      `, { count: "exact" })
      .is("deleted_at", null)
      .eq("is_archived", false)
      .not("status", "in", '("archived","superseded","deleted")');

    // Confidentiality guard
    if (!isAdmin) {
      if (profileId) {
        q = q.or(
          `confidentiality_level.in.(${allowedLevels.join(",")}),owner_user_id.eq.${profileId},created_by.eq.${profileId}`
        );
      } else {
        q = q.in("confidentiality_level", allowedLevels);
      }
    }

    // Status filter
    if (filters.status && filters.status !== "all") {
      q = q.eq("status", filters.status);
    }

    // Document type filter
    if (filters.documentTypeIds && filters.documentTypeIds.length > 0) {
      q = q.in("document_type_id", filters.documentTypeIds);
    }

    // Issue date range
    if (filters.issueDateFrom) q = q.gte("issue_date", filters.issueDateFrom);
    if (filters.issueDateTo) q = q.lte("issue_date", filters.issueDateTo);

    // Linked entity type filter
    if (filters.linkedEntityType) {
      const { data: linkedDocIds } = await supabase
        .from("dms_document_links")
        .select("document_id")
        .eq("entity_type", filters.linkedEntityType)
        .is("deleted_at", null);
      const ids = (linkedDocIds ?? []).map((r) => (r as { document_id: number }).document_id).filter(Boolean);
      if (ids.length === 0) return { success: true, data: { rows: [], total: 0 } };
      q = q.in("id", ids);
    }

    // ── Text search combining Layer 1 + Layer 2 ───────────────────────────────
    if (rawQuery.length >= 1) {
      const isDocNoPattern = /^[A-Za-z0-9]+-\d+$/.test(rawQuery) || /^\d{4,}$/.test(rawQuery);
      const allContentIds = Array.from(contentMatchIds);

      if (isDocNoPattern) {
        // Exact / prefix document number search only
        q = q.ilike("document_no", `%${rawQuery}%`);
      } else if (allContentIds.length > 0) {
        // Combine metadata ILIKE OR content FTS matches
        const metaFilter = `title.ilike.%${rawQuery}%,document_no.ilike.%${rawQuery}%`;
        q = q.or(`${metaFilter},id.in.(${allContentIds.join(",")})`);
      } else {
        // Metadata only
        q = q.or(`title.ilike.%${rawQuery}%,document_no.ilike.%${rawQuery}%`);
      }
    }

    // Ordering and pagination
    q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) return { success: false, error: error.message };

    const rows: DmsBrowserDocument[] = (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const id = r.id as number;
      const isContentMatch = contentMatchIds.has(id);
      const isMetaMatch =
        rawQuery.length === 0 ||
        (typeof r.title === "string" && r.title.toLowerCase().includes(rawQuery.toLowerCase())) ||
        (typeof r.document_no === "string" && r.document_no.toLowerCase().includes(rawQuery.toLowerCase()));

      const matchSource: DmsBrowserDocument["matchSource"] =
        isContentMatch && isMetaMatch ? "both" : isContentMatch ? "content" : "metadata";

      const dt = r.document_type as { type_code: string; name_en: string } | null;
      const files = ((r.files as unknown[]) ?? []).map((f) => {
        const fRow = f as { id: number; file_name: string; mime_type: string | null; file_size_bytes: number | null };
        return {
          id: fRow.id,
          fileName: fRow.file_name,
          mimeType: fRow.mime_type,
          fileSizeBytes: fRow.file_size_bytes,
        };
      });

      return {
        id,
        documentNo: r.document_no as string,
        title: r.title as string,
        typeNameEn: dt?.name_en ?? null,
        typeCode: dt?.type_code ?? null,
        status: r.status as string,
        issueDate: (r.issue_date as string | null) ?? null,
        expiryDate: (r.expiry_date as string | null) ?? null,
        matchSource,
        contentExcerpt: isContentMatch ? (contentExcerptMap.get(id) ?? null) : null,
        files,
      };
    });

    return { success: true, data: { rows, total: count ?? rows.length } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Search failed" };
  }
}

// ── Prefetch: document types for filter bar ───────────────────────────────────

export type DmsBrowserDocType = {
  id: number;
  typeCode: string;
  nameEn: string;
};

export async function getDmsBrowserDocumentTypes(): Promise<DmsBrowserDocType[]> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en")
      .eq("is_active", true)
      .order("name_en", { ascending: true });
    return (data ?? []).map((r) => {
      const row = r as { id: number; type_code: string; name_en: string };
      return { id: row.id, typeCode: row.type_code, nameEn: row.name_en };
    });
  } catch {
    return [];
  }
}
