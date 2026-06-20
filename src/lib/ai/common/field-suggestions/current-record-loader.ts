/**
 * ERP COMMON AI.1D — Current Record Loader
 *
 * Loads the current field values for a registered AI entity record.
 * Used to populate ErpAiCurrentRecordSnapshot for the prompt builder.
 *
 * Rules:
 * - Only loads registered, AI-eligible fields from the entity registry.
 * - Only supports Stage 1 entities: company (owner_companies), party (parties).
 * - Party child table fields (party_licenses, party_tax_registrations) are
 *   loaded at a best-effort level; currentValue = null if child row absent.
 * - Does NOT write anything.
 * - Does NOT log field values.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  ErpAiEntityType,
  ErpAiEntityRegistry,
  ErpAiCurrentRecordSnapshot,
  ErpAiEligibleFieldRegistration,
} from "../types";

// ── Main loader ───────────────────────────────────────────────────────────────

/**
 * Loads current values for all registered AI-eligible fields on the entity.
 *
 * For Stage 1 entities (company, party) only.
 * Returns a sanitized snapshot — values are converted to strings or null.
 * Sensitive structured data (JSON columns) is not included.
 */
export async function loadCurrentRecordSnapshot(
  entityType: ErpAiEntityType,
  entityId: number,
  registry: ErpAiEntityRegistry
): Promise<ErpAiCurrentRecordSnapshot> {
  const fields: Record<string, string | null> = {};

  // Group fields by table
  const fieldsByTable = groupFieldsByTable(registry.fields);

  for (const [table, tableFields] of Object.entries(fieldsByTable)) {
    await loadTableFields(entityType, entityId, table, tableFields, fields);
  }

  return { entityType, entityId, fields };
}

// ── Group fields by target table ──────────────────────────────────────────────

function groupFieldsByTable(
  fields: ErpAiEligibleFieldRegistration[]
): Record<string, ErpAiEligibleFieldRegistration[]> {
  const byTable: Record<string, ErpAiEligibleFieldRegistration[]> = {};
  for (const field of fields) {
    if (!field.isAiEligible) continue;
    if (!byTable[field.targetTable]) byTable[field.targetTable] = [];
    byTable[field.targetTable].push(field);
  }
  return byTable;
}

// ── Per-table value loader ────────────────────────────────────────────────────

async function loadTableFields(
  entityType: ErpAiEntityType,
  entityId: number,
  targetTable: string,
  fields: ErpAiEligibleFieldRegistration[],
  out: Record<string, string | null>
): Promise<void> {
  const columnNames = fields.map((f) => f.targetField);

  // Determine the filter column for the table
  const filterConfig = getTableFilterConfig(entityType, targetTable, entityId);

  if (!filterConfig) {
    // Child table without a known filter → set all fields to null
    for (const field of fields) {
      out[field.targetField] = null;
    }
    return;
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from(targetTable)
      .select(columnNames.join(", "))
      .is("deleted_at", null)
      .limit(1);

    // Apply filter
    query = query.eq(filterConfig.column, filterConfig.value);

    // For child tables, sort by updated_at desc to get the most recent row
    if (filterConfig.isChildTable) {
      query = query.order("updated_at", { ascending: false });
    }

    const { data } = await query.maybeSingle();

    for (const field of fields) {
      if (!data) {
        out[field.targetField] = null;
        continue;
      }
      const raw = (data as unknown as Record<string, unknown>)[field.targetField];
      out[field.targetField] = rawToString(raw);
    }
  } catch {
    // On error, set all to null — do not throw
    for (const field of fields) {
      out[field.targetField] = null;
    }
  }
}

// ── Table filter configuration ─────────────────────────────────────────────────

interface TableFilterConfig {
  column: string;
  value: number;
  isChildTable: boolean;
}

/**
 * Returns the filter column and value for a given entity + table combination.
 *
 * For main entity tables (owner_companies, parties): filter by `id`.
 * For child tables (party_licenses, party_tax_registrations): filter by `party_id`.
 * Returns null for unknown child tables (will result in null values).
 */
function getTableFilterConfig(
  entityType: ErpAiEntityType,
  targetTable: string,
  entityId: number
): TableFilterConfig | null {
  // Main entity tables
  if (entityType === "company" && targetTable === "owner_companies") {
    return { column: "id", value: entityId, isChildTable: false };
  }
  if (entityType === "party" && targetTable === "parties") {
    return { column: "id", value: entityId, isChildTable: false };
  }

  // Party child tables
  if (entityType === "party" && targetTable === "party_licenses") {
    return { column: "party_id", value: entityId, isChildTable: true };
  }
  if (entityType === "party" && targetTable === "party_tax_registrations") {
    return { column: "party_id", value: entityId, isChildTable: true };
  }

  // Branch + Site — Stage 2 stubs, not loaded
  return null;
}

// ── Value serializer ───────────────────────────────────────────────────────────

/**
 * Converts a raw DB value to a safe string representation for the AI prompt.
 * JSON objects are excluded (would expose too much data).
 * Numbers, booleans, dates are converted to strings.
 * Null/undefined → null.
 */
function rawToString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "boolean") return raw ? "true" : "false";
  // Dates from DB often come as ISO strings — handled above
  // JSON/objects: not safe to expose, return null
  return null;
}
