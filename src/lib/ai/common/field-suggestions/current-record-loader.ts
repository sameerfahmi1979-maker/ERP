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
  const reviewedTargets: NonNullable<ErpAiCurrentRecordSnapshot['reviewedTargets']> = {};

  // Group fields by table
  const fieldsByTable = groupFieldsByTable(registry.fields);

  for (const [table, tableFields] of Object.entries(fieldsByTable)) {
    await loadTableFields(entityType, entityId, table, tableFields, fields, reviewedTargets);
  }

  return { entityType, entityId, fields, reviewedTargets };
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
  out: Record<string, string | null>,
  reviewedTargets: NonNullable<ErpAiCurrentRecordSnapshot['reviewedTargets']>
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

  if(entityType==='company'&&targetTable==='owner_companies'){
    const supabase=await createClient();
    const {data,error}=await supabase.from('owner_companies').select(['id','workspace_revision',...columnNames].join(',')).eq('id',entityId).maybeSingle();
    const row=data as unknown as Record<string,unknown>|null;
    if(error||!row||row.id!==entityId||!Number.isSafeInteger(row.id)||!/^[1-9]\d*$/.test(String(row.workspace_revision))
      ||(typeof row.workspace_revision==='number'&&!Number.isSafeInteger(row.workspace_revision)))
      throw new Error('Current company fields and revision could not be loaded. Generate suggestions only after the company is available.');
    reviewedTargets.owner_companies={id:entityId,revision:String(row.workspace_revision)};
    // Preserve the exact stored value for review; whitespace is not an absent value.
    for(const field of fields){const raw=row[field.targetField];out[field.targetField]=raw===null||raw===undefined?null:String(raw);}
    return;
  }

  if(entityType==='party'&&targetTable==='parties'){
    const supabase=await createClient();
    const {data,error}=await supabase.from('parties').select(columnNames.join(',')).eq('id',entityId).maybeSingle();
    if(error||!data)throw new Error('Current party fields could not be loaded. No suggestions can be generated from an unavailable record.');
    for(const field of fields)out[field.targetField]=rawToString((data as unknown as Record<string,unknown>)[field.targetField]);
    return;
  }

  if(entityType==='party'&&filterConfig.isChildTable){
    const supabase=await createClient();
    const {data,error}=await supabase.from(targetTable).select(['id','workspace_revision',...columnNames].join(','))
      .eq('party_id',entityId).eq('is_active',true).is('archived_at',null).limit(2);
    if(error||!Array.isArray(data))throw new Error('Current party child fields could not be loaded. Try again before generating suggestions.');
    if(data.length>1)throw new Error('Multiple active child records need manual selection. Review these fields in their record editor.');
    const row=data[0] as unknown as Record<string,unknown>|undefined;
    if(row){
      if(!Number.isSafeInteger(row.id)||Number(row.id)<1||!/^[1-9]\d*$/.test(String(row.workspace_revision)))throw new Error('The child review identity is unavailable.');
      reviewedTargets[targetTable]={id:Number(row.id),revision:String(row.workspace_revision)};
    }
    for(const field of fields)out[field.targetField]=rawToString(row?.[field.targetField]);
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
