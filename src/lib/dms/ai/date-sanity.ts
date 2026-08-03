/**
 * DMS AI — Date sanity corrections ("smart catching")
 *
 * Deterministic post-extraction guards for AI date mistakes that no prompt can
 * fully prevent. Applied to every validated AI output (intake pass 1/2, rerun,
 * document analysis) via validateAiOutput().
 *
 * Current rule: an issue date can NEVER be after an expiry date. When the AI
 * returns the pair inverted (a recurring Emirates ID mistake — both dates are
 * printed on the card front), swap them and add a visible warning so the
 * reviewer double-checks.
 */

import type { DmsAiOutput } from "./types";

const ISSUE_FIELD_CODES = new Set([
  "issue_date",
  "issued_date",
  "date_issued",
  "issuing_date",
  "start_date",
]);

const EXPIRY_FIELD_CODES = new Set([
  "expiry_date",
  "expiry",
  "valid_until",
  "validity_date",
  "end_date",
  "date_expiry",
]);

/** Parse a date string in the formats the AI returns; null when unparseable. */
function parseFlexibleDate(val: string | null | undefined): number | null {
  if (!val || !val.trim()) return null;
  const v = val.trim();

  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    iso = v;
  } else {
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  if (!iso) return null;

  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Mutates the output in place: swaps inverted issue/expiry dates at both the
 * document level (suggested_issue_date / suggested_expiry_date) and the
 * metadata-field level, appending warnings when a correction was made.
 */
export function applyDateSanityCorrections(output: DmsAiOutput): void {
  const ext = output.extraction;
  const warnings: string[] = [];

  // ── 1. Document-level suggestions ─────────────────────────────────────────
  const issueTs = parseFlexibleDate(ext.issueDateSuggestion);
  const expiryTs = parseFlexibleDate(ext.expiryDateSuggestion);
  if (issueTs != null && expiryTs != null && issueTs > expiryTs) {
    const tmp = ext.issueDateSuggestion;
    ext.issueDateSuggestion = ext.expiryDateSuggestion;
    ext.expiryDateSuggestion = tmp;
    warnings.push(
      "Auto-corrected: the AI returned the issue date AFTER the expiry date — the two dates were swapped. Please verify both dates against the document."
    );
  }

  // ── 2. Extracted metadata fields (e.g. EMIRATES_ID issue_date/expiry_date) ─
  const issueField = ext.fields.find((f) => ISSUE_FIELD_CODES.has(f.fieldCode.toLowerCase()));
  const expiryField = ext.fields.find((f) => EXPIRY_FIELD_CODES.has(f.fieldCode.toLowerCase()));
  if (issueField && expiryField) {
    const fieldIssueTs = parseFlexibleDate(issueField.value);
    const fieldExpiryTs = parseFlexibleDate(expiryField.value);
    if (fieldIssueTs != null && fieldExpiryTs != null && fieldIssueTs > fieldExpiryTs) {
      const tmpValue = issueField.value;
      issueField.value = expiryField.value;
      expiryField.value = tmpValue;
      // Snippets travel with the values — the pair was cross-assigned.
      const tmpSnippet = issueField.sourceSnippet;
      issueField.sourceSnippet = expiryField.sourceSnippet;
      expiryField.sourceSnippet = tmpSnippet;
      warnings.push(
        `Auto-corrected: swapped the values of '${issueField.fieldCode}' and '${expiryField.fieldCode}' — an issue date must precede the expiry date. Please verify.`
      );
    }
  }

  if (warnings.length > 0) {
    output.warnings = [...(output.warnings ?? []), ...warnings];
  }
}
