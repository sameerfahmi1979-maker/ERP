import "server-only";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { DmsAiOutput, DmsExtractedField } from "@/lib/dms/ai/types";
import type { ModelPreparation, PreparationSnapshot } from "@/lib/dms/preparation/contracts";
import { resolveCicpaWording } from "@/lib/dms/phase2/cicpa";
import type { Evidence } from "@/lib/dms/phase2/provider-evidence";

export const CICPA_LOCATIONS_FIELD = "cicpa_locations_arabic";
export const CICPA_COMPANY_NUMBER_FIELD = "company_registration_number";
export const isCicpaPassType = (type: string | null | undefined) => type === "CICPA_PASS";
export const cicpaWordingPreviewEnabled = () => !!process.env.DMS_ALGT_CICPA_WORDING_PREVIEW_FILE;

const cropBounds = z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]);
const reverseCrop = z.strictObject({
  page: z.number().int().positive(),
  bounds: cropBounds.refine(([left, top, right, bottom]) => left < right && top < bottom),
  text: z.string().regex(/^[0-9]{1,32}$/u),
});
const manifest = z.strictObject({
  version: z.literal(1),
  witnesses: z.array(z.strictObject({
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    page: z.number().int().positive(),
    bounds: cropBounds,
    text: z.string().min(1).max(2000),
    // A malformed reverse crop can withhold that field while locations stay verified.
    reverseCompany: z.unknown().optional(),
  })).max(100),
});

async function readWitness(sha256: string) {
  const path = process.env.DMS_ALGT_CICPA_WORDING_PREVIEW_FILE;
  if (!path || !isAbsolute(path)) return null;
  const file = await open(path, "r");
  try {
    const maxBytes = 160_000;
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size || bytesRead > maxBytes) return null;
    const entries = manifest.parse(JSON.parse(buffer.toString("utf8", 0, bytesRead))).witnesses.filter(entry => entry.sourceSha256 === sha256);
    if (!entries.length) return { state: "absent" } as const;
    return entries.length === 1 ? { state: "matched", entry: entries[0] } as const : null;
  } finally {
    await file.close();
  }
}

type Original = { sha256: string; mime: string };

type CropBounds = z.infer<typeof cropBounds>;
function overlaps([left, top, right, bottom]: CropBounds, other: CropBounds) {
  return left < other[2] && top < other[3] && right > other[0] && bottom > other[1];
}

async function reviewCicpaFields(original: Original | undefined, observedLocations: string | undefined) {
  const sha256 = original?.sha256 ?? "";
  const lookup = original?.mime === "application/pdf" ? await readWitness(sha256).catch(() => null) : null;
  const entry = lookup?.state === "matched" ? lookup.entry : null;
  const controlledKeys = lookup?.state === "absent" ? [] : [CICPA_LOCATIONS_FIELD, CICPA_COMPANY_NUMBER_FIELD];
  const wording = resolveCicpaWording({
    sourceSha256: sha256, page: entry?.page ?? 0, bounds: entry?.bounds, observed: observedLocations,
    witness: entry ? { sha256: entry.sourceSha256, pages: [{
      page: entry.page, bounds: entry.bounds, region: "locations", method: "verified-transcription", text: entry.text,
    }] } : null,
  });
  const company = reverseCrop.safeParse(entry?.reverseCompany);
  const reverse = entry && company.success &&
    (company.data.page !== entry.page || !overlaps(company.data.bounds, entry.bounds))
    ? company.data
    : undefined;
  const fields: Record<string, Evidence> = Object.create(null);
  if (wording.status === "verified") fields[CICPA_LOCATIONS_FIELD] = {
    ...wording.evidence, value: wording.value, raw: wording.value, label: "Authorized locations",
  };
  if (reverse) fields[CICPA_COMPANY_NUMBER_FIELD] = {
    page: reverse.page, bounds: reverse.bounds, region: "reverse-company", side: "reverse",
    method: "verified-transcription", label: "Reverse-side company number", value: reverse.text, raw: reverse.text,
  };
  const notes = [
    wording.status === "verified"
      ? "Arabic locations verified against the original. Officer review is required."
      : "Arabic locations need original-page review. The AI wording was withheld.",
    reverse
      ? "Reverse-side company number verified against the original. Officer review is required."
      : "Reverse-side company number needs original-page review. Any AI value was withheld.",
  ];
  return { wording, notes, fields, controlledKeys };
}

const reviewedCodes = new Set([CICPA_LOCATIONS_FIELD, CICPA_COMPANY_NUMBER_FIELD, "company_number", "reverse_company_number"]);

function labelParts(label: string) {
  return label.toLowerCase().replace(/[_-]+/gu, " ").split(/[|/]/u).map(part => part.trim());
}

function isLocationsLabel(label: string) {
  return labelParts(label).some(name => /^(?:cicpa locations?(?: arabic)?|authori[sz]ed locations?(?: arabic)?|المواقع المصرح بها|الأماكن المصرح بها)$/u.test(name));
}

function isReviewedLabel(label: string) {
  return isLocationsLabel(label) || labelParts(label).some(name =>
    /^(?:(?:reverse side |reverse )?company (?:registration )?(?:number|no\.?)|رقم (?:تسجيل )?الشركة)$/u.test(name),
  );
}

export async function applyIntakeCicpaWording(output: DmsAiOutput, original: Original) {
  const observedLocations = output.extraction.fields.find(field => field.fieldCode === CICPA_LOCATIONS_FIELD)?.value
    ?? output.extraction.additionalFields.find(field => isLocationsLabel(field.label))?.value;
  const review = await reviewCicpaFields(original, observedLocations);
  const fields = output.extraction.fields.filter(field => !reviewedCodes.has(field.fieldCode));
  for (const [fieldCode, evidence] of Object.entries(review.fields)) fields.push({
    fieldCode, value: evidence.value, sourceSnippet: evidence.raw, confidenceLabel: "high", confidenceScore: 1,
  } satisfies DmsExtractedField);
  return {
    review,
    output: {
      ...output, warnings: [...(output.warnings ?? []), ...review.notes],
      extraction: { ...output.extraction, fields,
        additionalFields: output.extraction.additionalFields.filter(field => !isReviewedLabel(field.label)) },
    } satisfies DmsAiOutput,
  };
}

export async function applySavedCicpaWording(source: PreparationSnapshot, output: ModelPreparation, original?: Original) {
  const observedLocations = output.fields.find(field => field.code === CICPA_LOCATIONS_FIELD)?.value ?? undefined;
  const review = await reviewCicpaFields(original, observedLocations);
  const file = original ? source.files.find(row => row.sha256 === original.sha256) : undefined;
  return {
    controlledKeys: review.controlledKeys,
    trusted: file && Object.keys(review.fields).length ? { sha256: file.sha256, fileId: file.id, fields: review.fields } : undefined,
    output: { ...output,
      fields: output.fields.filter(field => !reviewedCodes.has(field.code)),
      warnings: [...output.warnings.slice(0, 30 - review.notes.length), ...review.notes],
    } satisfies ModelPreparation,
  };
}
