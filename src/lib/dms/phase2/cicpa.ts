import type { SourceLayoutProof } from "./provider-evidence";

const regions = {
  authority: { field: "authority", side: "front" },
  "permit-strip": { field: "permitStrip", side: "front" },
  holder: { field: "holder", side: "front" },
  sponsor: { field: "sponsor", side: "front" },
  expiry: { field: "expiry", side: "front" },
  locations: { field: "locationsArabic", side: "front" },
  "reverse-company": { field: "companyNumber", side: "reverse" },
  "reverse-pass": { field: "passNumber", side: "reverse" },
} as const;

export type CicpaRegion = keyof typeof regions;
export type CicpaField = (typeof regions)[CicpaRegion]["field"];
export type CicpaVariant = "onshore" | "offshore";

export interface CicpaEvidenceRegion {
  page: number;
  text: string;
  method?: string;
  region?: CicpaRegion;
  /** A common identifier assigned only after the front and reverse have been matched. */
  cardGroup?: string;
  /** Optional crop in PDF points, as left, top, right, bottom. */
  bounds?: readonly [number, number, number, number];
  /** Physical front frame for focused OCR regions from the same supported card. */
  cardBounds?: readonly [number, number, number, number];
}

export interface CicpaFieldEvidence {
  value: string;
  evidence: {
    page: number;
    region: CicpaRegion;
    side: "front" | "reverse";
    method: "verified-transcription";
    bounds?: CicpaEvidenceRegion["bounds"];
  };
}

export type CicpaIssue =
  | { code: "missing" | "unverified" | "unsupported" | "unreadable" | "conflicting"; region: CicpaRegion }
  | { code: "unpaired-sides" };

export interface CicpaEvidenceResult {
  status: "verified" | "held";
  variant: CicpaVariant | null;
  fields: Partial<Record<CicpaField, CicpaFieldEvidence>>;
  issues: CicpaIssue[];
}

const strips = {
  "تصريح دخول بري": "onshore",
  "تصريح دخول بحري": "offshore",
} as const;

function normalizedLabel(text: string): string {
  return text.normalize("NFKC").replace(/[\p{Cf}ـ]/gu, "").trim().replace(/\s+/gu, " ");
}

function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/gu, (digit) =>
    String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)),
  );
}

function expiryDate(text: string): string | undefined {
  const date = westernDigits(normalizedLabel(text));
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const printed = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/u.exec(date);
  const value = iso
    ? date
    : printed && `${printed[4]}-${printed[3].padStart(2, "0")}-${printed[1].padStart(2, "0")}`;
  if (!value || value.startsWith("0000")) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function validBounds(bounds: CicpaEvidenceRegion["bounds"]): boolean {
  return !bounds || (
    Array.isArray(bounds) && bounds.length === 4
    && bounds.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0)
    && bounds[0] < bounds[2]
    && bounds[1] < bounds[3]
  );
}

const cardOcrMethod = "tesseract-card-region-ocr";
const focusedOcrMethod = "tesseract-cicpa-front-region-ocr";
const guardHeading = /(?<![\p{L}\p{N}])(?:National\s+Guard|الحرس\s+الوطني)(?![\p{L}\p{N}])/iu;

type FrontProof = {
  scope: CicpaVariant;
  authority: { crop: CicpaEvidenceRegion; raw: string };
  strip: { crop: CicpaEvidenceRegion; raw: string };
  expiryCrops: CicpaEvidenceRegion[];
};

function containsBounds(outer: NonNullable<CicpaEvidenceRegion["bounds"]>, inner: NonNullable<CicpaEvidenceRegion["bounds"]>): boolean {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

function printedStrip(text: string) {
  const matched = Object.entries(strips).flatMap(([label, scope]) => {
    const raw = new RegExp(`(?<![\\p{L}\\p{N}])${label.replaceAll(" ", "\\s+")}(?![\\p{L}\\p{N}])`, "u").exec(text)?.[0];
    return raw ? [{ scope, raw }] : [];
  });
  return matched.length === 1 ? matched[0] : undefined;
}

function readFront(
  authorityCrops: readonly CicpaEvidenceRegion[],
  stripCrops: readonly CicpaEvidenceRegion[],
  expiryCrops: CicpaEvidenceRegion[],
): FrontProof | undefined {
  const authorities = authorityCrops.flatMap(crop => {
    const raw = guardHeading.exec(crop.text)?.[0];
    return raw ? [{ crop, raw }] : [];
  });
  const stripsFound = stripCrops.flatMap(crop => {
    const found = printedStrip(crop.text);
    return found ? [{ crop, ...found }] : [];
  });
  if (!authorities.length || !stripsFound.length || new Set(stripsFound.map(strip => strip.scope)).size !== 1) return undefined;
  const { scope, ...strip } = stripsFound[0];
  return { scope, authority: authorities[0], strip, expiryCrops };
}

/** Locate a National Guard card from its printed heading and strip. Focused OCR
 * regions must already be bound to the current source bytes by their caller.
 * Full location wording and reverse pairing still require reviewed evidence.
 */
export function readCicpaLayout(pages: readonly CicpaEvidenceRegion[], typeCode: string): SourceLayoutProof | null {
  if (typeCode !== "CICPA_PASS" || pages.some(page =>
    /security permit application|application form for persons security permit|طلب تصريح أمني/iu.test(page.text))) return null;

  const bounded = pages.filter(page => Number.isSafeInteger(page.page) && page.page > 0 && page.bounds && validBounds(page.bounds));
  const broadCrops = bounded.filter(page => page.method === cardOcrMethod && (page.region as string) !== "page-image-fallback");
  const focusGroups = new Map<string, CicpaEvidenceRegion[]>();
  for (const crop of bounded) {
    if (crop.method !== focusedOcrMethod || !crop.bounds || !crop.cardBounds || !validBounds(crop.cardBounds)
      || !containsBounds(crop.cardBounds, crop.bounds)
      || !["authority", "permit-strip", "expiry"].includes(crop.region ?? "")) continue;
    const key = `${crop.page}:${crop.cardBounds.join(",")}`;
    const group = focusGroups.get(key) ?? [];
    group.push(crop);
    focusGroups.set(key, group);
  }

  const focused = Array.from(focusGroups.values()).flatMap(group => {
    const front = readFront(group.filter(crop => crop.region === "authority"), group.filter(crop => crop.region === "permit-strip"),
      group.filter(crop => crop.region === "expiry"));
    return front ? [front] : [];
  });
  const broad = broadCrops.flatMap(crop => {
    const front = readFront([crop], [crop], []);
    if (!front || focused.some(other => other.scope === front.scope
      && crop.page === other.strip.crop.page
      && containsBounds(crop.bounds!, other.strip.crop.bounds!)
      && containsBounds(crop.bounds!, other.authority.crop.bounds!))) return [];
    return [front];
  });
  const cards = [...focused, ...broad];
  if (!cards.length && [...broadCrops, ...Array.from(focusGroups.values()).flat().filter(crop => crop.region === "authority")]
    .some(crop => guardHeading.test(crop.text))) {
    return { profileId: null, fields: {}, reasons: ["cicpa_scope_strip_unreadable"] };
  }
  if (cards.length !== 1) return null;

  const [{ scope, authority, strip, expiryCrops }] = cards;
  const origin = ({ page, bounds, method }: CicpaEvidenceRegion) => ({ page, bounds, method, side: "front" as const });
  const fields: SourceLayoutProof["fields"] = {
    access_scope: { ...origin(strip.crop), raw: strip.raw, value: scope, label: "Personnel permit strip" },
    printed_permit_strip: { ...origin(strip.crop), raw: strip.raw, value: normalizedLabel(strip.raw), label: "Personnel permit strip" },
    issuing_authority: { ...origin(authority.crop), raw: authority.raw, value: "National Guard", label: "Authority heading" },
  };
  const reasons = ["cicpa_regions_require_verification"];
  const typedDates = new Map<string, CicpaEvidenceRegion>();
  for (const crop of expiryCrops) {
    const value = expiryDate(crop.text);
    if (value) typedDates.set(value, crop);
  }
  if (typedDates.size > 1) reasons.push("cicpa_front_expiry_conflicting");
  if (typedDates.size === 1) {
    const [[value, crop]] = typedDates;
    fields.expiry_date = { ...origin(crop), raw: crop.text, value, label: "Printed red expiry date" };
  }
  return { profileId: `cicpa-${scope}`, reasons, fields };
}
function extractValue(region: CicpaRegion, text: string): string | undefined {
  const normalized = normalizedLabel(text);
  switch (region) {
    case "authority":
      return /(?:^|[^\p{L}])(?:الحرس الوطني|NATIONAL GUARD)(?:$|[^\p{L}])/iu.test(normalized) ? text : undefined;
    case "permit-strip":
      return Object.hasOwn(strips, normalized) ? text : undefined;
    case "expiry":
      return expiryDate(text);
    case "locations":
      return !/[?؟�…]|\.{2}|\[[^\]]*\]/u.test(text)
        && text.split("/").every((phrase) => /[\u0621-\u064a]/u.test(phrase))
        && text.split(/\r?\n/u).every((line) => /[\u0621-\u064a]/u.test(line))
        ? text : undefined;
    case "reverse-company":
      return /^الشركة\s*[:：]?\s*(\d+)$/u.exec(westernDigits(normalized))?.[1];
    case "reverse-pass":
      return /^الرقم\s*[:：]?\s*(\d+)$/u.exec(westernDigits(normalized))?.[1];
    case "holder":
    case "sponsor":
      return /\p{L}/u.test(normalized) && !/[?؟�…]/u.test(text) ? text : undefined;
  }
}

/** Validates structured, reviewed evidence for the supported National Guard layout.
 * A whole-page OCR transcription, crop color or barcode cannot supply a verified field.
 */
export function parseCicpaEvidence(pages: readonly CicpaEvidenceRegion[]): CicpaEvidenceResult {
  const fields: CicpaEvidenceResult["fields"] = {};
  const issues: CicpaIssue[] = [];
  const accepted = new Map<CicpaRegion, CicpaEvidenceRegion>();

  for (const region of Object.keys(regions) as CicpaRegion[]) {
    const candidates = pages.filter((entry) => entry.region === region);
    const verified = candidates.filter((entry) => entry.method === "verified-transcription");
    if (!verified.length) {
      issues.push({ code: candidates.length ? "unverified" : "missing", region });
      continue;
    }
    const [entry] = verified;
    if (verified.length > 1) {
      issues.push({ code: "conflicting", region });
      continue;
    }
    const value = typeof entry.text === "string" && extractValue(region, entry.text);
    if (!value || !Number.isSafeInteger(entry.page) || entry.page < 1 || !validBounds(entry.bounds)) {
      const unsupported = region === "authority" || region === "permit-strip";
      issues.push({ code: unsupported ? "unsupported" : "unreadable", region });
      continue;
    }

    const { field, side } = regions[region];
    fields[field] = {
      value,
      evidence: { page: entry.page, region, side, method: "verified-transcription", ...(entry.bounds && { bounds: entry.bounds }) },
    };
    accepted.set(region, entry);
  }

  const front = accepted.get("permit-strip");
  const reverseCompany = accepted.get("reverse-company");
  const reversePass = accepted.get("reverse-pass");
  const frontCandidates = Array.from(accepted.entries()).filter(([region]) => regions[region].side === "front");
  const paired = typeof front?.cardGroup === "string" && front.cardGroup.trim()
    && (!reverseCompany || reverseCompany.cardGroup === front.cardGroup)
    && (!reversePass || reversePass.cardGroup === front.cardGroup)
    && (!reverseCompany || !reversePass || reverseCompany.page === reversePass.page)
    && frontCandidates.every(([, entry]) => entry.page === front.page && entry.cardGroup === front.cardGroup);
  if ((reverseCompany || reversePass) && !paired) {
    issues.push({ code: "unpaired-sides" });
    delete fields.companyNumber;
    delete fields.passNumber;
  }

  const label = fields.permitStrip && normalizedLabel(fields.permitStrip.value) as keyof typeof strips;
  return {
    status: issues.length ? "held" : "verified",
    variant: label ? strips[label] : null,
    fields,
    issues,
  };
}

export interface CicpaWordingWitness {
  sha256: string;
  pages: readonly CicpaEvidenceRegion[];
}

export interface CicpaWordingInput {
  /** SHA-256 computed from the current original PDF bytes. */
  sourceSha256: string;
  page: number;
  bounds?: CicpaEvidenceRegion["bounds"];
  observed?: string | null;
  witness?: CicpaWordingWitness | null;
}

export type CicpaWordingResult =
  | {
      status: "verified";
      observed: string | null;
      value: string;
      disposition: "exact" | "corrected" | "source-only";
      evidence: CicpaFieldEvidence["evidence"];
    }
  | {
      status: "held";
      observed: string | null;
      value: null;
      reason: "source-mismatch" | "unverified-region" | "ambiguous-region" | "unreadable";
    };

/** Resolves one authorized-locations block using a reviewed transcription of the exact original and crop. */
export function resolveCicpaWording({
  sourceSha256, page, bounds, observed: ocr, witness,
}: CicpaWordingInput): CicpaWordingResult {
  const observed = typeof ocr === "string" ? ocr : null;
  const held = { status: "held", observed, value: null } as const;
  if (!witness || !/^[a-f0-9]{64}$/u.test(sourceSha256) || sourceSha256 !== witness.sha256) {
    return { ...held, reason: "source-mismatch" };
  }
  if (!Number.isSafeInteger(page) || page < 1 || !bounds || !validBounds(bounds) || !Array.isArray(witness.pages)) {
    return { ...held, reason: "unverified-region" };
  }

  const matches = witness.pages.filter((entry) =>
    entry?.region === "locations" && entry.method === "verified-transcription" && entry.page === page
    && Array.isArray(entry.bounds) && entry.bounds.length === bounds.length
    && bounds.every((coordinate, index) => coordinate === entry.bounds?.[index]),
  );
  if (!matches.length) return { ...held, reason: "unverified-region" };
  if (matches.length > 1) return { ...held, reason: "ambiguous-region" };

  const text = matches[0].text;
  const value = typeof text === "string" ? extractValue("locations", text) : undefined;
  if (!value) return { ...held, reason: "unreadable" };

  return {
    status: "verified",
    observed,
    value,
    disposition: observed === value ? "exact" : observed?.trim() ? "corrected" : "source-only",
    evidence: { page, bounds, region: "locations", side: "front", method: "verified-transcription" },
  };
}
