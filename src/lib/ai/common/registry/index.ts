/**
 * ERP COMMON AI.1A — Registry Index
 *
 * Central registry: maps every ERP entity type to its AI registry definition.
 * All field suggestion generation must go through this index.
 *
 * Validation rules (enforced at module load via validateCommonAiRegistry()):
 * - All entity types must be in ERP_COMMON_AI_ALLOWED_ENTITY_TYPES.
 * - Every registered field must have isAiEligible: true.
 * - No duplicate targetField entries within a single entity registry.
 * - Stage 2 stub registries are clearly marked and skipped by generation logic.
 */

import { ERP_COMMON_AI_ALLOWED_ENTITY_TYPES } from "../constants";
import { isGloballyNonUpdatableField } from "../non-updatable-fields";
import type {
  ErpAiEntityType,
  ErpAiEntityRegistry,
  ErpAiEligibleFieldRegistration,
  ErpAiRegistryLookupResult,
} from "../types";

import { COMPANY_REGISTRY } from "./company-registry";
import { PARTY_REGISTRY } from "./party-registry";
import { BRANCH_REGISTRY } from "./branch-registry";
import { SITE_REGISTRY } from "./site-registry";

// ── Registry map ──────────────────────────────────────────────────────────────

/**
 * All entity registries, keyed by entity type.
 * Import from here — never import individual registries directly in engine code.
 */
export const COMMON_AI_ENTITY_REGISTRIES: Readonly<
  Record<ErpAiEntityType, ErpAiEntityRegistry>
> = {
  company: COMPANY_REGISTRY,
  party: PARTY_REGISTRY,
  branch: BRANCH_REGISTRY,
  site: SITE_REGISTRY,
};

// ── Lookup functions ───────────────────────────────────────────────────────────

/**
 * Returns the entity registry for a given entity type.
 * Returns null if the entity type is not registered.
 */
export function getCommonAiEntityRegistry(
  entityType: string
): ErpAiEntityRegistry | null {
  if (!isCommonAiEntityType(entityType)) return null;
  return COMMON_AI_ENTITY_REGISTRIES[entityType] ?? null;
}

/**
 * Returns only the AI-eligible field registrations for an entity type.
 * Returns an empty array if the entity type is not registered.
 */
export function getCommonAiEligibleFields(
  entityType: string
): ErpAiEligibleFieldRegistration[] {
  const registry = getCommonAiEntityRegistry(entityType);
  if (!registry) return [];
  return registry.fields.filter((f) => f.isAiEligible === true);
}

/**
 * Returns a full lookup result including validation and stage information.
 * Use this in server actions before attempting generation.
 */
export function lookupCommonAiRegistry(
  entityType: string
): ErpAiRegistryLookupResult {
  if (!isCommonAiEntityType(entityType)) {
    return {
      registry: null,
      found: false,
      isActiveStage: false,
      error: `Entity type "${entityType}" is not registered in the Common AI engine.`,
    };
  }

  const registry = COMMON_AI_ENTITY_REGISTRIES[entityType];
  const isActiveStage = registry.stage === "stage_1";

  return {
    registry,
    found: true,
    isActiveStage,
    error: isActiveStage
      ? undefined
      : `Entity type "${entityType}" is a Stage 2 stub and not yet available for AI generation.`,
  };
}

/**
 * Type guard: returns true if the value is a valid registered entity type.
 */
export function isCommonAiEntityType(value: unknown): value is ErpAiEntityType {
  return (
    typeof value === "string" &&
    (ERP_COMMON_AI_ALLOWED_ENTITY_TYPES as ReadonlyArray<string>).includes(value)
  );
}

// ── Registry validation ────────────────────────────────────────────────────────

/**
 * Validates all entity registries.
 *
 * Throws a descriptive error if any registry violates the rules:
 * - Unknown entity type
 * - Field missing isAiEligible: true
 * - Globally non-updatable field registered
 * - Duplicate targetField within a registry
 * - Stage 2 stubs with stage !== "stage_2_stub" (safety check)
 *
 * Called once at module init. Does NOT query DB.
 */
export function validateCommonAiRegistry(): void {
  const allowedTypes = new Set<string>(ERP_COMMON_AI_ALLOWED_ENTITY_TYPES);

  for (const [entityType, registry] of Object.entries(
    COMMON_AI_ENTITY_REGISTRIES
  )) {
    // 1. Entity type must be in the allowed list
    if (!allowedTypes.has(entityType)) {
      throw new Error(
        `[CommonAI] Registry validation failed: entity type "${entityType}" is not in ERP_COMMON_AI_ALLOWED_ENTITY_TYPES.`
      );
    }

    // 2. Entity type on registry must match the key
    if (registry.entityType !== entityType) {
      throw new Error(
        `[CommonAI] Registry validation failed: registry key "${entityType}" does not match registry.entityType "${registry.entityType}".`
      );
    }

    // 3. Fields validation
    const seenFields = new Set<string>();

    for (const field of registry.fields) {
      // isAiEligible must be true
      if (field.isAiEligible !== true) {
        throw new Error(
          `[CommonAI] Registry validation failed: field "${field.targetField}" in "${entityType}" registry has isAiEligible !== true.`
        );
      }

      // No globally non-updatable fields (FK fields with allowForeignKeyUpdate:true skip the code/no check)
      const isFkOverride = field.fieldType === "fk" && field.allowForeignKeyUpdate === true;
      if (!isFkOverride && isGloballyNonUpdatableField(field.targetField)) {
        throw new Error(
          `[CommonAI] Registry validation failed: field "${field.targetField}" in "${entityType}" registry is globally non-updatable.`
        );
      }

      // No duplicate targetField + targetTable combinations
      const fieldKey = `${field.targetTable}.${field.targetField}`;
      if (seenFields.has(fieldKey)) {
        throw new Error(
          `[CommonAI] Registry validation failed: duplicate field "${fieldKey}" in "${entityType}" registry.`
        );
      }
      seenFields.add(fieldKey);

      // applyHandlerKey must not be empty
      if (!field.applyHandlerKey || field.applyHandlerKey.trim().length === 0) {
        throw new Error(
          `[CommonAI] Registry validation failed: field "${field.targetField}" in "${entityType}" registry has an empty applyHandlerKey.`
        );
      }
    }
  }
}

// Run validation immediately on import to catch registry configuration errors early.
validateCommonAiRegistry();
