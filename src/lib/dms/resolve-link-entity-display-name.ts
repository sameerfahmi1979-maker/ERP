/**
 * Resolves human-readable labels for DMS document link targets.
 * Used by Understanding tab, Links tab, and other read-only DMS aggregations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";

function pick(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Entity types where entity_id is the employees.id FK. */
const EMPLOYEE_ID_ENTITY_TYPES = new Set([
  "employee",
  "employee_compliance",
  "employee_contract",
  "employee_leave_request",
]);

export function formatDmsLinkEntityFallback(entityType: string, entityId: number): string {
  return `${getDmsEntityTypeLabel(entityType)} #${entityId}`;
}

export async function resolveDmsLinkEntityDisplayName(
  supabase: SupabaseClient,
  entityType: string,
  entityId: number
): Promise<string | null> {
  try {
    switch (entityType) {
      case "company": {
        const { data } = await supabase
          .from("owner_companies")
          .select("trade_name, legal_name_en, company_code")
          .eq("id", entityId)
          .maybeSingle();
        return pick(
          data?.trade_name,
          data?.legal_name_en,
          data?.company_code ? `Company ${data.company_code}` : null
        );
      }

      case "party":
      case "party_license":
      case "party_tax_registration": {
        const { data } = await supabase
          .from("parties")
          .select("display_name, legal_name_en, trade_name_en, party_code")
          .eq("id", entityId)
          .maybeSingle();
        return pick(
          data?.display_name,
          data?.legal_name_en,
          data?.trade_name_en,
          data?.party_code ? `Party ${data.party_code}` : null
        );
      }

      case "branch": {
        const { data } = await supabase
          .from("branches")
          .select("branch_name_en, branch_code")
          .eq("id", entityId)
          .maybeSingle();
        return pick(
          data?.branch_name_en,
          data?.branch_code ? `Branch ${data.branch_code}` : null
        );
      }

      case "site": {
        const { data } = await supabase
          .from("work_sites")
          .select("site_name, site_code")
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        return pick(data?.site_name, data?.site_code ? `Site ${data.site_code}` : null);
      }

      case "bank": {
        const { data } = await supabase
          .from("banks")
          .select("bank_name_en, bank_code")
          .eq("id", entityId)
          .maybeSingle();
        return pick(
          data?.bank_name_en,
          data?.bank_code ? `Bank ${data.bank_code}` : null
        );
      }

      case "vehicle":
      case "fleet_asset": {
        const { data } = await supabase
          .from("vehicles")
          .select("plate_number")
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        return pick(data?.plate_number ? `Plate ${data.plate_number}` : null);
      }

      case "employee_identity_document": {
        const { data } = await supabase
          .from("employee_identity_documents")
          .select(
            "document_number, document_type:hr_identity_document_types(name_en), employee:employees(full_name_en, employee_code)"
          )
          .eq("id", entityId)
          .maybeSingle();
        const emp = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;
        const docType = Array.isArray(data?.document_type)
          ? data?.document_type[0]
          : data?.document_type;
        const empLabel = pick(
          emp?.full_name_en && emp?.employee_code
            ? `${emp.full_name_en} (${emp.employee_code})`
            : null,
          emp?.full_name_en
        );
        return pick(
          docType?.name_en && data?.document_number
            ? `${docType.name_en} — ${data.document_number}`
            : null,
          docType?.name_en,
          data?.document_number,
          empLabel ? `Identity doc · ${empLabel}` : null
        );
      }

      case "employee_dependent": {
        const { data } = await supabase
          .from("employee_dependents")
          .select(
            "dependent_name_en, relationship_type:hr_relationship_types(name_en), employee:employees(full_name_en, employee_code)"
          )
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        const emp = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;
        const rel = Array.isArray(data?.relationship_type)
          ? data?.relationship_type[0]
          : data?.relationship_type;
        return pick(
          data?.dependent_name_en && rel?.name_en
            ? `${data.dependent_name_en} (${rel.name_en})`
            : null,
          data?.dependent_name_en,
          emp?.full_name_en ? `Dependent of ${emp.full_name_en}` : null
        );
      }

      case "employee_medical_insurance": {
        const { data } = await supabase
          .from("employee_medical_insurances")
          .select("policy_number, insurance_type, employee:employees(full_name_en, employee_code)")
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        const emp = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;
        return pick(
          data?.policy_number,
          data?.insurance_type,
          emp?.full_name_en ? `Insurance · ${emp.full_name_en}` : null
        );
      }

      case "employee_access_card": {
        const { data } = await supabase
          .from("employee_access_cards")
          .select("card_number, card_type, employee:employees(full_name_en, employee_code)")
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        const emp = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;
        return pick(
          data?.card_number,
          data?.card_type,
          emp?.full_name_en ? `Access card · ${emp.full_name_en}` : null
        );
      }

      case "employee_medical_record": {
        const { data } = await supabase
          .from("employee_medical_records")
          .select("record_type, employee:employees(full_name_en, employee_code)")
          .eq("id", entityId)
          .is("deleted_at", null)
          .maybeSingle();
        const emp = Array.isArray(data?.employee) ? data?.employee[0] : data?.employee;
        return pick(
          data?.record_type,
          emp?.full_name_en ? `Medical record · ${emp.full_name_en}` : null
        );
      }

      default: {
        if (EMPLOYEE_ID_ENTITY_TYPES.has(entityType) || entityType.startsWith("employee")) {
          const { data } = await supabase
            .from("employees")
            .select("full_name_en, known_name, employee_code")
            .eq("id", entityId)
            .is("deleted_at", null)
            .maybeSingle();
          return pick(
            data?.full_name_en && data?.employee_code
              ? `${data.full_name_en} (${data.employee_code})`
              : null,
            data?.full_name_en,
            data?.known_name,
            data?.employee_code ? `Employee ${data.employee_code}` : null
          );
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

export async function resolveDmsLinkEntityDisplayNames(
  supabase: SupabaseClient,
  links: Array<{ entity_type: string; entity_id: number }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  await Promise.all(
    links.map(async (link) => {
      const key = `${link.entity_type}:${link.entity_id}`;
      const name =
        (await resolveDmsLinkEntityDisplayName(supabase, link.entity_type, link.entity_id)) ??
        formatDmsLinkEntityFallback(link.entity_type, link.entity_id);
      results.set(key, name);
    })
  );
  return results;
}
