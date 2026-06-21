/**
 * Shared OCR / extraction helpers for HR compliance DMS prefill.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const OCR_SNIPPET_MAX = 6000;

const INTERNAL_DMS_DOC_NO = /^DMS-\d{4}-/i;

export function isInternalDmsDocumentNumber(docNo: string | null | undefined): boolean {
  if (!docNo?.trim()) return false;
  return INTERNAL_DMS_DOC_NO.test(docNo.trim());
}

export async function loadDmsOcrSnippet(db: AdminClient, documentId: number): Promise<string | null> {
  const { data: files } = await db
    .from("dms_document_files")
    .select("ocr_text, ocr_status")
    .eq("document_id", documentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5);

  const parts = (files ?? [])
    .map((f) => (f.ocr_text as string | null)?.trim())
    .filter(Boolean) as string[];

  if (parts.length === 0) {
    const { data: result } = await db
      .from("dms_ai_extraction_results")
      .select("raw_ocr_text")
      .eq("document_id", documentId)
      .neq("ai_status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (result?.raw_ocr_text as string | null)?.trim();
    if (raw) parts.push(raw);
  }

  if (parts.length === 0) {
    const { data: content } = await db
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .maybeSingle();
    const text = (content?.content_text as string | null)?.trim();
    if (text) parts.push(text);
  }

  const combined = parts.join("\n\n");
  return combined ? combined.slice(0, OCR_SNIPPET_MAX) : null;
}

export type DmsExtractionRow = {
  extracted_fields_json: Record<string, unknown>;
  field_confidence_json: Record<string, unknown>;
  issue_date_suggestion: string | null;
  expiry_date_suggestion: string | null;
  raw_ocr_text: string | null;
};

export async function loadLatestDmsExtraction(
  db: AdminClient,
  documentId: number
): Promise<DmsExtractionRow | null> {
  const { data: rows } = await db
    .from("dms_ai_extraction_results")
    .select("extracted_fields_json, field_confidence_json, issue_date_suggestion, expiry_date_suggestion, raw_ocr_text")
    .eq("document_id", documentId)
    .neq("ai_status", "superseded")
    .order("created_at", { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (!row) return null;

  return {
    extracted_fields_json: (row.extracted_fields_json as Record<string, unknown>) ?? {},
    field_confidence_json: (row.field_confidence_json as Record<string, unknown>) ?? {},
    issue_date_suggestion: (row.issue_date_suggestion as string | null) ?? null,
    expiry_date_suggestion: (row.expiry_date_suggestion as string | null) ?? null,
    raw_ocr_text: (row.raw_ocr_text as string | null) ?? null,
  };
}
