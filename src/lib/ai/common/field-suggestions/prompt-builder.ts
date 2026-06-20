/**
 * ERP COMMON AI.1A — Field Suggestion Prompt Builder
 *
 * Builds sanitized prompt messages for the Common AI field suggestion engine.
 * This file defines the prompt CONTRACT only — it does NOT call OpenAI or
 * any AI provider. The actual API call happens in Phase 1D server actions.
 *
 * Rules:
 * - Prompts instruct AI to output strict JSON only.
 * - AI must only use linked document evidence — never invent values.
 * - AI must mark uncertain cases as needs_human_review.
 * - AI must only suggest registered fields.
 * - AI must never suggest IDs, codes, numbering, or audit fields.
 * - Prompt builder must NOT log prompt content.
 * - Prompt builder must NOT read from DB.
 * - Prompt builder must NOT call any AI provider.
 */

import {
  ERP_COMMON_AI_PROMPT_VERSION,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
} from "../constants";
import type {
  ErpAiSuggestionGenerationInput,
  ErpAiEligibleFieldRegistration,
  ErpAiDocumentEvidenceSnippet,
} from "../types";

// ── Prompt output types ────────────────────────────────────────────────────────

export interface ErpAiBuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
}

// ── System prompt ──────────────────────────────────────────────────────────────

/**
 * Builds the system prompt for Common AI field suggestions.
 *
 * This instructs the AI on its role, output format, and hard rules.
 */
export function buildErpAiFieldSuggestionSystemPrompt(): string {
  return `You are an AI data assistant for an Enterprise Resource Planning (ERP) system used in the UAE.

Your task is to review linked business documents and suggest values for specific ERP record fields.

CRITICAL RULES — you MUST follow all of these exactly:

1. OUTPUT FORMAT:
   - Respond with ONLY a valid JSON object. No markdown, no code fences, no explanations outside the JSON.
   - The JSON must match the exact structure provided in the user message.

2. EVIDENCE RULES:
   - You may only suggest values that are clearly supported by the provided document evidence snippets.
   - Do NOT invent, guess, or fabricate values.
   - If you are not certain a value appears in the evidence, use suggestionType: "needs_human_review" and set confidenceScore below 0.5.
   - If no evidence supports a field, omit that field from the suggestions array entirely.

3. FIELD RULES:
   - Only suggest values for the fields listed in the "Registered Fields" section of the user message.
   - Do NOT suggest values for any other fields.
   - NEVER suggest values for: id, any *_code field, document_no, reference_no, created_at, updated_at, deleted_at, or any audit/system field.

4. CONFIDENCE SCORING:
   - Use confidenceScore 0.0–1.0 (two decimal places maximum).
   - 0.85–1.00: high — value is clearly and unambiguously stated in the document.
   - 0.65–0.84: medium — value is reasonably inferred from the document.
   - 0.40–0.64: low — value is present but ambiguous or partially visible.
   - Below 0.40: use suggestionType "needs_human_review".

5. EVIDENCE CITATION:
   - Always include sourceDocumentId when suggesting a value.
   - Always include a sourceExcerpt (verbatim short quote from the evidence, max ${ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS} characters).
   - Include a brief aiReason explaining why this value was extracted.

6. SUGGESTION TYPES:
   - fill_missing: field is currently empty, you found a value.
   - correct_value: field has a value but the document shows a different, more accurate value.
   - update_existing: field has a value but the document shows a newer version (e.g. renewed expiry date).
   - clear_wrong_value: field has a clearly incorrect value and should be cleared (suggestedValue: null).
   - conflict_detected: evidence documents disagree about the value.
   - needs_human_review: you are uncertain and a human must verify.

7. UAE CONTEXT:
   - UAE dates may appear as DD/MM/YYYY — convert to YYYY-MM-DD in suggestedValue.
   - TRN (Tax Registration Number) is a 15-digit number.
   - Trade license numbers vary by emirate — extract exactly as printed.
   - Arabic names: prefer the English transliteration in text fields unless the field is explicitly Arabic.

8. LIMITS:
   - Suggest a maximum of ${50} fields per response.
   - Keep aiReason under 200 characters.
   - Keep sourceExcerpt under ${ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS} characters.`;
}

// ── User prompt ────────────────────────────────────────────────────────────────

/**
 * Builds the user prompt containing the current record state, registered fields,
 * and evidence snippets.
 *
 * All input is sanitized — no raw OCR text, no full document content.
 */
export function buildErpAiFieldSuggestionUserPrompt(
  input: ErpAiSuggestionGenerationInput
): string {
  const { entityType, entityId, registeredFields, currentRecord, evidenceSnippets, promptVersion } =
    input;

  const lines: string[] = [];

  lines.push(
    `TASK: Suggest field values for the following ERP record.`,
    ``,
    `Entity Type: ${entityType}`,
    `Entity ID: ${entityId}`,
    `Prompt Version: ${promptVersion}`,
    ``
  );

  // Current record state
  lines.push(`CURRENT FIELD VALUES (null = field is empty):`);
  for (const field of registeredFields) {
    const currentVal = currentRecord.fields[field.targetField];
    const displayVal =
      currentVal === null || currentVal === undefined
        ? "null (empty)"
        : `"${truncate(String(currentVal), 200)}"`;
    lines.push(`  - ${field.targetField} (${field.fieldLabel}): ${displayVal}`);
  }
  lines.push(``);

  // Registered fields specification
  lines.push(`REGISTERED FIELDS (only suggest values for these fields):`);
  for (const field of registeredFields) {
    const hints =
      field.documentTypeHints.length > 0
        ? ` [relevant document types: ${field.documentTypeHints.join(", ")}]`
        : "";
    const overwrite = field.allowOverwrite ? " [overwrite allowed]" : " [only fill if empty]";
    const evidenceRequired = field.requiresExactDocumentEvidence
      ? " [exact document evidence required]"
      : "";
    const hint = field.validationHint ? ` [hint: ${field.validationHint}]` : "";
    const maxLen = field.maxLength ? ` [max ${field.maxLength} chars]` : "";

    lines.push(
      `  - targetField: "${field.targetField}"` +
        `  fieldLabel: "${field.fieldLabel}"` +
        `  fieldType: ${field.fieldType}` +
        hints +
        overwrite +
        evidenceRequired +
        hint +
        maxLen
    );
  }
  lines.push(``);

  // Evidence snippets
  lines.push(`DOCUMENT EVIDENCE (use only this evidence — do not invent values):`);
  if (evidenceSnippets.length === 0) {
    lines.push(`  (No linked document evidence available.)`);
  } else {
    for (const snippet of evidenceSnippets) {
      lines.push(buildEvidenceBlock(snippet));
    }
  }
  lines.push(``);

  // Output format instruction
  lines.push(
    `OUTPUT FORMAT — respond with ONLY this JSON structure:`,
    `{`,
    `  "entityType": "${entityType}",`,
    `  "entityId": ${entityId},`,
    `  "promptVersion": "${promptVersion}",`,
    `  "suggestions": [`,
    `    {`,
    `      "targetField": "<field name from registered fields list>",`,
    `      "fieldLabel": "<matching field label>",`,
    `      "fieldType": "<text|date|number|boolean|fk|json>",`,
    `      "currentValue": "<current value or null>",`,
    `      "suggestedValue": "<new value as string, or null to clear>",`,
    `      "suggestionType": "<fill_missing|correct_value|update_existing|clear_wrong_value|conflict_detected|needs_human_review>",`,
    `      "confidenceScore": <0.0-1.0>,`,
    `      "sourceDocumentId": <document id from evidence>,`,
    `      "sourceDocumentType": "<document type code>",`,
    `      "sourceExcerpt": "<short verbatim quote from evidence>",`,
    `      "aiReason": "<brief explanation>"`,
    `    }`,
    `  ]`,
    `}`
  );

  return lines.join("\n");
}

// ── Combined prompt ────────────────────────────────────────────────────────────

/**
 * Returns the complete built prompt (system + user) as an ErpAiBuiltPrompt.
 * This is what Phase 1D server actions will pass to the AI provider.
 */
export function buildErpAiFieldSuggestionPrompt(
  input: ErpAiSuggestionGenerationInput
): ErpAiBuiltPrompt {
  return {
    systemPrompt: buildErpAiFieldSuggestionSystemPrompt(),
    userPrompt: buildErpAiFieldSuggestionUserPrompt(input),
    promptVersion: ERP_COMMON_AI_PROMPT_VERSION,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildEvidenceBlock(snippet: ErpAiDocumentEvidenceSnippet): string {
  const lines: string[] = [];
  lines.push(`  Document ID: ${snippet.documentId}`);
  if (snippet.documentTypeCode) {
    lines.push(`    Type: ${snippet.documentTypeCode}`);
  }
  if (snippet.documentTitle) {
    lines.push(`    Title: ${truncate(snippet.documentTitle, 100)}`);
  }
  if (snippet.issueDate) lines.push(`    Issue Date: ${snippet.issueDate}`);
  if (snippet.expiryDate) lines.push(`    Expiry Date: ${snippet.expiryDate}`);
  if (snippet.aiSummarySnippet) {
    lines.push(
      `    Summary: ${truncate(snippet.aiSummarySnippet, ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS)}`
    );
  }
  if (snippet.contentSnippet) {
    lines.push(
      `    Content: ${truncate(snippet.contentSnippet, ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS)}`
    );
  }
  return lines.join("\n");
}

// ── Eligible field helpers ────────────────────────────────────────────────────

/**
 * Filters registered fields to only those relevant to the generation run.
 * Stage 2 stub entities should not reach here, but this adds a safety check.
 */
export function filterActiveRegisteredFields(
  fields: ErpAiEligibleFieldRegistration[]
): ErpAiEligibleFieldRegistration[] {
  return fields.filter((f) => f.isAiEligible === true);
}
