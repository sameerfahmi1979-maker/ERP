/**
 * ERP DMS AI Phase 13 — Deterministic Validation Engine
 *
 * Evaluates validation rules against a document or intake session and
 * produces DmsValidationFindingInput[] for upsert.
 *
 * Security rules:
 *   - Uses createAdminClient() for data loading only.
 *   - Caller must enforce permission + feature flag BEFORE calling this engine.
 *   - Summaries are truncated to max 200 chars — never raw OCR/content/AI text.
 *   - Max 10 findings per run to prevent flooding.
 *   - No Apply-to-ERP writes. No metadata writes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { VALIDATION_RULES } from "./validation-rules";
import { upsertDmsValidationFinding, createReviewQueueItemForValidationFinding } from "./validation-upsert";
import type {
  DmsValidationFindingInput,
  DmsValidationRunResult,
  DmsValidationOptions,
} from "./validation-types";

// ── Safe summary helper ───────────────────────────────────────────────────────

function safeSum(value: unknown, max = 200): string | null {
  if (value == null) return null;
  const str = String(value);
  if (str.length === 0) return null;
  return str.slice(0, max);
}

// ── Document data loader ──────────────────────────────────────────────────────

interface DocumentData {
  id:                number;
  document_type_id:  number | null;
  document_no:       string | null;
  title:             string | null;
  issue_date:        string | null;
  expiry_date:       string | null;
  owning_company_id: number | null;
}

interface UploadSessionData {
  id:           number;
  is_duplicate: boolean | null;
  sha256_hash:  string | null;
  document_id:  number | null;
}

interface AiResultData {
  id:                          number;
  suggested_document_type_id:  number | null;
  classification_score:        number | null;
  extracted_fields_json:       Record<string, unknown> | null;
}

interface MetadataDefinitionData {
  id:        number;
  field_code: string;
  label_en:  string;
  is_required: boolean;
}

interface MetadataValueData {
  definition_id: number;
  value_text:    string | null;
  value_number:  number | null;
  value_date:    string | null;
  value_datetime: string | null;
  value_boolean: boolean | null;
}

async function loadDocumentData(documentId: number): Promise<DocumentData | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_documents")
    .select("id, document_type_id, document_no, title, issue_date, expiry_date, owning_company_id")
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();
  if (error || !data) return null;
  return data as unknown as DocumentData;
}

async function loadUploadSessionForDocument(documentId: number): Promise<UploadSessionData | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_upload_sessions")
    .select("id, is_duplicate, sha256_hash, document_id")
    .eq("document_id", documentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as UploadSessionData;
}

async function loadLatestAiResultForDocument(documentId: number): Promise<AiResultData | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_ai_extraction_results")
    .select("id, suggested_document_type_id, classification_score, extracted_fields_json")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AiResultData;
}

async function loadRequiredMetadataDefinitions(documentTypeId: number): Promise<MetadataDefinitionData[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_metadata_definitions")
    .select("id, field_code, label_en, is_required")
    .eq("document_type_id", documentTypeId)
    .eq("is_required", true)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error || !data) return [];
  return data as unknown as MetadataDefinitionData[];
}

async function loadMetadataValues(documentId: number): Promise<MetadataValueData[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_document_metadata_values")
    .select("definition_id, value_text, value_number, value_date, value_datetime, value_boolean")
    .eq("document_id", documentId)
    .is("deleted_at", null);
  if (error || !data) return [];
  return data as unknown as MetadataValueData[];
}

// ── Rule evaluators ───────────────────────────────────────────────────────────

function evalExpiryBeforeIssueDate(doc: DocumentData): DmsValidationFindingInput | null {
  if (!doc.issue_date || !doc.expiry_date) return null;
  const issue  = new Date(doc.issue_date);
  const expiry = new Date(doc.expiry_date);
  if (isNaN(issue.getTime()) || isNaN(expiry.getTime())) return null;
  if (expiry >= issue) return null;

  const rule = VALIDATION_RULES.EXPIRY_BEFORE_ISSUE_DATE!;
  return {
    findingKey:           `${rule.ruleCode}:doc:${doc.id}`,
    documentId:           doc.id,
    findingType:          rule.findingType,
    severity:             rule.severity,
    sourceModule:         "validation_engine",
    ruleCode:             rule.ruleCode,
    ruleLabel:            rule.ruleLabel,
    ruleVersion:          rule.ruleVersion,
    aiGenerated:          false,
    currentValueSummary:  safeSum(`issue=${doc.issue_date}, expiry=${doc.expiry_date}`),
    reasonMessage:        safeSum(`Expiry date (${doc.expiry_date}) is before issue date (${doc.issue_date}).`, 500),
    evidenceJson:         { document_id: doc.id, issue_date: doc.issue_date, expiry_date: doc.expiry_date },
  };
}

function evalExpiryInPast(doc: DocumentData): DmsValidationFindingInput | null {
  if (!doc.expiry_date) return null;
  const expiry = new Date(doc.expiry_date);
  const now    = new Date();
  if (isNaN(expiry.getTime()) || expiry > now) return null;

  const rule = VALIDATION_RULES.EXPIRY_DATE_IN_PAST!;
  return {
    findingKey:          `${rule.ruleCode}:doc:${doc.id}`,
    documentId:          doc.id,
    findingType:         rule.findingType,
    severity:            rule.severity,
    sourceModule:        "validation_engine",
    ruleCode:            rule.ruleCode,
    ruleLabel:           rule.ruleLabel,
    ruleVersion:         rule.ruleVersion,
    aiGenerated:         false,
    currentValueSummary: safeSum(`expiry=${doc.expiry_date}`),
    reasonMessage:       safeSum(`Document expiry date (${doc.expiry_date}) is in the past.`, 500),
    evidenceJson:        { document_id: doc.id, expiry_date: doc.expiry_date },
  };
}

function evalIssueDateInFuture(doc: DocumentData): DmsValidationFindingInput | null {
  if (!doc.issue_date) return null;
  const issue      = new Date(doc.issue_date);
  const sevenDays  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (isNaN(issue.getTime()) || issue <= sevenDays) return null;

  const rule = VALIDATION_RULES.ISSUE_DATE_IN_FUTURE!;
  return {
    findingKey:          `${rule.ruleCode}:doc:${doc.id}`,
    documentId:          doc.id,
    findingType:         rule.findingType,
    severity:            rule.severity,
    sourceModule:        "validation_engine",
    ruleCode:            rule.ruleCode,
    ruleLabel:           rule.ruleLabel,
    ruleVersion:         rule.ruleVersion,
    aiGenerated:         false,
    currentValueSummary: safeSum(`issue=${doc.issue_date}`),
    reasonMessage:       safeSum(`Issue date (${doc.issue_date}) is more than 7 days in the future.`, 500),
    evidenceJson:        { document_id: doc.id, issue_date: doc.issue_date },
  };
}

function evalClassificationConfidenceLow(doc: DocumentData, aiResult: AiResultData | null): DmsValidationFindingInput | null {
  if (!aiResult) return null;
  const score = aiResult.classification_score;
  if (score == null || score >= 0.60) return null;

  const rule = VALIDATION_RULES.CLASSIFICATION_CONFIDENCE_LOW!;
  return {
    findingKey:          `${rule.ruleCode}:doc:${doc.id}:ai:${aiResult.id}`,
    documentId:          doc.id,
    aiResultId:          aiResult.id,
    findingType:         rule.findingType,
    severity:            rule.severity,
    sourceModule:        "validation_engine",
    ruleCode:            rule.ruleCode,
    ruleLabel:           rule.ruleLabel,
    ruleVersion:         rule.ruleVersion,
    aiGenerated:         false,
    confidence:          score,
    currentValueSummary: safeSum(`classification_score=${score.toFixed(3)}`),
    reasonMessage:       safeSum(`AI classification confidence ${(score * 100).toFixed(0)}% is below minimum threshold (60%).`, 500),
    evidenceJson:        { document_id: doc.id, ai_result_id: aiResult.id, classification_score: score },
  };
}

function evalClassificationTypeMismatch(doc: DocumentData, aiResult: AiResultData | null): DmsValidationFindingInput | null {
  if (!aiResult) return null;
  if (!aiResult.suggested_document_type_id || !doc.document_type_id) return null;
  if (aiResult.suggested_document_type_id === doc.document_type_id) return null;

  const rule = VALIDATION_RULES.CLASSIFICATION_TYPE_MISMATCH!;
  return {
    findingKey:           `${rule.ruleCode}:doc:${doc.id}:ai:${aiResult.id}`,
    documentId:           doc.id,
    aiResultId:           aiResult.id,
    findingType:          rule.findingType,
    severity:             rule.severity,
    sourceModule:         "validation_engine",
    ruleCode:             rule.ruleCode,
    ruleLabel:            rule.ruleLabel,
    ruleVersion:          rule.ruleVersion,
    aiGenerated:          false,
    confidence:           aiResult.classification_score ?? null,
    currentValueSummary:  safeSum(`saved_type_id=${doc.document_type_id}`),
    aiValueSummary:       safeSum(`ai_suggested_type_id=${aiResult.suggested_document_type_id}`),
    reasonMessage:        safeSum(`AI suggested document type (ID ${aiResult.suggested_document_type_id}) differs from saved type (ID ${doc.document_type_id}).`, 500),
    evidenceJson:         { document_id: doc.id, ai_result_id: aiResult.id, saved_type_id: doc.document_type_id, ai_suggested_type_id: aiResult.suggested_document_type_id },
  };
}

function evalOwnerCompanyMissing(doc: DocumentData): DmsValidationFindingInput | null {
  if (doc.owning_company_id != null) return null;

  const rule = VALIDATION_RULES.OWNER_COMPANY_MISSING!;
  return {
    findingKey:     `${rule.ruleCode}:doc:${doc.id}`,
    documentId:     doc.id,
    findingType:    rule.findingType,
    severity:       rule.severity,
    sourceModule:   "validation_engine",
    ruleCode:       rule.ruleCode,
    ruleLabel:      rule.ruleLabel,
    ruleVersion:    rule.ruleVersion,
    aiGenerated:    false,
    reasonMessage:  safeSum(`Document ${doc.document_no ?? doc.id} has no owner company assigned.`, 500),
    evidenceJson:   { document_id: doc.id },
  };
}

function evalDuplicateDocument(doc: DocumentData, session: UploadSessionData | null): DmsValidationFindingInput | null {
  if (!session?.is_duplicate) return null;

  const rule = VALIDATION_RULES.DUPLICATE_DOCUMENT_DETECTED!;
  return {
    findingKey:       `${rule.ruleCode}:doc:${doc.id}:sess:${session.id}`,
    documentId:       doc.id,
    uploadSessionId:  session.id,
    findingType:      rule.findingType,
    severity:         rule.severity,
    sourceModule:     "validation_engine",
    ruleCode:         rule.ruleCode,
    ruleLabel:        rule.ruleLabel,
    ruleVersion:      rule.ruleVersion,
    aiGenerated:      false,
    reasonMessage:    safeSum(`Duplicate upload detected for session ${session.id}.`, 500),
    evidenceJson:     { document_id: doc.id, upload_session_id: session.id },
  };
}

function evalRequiredFieldsMissing(
  doc: DocumentData,
  definitions: MetadataDefinitionData[],
  values: MetadataValueData[]
): DmsValidationFindingInput[] {
  if (!definitions.length) return [];

  const savedDefinitionIds = new Set(values.map(v => v.definition_id));
  const findings: DmsValidationFindingInput[] = [];
  const rule = VALIDATION_RULES.REQUIRED_FIELD_MISSING!;

  for (const def of definitions) {
    const hasValue = savedDefinitionIds.has(def.id);
    if (hasValue) {
      const val = values.find(v => v.definition_id === def.id);
      const hasNonNullValue = val && (
        val.value_text != null ||
        val.value_number != null ||
        val.value_date != null ||
        val.value_datetime != null ||
        val.value_boolean != null
      );
      if (hasNonNullValue) continue;
    }

    findings.push({
      findingKey:           `${rule.ruleCode}:doc:${doc.id}:field:${def.field_code}`,
      documentId:           doc.id,
      metadataDefinitionId: def.id,
      fieldCode:            def.field_code,
      findingType:          rule.findingType,
      severity:             rule.severity,
      sourceModule:         "validation_engine",
      ruleCode:             rule.ruleCode,
      ruleLabel:            rule.ruleLabel,
      ruleVersion:          rule.ruleVersion,
      aiGenerated:          false,
      reasonMessage:        safeSum(`Required field '${def.label_en}' (${def.field_code}) has no saved value.`, 500),
      evidenceJson:         { document_id: doc.id, definition_id: def.id, field_code: def.field_code },
    });
  }

  return findings;
}

// ── runDeterministicValidationForDocument ─────────────────────────────────────

export async function runDeterministicValidationForDocument(
  documentId: number,
  createdBy: number | null,
  options: DmsValidationOptions = {}
): Promise<DmsValidationRunResult> {
  const result: DmsValidationRunResult = {
    documentId,
    findingsCreated: 0,
    findingsSkipped: 0,
    findingIds:      [],
    queueItemIds:    [],
    errors:          [],
    rulesFired:      [],
  };

  const maxFindings    = options.maxFindings ?? 10;
  const createQueue    = options.createQueueItems !== false;

  try {
    // Load document
    const doc = await loadDocumentData(documentId);
    if (!doc) {
      result.errors.push(`Document ${documentId} not found`);
      return result;
    }

    // Load related data
    const [session, aiResult, requiredDefs, metaValues] = await Promise.all([
      loadUploadSessionForDocument(documentId),
      loadLatestAiResultForDocument(documentId),
      doc.document_type_id ? loadRequiredMetadataDefinitions(doc.document_type_id) : Promise.resolve([]),
      loadMetadataValues(documentId),
    ]);

    // Collect candidate findings from all rules
    const candidates: (DmsValidationFindingInput | null)[] = [
      evalExpiryBeforeIssueDate(doc),
      evalExpiryInPast(doc),
      evalIssueDateInFuture(doc),
      evalClassificationConfidenceLow(doc, aiResult),
      evalClassificationTypeMismatch(doc, aiResult),
      evalOwnerCompanyMissing(doc),
      evalDuplicateDocument(doc, session),
      ...evalRequiredFieldsMissing(doc, requiredDefs, metaValues),
    ];

    const allFindings = candidates.filter((f): f is DmsValidationFindingInput => f !== null);

    // Apply max findings cap
    const capped = allFindings.slice(0, maxFindings);

    // Upsert each finding
    for (const finding of capped) {
      finding.createdBy = createdBy;

      if (options.dryRun) {
        result.rulesFired.push(finding.ruleCode);
        continue;
      }

      try {
        const upsertResult = await upsertDmsValidationFinding(finding);

        if (!upsertResult.inserted) {
          result.findingsSkipped++;
          continue;
        }

        result.findingsCreated++;
        result.rulesFired.push(finding.ruleCode);

        if (upsertResult.findingId) {
          result.findingIds.push(upsertResult.findingId);

          if (createQueue) {
            try {
              const queueResult = await createReviewQueueItemForValidationFinding({
                findingId:   upsertResult.findingId,
                finding,
                documentId,
              });
              if (queueResult.itemId) result.queueItemIds.push(queueResult.itemId);
            } catch (qErr) {
              result.errors.push(`Queue item creation failed for finding ${upsertResult.findingId}: ${String(qErr).slice(0, 100)}`);
            }
          }
        }
      } catch (fErr) {
        result.errors.push(`Finding upsert failed for ${finding.ruleCode}: ${String(fErr).slice(0, 100)}`);
      }
    }

    logger.info("[validation-engine] run complete", {
      documentId,
      findingsCreated: result.findingsCreated,
      findingsSkipped: result.findingsSkipped,
    });
  } catch (err) {
    result.errors.push(`Engine error: ${String(err).slice(0, 200)}`);
    logger.warn("[validation-engine] engine error", { documentId, error: String(err).slice(0, 200) });
  }

  return result;
}

// ── runDeterministicValidationForIntakeSession ────────────────────────────────

export async function runDeterministicValidationForIntakeSession(
  uploadSessionId: number,
  createdBy: number | null,
  options: DmsValidationOptions = {}
): Promise<DmsValidationRunResult> {
  const result: DmsValidationRunResult = {
    uploadSessionId,
    findingsCreated: 0,
    findingsSkipped: 0,
    findingIds:      [],
    queueItemIds:    [],
    errors:          [],
    rulesFired:      [],
  };

  try {
    const db = createAdminClient();
    const { data: sess } = await db
      .from("dms_upload_sessions")
      .select("id, document_id")
      .eq("id", uploadSessionId)
      .maybeSingle();

    if (!sess) {
      result.errors.push(`Upload session ${uploadSessionId} not found`);
      return result;
    }

    const docId = (sess as unknown as { document_id: number | null }).document_id;
    if (!docId) {
      result.errors.push(`Upload session ${uploadSessionId} has no linked document`);
      return result;
    }

    // Delegate to document-level validation
    const docResult = await runDeterministicValidationForDocument(docId, createdBy, options);
    return { ...docResult, uploadSessionId };
  } catch (err) {
    result.errors.push(`Engine error: ${String(err).slice(0, 200)}`);
    return result;
  }
}
