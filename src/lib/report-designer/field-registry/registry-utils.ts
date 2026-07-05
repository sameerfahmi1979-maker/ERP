/**
 * Report Designer — Registry Utility Functions
 * Phase: REPORT DESIGNER UX.2
 */

import type {
  ReportFieldRegistryEntry,
  ReportFieldModuleGroup,
  ReportFieldEntityGroup,
} from "./types";
import { REPORT_FIELD_REGISTRY } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// Core accessors
// ─────────────────────────────────────────────────────────────────────────────

/** Return the full field registry array */
export function getReportFieldRegistry(): ReportFieldRegistryEntry[] {
  return REPORT_FIELD_REGISTRY;
}

/**
 * Return only active, non-planned entries.
 * These are the fields that can be inserted in UX.2.
 */
export function getActiveReportFieldEntries(): ReportFieldRegistryEntry[] {
  return REPORT_FIELD_REGISTRY.filter((e) => e.isActive && !e.isPlanned);
}

/**
 * Return active AND insertable entries for unrestricted contexts.
 * Returns only public/internal fields. Restricted/confidential fields require
 * governance context — use canFieldBeInsertedForTemplate() for those.
 */
export function getInsertableReportFieldEntries(): ReportFieldRegistryEntry[] {
  return REPORT_FIELD_REGISTRY.filter(
    (e) =>
      e.isActive &&
      !e.isPlanned &&
      (e.sensitivityLevel === "public" || e.sensitivityLevel === "internal")
  );
}

/**
 * Return all active, non-planned restricted/confidential field entries.
 * Used by the field picker to show governed fields with lock badge.
 */
export function getRestrictedFieldEntries(): ReportFieldRegistryEntry[] {
  return REPORT_FIELD_REGISTRY.filter(
    (e) =>
      e.isActive &&
      !e.isPlanned &&
      (e.sensitivityLevel === "restricted" || e.sensitivityLevel === "confidential")
  );
}

/** Look up a field entry by its fieldPath */
export function getReportFieldByPath(
  path: string
): ReportFieldRegistryEntry | undefined {
  return REPORT_FIELD_REGISTRY.find((e) => e.fieldPath === path);
}

/**
 * Check if a field path is allowed for unrestricted insertion
 * (exists in registry AND is active AND is public/internal).
 *
 * For restricted/confidential fields, use canFieldBeInsertedForTemplate()
 * from governance.ts with the full picker context.
 */
export function isReportFieldPathAllowed(path: string): boolean {
  const entry = getReportFieldByPath(path);
  if (!entry) return false;
  if (!entry.isActive) return false;
  if (entry.sensitivityLevel === "restricted") return false;
  if (entry.sensitivityLevel === "confidential") return false;
  return true;
}

/**
 * Check if a field path is a registered (known) restricted or confidential field.
 * Used in security review to distinguish governed sensitive fields from unknown paths.
 */
export function isRegisteredRestrictedField(path: string): boolean {
  const entry = getReportFieldByPath(path);
  if (!entry) return false;
  return (
    entry.sensitivityLevel === "restricted" || entry.sensitivityLevel === "confidential"
  );
}

/**
 * Check if a field path exists anywhere in the registry
 * (including inactive/planned). Used for planning-level checks.
 */
export function isReportFieldPathRegistered(path: string): boolean {
  return REPORT_FIELD_REGISTRY.some((e) => e.fieldPath === path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouped accessors (for the picker UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return fields grouped by module, then entity.
 * Includes all entries — active, planned, restricted — the UI decides what to show.
 */
export function getReportFieldsGroupedByModule(): ReportFieldModuleGroup[] {
  const moduleMap = new Map<string, ReportFieldModuleGroup>();

  for (const entry of REPORT_FIELD_REGISTRY) {
    // Get or create module group
    let mod = moduleMap.get(entry.moduleCode);
    if (!mod) {
      const isModulePlanned = !REPORT_FIELD_REGISTRY.some(
        (e) => e.moduleCode === entry.moduleCode && e.isActive && !e.isPlanned
      );
      mod = {
        moduleCode: entry.moduleCode,
        moduleLabel: entry.moduleLabel,
        isPlanned: isModulePlanned,
        entities: [],
      };
      moduleMap.set(entry.moduleCode, mod);
    }

    // Get or create entity group
    let entity = mod.entities.find((e) => e.entityCode === entry.entityCode);
    if (!entity) {
      entity = {
        entityCode: entry.entityCode,
        entityLabel: entry.entityLabel,
        fields: [],
      };
      mod.entities.push(entity);
    }

    entity.fields.push(entry);
  }

  // Sort fields within each entity by sortOrder
  for (const mod of moduleMap.values()) {
    for (const entity of mod.entities) {
      entity.fields.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  return Array.from(moduleMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample values map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a map of fieldPath → sampleValue for all active fields.
 * Merges with the existing buildSampleBindingValues output.
 */
export function getReportFieldSampleValues(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of REPORT_FIELD_REGISTRY) {
    if (entry.isActive && !entry.isPlanned && entry.sampleValue) {
      result[entry.fieldPath] = entry.sampleValue;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search the registry by query string.
 * Matches against fieldLabel, fieldPath, entityLabel, moduleLabel, description.
 */
export function searchReportFields(
  query: string
): ReportFieldRegistryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return REPORT_FIELD_REGISTRY;

  return REPORT_FIELD_REGISTRY.filter((entry) => {
    return (
      entry.fieldLabel.toLowerCase().includes(q) ||
      entry.fieldPath.toLowerCase().includes(q) ||
      entry.entityLabel.toLowerCase().includes(q) ||
      entry.moduleLabel.toLowerCase().includes(q) ||
      (entry.description?.toLowerCase().includes(q) ?? false)
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordered module list (for UI presentation)
// ─────────────────────────────────────════════════════════════════════════════

const MODULE_SORT_ORDER: Record<string, number> = {
  HR: 1,
  COMPANY: 2,
  DOCUMENT: 3,
  REPORT: 4,
  FLEET: 10,
  PROCUREMENT: 11,
  FINANCE: 12,
  INVENTORY: 13,
  TRANSPORT: 14,
  HSE: 15,
  WORKSHOP: 16,
  WEIGHBRIDGE: 17,
};

/** Return grouped modules sorted in canonical UI order */
export function getReportFieldsGroupedByModuleSorted(): ReportFieldModuleGroup[] {
  const groups = getReportFieldsGroupedByModule();
  return groups.sort(
    (a, b) =>
      (MODULE_SORT_ORDER[a.moduleCode] ?? 99) -
      (MODULE_SORT_ORDER[b.moduleCode] ?? 99)
  );
}
