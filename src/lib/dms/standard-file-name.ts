/**
 * DMS.NAMING.1 — Standard file name builder
 *
 * Format: {Document_type}_{Owner}_{DOC_NO}_{Expiry}.{ext}
 *
 * Decisions (Sameer 2026-06-20):
 * - Use `NoExpiry` when document type does not expire
 * - Medical insurance DOC_NO = card number (not policy number)
 * - Retroactive rename supported via bulk migration action
 */

export const DMS_STANDARD_FILE_NAME_MAX_LENGTH = 200;

/** Document types that never carry an expiry segment — use `NoExpiry`. */
export const DMS_NO_EXPIRY_TYPE_CODES = new Set([
  "MOA",
  "MEMORANDUM_OF_ASSOCIATION",
  "MEMORANDUM_ASSOC_AR",
  "ARTICLES_OF_ASSOCIATION",
  "TRN_CERTIFICATE",
]);

/** Human-readable segment overrides for type_code → filename token. */
const TYPE_CODE_SEGMENTS: Record<string, string> = {
  EMIRATES_ID: "Emirates_ID",
  PASSPORT_COPY: "Passport",
  VISA: "Residence_Visa",
  VISA_RESIDENCE: "Residence_Visa",
  LABOUR_CARD: "Labour_Card",
  DRIVING_LICENSE: "Driving_License",
  MEDICAL_INSURANCE: "Medical_Insurance",
  TRADE_LICENSE: "Trade_License",
  VEHICLE_REGISTRATION: "Vehicle_Registration",
  INSURANCE_CERTIFICATE: "Insurance_Certificate",
  CICPA_PASS: "CICPA_Pass",
  MOA: "MOA",
  MEMORANDUM_OF_ASSOCIATION: "MOA",
  MEMORANDUM_ASSOC_AR: "MOA",
  PROJECT_CONTRACT: "Project_Contract",
  TRN_CERTIFICATE: "TRN_Certificate",
};

/** Preferred metadata / AI field keys for DOC_NO, in priority order per type. */
const DOC_NO_FIELD_PRIORITY: Record<string, string[]> = {
  EMIRATES_ID: ["emirates_id_number", "id_number", "document_number"],
  PASSPORT_COPY: ["passport_number", "document_number"],
  VISA: ["visa_number", "visa_file_number", "uid_number", "uid", "file_number", "document_number"],
  VISA_RESIDENCE: ["visa_number", "visa_file_number", "uid_number", "uid", "file_number", "document_number"],
  LABOUR_CARD: ["labour_card_number", "work_permit_number", "card_number", "document_number"],
  DRIVING_LICENSE: ["license_number", "driving_license_number", "licence_number", "document_number"],
  MEDICAL_INSURANCE: [
    "insurance_card_number",
    "card_number",
    "card_no",
    "member_id",
    "member_no",
    "membership_number",
    "health_card_number",
    "policy_number",
  ],
  TRADE_LICENSE: ["license_number", "license_no", "document_number"],
  VEHICLE_REGISTRATION: ["plate_number", "registration_number", "chassis_number", "document_number"],
  INSURANCE_CERTIFICATE: ["policy_number", "certificate_number", "document_number"],
  TRN_CERTIFICATE: ["trn", "document_number"],
  PROJECT_CONTRACT: ["contract_number", "document_number"],
  MOA: ["registration_number", "document_number", "license_number"],
  CICPA_PASS: ["pass_number", "card_number", "document_number"],
};

const GENERIC_DOC_NO_KEYS = [
  "document_number",
  "reference_number",
  "id_number",
  "license_number",
  "policy_number",
  "passport_number",
  "card_number",
];

const OWNER_FIELD_KEYS = [
  "full_name_en",
  "full_name",
  "legal_name",
  "legal_name_en",
  "insured_name",
  "insured_party_name",
  "member_name",
  "holder_name",
  "visa_holder_name",
  "employee_name",
  "beneficiary_name",
  "registered_to",
  "company_name",
  "client_name",
  "contractor_name",
  "patient_name",
];

export type AiOwnerHints = {
  suggestedDescription?: string | null;
  suggestedTitle?: string | null;
  detectedEntities?: Array<{ name?: string; role?: string | null; entityType?: string }>;
};

export type BuildDmsStandardFileNameInput = {
  typeCode: string;
  ownerName: string;
  docNo: string | null;
  expiryDate: string | null;
  extension: string;
  requiresExpiryTracking?: boolean;
  documentNo?: string | null;
};

export type StandardFileNameValidation = {
  valid: boolean;
  missing: Array<"Owner" | "DOC_NO" | "Expiry">;
  expiryToken: string;
};

/** Characters illegal in Windows file and folder names. */
const WINDOWS_FORBIDDEN_FILENAME_RE = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Replace path-like and other unsafe characters with underscores (Windows-safe). */
export function sanitizeFilenameToken(value: string): string {
  return value
    .trim()
    .replace(WINDOWS_FORBIDDEN_FILENAME_RE, "_")
    .replace(/[\s.,;:]+/g, "_")
    .replace(/[^\w\-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

/** DOC_NO segment — preserve hyphens (EID, visa refs); slashes and dots become underscores. */
export function formatDocNoSegment(value: string, maxLen = 40): string {
  const cleaned = sanitizeFilenameToken(value);
  if (!cleaned) return "DMS-Unknown";
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).replace(/_+$/, "") : cleaned;
}

export function getExtensionFromFilename(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

export function stripFilenameExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

/** Convert type_code to PascalCase filename segment. */
export function typeCodeToDocumentTypeSegment(typeCode: string): string {
  const normalized = typeCode.trim().toUpperCase();
  if (TYPE_CODE_SEGMENTS[normalized]) return TYPE_CODE_SEGMENTS[normalized];
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("_");
}

/** Sanitize a single token for ASCII filename use (owner / type labels). */
export function normalizeFilenameSegment(value: string, maxLen = 60): string {
  const cleaned = value
    .trim()
    .replace(WINDOWS_FORBIDDEN_FILENAME_RE, " ")
    .replace(/[^\w\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[\d\-_]+$/.test(word) || /^\d/.test(word)) {
        return word.replace(/_/g, "-");
      }
      if (word.includes("-")) {
        return word
          .split("-")
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""))
          .filter(Boolean)
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");

  if (!cleaned) return "Unknown";
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).replace(/_+$/, "") : cleaned;
}

/** Format person or company name as Owner token (First_Last). */
export function formatOwnerSegment(name: string): string {
  return normalizeFilenameSegment(name, 40);
}

/** Short internal DMS number for fallback DOC_NO: DMS-2026-000028 → DMS-000028 */
export function shortDmsDocumentNo(documentNo: string): string {
  const trimmed = documentNo.trim();
  const match = trimmed.match(/^DMS-(\d{4})-(\d+)$/i);
  if (match) {
    const seq = match[2].padStart(6, "0");
    return `DMS-${seq.slice(-6)}`;
  }
  return formatDocNoSegment(trimmed, 30);
}

export function isInternalDmsReference(value: string): boolean {
  return /^DMS-\d{4}-\d+$/i.test(value.trim());
}

function pickFirstFieldValue(
  fields: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const raw = fields[key];
    if (raw == null) continue;
    const str = String(raw).trim();
    if (!str) continue;
    if (isInternalDmsReference(str)) continue;
    return str;
  }
  return null;
}

/** Resolve DOC_NO from extracted/metadata fields for a document type. */
export function resolveDocNoFromFields(
  typeCode: string,
  fields: Record<string, unknown>,
  documentNo?: string | null
): string {
  const code = typeCode.trim().toUpperCase();
  const priority = DOC_NO_FIELD_PRIORITY[code] ?? GENERIC_DOC_NO_KEYS;
  const fromFields = pickFirstFieldValue(fields, priority);
  if (fromFields) return formatDocNoSegment(fromFields, 40);

  if (documentNo) return shortDmsDocumentNo(documentNo);
  return "DMS-Unknown";
}

/** Resolve owner name from AI/metadata fields (before entity DB lookup). */
export function resolveOwnerFromFields(fields: Record<string, unknown>): string | null {
  const fromFields = pickFirstFieldValue(fields, OWNER_FIELD_KEYS);
  return fromFields ? formatOwnerSegment(fromFields) : null;
}

/**
 * Resolve document subject (owner token) using structured fields PLUS AI narrative hints.
 * Description/title often contain the holder name even when metadata fields are empty
 * (common for VISA types with no DMS metadata definitions seeded).
 */
export function resolveOwnerFromAiContext(
  fields: Record<string, unknown>,
  hints?: AiOwnerHints
): string | null {
  const fromFields = resolveOwnerFromFields(fields);
  if (fromFields) return fromFields;

  const additional = fields.__additional_fields;
  if (Array.isArray(additional)) {
    for (const raw of additional) {
      if (!raw || typeof raw !== "object") continue;
      const label = String((raw as { label?: string }).label ?? "");
      const value = String((raw as { value?: string }).value ?? "").trim();
      if (!value || /sponsor|employer|company/i.test(label)) continue;
      if (/holder|employee|beneficiary|name|visa|insured|patient/i.test(label)) {
        return formatOwnerSegment(value);
      }
    }
  }

  const entities = hints?.detectedEntities ?? [];
  const holderEntity =
    entities.find(
      (e) =>
        e.name &&
        e.role &&
        /holder|employee|beneficiary|insured|patient|visa/i.test(e.role) &&
        !/sponsor|employer/i.test(e.role)
    ) ??
    entities.find((e) => e.name && e.entityType === "person" && !/sponsor|employer/i.test(e.role ?? ""));
  if (holderEntity?.name) return formatOwnerSegment(holderEntity.name);

  const desc = hints?.suggestedDescription?.trim();
  if (desc) {
    const forMatch = desc.match(
      /\bfor\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,80}?)\s*(?:\(|,|—|–|-\s|valid|sponsored|with|expir|until)/i
    );
    if (forMatch?.[1] && !/sponsor/i.test(forMatch[1])) {
      return formatOwnerSegment(forMatch[1].trim());
    }
  }

  const title = hints?.suggestedTitle?.trim();
  if (title) {
    const dashMatch = title.match(/[—–-]\s*(.+)$/);
    if (dashMatch?.[1]) return formatOwnerSegment(dashMatch[1].trim());
  }

  return null;
}

/** Pull DOC_NO from AI description when structured fields are empty (e.g. visa ID in prose). */
export function resolveDocNoFromDescription(description: string | null | undefined): string | null {
  if (!description?.trim()) return null;
  const idLabel = description.match(/\bID:\s*([\d\-/]+)/i);
  if (idLabel?.[1]) return formatDocNoSegment(idLabel[1], 40);
  const eid = description.match(/\b(784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d)\b/);
  if (eid?.[1]) return formatDocNoSegment(eid[1].replace(/\s/g, ""), 40);
  return null;
}

/** Vehicle owner token when linked entity is a vehicle/plate context. */
export function formatVehicleOwnerSegment(plateNumber: string): string {
  const plate = normalizeFilenameSegment(plateNumber, 30);
  return plate.startsWith("Plate_") ? plate : `Plate_${plate}`;
}

export function formatExpiryToken(
  expiryDate: string | null | undefined,
  options: { typeCode: string; requiresExpiryTracking?: boolean }
): string {
  const date = expiryDate?.trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const code = options.typeCode.trim().toUpperCase();
  if (DMS_NO_EXPIRY_TYPE_CODES.has(code) || options.requiresExpiryTracking === false) {
    return "NoExpiry";
  }
  if (options.requiresExpiryTracking === true) return "Unknown";
  return "NoExpiry";
}

/** Sanitize a full standard file name (user override or legacy AI value). */
export function sanitizeStandardFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return trimmed;

  const ext = getExtensionFromFilename(trimmed);
  const base = stripFilenameExtension(trimmed)
    .replace(WINDOWS_FORBIDDEN_FILENAME_RE, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");

  if (!base) return trimmed;
  return `${base}.${ext}`;
}

export function buildDmsStandardFileName(input: BuildDmsStandardFileNameInput): string {
  const ext = input.extension.replace(/^\./, "").toLowerCase() || "bin";
  const docType = typeCodeToDocumentTypeSegment(input.typeCode);
  const owner = formatOwnerSegment(input.ownerName || "Unknown_Owner");
  const docNo = input.docNo
    ? formatDocNoSegment(input.docNo, 40)
    : input.documentNo
      ? shortDmsDocumentNo(input.documentNo)
      : "DMS-Unknown";
  const expiry = formatExpiryToken(input.expiryDate, {
    typeCode: input.typeCode,
    requiresExpiryTracking: input.requiresExpiryTracking,
  });

  const base = `${docType}_${owner}_${docNo}_${expiry}`;
  const withExt = `${base}.${ext}`;

  if (withExt.length <= DMS_STANDARD_FILE_NAME_MAX_LENGTH) return withExt;

  const allowedBaseLen = DMS_STANDARD_FILE_NAME_MAX_LENGTH - ext.length - 1;
  return `${base.slice(0, allowedBaseLen).replace(/_+$/, "")}.${ext}`;
}

export function validateStandardFileName(
  fileName: string,
  options: { requiresExpiryTracking?: boolean }
): StandardFileNameValidation {
  const base = stripFilenameExtension(fileName);
  const parts = base.split("_");
  const missing: StandardFileNameValidation["missing"] = [];

  const expiryToken = parts[parts.length - 1] ?? "";
  if (expiryToken === "Unknown" && options.requiresExpiryTracking) {
    missing.push("Expiry");
  }

  if (base.includes("Unknown_Owner")) missing.push("Owner");
  if (base.includes("DMS-Unknown")) missing.push("DOC_NO");

  return {
    valid: missing.length === 0,
    missing,
    expiryToken,
  };
}

/** Append _2, _3 … before extension when names collide. */
export function dedupeFileName(fileName: string, existingNames: Set<string>): string {
  if (!existingNames.has(fileName)) return fileName;

  const ext = getExtensionFromFilename(fileName);
  const base = stripFilenameExtension(fileName);
  let n = 2;
  while (n < 1000) {
    const candidate = `${base}_${n}.${ext}`;
    if (!existingNames.has(candidate)) return candidate;
    n++;
  }
  return `${base}_${Date.now()}.${ext}`;
}
