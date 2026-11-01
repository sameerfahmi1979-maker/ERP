/**
 * OFFICIAL DOCS.1 — Code-based official document registry.
 *
 * All official letter/form definitions are registered here. The registry
 * enforces the governance invariant that a definition can only be `published`
 * when every supported language has VERIFIED wording evidence — incomplete
 * wording can never be published (Gate 1).
 */

import { z } from "zod";
import {bilingualReviewDraft} from './definitions/hr/review-drafts';
import type {
  OfficialDocumentDefinition,
  OfficialDocumentLanguage,
} from "./types";
import {
  employmentCertificateDefinition,
  employmentConfirmationDefinition,
  experienceCertificateDefinition,
} from "./definitions/hr/employment";
import {
  salaryCertificateGeneralDefinition,
  salaryCertificateWithAmountDefinition,
} from "./definitions/hr/salary";
import { nocDefinition, warningLetterDefinition } from "./definitions/hr/noc-warning";
import {
  bankSalaryTransferLetterDefinition,
  clearanceFormDefinition,
  embassyLetterDefinition,
  handoverFormDefinition,
  joiningChecklistDefinition,
  leaveConfirmationDefinition,
  ppeIssueFormDefinition,
} from "./definitions/hr/forms";

const ALL_DEFINITIONS: OfficialDocumentDefinition[] = [
  // Published — verified wording
  employmentCertificateDefinition,
  employmentConfirmationDefinition,
  experienceCertificateDefinition,
  salaryCertificateWithAmountDefinition,
  salaryCertificateGeneralDefinition,
  nocDefinition,
  warningLetterDefinition,
  clearanceFormDefinition,
  joiningChecklistDefinition,
  ppeIssueFormDefinition,
  // Disabled pending approved wording
  bankSalaryTransferLetterDefinition,
  embassyLetterDefinition,
  handoverFormDefinition,
  leaveConfirmationDefinition,
].map(def=>def.documentCode==='HR_EMPLOYMENT_CONFIRMATION'?def:bilingualReviewDraft(def));

export const OFFICIAL_DOCUMENT_DEFINITIONS: ReadonlyMap<string, OfficialDocumentDefinition> =
  new Map(ALL_DEFINITIONS.map((d) => [d.documentCode, d]));

export function getOfficialDocumentDefinition(
  documentCode: string
): OfficialDocumentDefinition | null {
  return OFFICIAL_DOCUMENT_DEFINITIONS.get(documentCode) ?? null;
}

export function listOfficialDocumentDefinitions(): OfficialDocumentDefinition[] {
  return [...ALL_DEFINITIONS];
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance validation — incomplete wording can never be published
// ─────────────────────────────────────────────────────────────────────────────

const VERIFIED_STATUSES = new Set(["verified_code", "verified_migration", "verified_prompt"]);

/** Returns a list of governance violations (empty = valid). */
export function validateOfficialDocumentDefinition(def: OfficialDocumentDefinition): string[] {
  const errors: string[] = [];
  const code = def.documentCode;

  if (!/^[A-Z0-9_]+$/.test(code)) errors.push(`${code}: document code must be UPPER_SNAKE_CASE.`);

  if (def.status === "published") {
    if (def.supportedLanguages.length === 0) {
      errors.push(`${code}: published definitions must support at least one language.`);
    }
    if (def.version < 1) {
      errors.push(`${code}: published definitions must have version >= 1.`);
    }
    const needsEnglish =
      def.supportedLanguages.includes("en") || def.supportedLanguages.includes("bilingual");
    const needsArabic =
      def.supportedLanguages.includes("ar") || def.supportedLanguages.includes("bilingual");
    if (needsEnglish && !VERIFIED_STATUSES.has(def.wording.en.provenance)) {
      errors.push(`${code}: cannot publish — English wording is not verified (${def.wording.en.provenance}).`);
    }
    if (needsArabic && (!def.wording.ar || !VERIFIED_STATUSES.has(def.wording.ar.provenance))) {
      errors.push(`${code}: cannot publish — Arabic wording is not verified.`);
    }
    if (def.supportedLanguages.includes("bilingual") && !def.bilingualLayoutType) {
      errors.push(`${code}: bilingual support requires an approved bilingualLayoutType.`);
    }
  }

  if(def.status==='draft'){
    if(def.version<1||!def.supportedLanguages.length)errors.push(`${code}: complete drafts require a version and languages.`);
    if(def.supportedLanguages.includes('bilingual')&&!def.bilingualLayoutType)errors.push(`${code}: bilingual drafts require a layout strategy.`);
    if(!def.wording.en.source.trim()||(def.supportedLanguages.some(language=>language==='ar'||language==='bilingual')&&!def.wording.ar?.source.trim()))errors.push(`${code}: draft wording sources must be recorded.`);
  }

  if (def.status === "disabled_pending_wording" && def.supportedLanguages.length > 0) {
    errors.push(`${code}: disabled_pending_wording definitions must not advertise supported languages.`);
  }

  for (const input of def.optionalInputs) {
    if (!/^[a-z0-9_]+$/.test(input.key)) errors.push(`${code}: input key '${input.key}' must be snake_case.`);
    if (input.maxLength <= 0 || input.maxLength > 500)
      errors.push(`${code}: input '${input.key}' maxLength must be 1–500.`);
  }

  return errors;
}

/** Validate the whole registry. Used by unit tests and the coordinator boot path. */
export function validateOfficialDocumentRegistry(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of ALL_DEFINITIONS) {
    if (seen.has(def.documentCode)) errors.push(`Duplicate document code: ${def.documentCode}`);
    seen.add(def.documentCode);
    errors.push(...validateOfficialDocumentDefinition(def));
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation-time helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True when the definition may be generated at all. */
export function isGeneratable(def: OfficialDocumentDefinition): boolean {
  return !def.wordingReviewOnly && def.status === "published" && validateOfficialDocumentDefinition(def).length === 0;
}

/** Draft preview is not official issuance or evidence of business approval. */
export function isPreviewable(def:OfficialDocumentDefinition):boolean{
  return ['draft','published'].includes(def.status)&&validateOfficialDocumentDefinition(def).length===0;
}

/** True when the definition supports the requested language variant. */
export function supportsLanguage(
  def: OfficialDocumentDefinition,
  language: OfficialDocumentLanguage
): boolean {
  return def.supportedLanguages.includes(language);
}

/** Build a strict Zod schema for the definition's optional user inputs. */
export function buildInputsSchema(def: OfficialDocumentDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const input of def.optionalInputs) {
    // Plain printable text only — no control chars; trimmed server-side.
    const field = z
      .string()
      .trim()
      .max(input.maxLength)
      .regex(/^[^\u0000-\u001F\u007F]*$/, "Contains invalid control characters");
    const dated = input.type === 'date' ? field.refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value), `Choose a valid ${input.labelEn}.`) : field;
    const checked = input.choices ? dated.refine(value => input.choices!.some(choice => choice.value === value), `Choose a valid ${input.labelEn}.`) : dated;
    shape[input.key] = input.required
      ? checked.refine(value => value.length > 0, `${input.labelEn} is required.`)
      : checked.optional().default(input.defaultValue ?? "");
  }
  return z.object(shape).strict();
}

/**
 * Validate that every required source field is present and non-empty.
 * Returns the FIRST precise missing-data message (Section 6.4 UX contract).
 */
export function findMissingDataError(
  def: OfficialDocumentDefinition,
  row: Record<string, unknown>
): string | null {
  const errors = findMissingDataErrors(def, row);
  return errors.length ? errors.join("\n") : null;
}

/** All missing fields in one response, so users can correct a record once. */
export function findMissingDataErrors(
  def: OfficialDocumentDefinition,
  row: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  for (const field of def.requiredSourceFields) {
    const v = row[field];
    const empty =
      v === null ||
      v === undefined ||
      (typeof v === "string" && v.trim() === "") ||
      (typeof v === "number" && !Number.isFinite(v)) ||
      (field.includes("salary") && (!Number.isFinite(Number(v)) || Number(v) <= 0));
    if (empty) {
      errors.push(
        def.missingFieldMessages?.[field] ??
        `${def.titleEn} cannot be generated because required data '${field.replace(/_/g, " ")}' is missing on the employee record.`
      );
    }
  }
  return errors;
}
