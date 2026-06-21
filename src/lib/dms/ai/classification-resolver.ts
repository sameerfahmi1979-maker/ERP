/**
 * Resolves AI-suggested document type codes to canonical ERP type_code values.
 * Applies fingerprint heuristics when the model misclassifies common UAE documents.
 */

export type DocumentTypeRow = {
  id: number;
  type_code: string;
  name_en?: string;
};

/** Aliases the AI may return instead of exact type_code. */
const TYPE_CODE_ALIASES: Record<string, string> = {
  EMIRATES_ID: "EMIRATES_ID",
  EMIRATESID: "EMIRATES_ID",
  UAE_ID: "EMIRATES_ID",
  UAE_NATIONAL_ID: "EMIRATES_ID",
  NATIONAL_ID: "EMIRATES_ID",
  EID: "EMIRATES_ID",
  PASSPORT: "PASSPORT_COPY",
  PASSPORT_COPY: "PASSPORT_COPY",
  PASSPORT_SCAN: "PASSPORT_COPY",
  VISA: "VISA",
  RESIDENCE_VISA: "VISA",
  VISA_RESIDENCE: "VISA",
  RESIDENCE_PERMIT: "VISA",
  LABOUR_CARD: "LABOUR_CARD",
  LABOR_CARD: "LABOUR_CARD",
  WORK_PERMIT: "LABOUR_CARD",
  DRIVING_LICENSE: "DRIVING_LICENSE",
  DRIVING_LICENCE: "DRIVING_LICENSE",
  UAE_DRIVING_LICENSE: "DRIVING_LICENSE",
  MEDICAL_INSURANCE: "MEDICAL_INSURANCE",
  HEALTH_INSURANCE: "MEDICAL_INSURANCE",
  INSURANCE_CARD: "MEDICAL_INSURANCE",
  TRADE_LICENSE: "TRADE_LICENSE",
  COMMERCIAL_LICENSE: "TRADE_LICENSE",
  COMMERCIAL_REGISTER: "TRADE_LICENSE",
};

function normalizeToken(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** Emirates ID number pattern: 784-YYYY-NNNNNNN-N */
const EMIRATES_ID_NUMBER_RE = /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/;

const EMIRATES_ID_TEXT_SIGNALS = [
  /emirates\s*id/i,
  /emirates\s*identity/i,
  /uae\s*id/i,
  /الهوية\s*الإماراتية/i,
  /بطاقة\s*الهوية/i,
  /federal\s*authority\s*for\s*identity/i,
  /ica\s*smart/i,
];

const PASSPORT_SIGNALS = [/passport/i, /جواز\s*سفر/i, /machine\s*readable\s*zone/i, /\bMRZ\b/i, /P<[A-Z]{3}/];
const VISA_SIGNALS = [/residence\s*visa/i, /residency/i, /إقامة/i, /تأشيرة/i, /gdrfa/i, /icp/i, /uid\s*[:#]/i];
const DRIVING_LICENSE_SIGNALS = [/driving\s*licen/i, /رخصة\s*القيادة/i, /traffic\s*department/i, /rta/i];
const MEDICAL_INSURANCE_SIGNALS = [
  /medical\s*insurance/i,
  /health\s*insurance/i,
  /member\s*id/i,
  /tpa/i,
  /network/i,
  /تأمين\s*طبي/i,
];
const TRADE_LICENSE_SIGNALS = [/trade\s*licen/i, /commercial\s*licen/i, /رخصة\s*تجارية/i, /ded/i, /sedd/i];

export type TypeResolutionResult = {
  typeCode: string | null;
  typeId: number | null;
  source: "ai" | "alias" | "heuristic" | "none";
  overrideReason?: string;
};

function scoreSignals(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => (re.test(text) ? n + 1 : 0), 0);
}

/**
 * Infer document type from OCR/transcription text when classification is weak.
 */
export function inferTypeCodeFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const t = text;

  if (EMIRATES_ID_NUMBER_RE.test(t) || scoreSignals(t, EMIRATES_ID_TEXT_SIGNALS) >= 2) {
    return "EMIRATES_ID";
  }
  if (scoreSignals(t, PASSPORT_SIGNALS) >= 2 && !EMIRATES_ID_NUMBER_RE.test(t)) {
    return "PASSPORT_COPY";
  }
  if (scoreSignals(t, VISA_SIGNALS) >= 2) {
    return "VISA";
  }
  if (scoreSignals(t, DRIVING_LICENSE_SIGNALS) >= 2) {
    return "DRIVING_LICENSE";
  }
  if (scoreSignals(t, MEDICAL_INSURANCE_SIGNALS) >= 2) {
    return "MEDICAL_INSURANCE";
  }
  if (scoreSignals(t, TRADE_LICENSE_SIGNALS) >= 2) {
    return "TRADE_LICENSE";
  }
  return null;
}

function findTypeRow(
  typeRows: DocumentTypeRow[],
  typeCode: string
): DocumentTypeRow | undefined {
  const normalized = normalizeToken(typeCode);
  return typeRows.find((r) => normalizeToken(r.type_code) === normalized);
}

/**
 * Resolve suggested type_code to a DB row, with alias + heuristic overrides.
 */
export function resolveSuggestedDocumentType(
  suggestedTypeCode: string | null | undefined,
  typeRows: DocumentTypeRow[],
  transcription: string | null | undefined,
  aiConfidenceScore?: number | null
): TypeResolutionResult {
  const text = transcription ?? "";
  const heuristicType = inferTypeCodeFromText(text);

  // Strong Emirates ID fingerprint always wins over weak AI classification
  if (
    heuristicType === "EMIRATES_ID" &&
    (EMIRATES_ID_NUMBER_RE.test(text) || scoreSignals(text, EMIRATES_ID_TEXT_SIGNALS) >= 2)
  ) {
    const aiCode = suggestedTypeCode ? normalizeToken(suggestedTypeCode) : null;
    if (aiCode !== "EMIRATES_ID" && (aiConfidenceScore == null || aiConfidenceScore < 0.92)) {
      const row = findTypeRow(typeRows, "EMIRATES_ID");
      if (row) {
        return {
          typeCode: row.type_code,
          typeId: row.id,
          source: "heuristic",
          overrideReason: "Emirates ID number or card markers detected in document text",
        };
      }
    }
  }

  if (suggestedTypeCode) {
    const direct = findTypeRow(typeRows, suggestedTypeCode);
    if (direct) {
      return { typeCode: direct.type_code, typeId: direct.id, source: "ai" };
    }

    const aliasTarget = TYPE_CODE_ALIASES[normalizeToken(suggestedTypeCode)];
    if (aliasTarget) {
      const aliased = findTypeRow(typeRows, aliasTarget);
      if (aliased) {
        return { typeCode: aliased.type_code, typeId: aliased.id, source: "alias" };
      }
    }

    // Fuzzy: match by name_en substring
    const fuzzy = typeRows.find((r) => {
      const name = (r.name_en ?? "").toLowerCase();
      const sug = suggestedTypeCode.toLowerCase().replace(/_/g, " ");
      return name.includes(sug) || sug.includes(name);
    });
    if (fuzzy) {
      return { typeCode: fuzzy.type_code, typeId: fuzzy.id, source: "alias" };
    }
  }

  // Low-confidence AI + strong heuristic
  if (heuristicType && (aiConfidenceScore == null || aiConfidenceScore < 0.75)) {
    const row = findTypeRow(typeRows, heuristicType);
    if (row) {
      return {
        typeCode: row.type_code,
        typeId: row.id,
        source: "heuristic",
        overrideReason: `Document text matches ${heuristicType} fingerprint`,
      };
    }
  }

  return { typeCode: null, typeId: null, source: "none" };
}

/** Short visual fingerprint appended to type candidate list in prompts. */
export const TYPE_CLASSIFICATION_FINGERPRINTS: Record<string, string> = {
  EMIRATES_ID:
    "784-YYYY-NNNNNNN-N ID number, Federal Authority for Identity, bilingual EN/AR, photo ID card — NOT a passport",
  PASSPORT_COPY:
    "Passport booklet, MRZ lines (P<...>), passport number, nationality, place of birth — NOT Emirates ID",
  VISA:
    "UAE residence visa / entry permit, UID, file number, sponsor, GDRFA/ICP — stamp or card in passport",
  LABOUR_CARD: "MOHRE labour card, work permit number, employer name, Emirates ID link",
  DRIVING_LICENSE: "RTA/Traffic driving licence, licence number, vehicle classes, UAE emirate",
  MEDICAL_INSURANCE: "Health insurance card, member/card ID, insurer/TPA, network class, policy dates",
  TRADE_LICENSE: "Commercial/trade licence, licence number, DED/SEDD authority, company legal name",
  VEHICLE_REGISTRATION: "Mulkiya / vehicle registration card, plate number, chassis/VIN",
  INSURANCE_CERTIFICATE: "Insurance policy certificate, policy number, insurer, coverage period",
  MOA: "Memorandum of Association, company registration, shareholders — typically no expiry",
};
