/**
 * Phase 3 — Metadata-aware classification candidate packet builder.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DMS_METADATA_DEFINITION_SELECT,
  mapMetadataDefinitionRow,
  truncateStringList,
  type DmsMetadataDefinitionBase,
} from "@/lib/dms/metadata/metadata-definition-shared";
import {
  buildMetadataRollupFromDefinitions,
  scoreDocumentTypeCandidate,
  selectRankedCandidateTypes,
  type DocumentTypeScoreInput,
  type ScoredDocumentType,
} from "./classification-score";
import { TYPE_CLASSIFICATION_FINGERPRINTS } from "./classification-resolver";
import type { DmsAiDocumentTypeCandidate, DmsClassificationCandidatePacket } from "./types";

export type ClassificationCandidateBuildResult = {
  packets: DmsClassificationCandidatePacket[];
  typeCandidates: DmsAiDocumentTypeCandidate[];
  scoredTypes: ScoredDocumentType[];
};

function aliasesForTypeCode(typeCode: string): string[] {
  const normalized = typeCode.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string[]> = {
    EMIRATES_ID: ["EID", "UAE ID", "Emirates Identity"],
    PASSPORT_COPY: ["Passport", "Passport Scan"],
    PASSPORT: ["Passport"],
    VISA: ["Residence Visa", "Residency", "Residence Permit"],
    VISA_RESIDENCE: ["Visa", "Residence"],
    TRADE_LICENSE: ["Commercial License", "Trade Licence"],
    MEDICAL_INSURANCE: ["Health Insurance", "Insurance Card"],
    TRN_CERTIFICATE: ["TRN", "Tax Registration"],
    LABOUR_CARD: ["Labor Card", "Work Permit"],
  };
  return (map[normalized] ?? []).slice(0, 5);
}

function toPacket(
  scored: ScoredDocumentType,
  definitions: DmsMetadataDefinitionBase[]
): DmsClassificationCandidatePacket {
  const aiFields = definitions.filter((d) => d.is_ai_extractable !== false);
  const rollup = buildMetadataRollupFromDefinitions(definitions);

  return {
    documentTypeId: scored.id,
    typeCode: scored.type_code,
    nameEn: scored.name_en,
    nameAr: scored.name_ar ?? null,
    categoryCode: scored.category_code ?? null,
    description: scored.description?.slice(0, 120) ?? null,
    aliases: aliasesForTypeCode(scored.type_code),
    fingerprint: TYPE_CLASSIFICATION_FINGERPRINTS[scored.type_code]?.slice(0, 200) ?? null,
    expectedKeywords: rollup.expectedKeywords.slice(0, 12),
    expectedKeywordsAr: rollup.expectedKeywordsAr.slice(0, 8),
    expectedFieldLabelsEn: rollup.fieldLabelsEn.slice(0, 8),
    expectedFieldLabelsAr: rollup.fieldLabelsAr.slice(0, 6),
    expectedFormats: rollup.expectedFormats.slice(0, 4),
    negativeKeywords: rollup.negativeKeywords.slice(0, 6),
    metadataFieldCount: aiFields.length,
    requiredFieldCount: aiFields.filter((d) => d.is_required).length,
    preRankScore: scored.score,
  };
}

/** Format packets for inclusion in AI prompt (compact, char-budget aware). */
export function formatClassificationPacketsForPrompt(
  packets: DmsClassificationCandidatePacket[],
  maxChars = 4000
): string {
  const lines: string[] = [];
  let total = 0;

  for (const p of packets) {
    const parts = [
      `code=${p.typeCode}`,
      `name=${p.nameEn}`,
      p.nameAr ? `name_ar=${p.nameAr}` : null,
      p.categoryCode ? `category=${p.categoryCode}` : null,
      p.fingerprint ? `fingerprint=${p.fingerprint.slice(0, 120)}` : null,
      p.aliases.length ? `aliases=${truncateStringList(p.aliases, 5)}` : null,
      p.expectedFieldLabelsEn.length
        ? `labels_en=${truncateStringList(p.expectedFieldLabelsEn, 6)}`
        : null,
      p.expectedFieldLabelsAr.length
        ? `labels_ar=${truncateStringList(p.expectedFieldLabelsAr, 4)}`
        : null,
      p.expectedKeywords.length
        ? `keywords=${truncateStringList(p.expectedKeywords, 8)}`
        : null,
      p.expectedKeywordsAr.length
        ? `keywords_ar=${truncateStringList(p.expectedKeywordsAr, 5)}`
        : null,
      p.expectedFormats.length
        ? `formats=${truncateStringList(p.expectedFormats, 3)}`
        : null,
      p.negativeKeywords.length
        ? `avoid=${truncateStringList(p.negativeKeywords, 4)}`
        : null,
      `fields=${p.metadataFieldCount}`,
      `required=${p.requiredFieldCount}`,
    ].filter(Boolean);

    const line = `- { ${parts.join("; ")} }`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }

  return lines.join("\n");
}

/**
 * Load active document types + metadata definitions and build ranked candidate packets.
 */
export async function buildClassificationCandidates(
  supabase: SupabaseClient,
  ocrText: string,
  originalFilename?: string
): Promise<ClassificationCandidateBuildResult> {
  const { data: typeRows } = await supabase
    .from("dms_document_types")
    .select(
      `id, type_code, name_en, name_ar, description, category_id,
       category:dms_document_categories(category_code, name_en)`
    )
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(50);

  const types: DocumentTypeScoreInput[] = (typeRows ?? []).map((t) => {
    const row = t as Record<string, unknown>;
    const cat = row.category as Record<string, unknown> | null;
    return {
      id: row.id as number,
      type_code: row.type_code as string,
      name_en: row.name_en as string,
      name_ar: (row.name_ar as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      category_code: (cat?.category_code as string | null) ?? null,
    };
  });

  const typeIds = types.map((t) => t.id);
  const definitionsByType = new Map<number, DmsMetadataDefinitionBase[]>();

  if (typeIds.length > 0) {
    const { data: defRows } = await supabase
      .from("dms_metadata_definitions")
      .select(DMS_METADATA_DEFINITION_SELECT)
      .in("document_type_id", typeIds)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order");

    for (const row of defRows ?? []) {
      const mapped = mapMetadataDefinitionRow(row as Record<string, unknown>);
      const list = definitionsByType.get(mapped.document_type_id) ?? [];
      list.push(mapped);
      definitionsByType.set(mapped.document_type_id, list);
    }
  }

  const filename = originalFilename ?? "";
  const scored = types.map((type) => {
    const defs = definitionsByType.get(type.id) ?? [];
    const rollup = buildMetadataRollupFromDefinitions(defs);
    return scoreDocumentTypeCandidate(type, rollup, ocrText, filename);
  });

  const selected = selectRankedCandidateTypes(scored, 12);
  const packets = selected.map((s) => toPacket(s, definitionsByType.get(s.id) ?? []));

  const typeCandidates: DmsAiDocumentTypeCandidate[] = packets.map((p) => ({
    typeCode: p.typeCode,
    nameEn: p.nameEn,
    description: p.description,
    categoryName: p.categoryCode,
  }));

  return { packets, typeCandidates, scoredTypes: selected };
}
