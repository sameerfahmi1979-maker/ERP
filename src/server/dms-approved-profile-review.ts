import "server-only";
import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import { z } from "zod";
import { PHASE2_CATALOG } from "@/lib/dms/phase2/catalog";
import type { Evidence } from "@/lib/dms/phase2/provider-evidence";
import type { DmsAiOutput, DmsExtractedField } from "@/lib/dms/ai/types";
import type { ModelPreparation } from "@/lib/dms/preparation/contracts";
import { ALGT_DMS_PREVIEW_COMPANY, projectLegacyTrainingFields } from "@/server/dms-training-profile-review";

export const APPROVED_PROFILE_CATALOG_VERSION = "phase2-hr.1.2.0";
const approvedProfileIds = new Set([
  "emirates-id", "foreign-national-id", "uae-employment-entry", "uae-visit-entry",
  "uae-residence-cancellation", "work-permit", "job-offer", "cv", "salary-certificate",
  "sick-leave-certificate", "payment-receipt", "h2s-training", "firefighting-training",
  "first-aid-aed-cpr", "onshore-induction", "offshore-induction", "t-bosiet", "other-safety-training",
  "defensive-driving", "equipment-competency", "cicpa-onshore", "bank-iban-certificate",
  "h2s-training-opito-basic", "basic-first-aid-training",
]);
const catalogue = new Map([...PHASE2_CATALOG.profiles, ...PHASE2_CATALOG.variants]
  .filter(profile => approvedProfileIds.has(profile.id))
  .map(profile => [profile.id, profile]));
const limit = 8 * 1024 * 1024;
const fieldCode = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/u);
const bound = z.number().min(0);
const rectangle = z.tuple([bound, bound, bound, bound]).refine(([x1, y1, x2, y2]) => x2 > x1 && y2 > y1);
const text = z.string().min(1).max(2000).refine(value => value.trim().length > 0);
const fieldSchema = z.object({
  code: fieldCode, value: text, raw: text, page: z.number().int().positive(),
  label: z.string().max(150).nullish(), region: z.string().max(100).nullish(),
  side: z.string().max(20).nullish(), method: z.string().max(160).nullish(), bounds: rectangle.nullish(),
});
const safeId = z.string().min(1).max(160);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const originalSchema = z.object({ sha256: sha256Schema, size: z.number().int().min(1).max(52428800), mime: z.string().min(1).max(160) });
const witnessSchema = z.object({
  sourceSha256: sha256Schema, sourceId: safeId, size: z.number().int().min(1).max(52428800), mime: z.string().min(1).max(160),
  profileId: safeId, typeCode: z.string().min(1).max(100), pageCount: z.number().int().min(1).max(100000),
  fields: z.array(fieldSchema).min(1).max(120), mixedPacket: z.boolean().optional(),
  credentialDecision: z.object({
    status: z.literal("prepared-review"), approvedFor: z.literal("local-validation"), liveAuthorization: z.literal("none"),
    officerReviewRequired: z.literal(true), issues: z.array(z.unknown()).max(0),
    unverifiedOptionalCodes: z.array(fieldCode).max(120), requiredFieldCount: z.number().int().min(0).max(120),
  }),
});
const registrySchema = z.object({
  version: z.literal(1), catalogVersion: z.literal(APPROVED_PROFILE_CATALOG_VERSION),
  approvedProfileIds: z.array(safeId).max(approvedProfileIds.size).optional(),
  witnesses: z.array(z.unknown()).max(1000),
});
const recordKey = z.object({ sourceSha256: sha256Schema });
const date = z.iso.date();

type Original = z.infer<typeof originalSchema>;
type ReportedFields = readonly { code: string; value: string | null }[];
type Witness = z.infer<typeof witnessSchema>;
type HeldReason = "registry_unavailable" | "witness_missing" | "witness_conflict" | "source_mismatch"
  | "type_conflict" | "issuer_conflict" | "profile_unapproved" | "witness_invalid" | "specialist_conflict" | "type_unavailable";
type ApprovalResult =
  | { state: "verified"; profileId: string; typeCode: string; fields: Record<string, Evidence> }
  | { state: "held"; reason: HeldReason };
const held = (reason: HeldReason): ApprovalResult => ({ state: "held", reason });
export const approvedProfilePreviewConfigured = () => !!process.env.DMS_ALGT_APPROVED_PROFILE_PREVIEW_FILE;
export const approvedProfilePreviewEnabled = (companyId: unknown) => companyId === ALGT_DMS_PREVIEW_COMPANY && approvedProfilePreviewConfigured();

function isBelow(root: string, path: string) {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child);
}

async function readRegistry() {
  const path = process.env.DMS_ALGT_APPROVED_PROFILE_PREVIEW_FILE;
  const digest = sha256Schema.safeParse(process.env.DMS_ALGT_APPROVED_PROFILE_PREVIEW_SHA256);
  if (!path || !isAbsolute(path) || !digest.success) return null;
  const root = process.cwd();
  if (!isBelow(root, path)) return null;
  const localPath = await realpath(path);
  if (!isBelow(await realpath(root), localPath)) return null;
  const file = await open(localPath, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > limit) return null;
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const read = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size || createHash("sha256").update(buffer.subarray(0, offset)).digest("hex") !== digest.data) return null;
    const after = await file.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) return null;
    const parsed = registrySchema.parse(JSON.parse(buffer.toString("utf8", 0, offset)));
    if (parsed.approvedProfileIds?.some(id => !approvedProfileIds.has(id))) return null;
    return parsed;
  } finally {
    await file.close();
  }
}

function stableWitnessKey(witness: Witness) {
  const { profileId, typeCode, size, mime, pageCount, fields, mixedPacket, credentialDecision } = witness;
  return JSON.stringify([profileId, typeCode, size, mime, pageCount, [...fields].sort((a, b) => a.code.localeCompare(b.code)), mixedPacket ?? false, credentialDecision ?? null]);
}

function assertedType(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase();
  const aliases: Record<string, string> = PHASE2_CATALOG.legacyTypeAliases;
  return normalized && (aliases[normalized] ?? normalized);
}

function normalizeIssuer(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

const issuerCodes = new Set(["issuer", "issuer_country", "issuing_country", "issuance_country", "provider", "issuing_authority", "awarding_body", "employer", "employer_name", "company_name"]);
const fieldAliases: Record<string, string> = PHASE2_CATALOG.legacyFieldAliases;
type PrintedAlias = readonly [legacy: string, canonical: string, caption: RegExp];
const opitoHolderAliases: readonly PrintedAlias[] = [
  ["holder_name", "participant_name", /^this is to certify that$/u],
];
const printedAliasesByProfile: Partial<Record<string, readonly PrintedAlias[]>> = {
  "emirates-id": [["full_name_en", "holder_name", /^name(?: \(matched reverse mrz\))?$/u]],
  "uae-employment-entry": [["visa_holder_name", "holder_name", /^full name$/u]],
  "uae-visit-entry": [["visa_holder_name", "holder_name", /^full name$/u]],
  "work-permit": [
    ["full_name_en", "holder_name", /^person name$/u],
    ["labour_card_number", "work_permit_reference", /^card number$/u],
    ["expiry_date", "permit_expires_on", /^card expiry date$/u],
  ],
  "job-offer": [
    ["candidate_full_name", "candidate_name", /^second party \/ name$/u],
    ["position_title", "job_title", /^second party \/ profession of$/u],
    ["company_name", "employer", /^first party \/ establishment name$/u],
  ],
  "salary-certificate": [
    ["employer_name", "employer", /^certifying employer$/u],
    ["issue_date", "certificate_date", /^date$/u],
  ],
  "bank-iban-certificate": [
    ["account_holder_name", "account_holder", /^certifying declaration \/ maintains an account$/u],
    ["bank_name", "issuer", /^certifying bank$/u],
    ["certificate_issue_date", "issue_date", /^date$/u],
  ],
  "t-bosiet": opitoHolderAliases,
  "h2s-training-opito-basic": opitoHolderAliases,
};

export async function verifyApprovedProfile(
  original: Original | undefined,
  suggestedTypeCode: string | null,
  currentTypeCode?: string | null,
  reportedFields: ReportedFields = [],
): Promise<ApprovalResult> {
  if (!originalSchema.safeParse(original).success || !original) return held("source_mismatch");
  const registry = await readRegistry().catch(() => null);
  if (!registry) return held("registry_unavailable");

  const entries = registry.witnesses.filter(row => recordKey.safeParse(row).data?.sourceSha256 === original.sha256);
  if (!entries.length) return held("witness_missing");
  const parsed = z.array(witnessSchema).safeParse(entries);
  if (!parsed.success) return held("witness_invalid");
  const [witness] = parsed.data;
  const comparison = stableWitnessKey(witness);
  if (parsed.data.some(copy => stableWitnessKey(copy) !== comparison)) return held("witness_conflict");

  if (witness.size !== original.size || witness.mime !== original.mime) return held("source_mismatch");
  const profile = catalogue.get(witness.profileId);
  if (!profile || (registry.approvedProfileIds && !registry.approvedProfileIds.includes(witness.profileId))) return held("profile_unapproved");
  if (witness.typeCode !== profile.typeCode ||
    [suggestedTypeCode, currentTypeCode].map(assertedType).some(code => code && code !== profile.typeCode)) return held("type_conflict");
  if (witness.mixedPacket || witness.credentialDecision.requiredFieldCount !== profile.fields.filter(rule => rule.required).length) return held("witness_invalid");

  const rules = new Map(profile.fields.map(rule => [rule.key, rule]));
  const fields: Record<string, Evidence> = Object.create(null);
  for (const field of witness.fields) {
    const rule = rules.get(field.code);
    if (field.page > witness.pageCount || fields[field.code]) return held("witness_invalid");
    if (!rule) continue;
    if (rule.type === "date" && !date.safeParse(field.value).success) return held("witness_invalid");
    fields[field.code] = { value: field.value, raw: field.raw, page: field.page, label: field.label ?? field.code,
      region: field.region ?? undefined, side: field.side ?? undefined, method: field.method ?? "reviewed-profile-receipt", bounds: field.bounds ?? undefined };
  }
  if (!Object.keys(fields).length || profile.fields.some(rule => rule.required && !fields[rule.key])) return held("witness_invalid");

  for (const report of reportedFields) {
    const code = fieldAliases[report.code] ?? report.code;
    const evidence = fields[code];
    if (!issuerCodes.has(code) || !report.value?.trim() || !evidence) continue;
    const value = normalizeIssuer(report.value);
    const acceptedPakistanTitle = profile.id === "foreign-national-id" && code === "issuer_country"
      && evidence.value === "PK" && normalizeIssuer(evidence.raw ?? "") === "pakistan"
      && value === "islamic republic of pakistan";
    const acceptedEmiratesTitle = profile.id === "emirates-id" && code === "issuer_country"
      && evidence.value === "AE" && normalizeIssuer(evidence.raw ?? "") === "ilare"
      && rules.get(code)?.labels.some(label => normalizeIssuer(label) === value);
    if (!acceptedPakistanTitle && !acceptedEmiratesTitle && value !== normalizeIssuer(evidence.value)
      && value !== normalizeIssuer(evidence.raw ?? "")) return held("issuer_conflict");
  }
  return { state: "verified", profileId: profile.id, typeCode: profile.typeCode, fields };
}

export function retainSpecialistProof(review: ApprovalResult) {
  return review.state === "verified" || review.reason === "witness_missing";
}

export const SPECIALIST_TRAINING_FIELDS = ["issue_date", "expiry_date", "course_date", "induction_date", "award_date", "printed_outcome"] as const;

export function mergeApprovedProfileFields(
  review: ApprovalResult,
  specialist: Record<string, Evidence> | undefined,
  specialistControlledKeys: readonly string[] = [],
): Record<string, Evidence> {
  const fields: Record<string, Evidence> = Object.create(null);
  if (review.state === "verified") {
    for (const [code, value] of Object.entries(review.fields)) {
      if (!specialistControlledKeys.includes(code)) fields[code] = value;
    }
    if (["onshore-induction", "offshore-induction", "h2s-training"].includes(review.profileId)) {
      Object.assign(fields, projectLegacyTrainingFields({ profileId: review.profileId, fields }));
    }
    if (review.typeCode === "CICPA_PASS" && fields.issuing_authority) {
      fields.printed_issuing_authority = fields.issuing_authority;
    }
    for (const [alias, canonical, caption] of printedAliasesByProfile[review.profileId] ?? []) {
      const evidence = fields[canonical];
      if (!evidence || !caption.test(normalizeIssuer(evidence.label))) continue;
      if (alias === "full_name_en" && !/^\p{Script=Latin}[\p{Script=Latin}\p{Mark} .’'\p{Dash_Punctuation}]*$/u.test(evidence.value)) continue;
      fields[alias] ??= evidence;
    }
    for (const [legacy, canonical] of Object.entries(fieldAliases)) {
      if (fields[canonical]) fields[legacy] = fields[canonical];
    }
  }
  return retainSpecialistProof(review) ? Object.assign(fields, specialist) : fields;
}

export function approvedProfileMissingRequiredFields(review: ApprovalResult, fields: Record<string, Evidence>) {
  if (review.state !== "verified") return [];
  return catalogue.get(review.profileId)?.fields.filter(rule => rule.required && !fields[rule.key]).map(rule => rule.key) ?? [];
}

export function approvedProfileNotice(review: ApprovalResult, fields: Record<string, Evidence>) {
  const missing = approvedProfileMissingRequiredFields(review, fields);
  if (missing.length) return "Approved HR profile evidence is partial. Officer review required for: " + missing.join(", ") + ".";
  return review.state === "verified"
    ? "Approved HR profile evidence verified against the exact original. Officer review is required."
    : "Approved HR profile held for officer review. Reason: " + review.reason + ".";
}

export function applyIntakeApprovedProfile(output: DmsAiOutput, review: ApprovalResult, fields: Record<string, Evidence>,
  suggestedType: { code: string; id: number } | null): DmsAiOutput {
  const reason = approvedProfileNotice(review, fields);
  return {
    ...output, rawResponse: undefined, preparation: undefined, suggestedLinks: [], detectedEntities: [],
    warnings: [...(output.warnings ?? []), reason],
    classification: {
      ...output.classification, suggestedTypeCode: suggestedType?.code ?? null, suggestedTypeId: suggestedType?.id ?? null,
      confidenceScore: suggestedType ? output.classification.confidenceScore : 0,
      confidenceLabel: suggestedType ? output.classification.confidenceLabel : "needs_manual_review",
      needsHumanReview: true, reason,
    },
    extraction: {
      ...output.extraction, additionalFields: [], suggestedTitle: null, suggestedDescription: null,
      issueDateSuggestion: fields.issue_date?.value ?? null, expiryDateSuggestion: fields.expiry_date?.value ?? null,
      fields: Object.entries(fields).map(([fieldCode, evidence]) => ({
        fieldCode, value: evidence.value, sourceSnippet: evidence.raw, confidenceLabel: "high", confidenceScore: 1,
      } satisfies DmsExtractedField)),
    },
  };
}

export function prepareSavedApprovedProfile(output: ModelPreparation, review: ApprovalResult, fields: Record<string, Evidence>): ModelPreparation {
  return {
    ...output, documentTypeCode: null, title: null, description: null, summary: null, tagNames: [], fields: [],
    issueDate: fields.issue_date?.value ?? null, expiryDate: fields.expiry_date?.value ?? null,
    warnings: [...output.warnings.slice(0, 29), approvedProfileNotice(review, fields)],
  };
}
