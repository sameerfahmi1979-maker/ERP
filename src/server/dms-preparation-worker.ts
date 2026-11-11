import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentJobClaim } from "@/lib/dms/ai-jobs/claim-scope";
import { preparationSnapshotSchema, modelPreparationSchema } from "@/lib/dms/preparation/contracts";
import { runPreparationStage } from "@/lib/dms/preparation/stages";
import { buildPreparationCandidates, preparationPrompt, isPortraitPreparation } from "@/lib/dms/preparation/candidates";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { readVerifiedIntakeSource } from "@/server/dms-verified-intake-source";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { routeOcr } from "@/lib/dms/ocr/ocr-router";
import { preparationResponseSchema } from "@/lib/dms/preparation/response-schema";
import { StructuredAiFailure, structuredFailureCodes } from "@/lib/dms/ai/structured-failure";
import type { DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
const analysisReceipt = z.strictObject({ output: modelPreparationSchema, provider: z.string(), model: z.string().nullable(), configId: z.number().int().positive().nullable(),
  promptVersion: z.literal("dms-preparation/1"), schemaVersion: z.literal("dms-preparation/1"), inputHash: z.string().regex(/^[a-f0-9]{64}$/), promptTokens: z.number().int().nonnegative().nullable(), completionTokens: z.number().int().nonnegative().nullable(), durationMs: z.number().nonnegative() });
// Preserve received output before parsing or quality validation. Legacy validated receipts remain replayable.
const receivedAnalysisReceipt = analysisReceipt.omit({ output: true }).extend({
  receiptVersion: z.literal(2), rawJson: z.string().max(131072),
  responseIssue: z.enum(["provider_refusal", "provider_output_incomplete", "provider_output_invalid"]).optional(),
});
const storedAnalysisReceipt = z.union([analysisReceipt, receivedAnalysisReceipt]);
const safePreparationCodes = new Set<string>([...structuredFailureCodes, "quality_evaluation_held", "preparation_outcome_unconfirmed", "source_changed", "database_error"]);
const ocrReceipt = z.strictObject({ text: z.string().max(100000), provider: z.string(), model: z.string().nullable(), method: z.string(), pageCount: z.number().int().positive().nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const targetSchema = z.strictObject({ documentTypeId: z.number().int().positive(), typeCode: z.string(), typeName: z.string(), categoryId: z.number().int().positive(), categoryName: z.string().nullable(),
  profile: preparationSnapshotSchema.shape.profile, profileHash: preparationSnapshotSchema.shape.profileHash, schemaHash: preparationSnapshotSchema.shape.profileHash, fields: preparationSnapshotSchema.shape.fields, canApply: z.boolean(), holdReason: z.string().nullable() });

/** Returns null only for a verified legacy job, preserving its existing handler. */
export async function runDocumentPreparationJob(documentId: number): Promise<DmsAiJobHandlerResult | null> {
  const claim = currentJobClaim();
  if (!claim) return { success: false, errorCode: "auth_error", retryable: false };
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
        state: z.string(), resultId: z.number().int().positive().nullable(),
      }).passthrough() }),
    ]).parse(await rpc("context"));
    if (!read.preparation) return null;
    const context = read.context;
    if (context.source.documentId !== documentId) return { success: false, errorCode: "source_changed", retryable: false };
    if (context.resultId) return { success: true };
    const source = { ...context.source, files: context.source.files.filter(f => context.fileIds.includes(f.id)).map(f => ({ ...f })) };
    if (source.files.length !== context.fileIds.length) throw Error("selected_source_unavailable");
    const portrait = isPortraitPreparation(source);
    if (!portrait && context.mode === "reread_files") {
      // Read actual configured flags; a failed read must not enable a provider.
      const flags = await db.from("erp_ai_feature_flags").select("feature_code,is_enabled")
        .in("feature_code", ["DMS_OCR", "DMS_OCR_ROUTER", "DMS_OCR_GPT_VISION_FALLBACK"]);
      if (flags.error) throw Error("ocr_configuration_unavailable");
      const enabled = new Map((flags.data ?? []).map(f => [f.feature_code, f.is_enabled]));
      if (!enabled.get("DMS_OCR") || !enabled.get("DMS_OCR_ROUTER")) throw Error("ocr_not_enabled");
      const { provider } = await getDmsAiProvider("ocr");
      for (const file of source.files) {
        const extracted = await runPreparationStage(rpc, `ocr:${file.id}`, ocrReceipt, async () => {
          if (!file.bucket || !file.path) throw Error("source_location_unavailable");
          const verified = await readVerifiedIntakeSource(db.storage.from(file.bucket), { path: file.path, name: file.name, mime: file.mime, size: file.size, sha256: file.sha256 });
          // Candidate-only extraction; never call the old accepted-OCR writer.
          const result = await routeOcr({ buffer: verified.bytes, mimeType: file.mime, fileName: file.name,
            featureFlags: { dmsOcr: true, dmsOcrRouter: true, dmsOcrAzure: false, dmsOcrGptVisionFallback: enabled.get("DMS_OCR_GPT_VISION_FALLBACK") === true },
            azureProvider: null, gptProvider: provider, forceVision: false });
          if (!result.text.trim()) throw Error("source_text_unavailable");
          return { text: result.text.slice(0, 100000), provider: result.providerCode, model: result.model, method: result.method, pageCount: result.pageCount ?? null, sha256: verified.proof.sha256 };
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
      const result = await callCommonAiStructuredCompletion(prompt.system, prompt.user, { maxTokens: 6000, temperature: 0, selectedProvider:selected, responseSchema: preparationResponseSchema });
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
    let target: z.infer<typeof targetSchema> | null = null;
    const code = analyzed.output.documentTypeCode;
    if (code && code !== source.typeCode && types.some(t => t.code === code)) {
      target = targetSchema.parse(await rpc("bind_type", { typeCode: code }));
      if (target.canApply) {
        working = { ...source, documentTypeId: target.documentTypeId, categoryId: target.categoryId, typeName: target.typeName, typeCode: target.typeCode, fields: target.fields, profile: target.profile, profileHash: target.profileHash };
        analyzed = await analyze(`analysis:${target.documentTypeId}`, working, [{ code: target.typeCode, name: target.typeName }]);
        if (analyzed.output.documentTypeCode && analyzed.output.documentTypeCode !== target.typeCode) throw Error("type_comparison_unresolved");
      }
    }
    const candidate = buildPreparationCandidates(working, analyzed.output);
    if(catalogue.data.length>200)candidate.warnings.push("The registered catalogue exceeds the bounded classification limit. This review used the current type only; it does not claim an app-wide type search.");
    candidate.profileHash = context.source.profileHash;
    if (target) {
      const descriptor = {documentTypeId:target.documentTypeId,typeCode:target.typeCode,typeName:target.typeName,categoryId:target.categoryId,categoryName:target.categoryName,profileHash:target.profileHash,schemaHash:target.schemaHash,canApply:target.canApply,holdReason:target.holdReason};
      candidate.proposedType = descriptor;
      if (target.canApply) candidate.values.unshift({ key: "document_type_id", label: "Document type and registered category", current: String(source.documentTypeId), proposed: String(target.documentTypeId), evidence: [], confidence: null });
    } else if (code && code !== source.typeCode) candidate.warnings.push("The suggested type was not in the verified catalogue. The existing type is retained.");
    if (source.files.some(f => (f.text?.length ?? 0) > 24000)) candidate.warnings.push("Analysis used bounded source excerpts. Review the original for material outside those excerpts.");
    const published = z.object({ success: z.literal(true), resultId: z.number().int().positive(), replayed: z.boolean() }).strict().parse(await rpc("publish", { candidate,
      provenance: { provider: analyzed.provider, model: analyzed.model, configId: analyzed.configId, promptVersion: analyzed.promptVersion, schemaVersion: analyzed.schemaVersion, inputHash: analyzed.inputHash, promptTokens: analyzed.promptTokens, completionTokens: analyzed.completionTokens, durationMs: analyzed.durationMs },
      candidateText: working.files.map(f => f.text ?? "").join("\n\n").slice(0, 100000) }));
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
