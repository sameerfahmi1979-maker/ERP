import "server-only";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import type { DmsAiOutput, DmsExtractedField } from "@/lib/dms/ai/types";
import type { ModelPreparation, PreparationSnapshot } from "@/lib/dms/preparation/contracts";
import { PHASE2_CATALOG } from "@/lib/dms/phase2/catalog";
import { readH2sLayout } from "@/lib/dms/phase2/h2s-evidence";
import { readInductionLayout } from "@/lib/dms/phase2/induction-evidence";
import { verifyProviderOutput, type Evidence } from "@/lib/dms/phase2/provider-evidence";

const induction = "ADNOC_INDUCTION";
const h2s = "H2S_TRAINING_CERTIFICATE";
export type TrainingType = typeof induction | typeof h2s;
const isType = (code: string | null | undefined): code is TrainingType => code === induction || code === h2s;
export const ALGT_DMS_PREVIEW_COMPANY = 1;
export const trainingPreviewEnabled = () => process.env.DMS_ALGT_TRAINING_PROFILE_PREVIEW === "1";
export function trainingType(companyId: unknown, ...suggestions: (string | null | undefined)[]) {
  return trainingPreviewEnabled() && companyId === ALGT_DMS_PREVIEW_COMPANY ? suggestions.find(isType) : undefined;
}

const bounds = z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]);
const page = z.object({ page: z.literal(1), text: z.string().max(50000), method: z.string().max(80), region: z.string().max(80).optional(), bounds: bounds.optional() });
const scan = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/u), pageCount: z.number().int().nonnegative(),
  pages: z.array(page).max(1), regions: z.array(page).max(8) });
type TrainingSource = { bytes: Buffer; sha256: string; mime: string };
type TrainingReview = {
  prepared: boolean;
  profileId: string | null;
  fields: Record<string, Evidence>;
  reasons: string[];
};
const hold = (reason: string): TrainingReview => ({ prepared: false, profileId: null, fields: {}, reasons: [reason] });
let active = 0;

async function readTrainingOriginal(source: TrainingSource, code: TrainingType) {
  if (active >= 2) throw Error("training_reader_busy");
  active++;
  try {
    return await new Promise<z.infer<typeof scan>>((resolveScan, reject) => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
      for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA"]) {
        if (process.env[key]) env[key] = process.env[key];
      }
      const child = spawn(process.env.DMS_TRAINING_OCR_PYTHON || "python",
        ["-B", resolve(process.cwd(), "tooling/dms-phase2/read-training-original.py"), code],
        { env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
      let payload = "";
      const timer = setTimeout(() => { child.kill(); reject(Error("training_reader_timeout")); }, 55_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        payload += chunk;
        if (payload.length > 500_000) { clearTimeout(timer); child.kill(); reject(Error("training_reader_response_limit")); }
      });
      child.once("error", () => { clearTimeout(timer); reject(Error("training_reader_unavailable")); });
      child.stdin.on("error", () => { /* Process exit supplies the result. */ });
      child.once("close", status => {
        clearTimeout(timer);
        try {
          if (status !== 0) throw Error("training_reader_unavailable");
          resolveScan(scan.parse(JSON.parse(payload)));
        } catch { reject(Error("training_reader_invalid_response")); }
      });
      child.stdin.end(source.bytes);
    });
  } finally { active--; }
}

const aliases = {
  holder_name: "participant_name",
  issuing_authority: "provider",
  induction_date: "course_date",
  training_type: "course_title",
} as const;
const canonical = (field: string) => aliases[field as keyof typeof aliases] ?? field;

export async function verifyTrainingOriginal(code: TrainingType, sources: readonly TrainingSource[], output: DmsAiOutput): Promise<TrainingReview> {
  const [source] = sources;
  if (sources.length !== 1) return hold("training_multiple_originals");
  if (source.mime !== "application/pdf" || source.bytes.length > 12 * 1024 * 1024) return hold("training_original_format_or_size");
  const extracted = await readTrainingOriginal(source, code).catch(() => null);
  if (!extracted || extracted.sha256 !== source.sha256) return hold("training_original_evidence_unavailable");
  if (extracted.pageCount !== 1) return hold("training_layout_multi_page");
  if (extracted.pages.length !== 1) return hold("training_original_evidence_unavailable");
  const regions = code === h2s ? extracted.regions.filter(item => item.method === "tesseract-training-raster-ocr") : extracted.regions;
  const pages = [...extracted.pages, ...regions];
  const proof = code === h2s ? readH2sLayout(pages, code) : readInductionLayout(pages, code);
  if (!proof?.profileId) return { ...hold("training_layout_unconfirmed"), reasons: [...(proof?.reasons ?? ["training_layout_unconfirmed"])] };

  // A labelled course date that cannot be read is a review exception. Issue
  // and expiry captions never make the separate course date applicable.
  const courseDateUnverified = code === induction && !proof.fields.course_date &&
    pages.some(item => (!item.region || item.region === "physical-page") &&
      /^[ \t]*(?:Course Date|Held On|Date of Training|Attended Day\(s\))[ \t]*:[^\r\n]*\d/imu.test(item.text));
  const modelCode = output.classification.suggestedTypeCode;
  const fields = output.extraction.fields.map(field => ({ ...field, fieldCode: canonical(field.fieldCode) }));
  const comparison = { ...output, classification: { ...output.classification, suggestedTypeCode: modelCode ?? code },
    extraction: { ...output.extraction, fields } };
  const checked = verifyProviderOutput(comparison, extracted.pages.map(({ page, text, method }) => ({ page, text, method })),
    { profileId: null, fields: {}, reasons: [] }, { ...proof, limitToProofFields: true }, code);
  const dateRoleDisagreement = ([
    ["issue_date", output.extraction.issueDateSuggestion],
    ["expiry_date", output.extraction.expiryDateSuggestion],
  ] as const).some(([key, suggestion]) => suggestion && checked.fields[key]?.value !== suggestion);
  const reasons = [
    ...checked.reasons,
    ...(dateRoleDisagreement ? ["training_date_role_disagrees"] : []),
    ...(courseDateUnverified ? ["induction_printed_course_date_unverified"] : []),
  ];
  return { ...checked, prepared: checked.prepared && reasons.length === 0, reasons };
}

export function projectLegacyTrainingFields(review: Pick<TrainingReview, "profileId" | "fields">) {
  const fields = { ...review.fields };
  for (const [legacy, key] of Object.entries(aliases)) if (fields[key]) fields[legacy] = fields[key];
  if (review.profileId === "h2s-training" && fields.course_title) {
    fields.certificate_level = { ...fields.course_title, value: "Level 2" };
  }
  return fields;
}

export function trainingReviewNotice(review: TrainingReview) {
  if (review.prepared) return "Verified from the original training certificate. Officer review is required.";
  return "Training credential held for source review (" + review.reasons.join(", ") + ").";
}

export function applyIntakeTrainingReview(output: DmsAiOutput, review: TrainingReview) {
  const fields = review.prepared ? projectLegacyTrainingFields(review) : {};
  const suggestions = Object.entries(fields).map(([fieldCode, field]): DmsExtractedField => ({
    fieldCode, value: field.value, confidenceScore: 1, confidenceLabel: "high", sourceSnippet: field.raw,
  }));
  const warnings = [...(output.warnings ?? []), trainingReviewNotice(review)];
  return {
    evidence: fields,
    output: { ...output, rawResponse: undefined, warnings,
      classification: { ...output.classification, ...(review.prepared ? {} : {
        suggestedTypeCode: null, suggestedTypeId: null, confidenceLabel: "needs_manual_review" as const, confidenceScore: 0,
        needsHumanReview: true, reason: trainingReviewNotice(review), reviewReason: trainingReviewNotice(review),
      }) },
      extraction: { ...output.extraction, fields: suggestions, additionalFields: [],
        issueDateSuggestion: fields.issue_date?.value ?? null, expiryDateSuggestion: fields.expiry_date?.value ?? null,
        ...(review.prepared ? {} : { suggestedTitle: null, suggestedDescription: null }),
      },
      ...(!review.prepared && { suggestedLinks: [], detectedEntities: [], preparation: undefined }),
    } satisfies DmsAiOutput,
  };
}

export function trainingOutputFromPreparation(output: ModelPreparation): DmsAiOutput {
  const bundle = output.bundle;
  return {
    classification: { suggestedTypeCode: output.documentTypeCode, suggestedTypeId: null, confidenceScore: 0,
      confidenceLabel: "needs_manual_review", reason: "", needsHumanReview: bundle !== "single" },
    extraction: { fields: output.fields.flatMap(field => field.value ? [{
      fieldCode: field.code, value: field.value, confidenceLabel: "high", confidenceScore: field.confidence, sourceSnippet: field.snippet,
    }] : []), additionalFields: [], suggestedTitle: output.title, suggestedDescription: output.description, issueDateSuggestion: output.issueDate,
      expiryDateSuggestion: output.expiryDate, fullTextTranscription: null },
    suggestedLinks: [], detectedEntities: [], warnings: output.warnings,
  };
}

export function applySavedTrainingReview(source: PreparationSnapshot, output: ModelPreparation, review: TrainingReview) {
  const fields = review.prepared ? projectLegacyTrainingFields(review) : {};
  const definitions = new Set(source.fields.map(field => field.code));
  const file = source.files[0];
  const missing = PHASE2_CATALOG.profiles.find(profile => profile.id === review.profileId)?.fields
    .filter(rule => rule.required && fields[rule.key] && !definitions.has(rule.key) &&
      !Object.entries(aliases).some(([key, value]) => value === rule.key && definitions.has(key)) &&
      rule.key !== "issue_date" && rule.key !== "expiry_date").map(rule => rule.key) ?? [];
  const requiredWithoutEvidence = review.prepared ? source.fields.filter(field => field.required && !field.current && !fields[field.code]).map(field => field.code) : [];
  return {
    held: !review.prepared,
    trusted: { fields, sha256: file.sha256, fileId: file.id },
    output: { ...output, fields: [],
      issueDate: fields.issue_date?.value ?? null, expiryDate: fields.expiry_date?.value ?? null,
      ...(review.prepared ? {} : { documentTypeCode: null, title: null, description: null, summary: null, tagNames: [] }),
      warnings: [...output.warnings.slice(0, 27), trainingReviewNotice(review),
        ...(missing.length ? ["Verified fields without a registered metadata definition: " + missing.join(", ") + "."] : []),
        ...(requiredWithoutEvidence.length ? ["Required registered fields without source evidence: " + requiredWithoutEvidence.join(", ") + "."] : [])],
    } satisfies ModelPreparation,
  };
}
