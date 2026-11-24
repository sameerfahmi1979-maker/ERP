import type { SourcePage } from "./batch";
import type { Evidence, SourceLayoutProof } from "./provider-evidence";
import { readTrainingLayout } from "./training-evidence";

type H2sPage = Pick<SourcePage, "page" | "text" | "method" | "bounds"> & { region?: string };

const profileId = "h2s-training";
const rasterMethod = "tesseract-training-raster-ocr";
const course = /^[ \t]*H[2₂]S Training Level 2[ \t]*$/imu;
const completion = /^has attended and completed$/iu;
const academy = /^ADNOC Technical Academy$/iu;
const conflictingOutcome = /\b(?:certificate of attendance|attendance only|successfully passed an assessment|has been assessed|assessment of competence)\b/iu;
const academyRegions = new Set(["h2s-heading", "h2s-provider", "h2s-outcome"]);
const labelledFields = ["participant_name", "certificate_number", "issue_date", "expiry_date"] as const;
const fold = (text: string) => text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

function validBounds(bounds?: SourcePage["bounds"]) {
  return !!bounds && bounds.length === 4 && bounds.every(x => Number.isFinite(x) && x >= 0)
    && bounds[0] < bounds[2] && bounds[1] < bounds[3];
}

function rasterEvidence(page: H2sPage, pattern: RegExp, value: string, label: string): Evidence | null {
  const matches = page.text.split(/\r?\n/u).map((text, index) => ({ raw: text.trim(), line: index + 1 }))
    .filter(({ raw }) => pattern.test(raw));
  if (matches.length !== 1) return null;
  return {
    ...matches[0], page: page.page, value, label,
    method: page.method, region: page.region, bounds: page.bounds,
  };
}

/** Reconcile the exact Academy Level 2 overlay with independently rendered static page regions. */
export function readH2sLayout(pages: readonly H2sPage[], typeCode: string): SourceLayoutProof | null {
  if (typeCode !== "H2S_TRAINING_CERTIFICATE") return null;
  const originals = pages.filter(page => page.method !== rasterMethod);
  if (originals.some(page => /\bBasic\s+H[2₂]S Training\b/iu.test(page.text) && /\bOPITO\b/iu.test(page.text))) {
    return { profileId, fields: {}, reasons: ["h2s_opito_basic_distinct_award"], limitToProofFields: true };
  }
  if (originals.length !== 1 || originals[0].page !== 1 || originals[0].method !== "pdf-native") return null;
  const [original] = originals;
  if (!course.test(original.text)) return null;

  const regions = pages.filter(page => page.method === rasterMethod && academyRegions.has(page.region ?? ""));
  const heading = regions.find(page => page.region === "h2s-heading");
  const provider = regions.find(page => page.region === "h2s-provider");
  const outcome = regions.find(page => page.region === "h2s-outcome");
  if (regions.length !== 3 || !heading || !provider || !outcome
    || regions.some(page => page.page !== original.page || !validBounds(page.bounds))
    || new Set(regions.map(page => page.bounds?.join(","))).size !== 3) return null;

  if (conflictingOutcome.test(original.text) || regions.some(page => conflictingOutcome.test(page.text))) {
    return { profileId, fields: {}, reasons: ["h2s_completion_conflicts_with_assessment_or_attendance"], limitToProofFields: true };
  }
  const printedProvider = rasterEvidence(provider, academy, "ADNOC Technical Academy", "Printed Academy provider");
  const printedOutcome = rasterEvidence(outcome, completion, "completed", "Printed completion statement");
  if (!/^CERTIFICATE\s+OF COMPLETION$/iu.test(heading.text.trim()) || !printedProvider || !printedOutcome) return null;

  const overlay = readTrainingLayout([original], typeCode);
  if (!overlay || overlay.profileId !== profileId) return null;
  const fields: Record<string, Evidence> = { ...overlay.fields,
    provider: printedProvider,
    printed_outcome: printedOutcome,
  };
  const reasons = (overlay.reasons ?? []).filter(reason => ![
    "training_provider_source_unconfirmed", "training_outcome_source_unconfirmed",
  ].includes(reason));
  const labelled = pages.filter(page => page.method === rasterMethod && page.region === "h2s-labelled-overlay"
    && page.page === original.page && validBounds(page.bounds));
  if (labelled.length > 1) reasons.push("h2s_labelled_overlay_ambiguous");
  if (labelled.length === 1 && !conflictingOutcome.test(labelled[0].text) && course.test(labelled[0].text)) {
    const visible = readTrainingLayout([{ ...labelled[0], method: "tesseract-training-page-ocr" }], typeCode);
    const nativeLines = original.text.split(/\r?\n/u).map(fold);
    for (const key of labelledFields) {
      const reading = visible?.fields[key];
      if (!reading || reasons.includes(`conflicting_field:${key}`)) continue;
      const raw = fold(reading.raw);
      if (!fields[key] && nativeLines.filter(line => line === raw).length === 1) {
        fields[key] = { ...reading, method: labelled[0].method, region: labelled[0].region };
      } else if (!fields[key] || fold(fields[key].value) !== fold(reading.value)) {
        delete fields[key];
        reasons.push(`h2s_labelled_overlay_value_unconfirmed:${key}`);
      }
    }
    if (fields.participant_name) {
      const missing = reasons.indexOf("training_participant_source_unconfirmed");
      if (missing >= 0) reasons.splice(missing, 1);
    }
    if (fields.certificate_number && fields.issue_date && fields.expiry_date) {
      const missing = reasons.indexOf("training_labelled_layout_incomplete");
      if (missing >= 0) reasons.splice(missing, 1);
    }
  }
  if (!fields.expiry_date) {
    reasons.push("h2s_expiry_not_independently_printed");
  } else if (fields.issue_date && fields.expiry_date.value <= fields.issue_date.value) {
    delete fields.expiry_date;
    reasons.push("h2s_expiry_not_after_issue");
  }
  return { profileId, fields, limitToProofFields: true, ...(reasons.length && { reasons }) };
}
