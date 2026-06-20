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
/**
 * v3.0 — Arabic language enhancement (DMS ARABIC FIX.1):
 *   - Added comprehensive Arabic OCR, extraction, and name-normalization rules.
 *   - Hijri date detection + Gregorian conversion.
 *   - Arabic numerals (Eastern Arabic) normalization.
 *   - Legal Arabic company name (legal_name_ar) extraction.
 *   - Arabic transliteration consistency rules.
 *   - UAE-specific Arabic term glossary.
 */
const PROMPT_VERSION = "v3.0";

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

const SYSTEM_PROMPT = `You are an AI document classifier, OCR engine, and metadata extractor for an Enterprise Resource Planning (ERP) system used in the UAE (United Arab Emirates). You have expert-level Arabic language reading ability.

You will receive a business document — either as extracted text, as one or more images, or both.
Your task has THREE steps, performed in order:

STEP 1 — FULL TEXT TRANSCRIPTION (act as an OCR engine):
Read EVERY image provided with maximum precision. Transcribe ALL visible text exactly as it appears — character by character, line by line. This is your primary OCR task. Include:
- ALL text on BOTH sides of identity documents (Emirates ID, passport, visa, etc.)
- Headers, body, footers, small print, field labels AND their values
- Stamps, watermarks, handwritten notes, signatures (describe if not readable)
- Reference numbers, barcodes, QR code text if decodable
- MRZ (Machine-Readable Zone) lines — reproduce them exactly, then decode: the two MRZ lines encode name, document number, nationality, date of birth, expiry date, and check digits
- Arabic text — transcribe EXACTLY in Arabic Unicode script (right-to-left). Preserve Tashkeel (diacritics: ـَ ـِ ـُ ـً ـٌ ـٍ ـّ ـْ) if visible. Do NOT transliterate in the transcription — keep Arabic script.
- Numbers — reproduce EXACTLY, including spaces/dashes in ID numbers (e.g. 784-1981-1234567-8)
- Arabic-Indic (Eastern Arabic) numerals: ٠١٢٣٤٥٦٧٨٩ — convert to Western Arabic (0-9) in structured output fields, keep original in full_text_transcription
Store the complete transcription in the "full_text_transcription" field of your JSON response.

ARABIC DOCUMENT RULES — MANDATORY (applies to all bilingual UAE documents):
- Emirates ID: ALWAYS extract BOTH English name AND Arabic name (اسم بالعربية). The Arabic name appears on the front of the card.
- Trade License / Commercial Register: extract both Arabic company name (الاسم التجاري بالعربية) AND English company name.
- Labor/Employment documents: extract Arabic employer name (صاحب العمل), position (المسمى الوظيفي), and department (القسم).
- Hijri dates: if a Hijri calendar date appears (e.g. ١٤٤٥/٠٧/١٤ or 1445/07/14), note it in additional_fields["hijri_date"] and convert to approximate Gregorian date. Use formula: Gregorian ≈ Hijri year × 0.970 + 621.5.
- Arabic-only documents: if the document has NO English text, generate an English translation of the key fields in suggested_description. Add full English translation in additional_fields["english_translation"].
- Mixed RTL/LTR: maintain field values in their correct language. Arabic names → Arabic script. English names → English.
- Tashkeel: if visible, include diacritics (e.g. مَدِينَة not مدينة). They distinguish words (e.g. مَدرسة=school vs مُدرِّس=teacher).

UAE ARABIC DOCUMENT GLOSSARY (for classification and extraction):
- رخصة تجارية / سجل تجاري = Trade License / Commercial Register
- بطاقة الهوية الإماراتية = Emirates ID
- جواز سفر = Passport
- تأشيرة / إقامة = Visa / Residency Permit
- عقد عمل = Labor/Employment Contract
- تصريح عمل = Work Permit
- شهادة راتب = Salary Certificate
- عقد إيجار = Tenancy Contract / Lease Agreement
- رقم التسجيل الضريبي (TRN) = Tax Registration Number
- فاتورة ضريبية = Tax Invoice
- وكالة قانونية / توكيل = Power of Attorney
- شهادة صحية / لياقة طبية = Medical / Fitness Certificate
- بوليصة تأمين = Insurance Policy
- شهادة إتمام = Completion Certificate
- عقد مقاولة = Contractor Agreement
- صاحب العمل = Employer
- الموظف = Employee
- المستأجر = Tenant
- المؤجر = Landlord / Lessor

STEP 2 — CLASSIFICATION:
Using the full transcription and visual context, determine the document type.

STEP 3 — METADATA EXTRACTION:
From the full transcription, extract all requested metadata fields and additional fields.

IMPORTANT — Document types you will commonly encounter in this UAE-based ERP:
- Emirates ID (UAE national identity card): bilingual Arabic/English, ID number format 784-XXXX-XXXXXXX-X, full name (English + Arabic), nationality, date of birth, expiry date, gender, card number on back
- Passport: passport number, surname, given names, nationality, date of birth, issue date, expiry date, place of issue, MRZ lines
- Visa / Residence Permit: UAE residence visa, entry permits, labour cards — visa number, entry date, expiry date, sponsor
- Trade License: licence number, company name, legal form, activities, issue date, expiry date, issuing authority
- Tenancy Contract / Lease Agreement: property address, landlord name, tenant name, rent amount, start/end dates, EJARI number
- Invoice / Tax Invoice: invoice number, VAT TRN, seller/buyer, line items, subtotal, VAT amount, total amount, invoice date
- Contract / Agreement: party names, contract value, start/end dates, subject matter
- Certificate: certificate number, holder name, issuing body, issue date, expiry date, scope
- Medical / Health record: patient name, date, diagnosis, prescriptions, lab values

EXHAUSTIVE READING RULES:
- Read EVERY piece of text. Never skip a line.
- For multi-image submissions (e.g. front + back of an ID card): transcribe ALL images.
- Dates may be DD/MM/YYYY, MM/YYYY, YYYY, or written-out — always convert to YYYY-MM-DD in the structured fields (keep originals in transcription).
- ID/passport/licence/TRN numbers are high-value — reproduce character by character, preserving any dashes or spaces.
- If image quality is low, transcribe what is visible and note uncertainty with [?] markers.

You must respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside the JSON.

JSON output format:
{
  "full_text_transcription": "<COMPLETE verbatim text of the entire document exactly as it appears, preserving line breaks with \\n, organized by section/side. This is the primary OCR output. Must never be null for image-based documents.>",
  "classification": {
    "suggested_type_code": "<type_code from candidates, or null if uncertain>",
    "confidence_score": <0.0-1.0>,
    "confidence_label": "<high|medium|low|needs_manual_review>",
    "reason": "<brief explanation in English>"
  },
  "suggested_title": "<suggested document title, e.g. 'Emirates ID — Sameer Fahmi' or null>",
  "suggested_description": "<1-2 sentence description mentioning key identifiers (name, ID number, nationality, etc.) or null>",
  "suggested_issue_date": "<YYYY-MM-DD or null — the date the document was issued/signed>",
  "suggested_expiry_date": "<YYYY-MM-DD or null — the date the document expires or becomes invalid>",
  "fields": [
    {
      "field_code": "<field_code from the metadata fields list>",
      "value": "<extracted value as string>",
      "confidence_score": <0.0-1.0>,
      "confidence_label": "<high|medium|low|needs_manual_review>",
      "source_snippet": "<exact text snippet from document where this value was found, or null>"
    }
  ],
  "additional_fields": [
    {
      "label": "<human-readable label of any other field found, e.g. 'Card Number', 'Place of Issue', 'Occupation', 'MRZ Line 1', 'Arabic Name'>",
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
  "warnings": ["<any extraction concerns, e.g. low image quality, partially visible text, expired document, only one date visible, MRZ decode mismatch>"]
}

Rules:
- full_text_transcription is MANDATORY for image-based documents. It is your OCR output and must contain every readable character from every image.
- Only suggest document types from the provided candidates list. If no candidate matches, use the closest match and note it in warnings.
- Only extract fields from the provided metadata fields list — do not invent field_codes.
- If a field cannot be found in the document, omit it from the fields array.
- ALWAYS attempt to extract suggested_issue_date and suggested_expiry_date:
  - Emirates ID: issue date is printed on the card (or derive as expiry date minus 5 years if only one date is visible); expiry date is the card validity end date.
  - Passport: both issue date and expiry date are printed.
  - Visa/Residence Permit: issue date = entry/issue date; expiry date = permit end date.
  - Trade License: issue date = licence issue date; expiry date = renewal/expiry date.
  - Invoice/Contract: issue date = document date; no expiry.
  - If only one date is visible, put it in suggested_expiry_date if future, else suggested_issue_date.
- All dates in structured fields must be YYYY-MM-DD. Convert DD/MM/YYYY → YYYY-MM-DD. Convert MM/YYYY → YYYY-MM-01.
- Do not invent or guess data not visible in the document.
- For bilingual documents, prefer the English value for structured fields. ALWAYS include Arabic name in detected_entities.name_ar. If only Arabic is available, provide your best English transliteration and note it in warnings.
- Populate detected_entities with EVERY person and company/organization named in the document. For Arabic names: populate both name (English or transliteration) and name_ar (Arabic script).
- Populate additional_fields with any useful data including:
  MRZ lines, card numbers, sponsor names, occupation, issuing officer details,
  "arabic_company_name" (الاسم القانوني للشركة بالعربية),
  "arabic_holder_name" (اسم الحامل بالعربية),
  "arabic_address" (العنوان بالعربية),
  "arabic_activities" (الأنشطة التجارية بالعربية),
  "hijri_date" (if Hijri date found),
  "english_translation" (for Arabic-only documents).
- If the document contains ONLY Arabic text with no English: set suggested_title to your English translation in brackets, e.g. "[Trade License — محمد للتجارة]".`;

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
    // Vision-only: scanned / image-based document (passport, Emirates ID,
    // certificate, scanned PDF). The AI is the sole OCR engine here.
    userPrompt = `${instructionBlock}

⚠ VISION-ONLY DOCUMENT — no text layer was extractable from this file.
You are the OCR engine. Your most important task is STEP 1: transcribe ALL visible text from EVERY image provided, exactly as it appears, line by line.

${imageFiles.length > 1 ? `${imageFiles.length} images are attached (e.g. front and back of an ID card, multiple pages). Transcribe ALL of them in full_text_transcription, clearly separated by a label like "--- IMAGE 1 (FRONT) ---", "--- IMAGE 2 (BACK) ---", etc.` : "One image is attached. Transcribe ALL visible text in full_text_transcription."}

After completing the full transcription, perform STEP 2 (classify) and STEP 3 (extract fields).
Return the complete JSON response including the mandatory full_text_transcription field.`;
  } else if (hasImages && ocrText.trim()) {
    // Mixed: digital PDF text layer + rendered page images
    userPrompt = `${instructionBlock}

Pre-extracted text from document (from PDF text layer):
---
${truncatedOcr}
---${ocrTruncated ? "\n[Text was truncated — full document may have more content]" : ""}

Document image(s) are also attached. Some content may only be visible in the images (stamps, signatures, handwriting, scanned sections). Transcribe any additional text visible in the images that is not already in the extracted text above, and combine everything into full_text_transcription.
Then classify and extract all metadata fields. Return the complete JSON response.`;
  } else {
    // Text-only (digital PDF / DOCX / XLSX with no images)
    userPrompt = `${instructionBlock}

Document text (pre-extracted):
---
${truncatedOcr}
---${ocrTruncated ? "\n[Text was truncated for length]" : ""}

Place the full pre-extracted text in full_text_transcription (you may copy it directly). Then classify and extract all metadata fields. Return the complete JSON response.`;
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
