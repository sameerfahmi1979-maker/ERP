"use server";
import {discardRetainedIntake} from '@/server/dms-intake-discard';
import {recoverNumberedAiApproval} from '@/server/dms-ai-approval-recovery';
import {verifyAndAttestIntakeSource} from '@/server/dms-intake-source-attestation';

/**
 * DMS.11 — Option A AI-First Upload-Session Intake Server Actions
 *
 * Flow: Upload → AI Fill → User Reviews → Approve & Save → Final DMS Document
 *
 * Key rules:
 * - AI results are NEVER auto-saved to dms_documents or metadata.
 * - Final document is ONLY created on approveAiIntakeAndCreateDocument().
 * - OCR text and AI prompts are NEVER logged.
 */

import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";
import { buildClassificationCandidates, loadClassificationCandidateData } from "@/lib/dms/ai/classification-candidate-builder";
import { buildSanitizedClassificationPayload } from "@/lib/dms/ai/classification-output";
import { resolveSuggestedDocumentType } from "@/lib/dms/ai/classification-resolver";
import { getAzureDocumentIntelligenceProvider, getDmsAiProvider } from "@/lib/dms/ai/factory";
import { loadMetadataFieldsForDocumentType } from "@/lib/dms/ai/load-metadata-fields";
import { hashOcrText, PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import type {
  DmsAiDocumentTypeCandidate,
  DmsAiImageFile,
  DmsAiMetadataField,
  DmsAiOutput,
  DmsDetectedEntity,
  DmsSuggestedLink,
} from "@/lib/dms/ai/types";
import { approveNumberedAiIntake } from "@/server/numbered-ai-approval";
import type { AiApprovalInput, AiApprovalResult } from "@/lib/dms/numbered-ai-approval";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { AzureOcrProvider } from "@/lib/dms/ocr/azure-ocr-provider";
import { loadOcrFeatureFlags, routeOcr } from "@/lib/dms/ocr/ocr-router";
import { isDmsAiReviewEnabled, upsertDmsReviewQueueItem } from "@/lib/dms/review-queue/review-queue-upsert";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/actions/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {batchDraftUuidSchema,batchDraftPrepareEnvelopeSchema} from "@/lib/dms/numbered-batch-draft";

export async function recoverAiIntakeApproval(sessionId:number){return recoverNumberedAiApproval(sessionId);}

// ── Entity → party database matching ──────────────────────────────────────────

/**
 * Searches the parties table for records whose names match the AI-detected
 * entities. Returns suggested links the user can confirm during review.
 */
async function matchEntitiesToParties(
  supabase: SupabaseClient,
  entities: DmsDetectedEntity[]
): Promise<DmsSuggestedLink[]> {
  if (!entities || entities.length === 0) return [];

  const links: DmsSuggestedLink[] = [];
  const seenPartyIds = new Set<number>();

  for (const entity of entities.slice(0, 10)) {
    const name = entity.name?.trim();
    if (!name || name.length < 3) continue;

    try {
      // Case-insensitive partial match across the party name columns
      const pattern = `%${name.replace(/[%_]/g, "")}%`;
      const { data } = await supabase
        .from("parties")
        .select("id, party_no, display_name, legal_name_en, trade_name_en")
        .or(
          `display_name.ilike.${pattern},legal_name_en.ilike.${pattern},trade_name_en.ilike.${pattern}`
        )
        .limit(3);

      for (const p of (data ?? []) as Record<string, unknown>[]) {
        const pid = p.id as number;
        if (seenPartyIds.has(pid)) continue;
        seenPartyIds.add(pid);

        const partyName =
          (p.display_name as string) ||
          (p.legal_name_en as string) ||
          (p.trade_name_en as string) ||
          `Party #${pid}`;

        // Confidence: exact (case-insensitive) name match scores higher
        const exact = partyName.trim().toLowerCase() === name.toLowerCase();

        links.push({
          entityType: "party",
          entityId: pid,
          entityName: partyName,
          confidenceScore: exact ? 0.9 : 0.6,
          reason: `Matched ${entity.entityType || "entity"} "${name}"${entity.role ? ` (${entity.role})` : ""} from the document to party ${p.party_no ?? pid}`,
        });
      }
    } catch (err) {
      logger.warn("[ai-intake] party match failed for entity", { name, err: String(err) });
    }
  }

  return links.slice(0, 8);
}

// ── Permission helpers ────────────────────────────────────────────────────────

function canStartIntake(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    (hasPermission(ctx, "dms.documents.upload") && hasPermission(ctx,"dms.documents.review_ai") && hasPermission(ctx,"dms.documents.preview")) ||
    hasPermission(ctx, "dms.admin")
  );
}

function canViewIntake(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin")
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type IntakeAiResultRow = {
  id: number;
  upload_session_id: number | null;
  document_id: number | null;
  job_id: number;
  ai_status: string;
  suggested_document_type_id: number | null;
  classification_confidence: string | null;
  classification_score: number | null;
  classification_reason: string | null;
  extracted_fields_json: Record<string, unknown> | null;
  field_confidence_json: Record<string, unknown> | null;
  suggested_links_json: unknown[] | null;
  issue_date_suggestion: string | null;
  expiry_date_suggestion: string | null;
  suggested_title: string | null;
  suggested_description: string | null;
  review_action: string | null;
  raw_response_json: Record<string, unknown> | null;
  created_at: string;
  suggested_type?: { type_code: string; name_en: string } | null;
};

export type IntakeSessionData = {
  id: number;
  session_code: string;
  status: string;
  intake_status: string;
  review_status: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  temp_storage_path: string | null;
  is_duplicate: boolean;
  duplicate_document_id: number | null;
  ai_result_id: number | null;
  document_id: number | null;
  owning_company_id?: number | null;
  owning_branch_id?: number | null;
  reviewed_by: number | null;
  discarded_at: string | null;
  discard_reason: string | null;
  uploaded_at: string;
  ai_result?: IntakeAiResultRow | null;
  draft_values?: IntakeReviewValueRow[] | null;
};

export type IntakeReviewValueRow = {
  id: number;
  upload_session_id: number;
  field_scope: string;
  field_code: string;
  field_label: string | null;
  field_type: string | null;
  suggested_value_json: unknown;
  reviewed_value_json: unknown;
  confidence_score: number | null;
  confidence_label: string | null;
  source_snippet: string | null;
  review_status: string;
};

// Existing callers retain their business payload shape; the dedicated adapter
// validates it before any I/O and requires a separate operation contract.
export type ApproveIntakeInput = Omit<AiApprovalInput, "confidentialityLevel" | "metadataValues" | "links"> & {
  confidentialityLevel?: string;
  metadataValues?: {definitionId:number;fieldType:string;rawValue:string}[];
  links?: {entityType:string;entityId:number;linkRole?:string;isPrimary?:boolean}[];
};

// ── Validation schemas ────────────────────────────────────────────────────────

const StartIntakeSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  allowDuplicate: z.boolean().optional().default(false),
});



// ── startAiIntakeFromUploadSession ───────────────────────────────────────────

export async function startAiIntakeFromUploadSession(
  input: z.input<typeof StartIntakeSchema>
): Promise<ActionResult<{ sessionCode: string; status: string; message?: string }>> {
  // Until an ordinary source read proves explicit NULL, failures are not legacy.
  let modernStart=true;
  try {
    const parsed = StartIntakeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { uploadSessionId, allowDuplicate } = parsed.data;
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();

    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canStartIntake(ctx)) return { success: false, error: "Permission denied: scoped upload, preview and AI review are required." };

    // ── Load upload session ─────────────────────────────────────────────────

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };

    const typedSession = session as Record<string, unknown>;
    if (typedSession.status === "completed") return { success: false, error: "Upload session is already completed" };
    if (typedSession.status === "cancelled") return { success: false, error: "Upload session has been cancelled" };
    if (!typedSession.temp_storage_path) return { success: false, error: "Temporary file path is missing" };
    if ((typedSession.intake_status as string) === "approved") return { success: false, error: "Intake already approved" };
    if ((typedSession.intake_status as string) === "discarded") return { success: false, error: "Intake was discarded" };

    // Only explicit NULL is the historical route. A missing migration/projection
    // must not silently opt a governed upload into stale-run reset behavior.
    const marker=typedSession.batch_draft_operation_id;
    const modern=marker!==null;
    modernStart=modern;
    const claimFailure=()=>({success:false as const,error:"Analysis start is unconfirmed. Retain this batch for reconciliation."});
    const modernSource=z.object({id:z.literal(uploadSessionId),batch_draft_operation_id:batchDraftUuidSchema,
      batch_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),admission_position:z.number().int().min(0).max(9),
      uploaded_by:z.literal(ctx.profile.id),session_code:z.string().length(32).regex(/^[0-9A-F]{32}$/),
      owning_company_id:z.number().int().positive().nullable(),owning_branch_id:z.number().int().positive().nullable()}).safeParse(typedSession);
    if(modern&&(!modernSource.success||!batchDraftUuidSchema.safeParse(ctx.profile.auth_user_id).success||allowDuplicate))
      return claimFailure();
    let admittedAnchors:{admission_operation_id:string;admission_fingerprint:string}|undefined;
    const modernPrepare=async()=>{
      const response=await supabase.rpc("prepare_recoverable_dms_batch_draft",{p_session:uploadSessionId}).retry(false);
      const parsed=batchDraftPrepareEnvelopeSchema.safeParse(response.data);
      if(response.error||!parsed.success||!modernSource.success)return null;
      const value=parsed.data,member=value.member,source=modernSource.data;
      if(admittedAnchors&&(value.admission_operation_id!==admittedAnchors.admission_operation_id||value.admission_fingerprint!==admittedAnchors.admission_fingerprint))return null;
      return value.auth_user_id===ctx.profile!.auth_user_id&&value.profile_id===ctx.profile!.id&&
        value.batch_id===source.batch_id&&value.owning_company_id===source.owning_company_id&&value.owning_branch_id===source.owning_branch_id&&
        member.position===source.admission_position&&member.upload_session_id===source.id&&member.session_code===source.session_code&&member.draft_operation_id===source.batch_draft_operation_id?value:null;
    };
    if(modern){
      try{
        if(typedSession.intake_status==="failed")return claimFailure();
        const preparation=await modernPrepare();
        if(!preparation)return claimFailure();
        admittedAnchors={admission_operation_id:preparation.admission_operation_id,admission_fingerprint:preparation.admission_fingerprint};
        if(preparation.member.kind==="prepared")
          return {success:true,data:{sessionCode:preparation.member.session_code,status:"review_pending"}};
        if(preparation.member.processing)
          return {success:true,data:{sessionCode:preparation.member.session_code,status:"already_processing",message:"Analysis is already in progress. Retain this batch for reconciliation."}};
        if(typedSession.intake_status!=="uploaded"||typeof typedSession.updated_at!=="string"||!Number.isFinite(Date.parse(typedSession.updated_at))||
          typeof typedSession.status!=="string"||typedSession.document_id!==null||typedSession.ai_result_id!==null||typedSession.temp_cleaned_at!==null||typedSession.deleted_at!==null)
          return claimFailure();
      }catch{return claimFailure();}
    }

    // AI review already completed — return immediately so the UI can redirect to the
    // review page without re-running a full AI pass (which can take 60+ seconds for
    // large documents and cause a server-action timeout).
    if ((typedSession.intake_status as string) === "review_pending" || (typedSession.intake_status as string) === "review_in_progress") {
      return { success: true, data: { sessionCode: typedSession.session_code as string, status: "review_pending" } };
    }

    // ── SPEED.2K: concurrency guard + stale-run sweeper ─────────────────────
    // A second "AI Fill" click while a run is in flight must NOT start a second
    // full pipeline (double OCR + double GPT cost, racing status updates).
    const intakeStatusNow = typedSession.intake_status as string;
    if (!modern && (intakeStatusNow === "ocr_processing" || intakeStatusNow === "ai_processing")) {
      const updatedAtMs = typedSession.updated_at
        ? new Date(typedSession.updated_at as string).getTime()
        : 0;
      const ageMs = Date.now() - updatedAtMs;
      const STALE_AFTER_MS = 5 * 60 * 1000;

      if (Number.isFinite(ageMs) && ageMs < STALE_AFTER_MS) {
        return {
          success: true,
          data: {
            sessionCode: typedSession.session_code as string,
            status: "already_processing",
            message: "AI is already analyzing this file. The review screen will open when it finishes.",
          },
        };
      }

      // Stale (no status progress for 5+ min): the previous run was killed
      // mid-flight (server restart, dropped connection). Mark orphaned jobs
      // failed and proceed with a fresh run.
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({
          status: "failed",
          error_message: "Stale run — superseded by a new AI Fill request",
          completed_at: new Date().toISOString(),
        })
        .eq("upload_session_id", uploadSessionId)
        .in("status", ["pending", "processing"]);
      logger.warn("[ai-intake] stale processing session swept — starting fresh run", {
        uploadSessionId,
        staleForMs: ageMs,
      });
    }
    // Duplicate detection is informational only — the UI shows a warning badge.
    // Admins may intentionally create a second document from the same file.

    const sessionCode = typedSession.session_code as string;

    // ── Check AI provider ───────────────────────────────────────────────────

    const { provider, configId } = await getDmsAiProvider();

    if (!provider.isConfigured()) {
      if(modern)return {success:false,data:{sessionCode,status:"provider_not_configured",message:"No AI provider configured. Please configure one in Administration → Settings → AI Settings."},error:"No AI provider configured"};
      // Mark as failed but return sessionCode so user can proceed manually
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);

      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "ai_intake_failed", reason: "provider_not_configured" },
      });

      return {
        success: false,
        data: { sessionCode, status: "provider_not_configured", message: "No AI provider configured. Please configure one in Administration → Settings → AI Settings." },
        error: "No AI provider configured",
      };
    }

    // ── Update status: processing ───────────────────────────────────────────


    if(modern){
      try{
        const response=await supabase.from("dms_upload_sessions")
          .update({intake_status:"ocr_processing",updated_at:new Date().toISOString()})
          .eq("id",uploadSessionId).eq("batch_draft_operation_id",marker)
          .eq("batch_id",typedSession.batch_id).eq("admission_position",typedSession.admission_position)
          .eq("uploaded_by",ctx.profile.id).eq("intake_status","uploaded").eq("status",typedSession.status)
          .eq("updated_at",typedSession.updated_at).is("deleted_at",null).is("document_id",null).is("ai_result_id",null).is("temp_cleaned_at",null)
          .select("id,batch_draft_operation_id,intake_status").retry(false);
        const elected=z.array(z.object({id:z.literal(uploadSessionId),batch_draft_operation_id:z.literal(marker as string),intake_status:z.literal("ocr_processing")}).strict()).length(1).safeParse(response.data);
        if(response.error||!elected.success)return claimFailure();
        // A new ordinary governed statement after the conditional UPDATE wait.
        // Not a durable worker lease or DB protection against other direct DML.
        const current=await modernPrepare();
        if(!current||current.member.kind!=="analysis_required"||!current.member.processing)return claimFailure();
      }catch{return claimFailure();}
    }else{
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "ocr_processing", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
    }


    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: { event: "ai_intake_started", uploaded_by: ctx.profile.id },
    });

    // ── SPEED.2I: preload classification data concurrently with OCR ─────────
    // These two DB queries (~0.5-1s) only need the OCR text at scoring time,
    // so they run in parallel with the file download + OCR below.
    const candidateDataPromise = loadClassificationCandidateData(supabase).catch(() => null);

    // ── Extract file content from dms-temp ─────────────────────────────────

    const tempPath = typedSession.temp_storage_path as string;
    const mimeType = (typedSession.mime_type as string ?? "").toLowerCase().split(";")[0].trim();
    const originalFilename = typedSession.original_filename as string;

    let ocrText = "";
    const imageFiles: DmsAiImageFile[] = [];
    let contentExtracted = false;
    let verifiedSource:Awaited<ReturnType<typeof verifyAndAttestIntakeSource>>|undefined;

    try {
      verifiedSource = await verifyAndAttestIntakeSource(supabase,adminClient,uploadSessionId);
      if(verifiedSource.plan.actorId!==ctx.profile.id||verifiedSource.plan.source.path!==tempPath||verifiedSource.plan.source.name!==originalFilename||verifiedSource.plan.source.mime!==mimeType)
        throw Error('Intake source changed before extraction.');
      const buffer = verifiedSource.bytes;

      // Content extraction — Phase 10A: router-aware.
      // When DMS_OCR_ROUTER=true: router handles text extraction (local → Azure → GPT).
      //   Passes extracted text to AI classification; imageFiles is empty (router got text).
      // When DMS_OCR_ROUTER=false: legacy path — extractFileContent + combined GPT call.
      const featureFlags = await loadOcrFeatureFlags(supabase);

      if (featureFlags.dmsOcrRouter) {
        // Phase 10A router path
        const { provider: gptProvider } = await getDmsAiProvider("ocr");
        const { provider: azureAdapter } = await getAzureDocumentIntelligenceProvider();
        const azureProvider = azureAdapter ? new AzureOcrProvider(azureAdapter) : null;

        const routerResult = await routeOcr({
          buffer,
          mimeType,
          fileName: originalFilename,
          featureFlags,
          azureProvider,
          gptProvider: gptProvider.isConfigured() ? gptProvider : null,
        });

        ocrText = routerResult.text;
        // imageFiles left empty — router already performed OCR and returned text.
        logger.info(`[ai-intake] OCR router: method=${routerResult.method} provider=${routerResult.providerCode} text=${ocrText.length} chars`);
      } else {
        // Legacy path: extractFileContent produces text and/or rendered images for GPT.
        const extracted = await extractFileContent(buffer, mimeType, originalFilename);
        logger.info(`[ai-intake] content extraction method: ${extracted.method} (text=${extracted.text.length} chars, images=${extracted.images.length})`);

        ocrText = extracted.text;
        for (const img of extracted.images) {
          imageFiles.push({ fileName: img.fileName, base64: img.base64, mimeType: img.mimeType });
        }
      }

      // Never classify an unreadable/partially rendered file as if it was read.
      if (!ocrText.trim() && imageFiles.length === 0) throw new Error("No readable document content");
      contentExtracted = true;
    } catch (err) {
      if(modern)logger.warn("[ai-intake] content extraction unavailable",{uploadSessionId});
      else logger.error("[ai-intake] file content extraction error:", err);
      contentExtracted = false;
    }

    if (!contentExtracted) {
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: "The uploaded file could not be fully read. Check the OCR provider, or split a long PDF into files of at most four pages and retry." };
    }

    // ── Update status: AI processing ────────────────────────────────────────

    await supabase
      .from("dms_upload_sessions")
      .update({ intake_status: "ai_processing", updated_at: new Date().toISOString() })
      .eq("id", uploadSessionId);

    // ── Create AI job record ────────────────────────────────────────────────

    const inputHash = hashOcrText(ocrText + `+images:${imageFiles.length}+session:${uploadSessionId}`);

    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .insert({
        document_id: null,
        upload_session_id: uploadSessionId,
        job_type: "classify_extract",
        provider: provider.providerCode,
        model: provider.modelId ?? null,
        status: "pending",
        run_source: "ai_intake",
        input_text_hash: inputHash,
        prompt_version: PROMPT_VERSION,
        provider_config_id: configId ?? null,
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: "Failed to create AI job record" };
    }

    const jobId = job.id as number;

    // ── Load metadata-aware classification candidates (Phase 3 Pass 1) ─────

    const { packets: classificationPackets, typeCandidates, scoredTypes } =
      await buildClassificationCandidates(
        supabase,
        ocrText,
        originalFilename,
        await candidateDataPromise
      );

    const typeRows = scoredTypes.map((s) => ({
      id: s.id,
      type_code: s.type_code,
      name_en: s.name_en,
    }));

    // ── SPEED.1 P3: combined classify + extract in Pass 1 ─────────────────
    // Include the top-ranked candidate's metadata fields in Pass 1. When the
    // AI confirms that type (the common case), Pass 2 is skipped entirely,
    // saving a full GPT round trip. Pass 2 still runs when the AI resolves a
    // different type than the heuristic top candidate.
    let pass1FieldsTypeId: number | null = null;
    let metadataFields: DmsAiMetadataField[] = [];
    const topCandidate = scoredTypes[0];
    if (topCandidate && topCandidate.score > 0) {
      try {
        const topFields = await loadMetadataFieldsForDocumentType(supabase, topCandidate.id, "intake");
        if (topFields.length > 0) {
          metadataFields = topFields;
          pass1FieldsTypeId = topCandidate.id;
        }
      } catch (err) {
        logger.warn("[ai-intake] failed to preload top-candidate fields (non-fatal)", {
          typeId: topCandidate.id,
          err: modern ? "Metadata preload unavailable" : String(err).slice(0, 200),
        });
      }
    }

    // ── Mark job processing ────────────────────────────────────────────────

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // ── Run AI ────────────────────────────────────────────────────────────

    const startMs = Date.now();
    let aiOutput: DmsAiOutput | null = null;
    let aiError: string | null = null;

    try {
      aiOutput = await provider.analyze({
        ocrText,
        imageFiles,
        currentTypeCode: null,
        typeCandidates,
        metadataFields,
        originalFilename,
        classificationPackets,
      });
    } catch (err) {
      aiError = modern ? "AI analysis was not confirmed. Retain this batch for reconciliation." : String(err);
    }

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    // SPEED.2M: log pass-1 token counts + duration (non-fatal, no text content)
    await logDmsAiUsage({
      providerConfigId: configId ?? null,
      featureArea: "dms_intake",
      operationType: "intake_classify_extract_pass1",
      modelId: provider.modelId ?? null,
      status: aiError || !aiOutput ? "failed" : "success",
      inputTokenCount: aiOutput?.promptTokens ?? null,
      outputTokenCount: aiOutput?.completionTokens ?? null,
      durationMs,
      errorMessage: aiError,
      aiJobId: jobId,
      uploadSessionId,
      createdBy: ctx.profile.id,
      metadata: { ocr_chars: ocrText.length, image_count: imageFiles.length, prompt_version: PROMPT_VERSION },
    });

    if (aiError || !aiOutput) {
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "failed", error_message: (aiError ?? "").slice(0, 500), completed_at: completedAt, duration_ms: durationMs })
        .eq("id", jobId);
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "ai_intake_ai_failed", job_id: jobId, duration_ms: durationMs },
      });
      return { success: false, error: aiError ?? "AI analysis failed" };
    }

    // ── Pass 2: type-specific metadata extraction (only when the resolved
    //    type differs from the one whose fields Pass 1 already extracted) ────

    const pass1Transcription =
      aiOutput.extraction.fullTextTranscription ?? ocrText ?? "";

    const typeResolution = resolveSuggestedDocumentType(
      aiOutput.classification.suggestedTypeCode,
      typeRows as Array<{ id: number; type_code: string; name_en?: string }>,
      pass1Transcription,
      aiOutput.classification.confidenceScore
    );

    const suggestedTypeId = typeResolution.typeId;
    const suggestedTypeCode = typeResolution.typeCode;

    if (typeResolution.source !== "ai" && typeResolution.typeCode) {
      aiOutput.classification.suggestedTypeCode = typeResolution.typeCode;
      aiOutput.classification.suggestedTypeId = typeResolution.typeId;
      if (typeResolution.overrideReason) {
        aiOutput.warnings = [
          ...(aiOutput.warnings ?? []),
          `Classification adjusted: ${typeResolution.overrideReason}`,
        ];
      }
    }

    if (suggestedTypeId && suggestedTypeId === pass1FieldsTypeId) {
      // SPEED.1 P3: Pass 1 already extracted this type's fields — skip Pass 2.
      logger.info("[ai-intake] pass-2 skipped: pass-1 covered resolved type fields", {
        typeCode: suggestedTypeCode,
      });
    } else if (suggestedTypeId) {
      const typeSpecificFields = await loadMetadataFieldsForDocumentType(supabase, suggestedTypeId, "intake");
      if (typeSpecificFields.length > 0) {
        try {
          const pass2StartMs = Date.now();
          const extractOutput = await provider.analyze({
            ocrText: pass1Transcription || ocrText,
            imageFiles,
            currentTypeCode: suggestedTypeCode,
            typeCandidates,
            metadataFields: typeSpecificFields,
            originalFilename,
          });
          // SPEED.2M: log pass-2 token counts + duration (non-fatal)
          await logDmsAiUsage({
            providerConfigId: configId ?? null,
            featureArea: "dms_intake",
            operationType: "intake_extract_pass2",
            modelId: provider.modelId ?? null,
            status: "success",
            inputTokenCount: extractOutput.promptTokens ?? null,
            outputTokenCount: extractOutput.completionTokens ?? null,
            durationMs: Date.now() - pass2StartMs,
            aiJobId: jobId,
            uploadSessionId,
            createdBy: ctx.profile.id,
            metadata: { resolved_type_code: suggestedTypeCode, prompt_version: PROMPT_VERSION },
          });
          // Merge pass-2 extraction; keep pass-1 classification + transcription
          aiOutput.extraction.fields = extractOutput.extraction.fields;
          aiOutput.extraction.additionalFields = [
            ...aiOutput.extraction.additionalFields,
            ...extractOutput.extraction.additionalFields,
          ];
          if (!aiOutput.extraction.suggestedTitle && extractOutput.extraction.suggestedTitle) {
            aiOutput.extraction.suggestedTitle = extractOutput.extraction.suggestedTitle;
          }
          if (!aiOutput.extraction.suggestedDescription && extractOutput.extraction.suggestedDescription) {
            aiOutput.extraction.suggestedDescription = extractOutput.extraction.suggestedDescription;
          }
          if (!aiOutput.extraction.issueDateSuggestion && extractOutput.extraction.issueDateSuggestion) {
            aiOutput.extraction.issueDateSuggestion = extractOutput.extraction.issueDateSuggestion;
          }
          if (!aiOutput.extraction.expiryDateSuggestion && extractOutput.extraction.expiryDateSuggestion) {
            aiOutput.extraction.expiryDateSuggestion = extractOutput.extraction.expiryDateSuggestion;
          }
          if (!aiOutput.extraction.fullTextTranscription && extractOutput.extraction.fullTextTranscription) {
            aiOutput.extraction.fullTextTranscription = extractOutput.extraction.fullTextTranscription;
          }
          if (extractOutput.detectedEntities.length > 0) {
            aiOutput.detectedEntities = extractOutput.detectedEntities;
          }
        } catch (err) {
          logger.warn("[ai-intake] pass-2 type-specific extraction failed (non-fatal)", {
            typeCode: suggestedTypeCode,
            err: modern ? "Metadata extraction unavailable" : String(err).slice(0, 200),
          });
        }
      }
    }

    // ── Finalize classification on output ──────────────────────────────────

    aiOutput.classification.suggestedTypeCode = suggestedTypeCode;
    aiOutput.classification.suggestedTypeId = suggestedTypeId;

    // ── Build extracted fields JSON ────────────────────────────────────────

    const extractedFieldsJson: Record<string, unknown> = {};
    const fieldConfidenceJson: Record<string, unknown> = {};
    for (const field of aiOutput.extraction.fields) {
      extractedFieldsJson[field.fieldCode] = field.value;
      fieldConfidenceJson[field.fieldCode] = {
        score: field.confidenceScore,
        label: field.confidenceLabel,
        source_snippet: field.sourceSnippet ?? null,
      };
    }
    // Preserve everything else the AI read, so no information is lost.
    if (aiOutput.extraction.additionalFields.length > 0) {
      extractedFieldsJson.__additional_fields = aiOutput.extraction.additionalFields.map((a) => ({
        label: a.label,
        value: a.value,
        confidence: a.confidenceScore,
      }));
    }

    // ── Match detected entities against the parties database ───────────────
    const partyMatches = await matchEntitiesToParties(supabase, aiOutput.detectedEntities);
    const suggestedLinks = [
      ...(aiOutput.suggestedLinks ?? []),
      ...partyMatches,
    ];

    // ── Sanitize raw response (never log large text) ───────────────────────

    const sanitizedResponse = aiOutput.rawResponse
      ? {
          classification: buildSanitizedClassificationPayload(
            aiOutput.rawResponse.classification as Record<string, unknown> | undefined,
            aiOutput.classification.confidenceScore,
            aiOutput.classification.confidenceLabel,
            aiOutput.classification.suggestedTypeCode,
            aiOutput.classification.reason ?? ""
          ),
          suggested_title: aiOutput.rawResponse.suggested_title,
          suggested_description: aiOutput.rawResponse.suggested_description,
          field_count: (aiOutput.rawResponse.fields as unknown[])?.length ?? 0,
          warnings: aiOutput.rawResponse.warnings,
        }
      : {
          classification: buildSanitizedClassificationPayload(
            undefined,
            aiOutput.classification.confidenceScore,
            aiOutput.classification.confidenceLabel,
            aiOutput.classification.suggestedTypeCode,
            aiOutput.classification.reason ?? ""
          ),
        };

    // ── Store AI result ────────────────────────────────────────────────────

    const resultPayload = {
        job_id: jobId,
        document_id: null,
        upload_session_id: uploadSessionId,
        result_type: "combined",
        ai_status: "pending_review",
        suggested_document_type_id: suggestedTypeId,
        classification_confidence: aiOutput.classification.confidenceLabel,
        classification_score: aiOutput.classification.confidenceScore,
        classification_reason: (aiOutput.classification.reason ?? "").slice(0, 500),
        extracted_fields_json: extractedFieldsJson,
        field_confidence_json: fieldConfidenceJson,
        suggested_links_json: suggestedLinks,
        issue_date_suggestion: aiOutput.extraction.issueDateSuggestion ?? null,
        expiry_date_suggestion: aiOutput.extraction.expiryDateSuggestion ?? null,
        suggested_title: aiOutput.extraction.suggestedTitle?.slice(0, 500) ?? null,
        suggested_description: aiOutput.extraction.suggestedDescription?.slice(0, 2000) ?? null,
        review_action: null,
        reviewed_by: null,
        reviewed_at: null,
        raw_response_json: sanitizedResponse,
        // For image-based docs (passports, Emirates IDs, certificates, scanned PDFs)
        // local OCR produces no text — use the AI's full_text_transcription instead.
        // For digital PDFs/DOCX, use the locally extracted text (more reliable).
        raw_ocr_text: (() => {
          const localText = ocrText && ocrText.trim().length > 0 ? ocrText.trim() : null;
          const aiTranscription = aiOutput.extraction.fullTextTranscription ?? null;
          const best = localText ?? aiTranscription;
          return best ? best.slice(0, 100_000) : null;
        })(),
    };
    const { data: result, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .insert({...resultPayload,created_at:completedAt})
      .select("id")
      .single();

    if (resultErr || !result) {
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "failed", error_message: modern ? "AI result storage was not confirmed." : resultErr?.message ?? "Failed to store result", completed_at: completedAt, duration_ms: durationMs })
        .eq("id", jobId);
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: modern ? "AI result storage was not confirmed. Retain this batch for reconciliation." : resultErr?.message ?? "Failed to store AI result" };
    }

    const resultId = result.id as number;

    // ── Complete job + update session ──────────────────────────────────────

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "complete", completed_at: completedAt, duration_ms: durationMs })
      .eq("id", jobId);

    if(!verifiedSource)return {success:false,error:'The exact original-file proof is missing. Retain this intake for reconciliation.'};
    const attestedAnalysis=await adminClient.rpc('f07_attest_intake_analysis',{
      p_session:uploadSessionId,p_actor:verifiedSource.plan.actorId,p_auth_session:verifiedSource.plan.authSessionId,
      p_result:resultId,p_expected:resultPayload,
    });
    if(attestedAnalysis.error)return {success:false,error:'The AI result could not be verified against its exact original file. Retain this intake; no approval was submitted.'};

    await supabase
      .from("dms_upload_sessions")
      .update({
        intake_status: "review_pending",
        review_status: "pending",
        ai_job_id: jobId,
        ai_result_id: resultId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadSessionId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "classification_completed",
        job_id: jobId,
        result_id: resultId,
        duration_ms: durationMs,
        suggested_type_code: suggestedTypeCode,
        classification_score: aiOutput.classification.confidenceScore,
        needs_human_review: aiOutput.classification.needsHumanReview ?? false,
        prompt_version: PROMPT_VERSION,
      },
    });

    if (
      aiOutput.classification.needsHumanReview ||
      (aiOutput.classification.confidenceScore != null &&
        aiOutput.classification.confidenceScore < 0.6)
    ) {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: {
          event: "classification_low_confidence",
          result_id: resultId,
          classification_score: aiOutput.classification.confidenceScore,
          review_reason: aiOutput.classification.reviewReason ?? null,
        },
      });
    }

    // NOTE (SPEED.2L flash fix, 2026-08-03): do NOT call revalidatePath here.
    // This action runs for 30s+; the client's status poll redirects to
    // /dms/intake/[code] while it is still in flight. A revalidatePath in the
    // action response then triggers a router refresh that briefly bounces the
    // user back to the inbox ("flash") before the intake route wins again.
    // The inbox page is force-dynamic (revalidate=0), so it is always fresh on
    // the next visit anyway.

    // ── Phase 12: Non-fatal review queue generation hook ─────────────────────
    // Creates review queue items for low-confidence or missing-field classifications.
    // NEVER blocks the intake workflow.
    try {
      const reviewEnabled = await isDmsAiReviewEnabled();
      if (reviewEnabled) {
        const classificationScore = aiOutput.classification.confidenceScore ?? 1;
        const needsReview = aiOutput.classification.needsHumanReview || classificationScore < 0.6;

        if (needsReview) {
          await upsertDmsReviewQueueItem({
            idempotencyKey:  `intake_classification:${uploadSessionId}:classification`,
            reviewType:      "intake_classification_review",
            sourceType:      "intake",
            sourceId:        String(uploadSessionId),
            uploadSessionId,
            aiResultId:      resultId,
            reasonCode:      "classification_low_confidence",
            reasonMessage:   `Classification confidence ${(classificationScore * 100).toFixed(0)}% is below threshold or reviewer flagged.`,
            confidence:      classificationScore,
            priority:        classificationScore < 0.4 ? "high" : "normal",
            payloadJson: {
              upload_session_id: uploadSessionId,
              session_code: sessionCode,
              suggested_type_code: suggestedTypeCode,
              classification_score: classificationScore,
            },
            createdBy: ctx.profile.id,
          });
        }
      }
    } catch (hookErr) {
      logger.warn("[ai-intake] review queue hook failed (non-fatal)", { uploadSessionId, error: modern ? "Review queue update unavailable" : String(hookErr).slice(0, 200) });
    }

    return {
      success: true,
      data: { sessionCode, status: "review_pending", message: "AI analysis complete" },
    };
  } catch (e) {
    if(modernStart)return {success:false,error:"Analysis start is unconfirmed. Retain this batch for reconciliation."};
    logger.error("startAiIntakeFromUploadSession error", e);
    return { success: false, error: String(e) };
  }
}

// ── getAiIntakeSession ────────────────────────────────────────────────────────

export async function getAiIntakeSession(
  sessionCode: string
): Promise<ActionResult<IntakeSessionData>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Intake session not found" };

    const typedSession = session as Record<string, unknown>;
    const sessionId = typedSession.id as number;
    const aiResultId = typedSession.ai_result_id as number | null;

    // Load AI result if available
    let aiResult: IntakeAiResultRow | null = null;
    if (aiResultId) {
      const { data: resultRow } = await supabase
        .from("dms_ai_extraction_results")
        .select(`id, upload_session_id, document_id, job_id, ai_status,
                 suggested_document_type_id, classification_confidence, classification_score,
                 classification_reason, extracted_fields_json, field_confidence_json,
                 suggested_links_json, issue_date_suggestion, expiry_date_suggestion, suggested_title,
                 suggested_description, review_action, raw_response_json, created_at,
                 suggested_type:dms_document_types!suggested_document_type_id(type_code, name_en)`)
        .eq("id", aiResultId)
        .single();
      if (resultRow) aiResult = resultRow as unknown as IntakeAiResultRow;
    }

    // Load any saved draft values
    const { data: draftRows } = await supabase
      .from("dms_intake_review_values")
      .select("*")
      .eq("upload_session_id", sessionId)
      .order("field_scope")
      .order("field_code");

    const intakeData: IntakeSessionData = {
      id: sessionId,
      session_code: typedSession.session_code as string,
      status: typedSession.status as string,
      intake_status: (typedSession.intake_status as string) ?? "uploaded",
      review_status: (typedSession.review_status as string) ?? "not_started",
      original_filename: typedSession.original_filename as string,
      mime_type: typedSession.mime_type as string,
      file_size_bytes: typedSession.file_size_bytes as number,
      temp_storage_path: typedSession.temp_storage_path as string | null,
      is_duplicate: typedSession.is_duplicate as boolean,
      duplicate_document_id: typedSession.duplicate_document_id as number | null,
      ai_result_id: aiResultId,
      document_id: typedSession.document_id as number | null,
      owning_company_id: typedSession.owning_company_id as number | null,
      owning_branch_id: typedSession.owning_branch_id as number | null,
      reviewed_by: typedSession.reviewed_by as number | null,
      discarded_at: typedSession.discarded_at as string | null,
      discard_reason: typedSession.discard_reason as string | null,
      uploaded_at: typedSession.uploaded_at as string ?? typedSession.created_at as string,
      ai_result: aiResult,
      draft_values: draftRows as unknown as IntakeReviewValueRow[] | null,
    };

    return { success: true, data: intakeData };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── suggestIntakeEntityLinks (HR.DOCLINK.1A) ─────────────────────────────────

/**
 * Builds employee / dependent / party link suggestions for the intake review
 * Link panel. Exact identity-number matches are pre-ticked (decision D2);
 * everything else is listed unticked. Read-only — links are only written when
 * the reviewer approves with them ticked.
 */
export async function suggestIntakeEntityLinks(
  sessionCode: string
): Promise<ActionResult<import("@/lib/dms/entity-matching/intake-link-suggester").IntakeLinkSuggestion[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const admin = createAdminClient();
    const { data: session } = await admin
      .from("dms_upload_sessions")
      .select("id, ai_result_id")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (!session) return { success: false, error: "Intake session not found" };
    const aiResultId = (session as Record<string, unknown>).ai_result_id as number | null;
    if (!aiResultId) return { success: true, data: [] };

    const { data: aiResult } = await admin
      .from("dms_ai_extraction_results")
      .select("extracted_fields_json, suggested_links_json")
      .eq("id", aiResultId)
      .single();

    if (!aiResult) return { success: true, data: [] };

    const { buildIntakeLinkSuggestions } = await import(
      "@/lib/dms/entity-matching/intake-link-suggester"
    );
    const suggestions = await buildIntakeLinkSuggestions(admin, {
      extractedFields:
        ((aiResult as Record<string, unknown>).extracted_fields_json as Record<string, unknown>) ??
        null,
      suggestedLinksJson:
        ((aiResult as Record<string, unknown>).suggested_links_json as unknown[]) ?? null,
    });

    return { success: true, data: suggestions };
  } catch (e) {
    logger.error("suggestIntakeEntityLinks error", e);
    return { success: false, error: "Failed to build link suggestions" };
  }
}

// ── isDmsAiAutoStartEnabled (SPEED.2A) ────────────────────────────────────────

/**
 * When the DMS_AI_AUTO_START flag is enabled, the inbox starts AI analysis
 * automatically the moment an upload lands (no button click). Default: OFF.
 */
export async function isDmsAiAutoStartEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_AUTO_START")
      .maybeSingle();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// NOTE (SPEED.2L): the intake status poll lives at GET /api/dms/intake-status
// (route handler), NOT here. It must not be a server action: Next.js serializes
// server actions client-side (a poll action would queue behind the long-running
// startAiIntakeFromUploadSession call), and a server action resolving after a
// router.push reverts the navigation (inbox tab flash bug).

// ── getIntakeSessionSignedUrl ─────────────────────────────────────────────────

export async function getIntakeSessionSignedUrl(
  uploadSessionId: number
): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error } = await supabase
      .from("dms_upload_sessions")
      .select("temp_storage_path, mime_type")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (error || !session) return { success: false, error: "Session not found" };
    if (!session.temp_storage_path) return { success: false, error: "No file path available" };

    const { data: signedUrlData, error: urlError } = await adminClient.storage
      .from("dms-temp")
      .createSignedUrl(session.temp_storage_path as string, 300); // 5 minutes

    if (urlError || !signedUrlData) return { success: false, error: "Failed to generate preview URL" };

    return { success: true, data: { url: signedUrlData.signedUrl } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── rerunMetadataExtractionForIntakeSession (Phase 3) ─────────────────────────

const rerunExtractionSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  documentTypeId: z.number().int().positive(),
  mergeMode: z.enum(["fill_missing_only", "replace_ai_values", "keep_user_values"]),
});

export type RerunExtractionMergeMode = z.infer<typeof rerunExtractionSchema>["mergeMode"];

export async function rerunMetadataExtractionForIntakeSession(input: {
  uploadSessionId: number;
  documentTypeId: number;
  mergeMode: RerunExtractionMergeMode;
}): Promise<
  ActionResult<{
    extractedFieldsJson: Record<string, unknown>;
    fieldConfidenceJson: Record<string, unknown>;
    skipped: boolean;
  }>
> {
  try {
    const parsed = rerunExtractionSchema.parse(input);
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionErr } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, intake_status, ai_result_id, original_filename")
      .eq("id", parsed.uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionErr || !session) return { success: false, error: "Upload session not found" };

    const intakeStatus = (session as Record<string, unknown>).intake_status as string;
    if (intakeStatus === "approved" || intakeStatus === "discarded") {
      return { success: false, error: "Cannot re-run extraction for a completed intake" };
    }

    const aiResultId = (session as Record<string, unknown>).ai_result_id as number | null;
    if (!aiResultId) return { success: false, error: "No AI result available for this session" };

    const { data: aiResult, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .select("id, raw_ocr_text, extracted_fields_json, field_confidence_json, suggested_document_type_id")
      .eq("id", aiResultId)
      .single();

    if (resultErr || !aiResult) return { success: false, error: "AI result not found" };

    const sessionCode = (session as Record<string, unknown>).session_code as string;
    const originalFilename = (session as Record<string, unknown>).original_filename as string;

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: parsed.uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "metadata_extraction_rerun_started",
        document_type_id: parsed.documentTypeId,
        merge_mode: parsed.mergeMode,
      },
    });

    if (parsed.mergeMode === "keep_user_values") {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: parsed.uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "metadata_extraction_values_kept", merge_mode: parsed.mergeMode },
      });
      return {
        success: true,
        data: {
          extractedFieldsJson: (aiResult.extracted_fields_json as Record<string, unknown>) ?? {},
          fieldConfidenceJson: (aiResult.field_confidence_json as Record<string, unknown>) ?? {},
          skipped: true,
        },
      };
    }

    const ocrText = ((aiResult.raw_ocr_text as string | null) ?? "").trim();
    if (!ocrText) {
      return { success: false, error: "No OCR text available — cannot re-run extraction without re-running full AI intake" };
    }

    const { data: typeRow } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en")
      .eq("id", parsed.documentTypeId)
      .single();

    if (!typeRow) return { success: false, error: "Document type not found" };

    const typeSpecificFields = await loadMetadataFieldsForDocumentType(
      supabase,
      parsed.documentTypeId,
      "intake"
    );
    if (typeSpecificFields.length === 0) {
      return { success: false, error: "No metadata fields defined for this document type" };
    }

    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: false, error: "No AI provider configured" };
    }

    const typeCandidates: DmsAiDocumentTypeCandidate[] = [
      {
        typeCode: typeRow.type_code as string,
        nameEn: typeRow.name_en as string,
        description: null,
        categoryName: null,
      },
    ];

    let extractOutput: DmsAiOutput;
    const rerunStartMs = Date.now();
    try {
      extractOutput = await provider.analyze({
        ocrText,
        imageFiles: [],
        currentTypeCode: typeRow.type_code as string,
        typeCandidates,
        metadataFields: typeSpecificFields,
        originalFilename,
      });
    } catch (err) {
      return { success: false, error: String(err) };
    }

    // SPEED.2M: log rerun token counts + duration (non-fatal)
    await logDmsAiUsage({
      featureArea: "dms_intake",
      operationType: "intake_extract_rerun",
      modelId: provider.modelId ?? null,
      status: "success",
      inputTokenCount: extractOutput.promptTokens ?? null,
      outputTokenCount: extractOutput.completionTokens ?? null,
      durationMs: Date.now() - rerunStartMs,
      uploadSessionId: parsed.uploadSessionId,
      createdBy: ctx.profile.id,
      metadata: { type_code: typeRow.type_code, merge_mode: parsed.mergeMode, prompt_version: PROMPT_VERSION },
    });

    const existingExtracted = (aiResult.extracted_fields_json as Record<string, unknown>) ?? {};
    const existingConfidence = (aiResult.field_confidence_json as Record<string, unknown>) ?? {};

    const newExtracted: Record<string, unknown> = { ...existingExtracted };
    const newConfidence: Record<string, unknown> = { ...existingConfidence };

    for (const field of extractOutput.extraction.fields) {
      const existingVal = existingExtracted[field.fieldCode];
      const isEmpty =
        existingVal == null ||
        (typeof existingVal === "string" && existingVal.trim() === "");

      if (parsed.mergeMode === "fill_missing_only" && !isEmpty) continue;

      newExtracted[field.fieldCode] = field.value;
      newConfidence[field.fieldCode] = {
        score: field.confidenceScore,
        label: field.confidenceLabel,
        source_snippet: field.sourceSnippet ?? null,
      };
    }

    if (extractOutput.extraction.additionalFields.length > 0) {
      newExtracted.__additional_fields = extractOutput.extraction.additionalFields.map((a) => ({
        label: a.label,
        value: a.value,
        confidence: a.confidenceScore,
      }));
    }

    const { error: updateErr } = await supabase
      .from("dms_ai_extraction_results")
      .update({
        extracted_fields_json: newExtracted,
        field_confidence_json: newConfidence,
      })
      .eq("id", aiResultId);

    if (updateErr) return { success: false, error: updateErr.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: parsed.uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "metadata_extraction_rerun_completed",
        merge_mode: parsed.mergeMode,
        fields_updated: extractOutput.extraction.fields.length,
        document_type_id: parsed.documentTypeId,
      },
    });

    if (parsed.mergeMode === "replace_ai_values") {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: parsed.uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "metadata_extraction_values_replaced" },
      });
    }

    revalidatePath(`/dms/intake/${sessionCode}`);

    return {
      success: true,
      data: {
        extractedFieldsJson: newExtracted,
        fieldConfidenceJson: newConfidence,
        skipped: false,
      },
    };
  } catch (e) {
    logger.error("rerunMetadataExtractionForIntakeSession error", e);
    return { success: false, error: String(e) };
  }
}

// ── saveAiIntakeDraft ─────────────────────────────────────────────────────────

export async function saveAiIntakeDraft(
  uploadSessionId: number,
  draftValues: {
    fieldScope: string;
    fieldCode: string;
    fieldLabel?: string | null;
    fieldType?: string | null;
    reviewedValueJson: unknown;
    suggestedValueJson?: unknown;
    confidenceScore?: number | null;
    confidenceLabel?: string | null;
    sourceSnippet?: string | null;
    reviewStatus?: string;
  }[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    // Verify session belongs to a valid intake
    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("id, intake_status")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };

    const intakeStatus = (session as Record<string, unknown>).intake_status as string;
    if (intakeStatus === "approved" || intakeStatus === "discarded") {
      return { success: false, error: "Cannot save draft for a completed or discarded intake" };
    }

    const now = new Date().toISOString();

    // Upsert each field value
    for (const v of draftValues) {
      await supabase
        .from("dms_intake_review_values")
        .upsert(
          {
            upload_session_id: uploadSessionId,
            field_scope: v.fieldScope,
            field_code: v.fieldCode,
            field_label: v.fieldLabel ?? null,
            field_type: v.fieldType ?? null,
            suggested_value_json: v.suggestedValueJson ?? null,
            reviewed_value_json: v.reviewedValueJson,
            confidence_score: v.confidenceScore ?? null,
            confidence_label: v.confidenceLabel ?? null,
            source_snippet: v.sourceSnippet ?? null,
            review_status: v.reviewStatus ?? "edited",
            updated_at: now,
          },
          { onConflict: "upload_session_id,field_scope,field_code" }
        );
    }

    // Update review status
    await supabase
      .from("dms_upload_sessions")
      .update({ review_status: "in_review", updated_at: now })
      .eq("id", uploadSessionId);

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryAiIntake ─────────────────────────────────────────────────────────────

export async function retryAiIntake(
  uploadSessionId: number
): Promise<ActionResult<{ sessionCode: string; status: string }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canStartIntake(ctx)) return { success: false, error: "Permission denied" };

    // Governed work cannot be reset: age/failed is not proof a provider is dead.
    const source=await supabase.from("dms_upload_sessions").select("batch_draft_operation_id").eq("id",uploadSessionId).is("deleted_at",null).single();
    if(source.error||!source.data||source.data.batch_draft_operation_id!==null)
      return {success:false,error:"Use the retained batch recovery workflow. This analysis cannot be reset."};
    // Reset only the explicit historical NULL route.
    await supabase
      .from("dms_upload_sessions")
      .update({
        intake_status: "uploaded",
        review_status: "not_started",
        ai_result_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadSessionId).is("batch_draft_operation_id",null);

    return startAiIntakeFromUploadSession({ uploadSessionId });
  } catch {
    return { success: false, error: "Analysis retry is unavailable. Retain the original request for reconciliation." };
  }
}

// ── discardAiIntake ───────────────────────────────────────────────────────────

export async function discardAiIntake(
  uploadSessionId: number,
  reason?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, intake_status, document_id")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };
    const typedSession = session as Record<string, unknown>;

    if (typedSession.intake_status === "approved") {
      return { success: false, error: "Cannot discard an already-approved intake" };
    }

    const result=await discardRetainedIntake(supabase,{sessionId:uploadSessionId,documentId:typedSession.document_id as number|null,reason});
    if(!result.ok)return {success:false,error:result.error};
    try{revalidatePath("/dms/inbox");}catch{/* Committed receipt wins. */}
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── approveAiIntakeAndCreateDocument ─────────────────────────────────────────

export async function approveAiIntakeAndCreateDocument(
  input: ApproveIntakeInput,
  contract?: WorkspaceSaveContract,
): Promise<AiApprovalResult> {
  return approveNumberedAiIntake(input, contract);
}
