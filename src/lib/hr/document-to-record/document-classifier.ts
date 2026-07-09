/**
 * HR.14A — DMS Document Classification helper
 *
 * Maps DMS document type codes → HR classification.
 */

import type { DmsDocumentClassification } from "./types";

const TYPE_CODE_MAP: Record<string, DmsDocumentClassification> = {
  PASSPORT: "PASSPORT",
  PASSPORT_COPY: "PASSPORT",
  EMIRATES_ID: "EMIRATES_ID",
  EID: "EMIRATES_ID",
  UAE_ID: "EMIRATES_ID",
  RESIDENCE_VISA: "RESIDENCE_VISA",
  VISA: "RESIDENCE_VISA",
  LABOUR_CARD: "LABOUR_CARD",
  WORK_PERMIT: "LABOUR_CARD",
  DRIVING_LICENSE: "DRIVING_LICENSE",
  MEDICAL_INSURANCE: "MEDICAL_INSURANCE",
  INSURANCE_CARD: "MEDICAL_INSURANCE",
  TRAINING_CERTIFICATE: "TRAINING_CERTIFICATE",
  CERTIFICATE: "TRAINING_CERTIFICATE",
  ACCESS_CARD: "ACCESS_CARD",
};

const TITLE_KEYWORDS: Array<[string, DmsDocumentClassification]> = [
  ["passport", "PASSPORT"],
  ["emirates id", "EMIRATES_ID"],
  ["emirates_id", "EMIRATES_ID"],
  ["visa", "RESIDENCE_VISA"],
  ["residence", "RESIDENCE_VISA"],
  ["labour card", "LABOUR_CARD"],
  ["labor card", "LABOUR_CARD"],
  ["work permit", "LABOUR_CARD"],
  ["driving license", "DRIVING_LICENSE"],
  ["driver license", "DRIVING_LICENSE"],
  ["medical insurance", "MEDICAL_INSURANCE"],
  ["health insurance", "MEDICAL_INSURANCE"],
  ["insurance card", "MEDICAL_INSURANCE"],
  ["training", "TRAINING_CERTIFICATE"],
  ["certificate", "TRAINING_CERTIFICATE"],
  ["access card", "ACCESS_CARD"],
];

export function classifyDmsDocument(
  typeCode: string | null | undefined,
  title: string | null | undefined
): DmsDocumentClassification {
  if (typeCode) {
    const upper = typeCode.toUpperCase().trim();
    const direct = TYPE_CODE_MAP[upper];
    if (direct) return direct;
  }
  const lower = (title ?? "").toLowerCase();
  for (const [keyword, cls] of TITLE_KEYWORDS) {
    if (lower.includes(keyword)) return cls;
  }
  return "UNKNOWN";
}

export function classificationLabel(c: DmsDocumentClassification): string {
  const labels: Record<DmsDocumentClassification, string> = {
    PASSPORT: "Passport",
    EMIRATES_ID: "Emirates ID",
    RESIDENCE_VISA: "Residence Visa",
    LABOUR_CARD: "Labour Card",
    DRIVING_LICENSE: "Driving License",
    MEDICAL_INSURANCE: "Medical Insurance",
    TRAINING_CERTIFICATE: "Training Certificate",
    ACCESS_CARD: "Access Card",
    UNKNOWN: "Document",
  };
  return labels[c];
}

export function classificationToComplianceKind(
  c: DmsDocumentClassification
): "identity_document" | "medical_insurance" | "training_certificate" | null {
  if (["PASSPORT", "EMIRATES_ID", "RESIDENCE_VISA", "LABOUR_CARD", "DRIVING_LICENSE"].includes(c)) {
    return "identity_document";
  }
  if (c === "MEDICAL_INSURANCE") return "medical_insurance";
  if (c === "TRAINING_CERTIFICATE") return "training_certificate";
  return null;
}
