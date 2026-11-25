import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentJobClaim } from "@/lib/dms/ai-jobs/claim-scope";
import { preparationSnapshotSchema, modelPreparationSchema, type ModelPreparation } from "@/lib/dms/preparation/contracts";
import { runPreparationStage } from "@/lib/dms/preparation/stages";
import { buildPreparationCandidates, preparationPrompt, isPortraitPreparation } from "@/lib/dms/preparation/candidates";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { ALGT_DMS_PREVIEW_COMPANY, applySavedTrainingReview, trainingOutputFromPreparation, trainingPreviewEnabled, trainingType, verifyTrainingOriginal } from "@/server/dms-training-profile-review";
import { approvedProfilePreviewConfigured, approvedProfilePreviewEnabled, mergeApprovedProfileFields, prepareSavedApprovedProfile, SPECIALIST_TRAINING_FIELDS, verifyApprovedProfile } from "@/server/dms-approved-profile-review";
import { applySavedCicpaWording, cicpaWordingPreviewEnabled, isCicpaPassType } from "@/server/dms-cicpa-wording-review";
import { readVerifiedIntakeSource } from "@/server/dms-verified-intake-source";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { routeOcr } from "@/lib/dms/ocr/ocr-router";
import { preparationResponseSchema } from "@/lib/dms/preparation/response-schema";
import { StructuredAiFailure, structuredFailureCodes } from "@/lib/dms/ai/structured-failure";
import type { DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
import { preparationTraceId, traceDetachedOperation, traceSpan } from '@/lib/performance/trace';
const analysisReceipt = z.strictObject({ output: modelPreparationSchema, provider: z.string(), model: z.string().nullable(), configId: z.number().int().positive().nullable(),
  promptVersion: z.literal("dms-preparation/1"), schemaVersion: z.literal("dms-preparation/1"), inputHash: z.string().regex(/^[a-f0-9]{64}$/), promptTokens: z.number().int().nonnegative().nullable(), completionTokens: z.number().int().nonnegative().nullable(), durationMs: z.number().nonnegative() });
// Preserve received output before parsing or quality validation. Legacy validated receipts remain replayable.
const receivedAnalysisReceipt = analysisReceipt.omit({ output: true }).extend({
  receiptVersion: z.literal(2), rawJson: z.string().max(131072),
  responseIssue: z.enum(["provider_refusal", "provider_output_incomplete", "provider_output_invalid"]).optional(),
});
const storedAnalysisReceipt = z.union([analysisReceipt, receivedAnalysisReceipt]);
const safePreparationCodes = new Set<string>([...structuredFailureCodes, "quality_evaluation_held", "preparation_outcome_unconfirmed", "source_changed", "database_error"]);
const ocrReceipt = z.strictObject({ text: z.string().max(100000), provider: z.string(), model: z.string().nullable(), method: z.string(), pageCount: z.number().int().positive().nullable(), fileId:z.number().int().positive().optional(),versionId:z.number().int().positive().optional(),artifactContentHash:z.string().regex(/^[a-f0-9]{64}$/).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const targetSchema = z.strictObject({ documentTypeId: z.number().int().positive(), typeCode: z.string(), typeName: z.string(), categoryId: z.number().int().positive(), categoryName: z.string().nullable(),
  profile: preparationSnapshotSchema.shape.profile, profileHash: preparationSnapshotSchema.shape.profileHash, schemaHash: preparationSnapshotSchema.shape.profileHash, fields: preparationSnapshotSchema.shape.fields, canApply: z.boolean(), holdReason: z.string().nullable() });

/** Returns null only for a verified legacy job, preserving its existing handler. */
export async function runDocumentPreparationJob(documentId: number): Promise<DmsAiJobHandlerResult | null> {
  const claim = currentJobClaim();
  if (!claim) return { success: false, errorCode: "auth_error", retryable: false };
  return traceDetachedOperation('dms.rerun', () => prepareDocument(documentId,claim), preparationTraceId(claim.jobId));
}

async function prepareDocument(documentId: number, claim: NonNullable<ReturnType<typeof currentJobClaim>>): Promise<DmsAiJobHandlerResult | null> {
  const db = createAdminClient();
  const rpc = async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await db.rpc("ai_mod04_preparation_worker", { p_action: action, p_data: { jobId: claim.jobId, token: claim.token, ...extra } });
    if (r.error) throw Error(["42501", "PT409", "40001"].includes(r.error.code) ? "source_changed" : "database_error");
    return r.data;
  };
  try {
    const read = z.discriminatedUnion("preparation", [
      z.strictObject({ success: z.literal(true), preparation: z.literal(false) }),
      z.strictObject({ success: z.literal(true), preparation: z.literal(true), context: z.object({
        source: preparationSnapshotSchema, mode: z.enum(["reuse_text", "reread_files"]), fileIds: z.array(z.number().int().positive()).min(1).max(10),
        state: z.string(), resultId: z.number().int().positive().nullable(), target: targetSchema.nullable().optional(),
      }).passthrough() }),
    ]).parse(await rpc("context"));
    if (!read.preparation) return null;
    const context = read.context;
    if (context.source.documentId !== documentId) return { success: false, errorCode: "source_changed", retryable: false };
    if (context.resultId) return { success: true };
    const source = { ...context.source, files: context.source.files.filter(f => context.fileIds.includes(f.id)).map(f => ({ ...f })) };
    if (source.files.length !== context.fileIds.length) throw Error("selected_source_unavailable");
    const portrait = isPortraitPreparation(source);
    const originals = new Map<number, Awaited<ReturnType<typeof readVerifiedIntakeSource>>>();
    const readOriginal = (file: typeof source.files[number]) => {
      if (!file.bucket || !file.path) throw Error("source_location_unavailable");
      return readVerifiedIntakeSource(db.storage.from(file.bucket), { path: file.path, name: file.name, mime: file.mime, size: file.size, sha256: file.sha256 });
    };
    // Older retained reuse requests keep their original semantics. Requests
    // created with the verification flag require qualified text for reuse.
    const filesToRead = source.files.filter(file => context.mode === 'reread_files' || file.verifiedText === false);
    if (!portrait && filesToRead.length > 0) {
      // Read actual configured flags; a failed read must not enable a provider.
      const flags = await db.from("erp_ai_feature_flags").select("feature_code,is_enabled")
        .in("feature_code", ["DMS_OCR", "DMS_OCR_ROUTER", "DMS_OCR_GPT_VISION_FALLBACK"]);
      if (flags.error) throw Error("ocr_configuration_unavailable");
      const enabled = new Map((flags.data ?? []).map(f => [f.feature_code, f.is_enabled]));
      if (!enabled.get("DMS_OCR") || !enabled.get("DMS_OCR_ROUTER")) throw Error("ocr_not_enabled");
      const { provider } = await getDmsAiProvider("ocr");
      for (const file of filesToRead) {
        const extracted = await runPreparationStage(rpc, `ocr:${file.id}`, ocrReceipt, async () => {
          const verified = await readOriginal(file);
          if (context.mode === "reread_files" && source.files.length === 1 && (approvedProfilePreviewConfigured() ||
            ((trainingPreviewEnabled() || cicpaWordingPreviewEnabled()) && file.mime === "application/pdf"))) originals.set(file.id, verified);
          // Candidate-only extraction; never call the old accepted-OCR writer.
          const result = await traceSpan('dms.ocr', () => routeOcr({ buffer: verified.bytes, mimeType: file.mime, fileName: file.name,
            featureFlags: { dmsOcr: true, dmsOcrRouter: true, dmsOcrAzure: false, dmsOcrGptVisionFallback: enabled.get("DMS_OCR_GPT_VISION_FALLBACK") === true },
            azureProvider: null, gptProvider: provider, forceVision: false }));
          if (!result.text.trim()) throw Error("source_text_unavailable");
          const text=result.text.slice(0,100000);
          return { text,fileId:file.id,versionId:file.versionId,artifactContentHash:createHash("sha256").update(text,"utf8").digest("hex"), provider: result.providerCode, model: result.model, method: result.method, pageCount: result.pageCount ?? null, sha256: verified.proof.sha256 };
        });
        if (extracted.sha256 !== file.sha256) throw Error("source_fingerprint_changed");
        file.text = extracted.text;
      }
    }
    if (!portrait && source.files.some(f => !f.text?.trim())) throw Error("source_text_unavailable");
    const catalogue = await db.from("dms_document_types").select("type_code,name_en").eq("is_active", true).is("deleted_at", null).order("id").limit(201);
    if (catalogue.error || !catalogue.data) throw Error("type_catalogue_unavailable");
    const types = catalogue.data.length > 200 ? [{ code: source.typeCode ?? "", name: source.typeName ?? "Current type" }] : catalogue.data.map(t => ({ code: t.type_code, name: t.name_en }));
    const analyze = async (stage: string, input: typeof source, candidates: typeof types) => {
      const prompt = preparationPrompt(input, candidates), inputHash = createHash("sha256").update(prompt.system).update(prompt.user).digest("hex");
      const selected=portrait?null:await getDmsAiProvider();
      const quote=selected?.configId&&selected.provider.modelId?{configId:selected.configId,model:selected.provider.modelId,inputByteCeiling:Buffer.byteLength(prompt.system,'utf8')+Buffer.byteLength(prompt.user,'utf8'),outputTokenCeiling:6000}:undefined;
      // Reject a local policy hold before marking any model request as started.
      if (!portrait) {
        if (!selected) throw new StructuredAiFailure("provider_not_configured");
        const gate = await db.rpc("ai_mod05_model_gate", { p_job: claim.jobId, p_token: claim.token, p_model: selected.provider.modelId, p_prompt: "dms-preparation/1" });
        if ((gate.error && !["PGRST202", "42883"].includes(gate.error.code)) || (!gate.error && gate.data?.success !== true)) throw Error("quality_evaluation_held");
      }
      const received = await runPreparationStage(rpc, stage, storedAnalysisReceipt, async () => {
      if (portrait) return { output: { documentTypeCode: source.typeCode, title: null, description: null, summary: null, issueDate: null, expiryDate: null, fields: [], tagNames: [], warnings: [], bundle: "single" as const }, provider: "not_applicable", model: null, configId: null, promptVersion: "dms-preparation/1" as const, schemaVersion: "dms-preparation/1" as const, inputHash, promptTokens: null, completionTokens: null, durationMs: 0 };
      if(!selected)throw Error('provider_configuration_unavailable');
      const result = await traceSpan(stage === 'analysis' ? 'dms.model.first' : 'dms.model.second', () =>
        callCommonAiStructuredCompletion(prompt.system, prompt.user, { maxTokens: 6000, temperature: 0, selectedProvider:selected, responseSchema: preparationResponseSchema }));
      if (!result.success) throw new StructuredAiFailure(result.errorCode ?? "provider_unavailable");
      return { receiptVersion: 2 as const, rawJson: result.rawJson,
        ...(result.responseIssue ? { responseIssue: result.responseIssue } : {}),
        provider: result.providerCode, model: result.model, configId: result.configId, promptVersion: "dms-preparation/1" as const, schemaVersion: "dms-preparation/1" as const, inputHash, promptTokens: result.promptTokens, completionTokens: result.completionTokens, durationMs: result.durationMs };
      },quote);
      if (received.inputHash !== inputHash) throw Error("source_changed");
      if (!portrait) {
        const actualGate = await db.rpc("ai_mod05_model_gate", { p_job: claim.jobId, p_token: claim.token, p_model: received.model, p_prompt: "dms-preparation/1" });
        if ((actualGate.error && !["PGRST202", "42883"].includes(actualGate.error.code)) || (!actualGate.error && actualGate.data?.success !== true)) throw Error("quality_evaluation_held");
      }
      if ("output" in received) return received;
      if (received.responseIssue) throw new StructuredAiFailure(received.responseIssue);
      try { return { ...received, output: modelPreparationSchema.parse(JSON.parse(received.rawJson)) }; }
      catch { throw new StructuredAiFailure("provider_output_invalid"); }
    };
    let analyzed = await analyze("analysis", source, types), working = source;
    let target = context.target ?? null;
    const code = analyzed.output.documentTypeCode;
    const suggestedType = code && code !== source.typeCode && types.some(t => t.code === code) ? code : null;
    const reread = context.mode === "reread_files";
    const trainingCandidate = reread ? trainingType(ALGT_DMS_PREVIEW_COMPANY, code, source.typeCode) : undefined;
    const cicpaPreview = reread && cicpaWordingPreviewEnabled() && [source.typeCode, target?.typeCode, suggestedType].some(isCicpaPassType);
    let previewCompany: number | null = null;
    if (trainingCandidate || cicpaPreview || (reread && approvedProfilePreviewConfigured())) {
      const scope = await db.from("dms_documents").select("owning_company_id").eq("id", documentId).is("deleted_at", null).maybeSingle();
      if (scope.error || !scope.data) throw Error("source_changed");
      previewCompany = scope.data.owning_company_id;
    }
    const readOnlyPreview = reread && approvedProfilePreviewEnabled(previewCompany);
    const trainingCode = previewCompany === ALGT_DMS_PREVIEW_COMPANY ? trainingCandidate : undefined;
    const getPreviewOriginal = async () => {
      if (source.files.length !== 1) return undefined;
      const [file] = source.files;
      const original = originals.get(file.id) ?? await readOriginal(file);
      if (original.proof.sha256 !== file.sha256) throw Error("source_changed");
      originals.set(file.id, original);
      return original;
    };
    if (target && readOnlyPreview) throw Error("preparation_outcome_unconfirmed");
    const trainingOriginal = trainingCode ? await getPreviewOriginal() : undefined;
    const trainingInputs = trainingOriginal ? [{ bytes: trainingOriginal.bytes, sha256: trainingOriginal.proof.sha256, mime: source.files[0].mime }] : [];
    // Establish the specialist hold before adding an immutable type binding.
    const preflightTraining = trainingCode && (suggestedType || target)
      ? await verifyTrainingOriginal(trainingCode, trainingInputs, trainingOutputFromPreparation(analyzed.output)) : undefined;
    if (target && preflightTraining && !preflightTraining.prepared) throw Error("preparation_outcome_unconfirmed");
    if (!target && suggestedType && !readOnlyPreview && preflightTraining?.prepared !== false) {
      target = targetSchema.parse(await rpc("bind_type", { typeCode: code }));
    }
    if (target) {
      if (target.typeCode !== code) throw Error("source_changed");
      if (target.canApply) {
        working = { ...source, documentTypeId: target.documentTypeId, categoryId: target.categoryId, typeName: target.typeName, typeCode: target.typeCode, fields: target.fields, profile: target.profile, profileHash: target.profileHash };
        analyzed = await analyze(`analysis:${target.documentTypeId}`, working, [{ code: target.typeCode, name: target.typeName }]);
        if (analyzed.output.documentTypeCode && analyzed.output.documentTypeCode !== target.typeCode) throw Error("type_comparison_unresolved");
      }
    }
    let reviewed: ReturnType<typeof applySavedTrainingReview> | undefined;
    let cicpaReview: Awaited<ReturnType<typeof applySavedCicpaWording>> | undefined;
    let approvedSaved: { output: ModelPreparation; trusted?: NonNullable<Awaited<ReturnType<typeof applySavedCicpaWording>>["trusted"]> } | undefined;
    const checkCicpa = cicpaPreview && isCicpaPassType(working.typeCode);
    if (previewCompany === ALGT_DMS_PREVIEW_COMPANY) {
      if (checkCicpa && preflightTraining?.prepared !== false) {
        const original = await getPreviewOriginal();
        cicpaReview = await applySavedCicpaWording(working, analyzed.output,
          original ? { sha256: original.proof.sha256, mime: source.files[0].mime } : undefined);
      } else if (trainingCode) {
        const review = preflightTraining && !target?.canApply ? preflightTraining
          : await verifyTrainingOriginal(trainingCode, trainingInputs, trainingOutputFromPreparation(analyzed.output));
        if (target && !review.prepared) {
          // The target and completed stages remain recoverable under the original operation.
          throw Error("preparation_outcome_unconfirmed");
        }
        reviewed = applySavedTrainingReview(working, analyzed.output, review);
      }
      if (readOnlyPreview) {
        const original = await getPreviewOriginal();
        let approvedReview = await verifyApprovedProfile(original?.proof, code, source.typeCode, analyzed.output.fields);
        if (reviewed?.held && approvedReview.state === "verified") approvedReview = { state: "held", reason: "specialist_conflict" };
        const fields = mergeApprovedProfileFields(approvedReview, reviewed?.trusted?.fields ?? cicpaReview?.trusted?.fields,
          reviewed ? SPECIALIST_TRAINING_FIELDS : cicpaReview?.controlledKeys);
        const file = original ? source.files[0] : undefined;
        approvedSaved = {
          output: prepareSavedApprovedProfile(reviewed?.output ?? cicpaReview?.output ?? analyzed.output, approvedReview, fields),
          ...(file && Object.keys(fields).length ? { trusted: { sha256: file.sha256, fileId: file.id, fields } } : {}),
        };
      }
    }
    const candidate = buildPreparationCandidates(working, approvedSaved?.output ?? reviewed?.output ?? cicpaReview?.output ?? analyzed.output,
      approvedSaved ? approvedSaved.trusted : reviewed?.trusted ?? cicpaReview?.trusted);
    if (approvedSaved) candidate.values = candidate.values.filter(value =>
      value.key.startsWith("metadata:") || value.key === "issue_date" || value.key === "expiry_date",
    );
    if(catalogue.data.length>200)candidate.warnings.push("The registered catalogue exceeds the bounded classification limit. This review used the current type only; it does not claim an app-wide type search.");
    candidate.profileHash = context.source.profileHash;
    if (reviewed?.held) candidate.values = candidate.values.filter(value => value.key.startsWith("metadata:") && value.proposed === (value.current ?? ""));
    if (target) {
      const descriptor = {documentTypeId:target.documentTypeId,typeCode:target.typeCode,typeName:target.typeName,categoryId:target.categoryId,categoryName:target.categoryName,profileHash:target.profileHash,schemaHash:target.schemaHash,canApply:target.canApply,holdReason:target.holdReason};
      candidate.proposedType = descriptor;
      if (target.canApply) candidate.values.unshift({ key: "document_type_id", label: "Document type and registered category", current: String(source.documentTypeId), proposed: String(target.documentTypeId), evidence: [], confidence: null });
    } else if (!approvedSaved && !reviewed && code && code !== source.typeCode) candidate.warnings.push("The suggested type was not in the verified catalogue. The existing type is retained.");
    if (source.files.some(f => (f.text?.length ?? 0) > 24000)) candidate.warnings.push("Analysis used bounded source excerpts. Review the original for material outside those excerpts.");
    const receipt = z.strictObject({ success: z.literal(true), resultId: z.number().int().positive(), replayed: z.boolean() });
    const published = await traceSpan('dms.publish', async () => receipt.parse(await rpc("publish", { candidate,
      provenance: { provider: analyzed.provider, model: analyzed.model, configId: analyzed.configId, promptVersion: analyzed.promptVersion, schemaVersion: analyzed.schemaVersion, inputHash: analyzed.inputHash, promptTokens: analyzed.promptTokens, completionTokens: analyzed.completionTokens, durationMs: analyzed.durationMs },
      candidateText: working.files.map(f => f.text ?? "").join("\n\n").slice(0, 100000) }))).catch(() => null);
    if (!published) return { success: false, errorCode: "preparation_publication_unconfirmed", retryable: false };
    return { success: published.success, modelName: analyzed.model, providerCode: analyzed.provider, inputTokenCount: analyzed.promptTokens, outputTokenCount: analyzed.completionTokens };
  } catch (error) {
    // A retained uncertain stage needs reconciliation, not a fresh paid request.
    // The job's ordinary retry does not admit another model/OCR call.
    const code = error instanceof StructuredAiFailure ? error.code
      : error instanceof Error && safePreparationCodes.has(error.message) ? error.message
      : error instanceof z.ZodError ? "validation_error" : "unexpected";
    return { success: false, errorCode: code, safeMessage: `Preparation is held. Reference: ${code}. Accepted document data is unchanged.`, retryable: false };
  }
}
