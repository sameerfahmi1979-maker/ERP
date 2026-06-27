/**
 * Phase 3 — Deterministic pre-ranking for metadata-aware document classification.
 * No AI calls, no DB writes.
 */

import {
  inferTypeCodeFromText,
  TYPE_CLASSIFICATION_FINGERPRINTS,
} from "./classification-resolver";
import type { DmsMetadataDefinitionBase } from "@/lib/dms/metadata/metadata-definition-shared";

/** Mandatory UAE common types always considered for candidate selection. */
export const MANDATORY_COMMON_TYPE_CODES = [
  "EMIRATES_ID",
  "PASSPORT_COPY",
  "PASSPORT",
  "VISA",
  "VISA_RESIDENCE",
  "UAE_RESIDENCE_VISA",
  "TRADE_LICENSE",
  "MEDICAL_INSURANCE",
  "TRN_CERTIFICATE",
  "VAT_CERTIFICATE",
  "LABOUR_CARD",
] as const;

export type DocumentTypeScoreInput = {
  id: number;
  type_code: string;
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
  category_code?: string | null;
};

export type MetadataRollup = {
  expectedKeywords: string[];
  expectedKeywordsAr: string[];
  expectedFormats: string[];
  negativeKeywords: string[];
  fieldLabelsEn: string[];
  fieldLabelsAr: string[];
};

export type ScoredDocumentType = DocumentTypeScoreInput & {
  score: number;
  scoreBreakdown: string[];
};

function normalizeToken(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06FF]+/i)
    .filter((t) => t.length >= 2);
}

function countKeywordHits(haystack: string, keywords: string[], maxHits = 5): number {
  if (!haystack || keywords.length === 0) return 0;
  const lower = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (!kw?.trim()) continue;
    if (lower.includes(kw.toLowerCase())) {
      hits++;
      if (hits >= maxHits) break;
    }
  }
  return hits;
}

/** Build reverse alias map: canonical type_code → alias strings */
function aliasesForTypeCode(typeCode: string): string[] {
  const normalized = normalizeToken(typeCode);
  const aliases: string[] = [];
  const aliasEntries: Record<string, string> = {
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
    MEDICAL_INSURANCE: "MEDICAL_INSURANCE",
    HEALTH_INSURANCE: "MEDICAL_INSURANCE",
    INSURANCE_CARD: "MEDICAL_INSURANCE",
    TRADE_LICENSE: "TRADE_LICENSE",
    COMMERCIAL_LICENSE: "TRADE_LICENSE",
    COMMERCIAL_REGISTER: "TRADE_LICENSE",
  };
  for (const [alias, target] of Object.entries(aliasEntries)) {
    if (target === normalized || normalizeToken(target) === normalized) {
      aliases.push(alias.replace(/_/g, " "));
    }
  }
  return [...new Set(aliases)].slice(0, 5);
}

function testFormatInText(text: string, format: string): boolean {
  if (!text || !format) return false;
  const f = format.trim();
  // Emirates ID pattern hint
  if (f.includes("784") || f.toLowerCase().includes("emirates id")) {
    return /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/.test(text);
  }
  // Generic: if format looks like regex, try it
  if (f.startsWith("/") && f.lastIndexOf("/") > 0) {
    try {
      const body = f.slice(1, f.lastIndexOf("/"));
      const re = new RegExp(body, "i");
      return re.test(text);
    } catch {
      return false;
    }
  }
  return text.toLowerCase().includes(f.toLowerCase().slice(0, 40));
}

/**
 * Score a document type against filename + OCR text + metadata rollup.
 * Weights documented inline for maintainability.
 */
export function scoreDocumentTypeCandidate(
  type: DocumentTypeScoreInput,
  rollup: MetadataRollup,
  ocrText: string,
  filename: string
): ScoredDocumentType {
  const breakdown: string[] = [];
  let score = 0;
  const text = `${ocrText}\n${filename}`;
  const codeNorm = normalizeToken(type.type_code);
  const fileLower = filename.toLowerCase();

  // +0.35 filename token match vs type_code or aliases
  const codeTokens = [
    type.type_code.toLowerCase(),
    ...type.type_code.toLowerCase().split("_"),
    ...aliasesForTypeCode(type.type_code).map((a) => a.toLowerCase()),
  ];
  if (codeTokens.some((t) => t.length >= 3 && fileLower.includes(t.replace(/ /g, "_")))) {
    score += 0.35;
    breakdown.push("filename_match");
  }

  // +0.20 type name in text
  if (type.name_en && text.toLowerCase().includes(type.name_en.toLowerCase().slice(0, 20))) {
    score += 0.2;
    breakdown.push("name_en_match");
  }

  // +0.15 Arabic name
  if (type.name_ar && text.includes(type.name_ar.slice(0, 12))) {
    score += 0.15;
    breakdown.push("name_ar_match");
  }

  // +0.20 keyword hits (cap 5 hits → max ~0.20)
  const kwHits = countKeywordHits(text, rollup.expectedKeywords, 5);
  if (kwHits > 0) {
    score += Math.min(0.2, kwHits * 0.04);
    breakdown.push(`keywords_${kwHits}`);
  }

  // +0.15 Arabic keyword hits
  const kwArHits = countKeywordHits(text, rollup.expectedKeywordsAr, 4);
  if (kwArHits > 0) {
    score += Math.min(0.15, kwArHits * 0.05);
    breakdown.push(`keywords_ar_${kwArHits}`);
  }

  // +0.30 format pattern match
  for (const fmt of rollup.expectedFormats) {
    if (testFormatInText(text, fmt)) {
      score += 0.3;
      breakdown.push("format_match");
      break;
    }
  }

  // +0.20 fingerprint signal (type has fingerprint and heuristic infer matches)
  const fp = TYPE_CLASSIFICATION_FINGERPRINTS[type.type_code];
  if (fp && inferTypeCodeFromText(text) === type.type_code) {
    score += 0.2;
    breakdown.push("heuristic_fingerprint");
  }

  // −0.25 per negative keyword hit (max −0.5)
  const negHits = countKeywordHits(text, rollup.negativeKeywords, 3);
  if (negHits > 0) {
    score -= Math.min(0.5, negHits * 0.25);
    breakdown.push(`negative_${negHits}`);
  }

  // +0.10 field label overlap
  const labelHits = countKeywordHits(text, rollup.fieldLabelsEn, 3);
  if (labelHits > 0) {
    score += Math.min(0.1, labelHits * 0.04);
    breakdown.push(`labels_${labelHits}`);
  }

  return {
    ...type,
    score: Math.max(0, Math.min(1, score)),
    scoreBreakdown: breakdown,
  };
}

/** Build metadata rollup from definition rows for one document type. */
export function buildMetadataRollupFromDefinitions(
  definitions: DmsMetadataDefinitionBase[]
): MetadataRollup {
  const aiFields = definitions.filter((d) => d.is_ai_extractable !== false);
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];

  const expectedKeywords: string[] = [];
  const expectedKeywordsAr: string[] = [];
  const expectedFormats: string[] = [];
  const negativeKeywords: string[] = [];
  const fieldLabelsEn: string[] = [];
  const fieldLabelsAr: string[] = [];

  for (const d of aiFields.sort((a, b) => a.sort_order - b.sort_order)) {
    fieldLabelsEn.push(d.field_label_en);
    if (d.field_label_ar) fieldLabelsAr.push(d.field_label_ar);
    if (d.ai_keywords) expectedKeywords.push(...d.ai_keywords);
    if (d.ai_possible_labels_en) expectedKeywords.push(...d.ai_possible_labels_en);
    if (d.ai_possible_labels_ar) expectedKeywordsAr.push(...d.ai_possible_labels_ar);
    if (d.ai_negative_keywords) negativeKeywords.push(...d.ai_negative_keywords);
    if (d.ai_expected_format) expectedFormats.push(d.ai_expected_format);
  }

  return {
    expectedKeywords: uniq(expectedKeywords).slice(0, 20),
    expectedKeywordsAr: uniq(expectedKeywordsAr).slice(0, 12),
    expectedFormats: uniq(expectedFormats).slice(0, 4),
    negativeKeywords: uniq(negativeKeywords).slice(0, 8),
    fieldLabelsEn: uniq(fieldLabelsEn).slice(0, 8),
    fieldLabelsAr: uniq(fieldLabelsAr).slice(0, 6),
  };
}

/** Rank types and select top N + mandatory common types. */
export function selectRankedCandidateTypes(
  scored: ScoredDocumentType[],
  topN = 12
): ScoredDocumentType[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const selected: ScoredDocumentType[] = [];
  const seenIds = new Set<number>();

  for (const row of sorted.slice(0, topN)) {
    if (!seenIds.has(row.id)) {
      selected.push(row);
      seenIds.add(row.id);
    }
  }

  for (const code of MANDATORY_COMMON_TYPE_CODES) {
    const match = scored.find((s) => normalizeToken(s.type_code) === normalizeToken(code));
    if (match && !seenIds.has(match.id)) {
      selected.push(match);
      seenIds.add(match.id);
    }
  }

  return selected;
}
