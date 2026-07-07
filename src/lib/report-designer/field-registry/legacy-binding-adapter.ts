/**
 * Report Designer — Legacy Binding Adapter
 * Phase: REPORT DESIGNER UX.2
 *
 * Generates the legacy ERP_BINDING_REGISTRY-compatible object from the
 * new REPORT_FIELD_REGISTRY. This ensures backward compatibility for all
 * code that imports ERP_BINDING_REGISTRY, SAFE_BINDING_PATHS, etc.
 *
 * All existing imports from binding-registry.ts continue to work unchanged.
 */

import type { BindingDescriptor } from "../binding-registry";
import { REPORT_FIELD_REGISTRY } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// Namespace mapping
// ─────────────────────────────────────────────────────────────────────────────

function toNamespace(
  entityCode: string
): "employee" | "company" | "document" | "report" {
  switch (entityCode) {
    case "employee":
      return "employee";
    case "company":
      return "company";
    case "document":
      return "document";
    case "report":
      return "report";
    default:
      return "document";
  }
}

function toValueType(
  dataType: string
): "string" | "date" | "number" | "url" {
  switch (dataType) {
    case "date":
      return "date";
    case "number":
    case "money":
      return "number";
    case "url":
      return "url";
    default:
      return "string";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the legacy ERP_BINDING_REGISTRY Record from the new field registry.
 * All active, non-planned fields are included — INCLUDING restricted and
 * confidential fields.
 *
 * SECURITY NOTE: including restricted fields here does NOT leak values.
 * This registry is an allowlist of VALID PATHS (save validation, Zod schema,
 * renderer path lookup). Value resolution is governed separately:
 *  - test/preview: values are always masked (sensitive-field-masking.ts)
 *  - official: resolved only via resolveOfficialSensitiveFields after all
 *    governance gates pass (permission, template type, approval status)
 * Excluding them here made templates with governed sensitive fields fail
 * save validation with "Unknown binding" — wrong layer for the gate.
 */
export function buildLegacyBindingRegistry(): Record<string, BindingDescriptor> {
  const result: Record<string, BindingDescriptor> = {};

  for (const entry of REPORT_FIELD_REGISTRY) {
    // Only include active, implemented fields
    if (!entry.isActive || entry.isPlanned) {
      continue;
    }

    result[entry.fieldPath] = {
      path: entry.fieldPath,
      label: entry.fieldLabel,
      namespace: toNamespace(entry.entityCode),
      valueType: toValueType(entry.dataType),
      requiresSignPermission: entry.requiredPermission === "reports.sign",
      templateTypeRestriction: entry.allowedTemplateTypes,
    };
  }

  return result;
}

/** The generated legacy registry — compatible with all existing imports */
export const GENERATED_ERP_BINDING_REGISTRY: Record<string, BindingDescriptor> =
  buildLegacyBindingRegistry();
