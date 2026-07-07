/**
 * Report Designer — Layout Validation Helpers
 * Phase: REPORT DESIGNER.1
 *
 * Server-side validation utilities called before any layout save or render.
 * These are thin wrappers around the Zod schema with human-readable output.
 */

import type { ReportDesignerLayoutJson } from "./types";
import { ReportDesignerLayoutJsonSchema, SaveVisualLayoutInputSchema } from "./layout-schema";
import type { SaveVisualLayoutInputValidated } from "./layout-schema";
import { extractBindingsFromText, isAllowlistedBinding } from "./binding-registry";
import { collectBindingTokens } from "./prosemirror-plaintext";

// ─────────────────────────────────────────────────────────────────────────────
// Validation result type
// ─────────────────────────────────────────────────────────────────────────────

export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Count of blocks in body zone */
  blockCount: number;
  /** Unique set of binding paths found */
  bindingsFound: string[];
  /** Block types used, deduplicated */
  blockTypesSummary: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single layout zone JSON (body, header, or footer).
 * Returns a structured validation result — never throws.
 */
export function validateLayoutZone(
  raw: unknown,
  zoneName: "body" | "header" | "footer" = "body"
): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = ReportDesignerLayoutJsonSchema.safeParse(raw);

  if (!parsed.success) {
    const zodErrors = parsed.error.issues.map(
      (e) => `[${zoneName}] ${e.path.map(String).join(".")}: ${e.message}`
    );
    return {
      valid: false,
      errors: zodErrors,
      warnings,
      blockCount: 0,
      bindingsFound: [],
      blockTypesSummary: [],
    };
  }

  const layout = parsed.data;
  const blockCount = layout.content.length;
  const bindingsFound = new Set<string>();
  const blockTypes = new Set<string>();

  // Walk blocks and collect bindings
  for (const block of layout.content) {
    blockTypes.add(block.type);

    if (block.type === "BodyTextSectionBlock") {
      const bindings = extractBindingsFromText(block.props.content);
      bindings.forEach((b) => {
        bindingsFound.add(b);
        if (!isAllowlistedBinding(b)) {
          errors.push(`[${zoneName}] Unknown binding "{{${b}}}" in BodyTextSectionBlock`);
        }
      });

      // Guard against corrupt binding tokens (stale editor bundle): every
      // bindingToken in richContent MUST carry a non-empty path attribute.
      // Rejecting here prevents silent data destruction on save.
      const rc = block.props.richContent as Record<string, unknown> | null | undefined;
      if (rc && rc.type === "doc") {
        const tokens = collectBindingTokens(rc);
        const pathless = tokens.filter((t) => {
          const attrs = t.attrs as Record<string, unknown> | undefined;
          return !attrs || typeof attrs.path !== "string" || !attrs.path;
        });
        if (pathless.length > 0) {
          // Include a JSON dump of the first 3 failing tokens so errors can be
          // diagnosed without opening a debugger session.
          const sample = pathless.slice(0, 3).map((t) => JSON.stringify(t)).join(" | ");
          errors.push(
            `[${zoneName}] ${pathless.length} inserted field(s) in the rich text are missing their binding path. ` +
              `Failing token(s): ${sample}. ` +
              `This usually means the editor page is running an outdated version — please hard-refresh the browser (Ctrl+Shift+R) and re-insert the fields.`
          );
        } else {
          for (const t of tokens) {
            const path = (t.attrs as Record<string, unknown>).path as string;
            bindingsFound.add(path);
            if (!isAllowlistedBinding(path)) {
              errors.push(`[${zoneName}] Unknown binding "{{${path}}}" in rich text field token`);
            }
          }
        }
      }
    }

    if (block.type === "KeyValueSectionBlock") {
      for (const field of block.props.fields) {
        bindingsFound.add(field.binding);
        if (!isAllowlistedBinding(field.binding)) {
          errors.push(
            `[${zoneName}] Unknown binding "${field.binding}" in KeyValueSectionBlock field "${field.label}"`
          );
        }
      }
    }
  }

  // Warnings: VerificationQrBlock in footer is unusual
  if (
    zoneName === "header" &&
    layout.content.some((b) => b.type === "VerificationQrBlock")
  ) {
    warnings.push(
      "[header] VerificationQrBlock in header zone is unusual — typically placed in footer"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blockCount,
    bindingsFound: Array.from(bindingsFound),
    blockTypesSummary: Array.from(blockTypes),
  };
}

/**
 * Validate a full save-layout input.
 * Returns combined results from body + optional header/footer zones.
 */
export function validateSaveLayoutInput(raw: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: SaveVisualLayoutInputValidated;
} {
  const parsed = SaveVisualLayoutInputSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (e) => `${e.path.map(String).join(".")}: ${e.message}`
      ),
      warnings: [],
    };
  }

  const input = parsed.data;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  const bodyResult = validateLayoutZone(input.bodyLayout, "body");
  allErrors.push(...bodyResult.errors);
  allWarnings.push(...bodyResult.warnings);

  if (input.headerLayout) {
    const headerResult = validateLayoutZone(input.headerLayout, "header");
    allErrors.push(...headerResult.errors);
    allWarnings.push(...headerResult.warnings);
  }

  if (input.footerLayout) {
    const footerResult = validateLayoutZone(input.footerLayout, "footer");
    allErrors.push(...footerResult.errors);
    allWarnings.push(...footerResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    parsed: allErrors.length === 0 ? input : undefined,
  };
}

/**
 * Build a safe audit metadata object from a validated layout.
 * Never includes full layout JSON — only structural metadata.
 */
export function buildLayoutAuditMeta(
  templateId: number,
  layout: ReportDesignerLayoutJson
) {
  const bodyResult = validateLayoutZone(layout, "body");
  return {
    template_id: templateId,
    schema_version: layout.schemaVersion,
    engine: layout.engine,
    block_count: bodyResult.blockCount,
    binding_count: bodyResult.bindingsFound.length,
    block_type_summary: bodyResult.blockTypesSummary,
  };
}
