/**
 * DMS.10 — AI Prompt Builders
 *
 * Builds structured prompts for classification and metadata extraction.
 * OCR text and full prompts are NEVER stored in audit logs.
 * Prompts are truncated to safe token limits before sending.
 */

import type { DmsAiDocumentTypeCandidate, DmsAiImageFile, DmsAiMetadataField } from "./types";

/** Maximum OCR text characters to include in a single prompt (≈ 6000 tokens). */
const MAX_OCR_CHARS = 12_000;
const PROMPT_VERSION = "v1.3";

export { PROMPT_VERSION };

export interface BuiltPrompt {
  systemPrompt: string;
  /** Plain text user prompt (used when there are no image attachments). */
  userPrompt: string;
  /** Rich content array for multimodal requests (text + image parts). */
  userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }>;
  ocrTruncated: boolean;
  hasImages: boolean;
}

const SYSTEM_PROMPT = `You are an AI document classifier and metadata extractor for an Enterprise Resource Planning (ERP) system used in the UAE (United Arab Emirates).

You will receive a business document — either as extracted text, as one or more images, or both.
Your task is to carefully read the document, determine its type, and extract all structured metadata visible in it.

IMPORTANT — Document types you will commonly encounter in this UAE-based ERP:
- Emirates ID (UAE national identity card): bilingual Arabic/English, contains ID number (format 784-XXXX-XXXXXXX-X), full name, nationality, date of birth, expiry date, gender
- Passport: multiple nationalities, contains passport number, full name, nationality, date of birth, issue/expiry dates
- Visa / Residence Permit: UAE residence visa, entry permits, labour cards
- Trade License: UAE company trade licence with licence number, company name, activities, expiry
- Tenancy Contract / Lease Agreement: property address, landlord/tenant names, rent amount, dates
- Invoice / Tax Invoice: VAT invoice with TRN, amounts, line items
- Contract / Agreement: commercial contracts, service agreements
- Certificate: various official certificates (MOL, municipality, etc.)
- Medical / Health record: lab results, prescriptions, medical reports

EXHAUSTIVE READING — this is critical:
- Read EVERY piece of text on the document: headers, body, footers, small print, stamps, watermarks, signatures, reference numbers, barcodes/MRZ lines.
- Read ALL pages / ALL images provided (e.g. front AND back of an ID card, every page of a contract, every sheet of a spreadsheet).
- Handle bilingual documents (Arabic + English) — prefer English values, but capture Arabic names/values if English is absent.
- For UAE identity documents: extract the ID/passport/visa number, full name (English + Arabic), nationality, date of birth, gender, issuing place, issue date, and expiry date.
- For the machine-readable zone (MRZ) on IDs/passports, decode it to cross-check name, number, nationality, and dates.
- Dates may be DD/MM/YYYY, MM/YYYY, or written out — always convert to YYYY-MM-DD.
- ID numbers, passport numbers, licence numbers, TRN, and reference numbers are high-value — extract them precisely, character by character.
- Capture EVERYTHING you find in "additional_fields" even if it is not in the requested metadata list, so no information is lost.

You must respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside the JSON.

JSON output format:
{
  "classification": {
    "suggested_type_code": "<type_code from candidates, or null if uncertain>",
    "confidence_score": <0.0-1.0>,
    "confidence_label": "<high|medium|low|needs_manual_review>",
    "reason": "<brief explanation in English>"
  },
  "suggested_title": "<suggested document title, e.g. 'Emirates ID — Sameer Fahmi' or null>",
  "suggested_description": "<1-2 sentence description mentioning key identifiers (name, ID number, nationality, etc.) or null>",
  "suggested_issue_date": "<YYYY-MM-DD or null — the date the document was ISSUED/ISSUED ON, e.g. the card issue date, contract signing date, invoice date>",
  "suggested_expiry_date": "<YYYY-MM-DD or null — the date the document EXPIRES or becomes invalid>",
  "fields": [
    {
      "field_code": "<field_code from the metadata fields list>",
      "value": "<extracted value as string>",
      "confidence_score": <0.0-1.0>,
      "confidence_label": "<high|medium|low|needs_manual_review>",
      "source_snippet": "<short text snippet from document or null>"
    }
  ],
  "additional_fields": [
    {
      "label": "<human-readable label of any other field found, e.g. 'Card Number', 'Place of Issue', 'Occupation'>",
      "value": "<extracted value as string>",
      "confidence_score": <0.0-1.0>
    }
  ],
  "detected_entities": [
    {
      "entity_type": "<person|company|organization>",
      "name": "<full name exactly as written, English preferred>",
      "name_ar": "<Arabic name if present, else null>",
      "identifier": "<related ID/passport/licence/TRN number if any, else null>",
      "role": "<role in document if clear, e.g. 'holder', 'landlord', 'tenant', 'vendor', 'customer'>"
    }
  ],
  "warnings": ["<any extraction concerns, e.g. low image quality, partially visible text, expired document, only one date visible>"]
}

Rules:
- Only suggest document types from the provided candidates list. If no candidate matches, use the closest match and note it in warnings.
- Only extract fields from the provided metadata fields list — do not invent field_codes.
- If a field cannot be found in the document, omit it from the fields array.
- ALWAYS attempt to extract suggested_issue_date and suggested_expiry_date — these are top-level core fields required for ALL document types.
  - Emirates ID: issue date is printed on the card (or derive it as expiry date minus 5 years if only one date is visible); expiry date is the card validity end date.
  - Passport: issue date and expiry date are both printed.
  - Visa/Residence Permit: issue date = entry/issue date; expiry date = permit end date.
  - Trade License: issue date = licence issue date; expiry date = renewal/expiry date.
  - Invoice/Contract: issue date = document date; no expiry.
  - If only one date is visible on the document, put it in suggested_expiry_date if it is a future date, else in suggested_issue_date.
- confidence_score must be between 0.0 and 1.0.
- All dates must be in YYYY-MM-DD format. Convert DD/MM/YYYY → YYYY-MM-DD. Convert MM/YYYY → YYYY-MM-01.
- Do not invent or guess data not visible in the document.
- If the image quality is poor or text is unclear, lower the confidence score and add a warning.
- For scanned or photographed documents, use visual context (logos, layout, colours, stamps) to help classify even if some text is unclear.
- For bilingual documents, prefer the English value for field extraction but include Arabic names in the title if that's the only source.
- Populate detected_entities with EVERY person and company/organization named in the document — the ERP will try to match them to existing records in its database. Include their identifier (ID/passport/licence/TRN) and role when visible.
- Populate additional_fields with any other useful data you read that is not in the requested metadata list. Never leave information on the document uncaptured.`;

/**
 * Builds a combined classification + extraction prompt.
 * Supports both text-only and multimodal (text + image) inputs.
 */
export function buildCombinedPrompt(
  ocrText: string,
  typeCandidates: DmsAiDocumentTypeCandidate[],
  metadataFields: DmsAiMetadataField[],
  currentTypeCode: string | null,
  imageFiles: DmsAiImageFile[] = [],
  originalFilename?: string
): BuiltPrompt {
  const truncatedOcr = ocrText.substring(0, MAX_OCR_CHARS);
  const ocrTruncated = ocrText.length > MAX_OCR_CHARS;
  const hasImages = imageFiles.length > 0;

  const candidateList = typeCandidates
    .slice(0, 20)
    .map((t) => `- ${t.typeCode}: ${t.nameEn}${t.description ? ` (${t.description.slice(0, 80)})` : ""}`)
    .join("\n");

  const fieldList = metadataFields
    .map((f) => {
      let line = `- ${f.fieldCode} (${f.fieldType}): ${f.labelEn}`;
      if (f.aiFieldHint) line += ` [hint: ${f.aiFieldHint}]`;
      if (f.isRequired) line += " [required]";
      return line;
    })
    .join("\n");

  const filenameHint = originalFilename
    ? `Original filename: ${originalFilename}\n`
    : "";
  const contextHeader = currentTypeCode
    ? `${filenameHint}Current document type: ${currentTypeCode}\n\n`
    : filenameHint
      ? `${filenameHint}\n`
      : "";

  const instructionBlock = `${contextHeader}Document type candidates:
${candidateList}

Metadata fields to extract:
${fieldList || "(no specific fields defined for this type)"}`;

  let userPrompt: string;

  if (hasImages && !ocrText.trim()) {
    // Vision-only: scanned / image-based document — AI reads all content visually
    userPrompt = `${instructionBlock}

This is a scanned or image-based document (no text layer was extractable). The full document is provided as image(s) below.
Read ALL visible text carefully — including both sides if multiple images are provided, small print, stamps, watermarks, and any bilingual (Arabic/English) content.
Classify the document and extract every metadata field you can identify. Return the JSON response.`;
  } else if (hasImages && ocrText.trim()) {
    // Mixed: text from PDF + additional images
    userPrompt = `${instructionBlock}

Extracted text from document:
---
${truncatedOcr}
---${ocrTruncated ? "\n[Text was truncated for length]" : ""}

Additional document image(s) are attached. Use both the text and images to analyze the document and return the JSON response.`;
  } else {
    // Text-only
    userPrompt = `${instructionBlock}

Document text:
---
${truncatedOcr}
---${ocrTruncated ? "\n[Text was truncated for length]" : ""}

Analyze this document and return the JSON response.`;
  }

  // Build multimodal content array
  const userContent: BuiltPrompt["userContent"] = [{ type: "text", text: userPrompt }];
  for (const img of imageFiles.slice(0, 4)) { // max 4 images per request
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    });
  }

  return { systemPrompt: SYSTEM_PROMPT, userPrompt, userContent, ocrTruncated, hasImages };
}

/**
 * Returns a safe SHA-256-like hash fingerprint of the OCR text.
 * Uses a simple djb2-based hash — deterministic, not cryptographic.
 * This is used only for job deduplication, not security.
 */
export function hashOcrText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < Math.min(text.length, 10_000); i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}-len${text.length}`;
}
