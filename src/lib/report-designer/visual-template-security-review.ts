/**
 * Report Designer — Visual Template Security Review
 * Phase: REPORT DESIGNER.7 — Governance, Approval & Security Review Integration
 *
 * Pure functions (no I/O) that inspect visual layout JSON for unsafe content
 * before a template can be submitted for review, approved, or published.
 *
 * Designed to integrate cleanly into the existing security review pipeline
 * in `src/lib/template-governance/security-review.ts`.
 *
 * RULES enforced:
 *  - Only 'puck' engine or null/empty allowed
 *  - Schema version must be supported
 *  - Header/body/footer must validate against ReportDesignerLayoutJsonSchema
 *  - Only the approved 10 block types allowed
 *  - No raw HTML, script, iframe, object, embed, meta, link tags
 *  - No event handler keys (onClick, onLoad, onError, onMouseEnter, etc.)
 *  - No arbitrary external URLs in any block prop
 *  - No forbidden binding paths (salary, IBAN, bank, medical, etc.)
 *  - No unknown binding placeholders in text fields
 *  - No unsafe protocol strings (javascript:, data:text/html, vbscript:)
 *  - No secret/credential patterns (service_role, api_key, etc.)
 *  - Payload size limits per zone
 *
 * Returns `VisualTemplateSecurityReviewResult` compatible with the existing
 * `SecurityFinding[]` / `SecurityReviewResult` contract.
 */

import {
  ReportDesignerLayoutJsonSchema,
} from "./layout-schema";
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
} from "./types";
import {
  REPORT_DESIGNER_BLOCK_TYPES,
} from "./constants";
import { ERP_BINDING_REGISTRY, extractBindingsFromText } from "./binding-registry";
import { isRegisteredSensitiveField, getReportFieldByPath } from "./field-registry";
import type { SecurityFinding } from "@/lib/template-governance/security-review";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum allowed JSON string length per zone (bytes) */
const MAX_ZONE_JSON_BYTES = 64 * 1024; // 64 KB per zone

/** Known ERP block types (allowlist) — auto-updated via REPORT_DESIGNER_BLOCK_TYPES */
const ALLOWED_BLOCK_TYPES = new Set(REPORT_DESIGNER_BLOCK_TYPES as unknown as string[]);

/** Supported visual editor engines */
const ALLOWED_VISUAL_ENGINES = new Set(["puck"]);

/** Unsafe HTML tag patterns to block inside any block text prop */
const UNSAFE_HTML_PATTERN = /<(script|iframe|object|embed|meta|link|base|form|input|button|applet|frame|frameset|style)\b/i;

/** Unsafe protocol patterns */
const UNSAFE_PROTOCOL_PATTERN = /javascript:|data:text\/html|data:application\/|vbscript:/i;

/** Event handler key pattern */
const EVENT_HANDLER_KEY_PATTERN = /^on[A-Z][a-zA-Z]+$/;

/**
 * Credential/technical fragments that must ALWAYS be blocked regardless of governance.
 * These are never legitimate in a report template.
 */
const ALWAYS_BLOCK_BINDING_FRAGMENTS = new Set([
  "ocr_text", "extracted_text", "embedding", "vector",
  "api_key", "secret", "token", "service_role",
]);

/**
 * Governed sensitive field fragments. These are now registry-backed (UX.3).
 * For registered fields, the security review checks the template type allowlist.
 * For unregistered paths that match these fragments, blocking is applied.
 */
const GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS = new Set([
  "salary", "basic_salary", "total_salary", "net_salary",
  "iban", "account_number", "bank_account",
  "passport", "emirates_id", "eid", "visa_number", "residence_visa",
  "medical", "diagnosis", "prescription",
]);

/**
 * Combined set for backward-compat checks in block-level validations.
 * @deprecated Prefer ALWAYS_BLOCK_BINDING_FRAGMENTS + GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS
 */
const SENSITIVE_BINDING_FRAGMENTS = new Set([
  ...ALWAYS_BLOCK_BINDING_FRAGMENTS,
  ...GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS,
]);

/** Sensitive column key fragments that must never appear in ReportTableBlock column keys */
const SENSITIVE_COLUMN_KEY_FRAGMENTS = new Set([
  "salary", "iban", "bank", "account", "passport", "eid", "visa",
  "medical", "health", "insurance", "token", "secret", "api_key",
  "ocr", "extracted", "embedding", "vector", "password", "pin",
]);

/** Only this data source value is allowed on ReportTableBlock */
const ALLOWED_TABLE_DATA_SOURCES = new Set(["report.preview_rows"]);

/** Safe column key regex — same as in layout-schema.ts */
const SAFE_COLUMN_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]*$/;
const SUSPICIOUS_VALUE_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "service_role_in_prop", pattern: /service_role/i },
  { rule: "api_key_in_prop", pattern: /api[_-]?key\s*[:=]/i },
  { rule: "raw_sql_select", pattern: /\bSELECT\b.{0,80}\bFROM\b/i },
  { rule: "raw_sql_insert", pattern: /\bINSERT\b.{0,40}\bINTO\b/i },
  { rule: "raw_sql_drop", pattern: /\bDROP\b.{0,20}\bTABLE\b/i },
  { rule: "unsafe_protocol", pattern: UNSAFE_PROTOCOL_PATTERN },
];

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface VisualTemplateSecurityReviewInput {
  visual_editor_engine?: string | null;
  visual_layout_schema_version?: number | null;
  header_layout_json?: unknown;
  body_layout_json?: unknown;
  footer_layout_json?: unknown;
  style_json?: unknown;
  /** UX.3: Template type — used for sensitive field allowlist validation */
  template_type?: string | null;
}

export interface VisualTemplateSecurityReviewResult {
  /** True if no blocking findings */
  passed: boolean;
  /** Highest finding severity */
  severity: "none" | "warning" | "block";
  /** All findings from visual layout inspection */
  findings: SecurityFinding[];
  /** Whether a visual layout was actually present (engine=puck + at least one non-empty zone) */
  hasVisualLayout: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeField(zone: string, subPath?: string): string {
  return subPath ? `visual.${zone}.${subPath}` : `visual.${zone}`;
}

function blocking(field: string, rule: string, excerpt: string): SecurityFinding {
  return { field, rule, severity: "block", excerpt };
}

function warning(field: string, rule: string, excerpt: string): SecurityFinding {
  return { field, rule, severity: "warning", excerpt };
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/**
 * Scan a single string value for unsafe patterns.
 */
function scanStringValue(
  value: string,
  field: string
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (UNSAFE_HTML_PATTERN.test(value)) {
    findings.push(blocking(field, "unsafe_html_tag", truncate(value)));
  }

  for (const { rule, pattern } of SUSPICIOUS_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      findings.push(blocking(field, rule, truncate(value)));
    }
  }

  return findings;
}

/**
 * Extract and validate binding paths from text nodes and bindingToken nodes
 * in ProseMirror JSON. Recursively walks the doc tree.
 *
 * UX.2 update: Also validates bindingToken.attrs.path against the registry.
 * UX.3 update: Governance-aware checking for restricted/confidential fields.
 */
function validateBindingsInRichContent(
  node: Record<string, unknown>,
  fieldPrefix: string,
  templateType?: string | null
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check text nodes for manually typed {{path}} tokens
  if (node.type === "text" && typeof node.text === "string") {
    findings.push(...validateBindingsInText(node.text, `${fieldPrefix}.text`, templateType));
  }

  // UX.2/UX.3: Check bindingToken nodes — validate attrs.path against registry
  if (node.type === "bindingToken") {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const path = typeof attrs?.path === "string" ? attrs.path : "";
    if (!path) {
      findings.push(blocking(`${fieldPrefix}.bindingToken`, "empty_binding_token_path", "(empty path)"));
    } else {
      const lowerPath = path.toLowerCase();

      // Check always-block fragments first
      let alwaysBlock = false;
      for (const fragment of ALWAYS_BLOCK_BINDING_FRAGMENTS) {
        if (lowerPath.includes(fragment)) {
          findings.push(blocking(`${fieldPrefix}.bindingToken`, "sensitive_binding_path", `{{${path}}}`));
          alwaysBlock = true;
          break;
        }
      }

      if (!alwaysBlock) {
        // Check governance-sensitive fragments
        let isSensitiveFragment = false;
        for (const fragment of GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS) {
          if (lowerPath.includes(fragment)) {
            isSensitiveFragment = true;
            break;
          }
        }

        if (isSensitiveFragment) {
          if (isRegisteredSensitiveField(path)) {
            const entry = getReportFieldByPath(path);
            if (entry?.allowedTemplateTypes && templateType) {
              if (entry.allowedTemplateTypes.includes(templateType)) {
                findings.push(
                  warning(`${fieldPrefix}.bindingToken`, "restricted_field_elevated_approval_required",
                    `{{${path}}} — restricted field in ${templateType} template. Requires reports.sensitive_fields.approve to publish.`)
                );
              } else {
                findings.push(
                  blocking(`${fieldPrefix}.bindingToken`, "restricted_field_template_type_not_allowed",
                    `{{${path}}} — not allowed for template type "${templateType}". Allowed: ${entry.allowedTemplateTypes.join(", ")}`)
                );
              }
            } else {
              findings.push(
                warning(`${fieldPrefix}.bindingToken`, "restricted_field_template_type_unknown",
                  `{{${path}}} — restricted field; ensure template type is set and allowed.`)
              );
            }
          } else {
            findings.push(blocking(`${fieldPrefix}.bindingToken`, "sensitive_binding_path", `{{${path}}}`));
          }
        } else if (!ERP_BINDING_REGISTRY[path]) {
          findings.push(warning(`${fieldPrefix}.bindingToken`, "unknown_binding_path", `{{${path}}}`));
        }
      }
    }
  }

  // Recurse into content
  const content = node.content;
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      if (content[i] && typeof content[i] === "object") {
        findings.push(
          ...validateBindingsInRichContent(
            content[i] as Record<string, unknown>,
            `${fieldPrefix}.content[${i}]`,
            templateType
          )
        );
      }
    }
  }

  return findings;
}

/**
 * Walk an arbitrary JSON object and collect all string values recursively.
 * Also checks object keys for event handler names.
 * Returns SecurityFindings for anything suspicious.
 */
function scanJsonObject(
  obj: unknown,
  fieldPrefix: string,
  depth = 0
): SecurityFinding[] {
  if (depth > 20) return []; // Prevent deep recursion
  if (obj === null || obj === undefined) return [];

  const findings: SecurityFinding[] = [];

  if (typeof obj === "string") {
    findings.push(...scanStringValue(obj, fieldPrefix));
    return findings;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      findings.push(...scanJsonObject(obj[i], `${fieldPrefix}[${i}]`, depth + 1));
    }
    return findings;
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      // Check for event handler keys
      if (EVENT_HANDLER_KEY_PATTERN.test(key)) {
        findings.push(blocking(`${fieldPrefix}.${key}`, "event_handler_key", key));
      }
      findings.push(
        ...scanJsonObject(
          (obj as Record<string, unknown>)[key],
          `${fieldPrefix}.${key}`,
          depth + 1
        )
      );
    }
  }

  return findings;
}

/**
 * Validate binding paths in text fields against the allowlist.
 * Returns findings for unknown or sensitive bindings.
 *
 * UX.3: Governance-aware — registered sensitive fields are allowed if
 * template_type matches their allowedTemplateTypes; otherwise blocked.
 */
function validateBindingsInText(
  text: string,
  field: string,
  templateType?: string | null
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const bindings = extractBindingsFromText(text);

  for (const binding of bindings) {
    const lowerPath = binding.toLowerCase();

    // 1. Always-block credential/tech fragments
    let alwaysBlock = false;
    for (const fragment of ALWAYS_BLOCK_BINDING_FRAGMENTS) {
      if (lowerPath.includes(fragment)) {
        findings.push(blocking(field, "sensitive_binding_path", `{{${binding}}}`));
        alwaysBlock = true;
        break;
      }
    }
    if (alwaysBlock) continue;

    // 2. Check governance-sensitive fragments
    let isSensitiveFragment = false;
    for (const fragment of GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS) {
      if (lowerPath.includes(fragment)) {
        isSensitiveFragment = true;
        break;
      }
    }

    if (isSensitiveFragment) {
      // UX.3: Check if this is a registered restricted/confidential field
      if (isRegisteredSensitiveField(binding)) {
        const entry = getReportFieldByPath(binding);
        if (entry?.allowedTemplateTypes && templateType) {
          if (entry.allowedTemplateTypes.includes(templateType)) {
            // Template type is allowed — warning only (needs elevated approval)
            findings.push(
              warning(
                field,
                "restricted_field_elevated_approval_required",
                `{{${binding}}} — restricted field in ${templateType} template. Requires reports.sensitive_fields.approve to publish.`
              )
            );
          } else {
            // Template type NOT allowed for this field
            findings.push(
              blocking(
                field,
                "restricted_field_template_type_not_allowed",
                `{{${binding}}} — not allowed for template type "${templateType}". Allowed: ${entry.allowedTemplateTypes.join(", ")}`
              )
            );
          }
        } else if (entry?.allowedTemplateTypes && !templateType) {
          // No template type available — warn, cannot validate allowlist
          findings.push(
            warning(
              field,
              "restricted_field_template_type_unknown",
              `{{${binding}}} — restricted field; template type unknown. Ensure template type is set.`
            )
          );
        } else {
          // No allowedTemplateTypes defined — block (field not fully governed)
          findings.push(blocking(field, "sensitive_binding_path", `{{${binding}}}`));
        }
      } else {
        // Not a registered sensitive field — unknown suspicious path — block
        findings.push(blocking(field, "sensitive_binding_path", `{{${binding}}}`));
      }
      continue;
    }

    // 3. Unknown binding path (not in allowlist and not sensitive)
    if (!ERP_BINDING_REGISTRY[binding]) {
      findings.push(
        warning(field, "unknown_binding_path", `{{${binding}}}`)
      );
    }
  }

  return findings;
}

/**
 * Scan all text content strings in a block for binding issues.
 */
function scanBlockBindings(
  block: Record<string, unknown>,
  fieldPrefix: string,
  templateType?: string | null
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const [key, value] of Object.entries(block)) {
    if (typeof value === "string" && value.includes("{{")) {
      findings.push(...validateBindingsInText(value, `${fieldPrefix}.${key}`, templateType));
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Review a single layout zone (header/body/footer) for security issues.
 * Returns SecurityFinding[] for all violations found.
 *
 * UX.3: templateType is used for governance-aware sensitive field checking.
 */
export function reviewVisualLayoutZone(
  zoneRaw: unknown,
  zoneName: "header" | "body" | "footer",
  templateType?: string | null
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!zoneRaw || typeof zoneRaw !== "object") return findings;

  // Size check (JSON stringify to get approximate size)
  const jsonStr = JSON.stringify(zoneRaw);
  if (jsonStr.length > MAX_ZONE_JSON_BYTES) {
    findings.push(
      blocking(
        makeField(zoneName),
        "zone_payload_too_large",
        `Zone payload ${jsonStr.length} bytes exceeds limit of ${MAX_ZONE_JSON_BYTES}`
      )
    );
    return findings; // Don't proceed with parsing if too large
  }

  // Validate with Zod schema
  const parsed = ReportDesignerLayoutJsonSchema.safeParse(zoneRaw);
  if (!parsed.success) {
    // If empty layout (empty content array), pass silently
    const maybeContent = (zoneRaw as Record<string, unknown>).content;
    if (Array.isArray(maybeContent) && maybeContent.length === 0) {
      return findings;
    }
    findings.push(
      blocking(
        makeField(zoneName),
        "invalid_layout_schema",
        `Layout JSON failed schema validation: ${parsed.error.issues[0]?.message ?? "invalid"}`
      )
    );
    return findings;
  }

  const layout = parsed.data;
  const blocks = layout.content ?? [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as unknown as Record<string, unknown>;
    const blockField = makeField(zoneName, `block[${i}]`);

    // Check block type
    const blockType = block.type as string | undefined;
    if (!blockType || !ALLOWED_BLOCK_TYPES.has(blockType)) {
      findings.push(
        blocking(blockField, "unknown_block_type", blockType ?? "(missing type)")
      );
      continue; // Skip further checks on unknown blocks
    }

    // REPORT DESIGNER UX.1: Validate richContent in BodyTextSectionBlock
    if (blockType === "BodyTextSectionBlock") {
      const props = block.props as Record<string, unknown> | undefined;
      if (props?.richContent && typeof props.richContent === "object") {
        const rc = props.richContent as Record<string, unknown>;
        if (rc.type !== "doc") {
          findings.push(blocking(`${blockField}.props.richContent`, "invalid_prosemirror_doc_type", String(rc.type)));
        }
        const rcStr = JSON.stringify(rc);
        if (rcStr.length > 64 * 1024) {
          findings.push(blocking(`${blockField}.props.richContent`, "richcontent_payload_too_large", `${rcStr.length} bytes`));
        }
        // Deep scan richContent for unsafe patterns
        findings.push(...scanJsonObject(rc, `${blockField}.props.richContent`));
        // Extract and validate bindings in text nodes (UX.3: pass templateType)
        findings.push(...validateBindingsInRichContent(rc, `${blockField}.props.richContent`, templateType));
      }
      // Standard props scan for non-richContent props (title, language, content)
      if (props) {
        const { richContent: _rc, ...standardProps } = props;
        findings.push(...scanJsonObject(standardProps, `${blockField}.props`));
        findings.push(...scanBlockBindings(standardProps, `${blockField}.props`, templateType));
      }
      continue; // BodyTextSectionBlock fully handled
    }

    // REPORT DESIGNER UX.1: Validate ColumnStripBlock
    if (blockType === "ColumnStripBlock") {
      const props = block.props as Record<string, unknown> | undefined;
      if (props) {
        // Validate layout
        const allowedLayouts = new Set(["equal", "left-wide", "right-wide", "2-col", "3-col"]);
        if (typeof props.layout === "string" && !allowedLayouts.has(props.layout)) {
          findings.push(blocking(`${blockField}.props.layout`, "invalid_column_layout", String(props.layout)));
        }
        // Validate slots
        const BLOCKED_SLOT_TYPES = new Set(["BrandingHeaderBlock", "ReportTableBlock", "ColumnStripBlock"]);
        for (const slotName of ["leftSlot", "centerSlot", "rightSlot"]) {
          const slot = props[slotName] as Record<string, unknown> | undefined;
          if (!slot || typeof slot !== "object") continue;
          const slotField = `${blockField}.props.${slotName}`;
          const ct = String(slot.contentType ?? "");
          if (BLOCKED_SLOT_TYPES.has(ct)) {
            findings.push(blocking(slotField, "blocked_slot_content_type", ct));
          }
          // Scan slot for unsafe content (UX.3: pass templateType)
          findings.push(...scanJsonObject(slot, slotField));
          findings.push(...scanBlockBindings(slot, slotField, templateType));
        }
      }
      continue; // ColumnStripBlock fully handled
    }

    // REPORT DESIGNER.8: Special validation for ReportTableBlock
    if (blockType === "ReportTableBlock") {
      const props = block.props as Record<string, unknown> | undefined;
      if (props) {
        // dataSource must be exactly "report.preview_rows"
        if (!ALLOWED_TABLE_DATA_SOURCES.has(String(props.dataSource ?? ""))) {
          findings.push(
            blocking(
              `${blockField}.props.dataSource`,
              "unsafe_table_data_source",
              `dataSource='${String(props.dataSource)}' is not allowed`
            )
          );
        }

        // maxRows must be ≤ 50
        if (typeof props.maxRows === "number" && props.maxRows > 50) {
          findings.push(
            blocking(
              `${blockField}.props.maxRows`,
              "table_max_rows_exceeded",
              `maxRows=${props.maxRows} exceeds limit of 50`
            )
          );
        }

        // Scan column defs
        const columns = props.columns;
        if (Array.isArray(columns)) {
          for (let ci = 0; ci < columns.length; ci++) {
            const col = columns[ci] as Record<string, unknown>;
            const colKey = String(col.key ?? "");
            const colField = `${blockField}.props.columns[${ci}]`;

            // Key must match safe pattern
            if (!SAFE_COLUMN_KEY_PATTERN.test(colKey)) {
              findings.push(
                blocking(`${colField}.key`, "unsafe_column_key", colKey)
              );
            } else {
              // Check for sensitive fragments
              const lower = colKey.toLowerCase();
              for (const frag of SENSITIVE_COLUMN_KEY_FRAGMENTS) {
                if (lower.includes(frag)) {
                  findings.push(
                    blocking(`${colField}.key`, "sensitive_column_key", colKey)
                  );
                  break;
                }
              }
            }

            // Scan label for HTML/scripts
            if (typeof col.label === "string") {
              findings.push(...scanStringValue(col.label, `${colField}.label`));
            }
          }
        }

        // Scan title and emptyText for HTML/scripts
        for (const propName of ["title", "emptyText"]) {
          const val = props[propName];
          if (typeof val === "string") {
            findings.push(...scanStringValue(val, `${blockField}.props.${propName}`));
          }
        }
      }
      continue; // ReportTableBlock fully handled — skip generic prop scan
    }

    // Scan block props recursively
    const props = block.props as Record<string, unknown> | undefined;
    if (props) {
      findings.push(...scanJsonObject(props, `${blockField}.props`));
      findings.push(...scanBlockBindings(props, `${blockField}.props`, templateType));
    }
  }

  return findings;
}

/**
 * Full security review of a visual template's layout zones and metadata.
 *
 * Compatible with the existing `SecurityReviewResult` structure used by
 * `runTemplateSecurityReview` in `security-review.ts`.
 */
export function reviewVisualTemplateLayoutSecurity(
  input: VisualTemplateSecurityReviewInput
): VisualTemplateSecurityReviewResult {
  const findings: SecurityFinding[] = [];

  const { visual_editor_engine, visual_layout_schema_version } = input;

  // ── 1. Engine validation ─────────────────────────────────────────────────
  if (visual_editor_engine !== null && visual_editor_engine !== undefined && visual_editor_engine !== "") {
    if (!ALLOWED_VISUAL_ENGINES.has(visual_editor_engine)) {
      findings.push(
        blocking(
          "visual.engine",
          "unsupported_visual_engine",
          `visual_editor_engine='${visual_editor_engine}' is not allowed`
        )
      );
    }
  }

  // ── 2. Schema version check ──────────────────────────────────────────────
  if (visual_layout_schema_version !== null && visual_layout_schema_version !== undefined) {
    if (visual_layout_schema_version > CURRENT_LAYOUT_SCHEMA_VERSION) {
      findings.push(
        blocking(
          "visual.schema_version",
          "unsupported_schema_version",
          `schema_version=${visual_layout_schema_version} > supported=${CURRENT_LAYOUT_SCHEMA_VERSION}`
        )
      );
    }
  }

  // ── 3. Zone inspection (UX.3: pass template_type for governance-aware checks)
  const templateType = input.template_type ?? null;
  const headerFindings = reviewVisualLayoutZone(input.header_layout_json, "header", templateType);
  const bodyFindings = reviewVisualLayoutZone(input.body_layout_json, "body", templateType);
  const footerFindings = reviewVisualLayoutZone(input.footer_layout_json, "footer", templateType);

  findings.push(...headerFindings, ...bodyFindings, ...footerFindings);

  // ── 4. Style JSON scan ───────────────────────────────────────────────────
  if (input.style_json && Object.keys(input.style_json as object).length > 0) {
    const styleSize = JSON.stringify(input.style_json).length;
    if (styleSize > MAX_ZONE_JSON_BYTES) {
      findings.push(blocking("visual.style_json", "style_payload_too_large", `${styleSize} bytes`));
    } else {
      findings.push(...scanJsonObject(input.style_json, "visual.style_json"));
    }
  }

  // ── 5. Determine if visual layout is present ─────────────────────────────
  const hasVisualLayout =
    !!visual_editor_engine &&
    (
      hasBlocks(input.header_layout_json) ||
      hasBlocks(input.body_layout_json) ||
      hasBlocks(input.footer_layout_json)
    );

  // ── 6. UX.3: Add governance warning if restricted fields are used ─────────
  const usesRestrictedFields = findings.some(
    (f) =>
      f.rule === "restricted_field_elevated_approval_required" ||
      f.rule === "restricted_field_template_type_unknown"
  );
  if (usesRestrictedFields) {
    findings.push(
      warning(
        "visual.governance",
        "sensitive_fields_require_elevated_approval",
        "This template uses restricted/confidential fields. Approving/publishing requires reports.sensitive_fields.approve permission."
      )
    );
  }

  const hasBlock = findings.some((f) => f.severity === "block");
  const hasWarning = findings.some((f) => f.severity === "warning");

  return {
    passed: !hasBlock,
    severity: hasBlock ? "block" : hasWarning ? "warning" : "none",
    findings,
    hasVisualLayout,
  };
}

function hasBlocks(layoutRaw: unknown): boolean {
  if (!layoutRaw || typeof layoutRaw !== "object") return false;
  const content = (layoutRaw as Record<string, unknown>).content;
  return Array.isArray(content) && content.length > 0;
}

/**
 * Extract all binding paths from all visual layout zones.
 * Used for reporting which bindings a template depends on.
 * UX.2: Also extracts bindingToken node paths.
 */
export function extractVisualLayoutBindings(
  input: Pick<VisualTemplateSecurityReviewInput, "header_layout_json" | "body_layout_json" | "footer_layout_json">
): string[] {
  const bindings = new Set<string>();

  function extractFromNode(node: Record<string, unknown>): void {
    if (node.type === "text" && typeof node.text === "string") {
      for (const b of extractBindingsFromText(node.text)) bindings.add(b);
    }
    // UX.2: bindingToken nodes
    if (node.type === "bindingToken") {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (typeof attrs?.path === "string" && attrs.path) {
        bindings.add(attrs.path);
      }
    }
    const content = node.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        if (child && typeof child === "object") {
          extractFromNode(child as Record<string, unknown>);
        }
      }
    }
  }

  for (const zoneRaw of [input.header_layout_json, input.body_layout_json, input.footer_layout_json]) {
    if (!zoneRaw || typeof zoneRaw !== "object") continue;
    const parsed = ReportDesignerLayoutJsonSchema.safeParse(zoneRaw);
    if (!parsed.success) continue;
    for (const block of parsed.data.content ?? []) {
      const b = block as unknown as Record<string, unknown>;
      const props = b.props as Record<string, unknown> | undefined;
      if (!props) continue;
      for (const value of Object.values(props)) {
        if (typeof value === "string") {
          for (const path of extractBindingsFromText(value)) bindings.add(path);
        }
        // UX.2: Walk richContent ProseMirror JSON if present
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const rc = value as Record<string, unknown>;
          if (rc.type === "doc") {
            extractFromNode(rc);
          }
        }
      }
    }
  }

  return Array.from(bindings);
}
