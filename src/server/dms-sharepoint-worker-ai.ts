import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildClassificationCandidates } from "@/lib/dms/ai/classification-candidate-builder";
import { buildSanitizedClassificationPayload } from "@/lib/dms/ai/classification-output";
import { resolveSuggestedDocumentType } from "@/lib/dms/ai/classification-resolver";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { loadMetadataFieldsForDocumentType } from "@/lib/dms/ai/load-metadata-fields";
import { SOURCE_ROLE_PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import type { DmsExtractedField } from "@/lib/dms/ai/types";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { prepareIntakeOutput } from "@/lib/dms/preparation/intake";

const permitType = "LABOUR_CARD";
const acceptedTypeCodes = new Set([permitType, "LABOR_CARD", "WORK_PERMIT"]);
const captions = {
  full_name_en: "Person Name",
  labour_card_number: "Card Number",
  expiry_date: "Card Expiry Date",
};
const namePattern = /^[A-Za-z][A-Za-z .’'-]{1,119}$/u;
const printedCaption = /^(?:Person Name|Person Code|Passport Number|Passport Issue Date|Passport Expiry Date|Card Number|Card Type|Card Issuance Date|Card Expiry Date|Work Permit|Establishment Name|Nationality|Occupation|Profession|Gender|Sex|Date of Birth|Work Site|Issue Date|Expiry Date|Transaction No|Electronic Work Permit Information)(?:\s*:|$)/iu;
const nextCaption = /^(?:Person Code|Passport|Card|Work Permit|Establishment|Nationality|Occupation|Profession|Gender|Sex|Date of Birth|Work Site|Issue Date|Expiry Date|Transaction No|Electronic Work Permit Information)\b/iu;

type PrintedField = { value: string; snippet: string };
type SharePointProviderPin = {
  provider: "openai";
  model: string;
  configId: number;
  configUpdatedAt: string;
  promptVersion: typeof SOURCE_ROLE_PROMPT_VERSION;
};

function normalizeLine(line: string): string {
  return line.normalize("NFKC").split("|")[0].trim().replace(/\s+/gu, " ");
}

function readCaption(lines: string[], caption: string, allowNameContinuation = false): PrintedField {
  const prefix = `${caption}:`.toLowerCase();
  const exact = caption.toLowerCase();
  const indexes = lines.flatMap((line, index) => line.toLowerCase() === exact || line.toLowerCase().startsWith(prefix) ? [index] : []);
  if (indexes.length !== 1) throw Error("The work permit source evidence is ambiguous.");
  const index = indexes[0];
  const inline = lines[index].slice(caption.length).replace(/^:\s*/u, "").trim();
  const first = inline || lines[index + 1];
  if (!first || (allowNameContinuation && printedCaption.test(first))) {
    throw Error("The work permit source evidence is missing a printed value.");
  }
  const continuationIndex = index + (inline ? 1 : 2);
  const continuation = lines[continuationIndex];
  const following = lines[continuationIndex + 1];
  const parts = [first];
  if (allowNameContinuation && continuation && /^[A-Z]/u.test(continuation) && continuation === continuation.toUpperCase() &&
    namePattern.test(continuation) && !nextCaption.test(continuation) &&
    !(following && printedCaption.test(`${continuation} ${following}`))) parts.push(continuation);
  return { value: parts.join(" "), snippet: [caption, ...parts].join("\n") };
}

function isoPrintedDate(value: string): string | null {
  const printed = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  const iso = printed ? `${printed[3]}-${printed[2]}-${printed[1]}` : value;
  return z.iso.date().safeParse(iso).success ? iso : null;
}

function snippetKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s:]+/gu, " ").trim();
}

/** Prepares one source-bound Work Permit after a durable provider-attempt reservation. */
export async function analyzeSharePointWorkPermit({ client, bytes, filename, sha256, reserveProviderAttempt }: {
  client: SupabaseClient;
  bytes: Buffer;
  filename: string;
  sha256: string;
  reserveProviderAttempt: (pin: SharePointProviderPin) => Promise<void>;
}) {
  if (!/\.pdf$/iu.test(filename) || bytes.length < 1 || bytes.length > 3 * 1024 * 1024 ||
    createHash("sha256").update(bytes).digest("hex") !== sha256) {
    throw Error("The work permit original fingerprint is invalid.");
  }

  const content = await extractFileContent(bytes, "application/pdf", filename, { retainPdfTextForVerification: true });
  const sourceText = content.pdfEmbeddedText || content.text;
  if (content.pageCount !== 1 || !sourceText || (!content.text.trim() && content.images.length !== 1)) {
    throw Error("A single-page work permit with readable printed evidence is required.");
  }

  const { packets, typeCandidates, scoredTypes } = await buildClassificationCandidates(client, sourceText, filename);
  const permit = scoredTypes.find(row => row.type_code === permitType);
  const sourceResolution = resolveSuggestedDocumentType(null, scoredTypes, sourceText);
  if (!permit || sourceResolution.typeId !== permit.id || sourceResolution.source !== "heuristic" ||
    !/\p{Script=Arabic}/u.test(sourceText)) {
    throw Error("The approved bilingual MOHRE work permit layout could not be verified.");
  }

  const lines = sourceText.split(/\r?\n/u).map(normalizeLine).filter(Boolean);
  const holder = readCaption(lines, captions.full_name_en, true);
  const card = readCaption(lines, captions.labour_card_number);
  const expiry = readCaption(lines, captions.expiry_date);
  const issuance = readCaption(lines, "Card Issuance Date");
  const expiryDate = isoPrintedDate(expiry.value);
  const issueDate = isoPrintedDate(issuance.value);
  if (!namePattern.test(holder.value) || printedCaption.test(holder.value) || !/^[A-Z0-9][A-Z0-9-]{2,39}$/iu.test(card.value) ||
    !expiryDate || !issueDate || issueDate > expiryDate) {
    throw Error("The work permit source evidence does not establish the critical fields.");
  }
  const sourceFields: Record<keyof typeof captions, PrintedField> = {
    full_name_en: holder, labour_card_number: card, expiry_date: { ...expiry, value: expiryDate },
  };

  const [{ provider, configId, configCode, configUpdatedAt }, registeredFields] = await Promise.all([
    getDmsAiProvider("analysis"), loadMetadataFieldsForDocumentType(client, permit.id, "intake"),
  ]);
  if (configCode !== "DEFAULT_DMS_CLASSIFIER" || provider.providerCode !== "openai" || !provider.isConfigured() ||
    !provider.modelId || !configId || !Number.isSafeInteger(configId) || configId < 1 || !configUpdatedAt) {
    throw Error("The approved Work Permit classifier configuration is unavailable.");
  }
  if (Object.keys(captions).some(code => !registeredFields.some(field => field.fieldCode === code))) {
    throw Error("Required Work Permit metadata definitions are unavailable.");
  }
  const metadataFields = registeredFields.map(field => {
    const caption = captions[field.fieldCode as keyof typeof captions];
    return caption ? { ...field, isRequired: true, aiFieldHint: [field.aiFieldHint,
      `Read the printed ${caption} only. Include that caption and the full printed value in the source snippet.`].filter(Boolean).join(" ") } : field;
  });

  const pin: SharePointProviderPin = {
    provider: provider.providerCode, model: provider.modelId, configId, configUpdatedAt,
    promptVersion: SOURCE_ROLE_PROMPT_VERSION,
  };
  await reserveProviderAttempt(pin);
  const startedAt = Date.now();
  const output = await provider.analyze({
    ocrText: content.text, imageFiles: content.images, currentTypeCode: null, typeCandidates,
    classificationPackets: packets, metadataFields, originalFilename: filename, dateEvidenceMode: "source_roles",
  });
  const classification = output.classification;
  const suggestedType = classification.suggestedTypeCode?.trim().toUpperCase() ?? "";
  const resolved = resolveSuggestedDocumentType(suggestedType, scoredTypes, "", classification.confidenceScore);
  if (!acceptedTypeCodes.has(suggestedType) || resolved.typeId !== permit.id || output.preparation?.bundle !== "single" ||
    !Number.isFinite(classification.confidenceScore) || classification.confidenceScore < 0.65 || classification.confidenceScore > 1) {
    throw Error("The Work Permit classification is conflicting or uncertain.");
  }

  const verifiedFields: DmsExtractedField[] = [];
  const fieldConfidence: Record<string, { score: number; label: string; source_page: number; source_snippet: string }> = {};
  for (const [code, printed] of Object.entries(sourceFields)) {
    const candidates = output.extraction.fields.filter(field => field.fieldCode === code);
    const model = candidates[0];
    if (candidates.length !== 1 || normalizeLine(model.value) !== printed.value || !model.sourceSnippet ||
      !snippetKey(model.sourceSnippet).startsWith(snippetKey(printed.snippet))) {
      throw Error("The Work Permit AI result differs from the printed source evidence.");
    }
    verifiedFields.push({ ...model, value: printed.value, sourceSnippet: printed.snippet });
    fieldConfidence[code] = { score: model.confidenceScore, label: model.confidenceLabel, source_page: 1, source_snippet: printed.snippet };
  }
  if ((output.extraction.issueDateSuggestion && output.extraction.issueDateSuggestion !== issueDate) ||
    (output.extraction.expiryDateSuggestion && output.extraction.expiryDateSuggestion !== expiryDate)) {
    throw Error("The Work Permit reported dates differ from the printed source evidence.");
  }

  const prepared = prepareIntakeOutput({ ...output, extraction: { ...output.extraction, fields: verifiedFields } }, {
    typeCode: permitType, typeName: permit.name_en, originalName: filename, verifiedSubject: null, sourceHash: sha256,
  });
  const rawClass = output.rawResponse?.classification;
  const reason = classification.reason.slice(0, 500);
  return {
    job: {
      provider: pin.provider, model: pin.model,
      inputTextHash: createHash("sha256").update(content.text, "utf8").digest("hex"),
      promptVersion: pin.promptVersion, providerConfigId: pin.configId, durationMs: Math.max(0, Date.now() - startedAt),
    },
    result: {
      classificationConfidence: classification.confidenceLabel, classificationScore: classification.confidenceScore,
      classificationReason: reason, extractedFields: Object.fromEntries(verifiedFields.map(field => [field.fieldCode, field.value])),
      fieldConfidence, issueDate, expiryDate, title: prepared.title, description: output.extraction.suggestedDescription?.slice(0, 2000) ?? null,
      rawResponse: {
        classification: { ...buildSanitizedClassificationPayload(
          rawClass && typeof rawClass === "object" ? rawClass as Record<string, unknown> : undefined,
          classification.confidenceScore, classification.confidenceLabel, permitType, reason,
        ), needs_human_review: true },
        preparation: prepared,
      },
      rawOcrText: (content.text || output.extraction.fullTextTranscription)?.trim().slice(0, 100_000) || null,
    },
  };
}
