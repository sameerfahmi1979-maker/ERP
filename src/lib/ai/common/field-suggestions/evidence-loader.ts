/**
 * ERP COMMON AI.1C — DMS Evidence Loader
 *
 * Loads sanitized DMS document evidence for linked entity records.
 * Evidence is sourced ONLY from documents linked via dms_document_links.
 *
 * Rules (enforced):
 * - Only linked documents (dms_document_links) — never unlinked or fuzzy-searched
 * - Confidentiality gates: hr/legal/executive excluded for non-admin users
 * - Never returns full OCR text, full content_text, or raw AI responses
 * - All text is sanitized and capped to ERP_COMMON_AI constants
 * - No OpenAI calls
 * - No suggestion generation or persistence
 * - No target record writes
 * - Do NOT log evidence text, OCR text, or content snippets
 */

import { createClient } from "@/lib/supabase/server";
import type { ErpAiEntityRegistry, ErpAiDocumentEvidenceSnippet, ErpAiEntityType } from "../types";
import {
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS,
} from "../constants";
import {
  buildContentSnippet,
  isDocumentEvidenceAllowedForUser,
  sanitizeAndCapText,
} from "./evidence-sanitizer";

// ── Input type ────────────────────────────────────────────────────────────────

export interface LoadEvidenceInput {
  entityType: ErpAiEntityType;
  entityId: number;
  /** Registry for the entity — used to filter documents by relevant document type hints. */
  registry: ErpAiEntityRegistry;
  /** User's profile ID (for security checks). */
  userProfileId: number;
  /** True if the user has dms.admin or system_admin access. */
  isAdmin?: boolean;
  /** Maximum linked documents to process (default: ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS). */
  maxDocuments?: number;
}

// ── Evidence loader result ────────────────────────────────────────────────────

export interface EvidenceLoadResult {
  snippets: ErpAiDocumentEvidenceSnippet[];
  /** Total linked documents found (before confidentiality filter). */
  totalLinked: number;
  /** Documents skipped due to restricted confidentiality. */
  skippedConfidential: number;
  /** Documents skipped because no content was available. */
  skippedNoContent: number;
}

// ── Main evidence loader ──────────────────────────────────────────────────────

/**
 * Loads sanitized DMS document evidence for an entity from linked documents.
 *
 * Evidence is loaded from:
 *   1. dms_document_links → dms_documents (metadata + AI summary)
 *   2. dms_document_content (content_text excerpt, capped)
 *   3. dms_document_files (OCR text from primary/current-version file, capped)
 *
 * Confidentiality: hr/legal/executive documents are excluded unless user is admin.
 * Text: all content capped to ERP_COMMON_AI constants — never full text.
 */
export async function loadLinkedDmsDocumentEvidence(
  input: LoadEvidenceInput
): Promise<EvidenceLoadResult> {
  const {
    entityType,
    entityId,
    isAdmin = false,
    maxDocuments = ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS,
  } = input;

  const supabase = await createClient();

  // ── 1. Load linked documents ───────────────────────────────────────────────

  const { data: linkData, error: linkError } = await supabase
    .from("dms_document_links")
    .select(`
      id,
      document_id,
      document:dms_documents(
        id,
        document_no,
        title,
        description,
        confidentiality_level,
        issue_date,
        expiry_date,
        ai_summary,
        ai_risk_level,
        ai_risk_score,
        completeness_score,
        document_type:dms_document_types(type_code, name_en, category:dms_document_categories(name_en))
      )
    `)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("linked_at", { ascending: false })
    .limit(maxDocuments * 3); // Fetch extra to account for confidentiality filtering

  if (linkError) {
    // Return empty on DB error — do not throw; caller handles gracefully
    return { snippets: [], totalLinked: 0, skippedConfidential: 0, skippedNoContent: 0 };
  }

  const links = linkData ?? [];
  const totalLinked = links.length;
  let skippedConfidential = 0;
  let skippedNoContent = 0;

  const snippets: ErpAiDocumentEvidenceSnippet[] = [];

  for (const link of links) {
    if (snippets.length >= maxDocuments) break;

    const doc = (link.document as unknown) as Record<string, unknown> | null;
    if (!doc) continue;

    const documentId = link.document_id as number;
    const confidentiality = (doc.confidentiality_level as string) ?? "internal";

    // ── 2. Confidentiality gate ────────────────────────────────────────────
    if (!isDocumentEvidenceAllowedForUser(confidentiality, isAdmin)) {
      skippedConfidential++;
      continue;
    }

    // ── 3. Extract safe metadata ───────────────────────────────────────────
    const docNo = sanitizeAndCapText(doc.document_no as string | null, 50);
    const title = sanitizeAndCapText(doc.title as string | null, 200);
    const description = sanitizeAndCapText(doc.description as string | null, 300);
    const issueDate = (doc.issue_date as string | null) ?? null;
    const expiryDate = (doc.expiry_date as string | null) ?? null;
    const riskLevel = (doc.ai_risk_level as string | null) ?? null;
    const completenessScore =
      doc.completeness_score != null ? Number(doc.completeness_score) : null;

    // Redact AI summary for restricted documents (extra safety — gate already checked)
    const rawSummary =
      !isDocumentEvidenceAllowedForUser(confidentiality, isAdmin)
        ? null
        : (doc.ai_summary as string | null);

    const docType = doc.document_type as
      | { type_code?: string; name_en?: string; category?: { name_en?: string } | null }
      | null;
    const documentTypeCode = docType?.type_code ?? null;
    const documentType = docType?.name_en ?? null;
    const categoryName = (docType?.category as { name_en?: string } | null)?.name_en ?? null;

    // ── 4. Try to load content_text excerpt (dms_document_content) ────────
    let contentText: string | null = null;
    {
      const { data: contentData } = await supabase
        .from("dms_document_content")
        .select("content_text")
        .eq("document_id", documentId)
        .single();

      if (contentData?.content_text) {
        // Cap to ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS before returning
        contentText = (contentData.content_text as string).slice(
          0,
          ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS
        );
      }
    }

    // ── 5. Try to load OCR text from primary/current-version file ─────────
    let ocrText: string | null = null;
    let ocrFileId: number | undefined;
    if (!contentText && !rawSummary) {
      // Only load OCR if no better source is available (performance optimization)
      const { data: fileData } = await supabase
        .from("dms_document_files")
        .select("id, ocr_text")
        .eq("document_id", documentId)
        .eq("is_current_version", true)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (fileData?.ocr_text) {
        ocrText = (fileData.ocr_text as string).slice(
          0,
          ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS
        );
        ocrFileId = fileData.id as number;
      }
    }

    // ── 6. Build content snippet ───────────────────────────────────────────
    const { contentSnippet, aiSummarySnippet, sourceKind } = buildContentSnippet({
      aiSummary: rawSummary,
      contentText,
      ocrText,
      title,
      description,
      maxSnippetChars: ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
      maxContentChars: ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS,
    });

    // Skip documents with no useful content at all (metadata only + no title)
    if (
      sourceKind === "metadata" &&
      contentSnippet === "[No content available]"
    ) {
      skippedNoContent++;
      continue;
    }

    snippets.push({
      documentId,
      fileId: ocrFileId,
      documentNo: docNo,
      documentTypeCode,
      documentType,
      documentTitle: title,
      categoryName,
      issueDate,
      expiryDate,
      riskLevel,
      completenessScore,
      sourceKind,
      contentSnippet,
      aiSummarySnippet,
    });
  }

  return { snippets, totalLinked, skippedConfidential, skippedNoContent };
}

// ── Preview helper (admin/debug use only) ─────────────────────────────────────

/**
 * Returns a safe metadata-only summary of what evidence would be loaded,
 * without any content snippets. Useful for admin diagnostics.
 *
 * Returns: { documentCount, documentIds, skippedConfidential }
 * Does NOT return any text content.
 */
export async function previewLinkedDmsDocumentCount(input: {
  entityType: ErpAiEntityType;
  entityId: number;
  isAdmin?: boolean;
}): Promise<{
  totalLinked: number;
  documentIds: number[];
  skippedConfidential: number;
}> {
  const { entityType, entityId, isAdmin = false } = input;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dms_document_links")
    .select(`
      document_id,
      document:dms_documents(id, confidentiality_level)
    `)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("linked_at", { ascending: false });

  if (error || !data) {
    return { totalLinked: 0, documentIds: [], skippedConfidential: 0 };
  }

  let skippedConfidential = 0;
  const documentIds: number[] = [];

  for (const link of data) {
    const doc = (link.document as unknown) as Record<string, unknown> | null;
    if (!doc) continue;

    const confidentiality = (doc.confidentiality_level as string) ?? "internal";
    if (!isDocumentEvidenceAllowedForUser(confidentiality, isAdmin)) {
      skippedConfidential++;
      continue;
    }

    documentIds.push(link.document_id as number);
  }

  return {
    totalLinked: data.length,
    documentIds,
    skippedConfidential,
  };
}
