/**
 * Template Security Review — BRANDING.7
 *
 * Deterministic static analysis of template content to detect unsafe patterns
 * before a template can be approved or published.
 *
 * Must never perform I/O. Pure functions only.
 */

export type SecurityFindingSeverity = "block" | "warning";

export interface SecurityFinding {
  field: string;
  rule: string;
  severity: SecurityFindingSeverity;
  excerpt: string;
}

export interface SecurityReviewResult {
  passed: boolean;
  severity: "none" | "warning" | "block";
  findings: SecurityFinding[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern definitions
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  // Script injection
  { rule: "script_tag", pattern: /<script[\s>]/i },
  // Arbitrary inline event handlers (user-defined; note: onerror="this.style.display='none'" is allowlisted)
  { rule: "inline_event_handler", pattern: /\bon\w+\s*=\s*["'](?!this\.style\.display='none')/i },
  // SQL fragments
  { rule: "raw_sql_select", pattern: /\bSELECT\b.{0,80}\bFROM\b/i },
  { rule: "raw_sql_insert", pattern: /\bINSERT\b.{0,40}\bINTO\b/i },
  { rule: "raw_sql_delete", pattern: /\bDELETE\b.{0,40}\bFROM\b/i },
  { rule: "raw_sql_drop", pattern: /\bDROP\b.{0,20}\bTABLE\b/i },
  { rule: "raw_sql_update", pattern: /\bUPDATE\b.{0,80}\bSET\b/i },
  // Secret/credential leakage
  { rule: "service_role_leak", pattern: /service_role/i },
  { rule: "api_key_leak", pattern: /api[_-]?key\s*[:=]/i },
  { rule: "secret_leak", pattern: /secret\s*[:=]/i },
  { rule: "token_leak", pattern: /\btoken\s*[:=]\s*["'][A-Za-z0-9+/=._-]{20,}/i },
  // Sensitive data fields
  { rule: "salary_field", pattern: /\bsalary\b|\bpayroll\b|\bbasic_pay\b|\bnet_pay\b/i },
  { rule: "iban_field", pattern: /\biban\b|\baccount_number\b/i },
  { rule: "medical_field", pattern: /\bmedical\b|\bdiagnosis\b|\bprescription\b/i },
];

const WARN_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  // External non-https URLs
  { rule: "http_external_url", pattern: /http:\/\/(?!localhost)/i },
  // AI/ML fields that should not be in public output
  { rule: "ocr_extracted_text", pattern: /\bocr_text\b|\bextracted_text\b/i },
  { rule: "prompt_field", pattern: /\bprompt\b|\bsystem_prompt\b/i },
  { rule: "embedding_field", pattern: /\bembedding\b|\bvector\b/i },
  // Raw SQL comment patterns
  { rule: "sql_comment", pattern: /--\s+\w/i },
];

// ─────────────────────────────────────────────────────────────────────────────
// Field extractor
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateContentFields {
  body_html_en?: string | null;
  body_html_ar?: string | null;
  custom_css?: string | null;
  watermark_text?: string | null;
}

function extractSnippet(text: string, match: RegExpMatchArray): string {
  const start = Math.max(0, (match.index ?? 0) - 20);
  const end = Math.min(text.length, (match.index ?? 0) + 60);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core review function
// ─────────────────────────────────────────────────────────────────────────────

export function runTemplateSecurityReview(
  fields: TemplateContentFields
): SecurityReviewResult {
  const findings: SecurityFinding[] = [];

  const namedFields: Array<[string, string | null | undefined]> = [
    ["body_html_en", fields.body_html_en],
    ["body_html_ar", fields.body_html_ar],
    ["custom_css", fields.custom_css],
    ["watermark_text", fields.watermark_text],
  ];

  for (const [fieldName, content] of namedFields) {
    if (!content) continue;

    for (const { rule, pattern } of BLOCK_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        findings.push({
          field: fieldName,
          rule,
          severity: "block",
          excerpt: extractSnippet(content, match),
        });
      }
    }

    for (const { rule, pattern } of WARN_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        findings.push({
          field: fieldName,
          rule,
          severity: "warning",
          excerpt: extractSnippet(content, match),
        });
      }
    }
  }

  const hasBlock = findings.some((f) => f.severity === "block");
  const hasWarning = findings.some((f) => f.severity === "warning");

  return {
    passed: !hasBlock,
    severity: hasBlock ? "block" : hasWarning ? "warning" : "none",
    findings,
  };
}
