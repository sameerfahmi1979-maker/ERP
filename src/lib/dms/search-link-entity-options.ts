/**
 * Searchable entity options for DMS document link picker (Add Link form).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";

export type DmsLinkEntityOption = {
  id: number;
  label: string;
  code: string | null;
  description: string | null;
};

const EMPLOYEE_ID_ENTITY_TYPES = new Set([
  "employee",
  "employee_compliance",
  "employee_contract",
  "employee_leave_request",
]);

const DEFAULT_LIMIT = 50;

function sanitizeSearch(search?: string): string | null {
  const q = search?.trim();
  if (!q) return null;
  return q.replace(/[%_]/g, "").slice(0, 80);
}

function toOption(
  id: number,
  label: string,
  code?: string | null,
  description?: string | null
): DmsLinkEntityOption {
  return {
    id,
    label,
    code: code ?? null,
    description: description ?? null,
  };
}

function logSearchError(scope: string, error: { message: string }) {
  logger.warn(`searchDmsLinkEntityOptions:${scope}`, { error: error.message });
}

async function searchEmployees(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("employees")
    .select("id, employee_code, full_name_en, known_name")
    .is("deleted_at", null)
    .order("full_name_en", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(
      `employee_code.ilike.%${search}%,full_name_en.ilike.%${search}%,full_name_ar.ilike.%${search}%,known_name.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      row.full_name_en
        ? `${row.full_name_en as string}${row.employee_code ? ` (${row.employee_code as string})` : ""}`
        : (row.employee_code as string) ?? `Employee #${row.id}`,
      row.employee_code as string | null,
      row.known_name as string | null
    )
  );
}

async function searchParties(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("parties")
    .select("id, party_code, display_name, legal_name_en, trade_name_en")
    .eq("is_active", true)
    .order("display_name", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,party_code.ilike.%${search}%,legal_name_en.ilike.%${search}%,trade_name_en.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("parties", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      (row.display_name as string) ||
        (row.legal_name_en as string) ||
        (row.trade_name_en as string) ||
        `Party #${row.id}`,
      row.party_code as string | null
    )
  );
}

async function searchCompanies(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("owner_companies")
    .select("id, trade_name, legal_name_en, company_code")
    .order("trade_name", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(
      `trade_name.ilike.%${search}%,legal_name_en.ilike.%${search}%,company_code.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      (row.trade_name as string) || (row.legal_name_en as string) || `Company #${row.id}`,
      row.company_code as string | null
    )
  );
}

async function searchBranches(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("branches")
    .select("id, branch_name_en, branch_code")
    .order("branch_name_en", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(
      `branch_name_en.ilike.%${search}%,branch_code.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      (row.branch_name_en as string) || `Branch #${row.id}`,
      row.branch_code as string | null
    )
  );
}

async function searchBanks(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("banks")
    .select("id, bank_name_en, bank_code")
    .eq("is_active", true)
    .order("bank_name_en", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(`bank_name_en.ilike.%${search}%,bank_code.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      (row.bank_name_en as string) || `Bank #${row.id}`,
      row.bank_code as string | null
    )
  );
}

async function searchSites(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("work_sites")
    .select("id, site_name, site_code")
    .is("deleted_at", null)
    .order("site_name", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(`site_name.ilike.%${search}%,site_code.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) =>
    toOption(
      row.id as number,
      (row.site_name as string) || `Site #${row.id}`,
      row.site_code as string | null
    )
  );
}

async function searchVehicles(
  _supabase: SupabaseClient,
  _search: string | null,
  _limit: number
): Promise<DmsLinkEntityOption[]> {
  // Fleet module tables not deployed yet — avoid querying missing `vehicles` table.
  return [];
}

async function searchPartyLicenses(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("party_licenses")
    .select("id, license_number, license_code, party:parties(display_name, party_code)")
    .order("license_number", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.or(`license_number.ilike.%${search}%,license_code.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const party = Array.isArray(row.party) ? row.party[0] : row.party;
    const partyName = party?.display_name as string | undefined;
    return toOption(
      row.id as number,
      row.license_number
        ? `${row.license_number as string}${partyName ? ` · ${partyName}` : ""}`
        : (row.license_code as string) || `License #${row.id}`,
      row.license_code as string | null,
      partyName ?? null
    );
  });
}

async function searchPartyTaxRegistrations(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("party_tax_registrations")
    .select("id, trn, party:parties(display_name, party_code)")
    .order("trn", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.ilike("trn", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const party = Array.isArray(row.party) ? row.party[0] : row.party;
    const partyName = party?.display_name as string | undefined;
    return toOption(
      row.id as number,
      row.trn
        ? `TRN ${row.trn as string}${partyName ? ` · ${partyName}` : ""}`
        : `Tax registration #${row.id}`,
      row.trn as string | null,
      partyName ?? null
    );
  });
}

async function searchEmployeeDependents(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("employee_dependents")
    .select("id, dependent_name_en, employee:employees(full_name_en, employee_code)")
    .is("deleted_at", null)
    .order("dependent_name_en", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.ilike("dependent_name_en", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
    return toOption(
      row.id as number,
      (row.dependent_name_en as string) || `Dependent #${row.id}`,
      emp?.employee_code as string | null,
      emp?.full_name_en as string | null
    );
  });
}

async function searchEmployeeIdentityDocuments(
  supabase: SupabaseClient,
  search: string | null,
  limit: number
): Promise<DmsLinkEntityOption[]> {
  let query = supabase
    .from("employee_identity_documents")
    .select(
      "id, document_number, document_type:hr_identity_document_types(name_en), employee:employees(full_name_en, employee_code)"
    )
    .order("document_number", { ascending: true })
    .limit(limit);

  if (search) {
    query = query.ilike("document_number", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    logSearchError("employees", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
    const docType = Array.isArray(row.document_type) ? row.document_type[0] : row.document_type;
    return toOption(
      row.id as number,
      docType?.name_en && row.document_number
        ? `${docType.name_en as string} — ${row.document_number as string}`
        : (row.document_number as string) || `Identity doc #${row.id}`,
      emp?.employee_code as string | null,
      emp?.full_name_en as string | null
    );
  });
}

export async function searchDmsLinkEntityOptionsForType(
  supabase: SupabaseClient,
  entityType: string,
  search?: string,
  limit = DEFAULT_LIMIT
): Promise<DmsLinkEntityOption[]> {
  const q = sanitizeSearch(search);

  if (EMPLOYEE_ID_ENTITY_TYPES.has(entityType) || entityType.startsWith("employee")) {
    if (
      entityType === "employee_dependent" ||
      entityType === "employee_identity_document" ||
      entityType === "employee_medical_insurance" ||
      entityType === "employee_access_card" ||
      entityType === "employee_medical_record"
    ) {
      // fall through to specific handlers below
    } else {
      return searchEmployees(supabase, q, limit);
    }
  }

  switch (entityType) {
    case "party":
      return searchParties(supabase, q, limit);
    case "party_license":
      return searchPartyLicenses(supabase, q, limit);
    case "party_tax_registration":
      return searchPartyTaxRegistrations(supabase, q, limit);
    case "company":
      return searchCompanies(supabase, q, limit);
    case "branch":
      return searchBranches(supabase, q, limit);
    case "bank":
      return searchBanks(supabase, q, limit);
    case "site":
      return searchSites(supabase, q, limit);
    case "vehicle":
    case "fleet_asset":
      return searchVehicles(supabase, q, limit);
    case "employee_dependent":
      return searchEmployeeDependents(supabase, q, limit);
    case "employee_identity_document":
      return searchEmployeeIdentityDocuments(supabase, q, limit);
    default:
      if (entityType.startsWith("employee")) {
        return searchEmployees(supabase, q, limit);
      }
      return [];
  }
}

export function getDmsLinkEntitySearchPlaceholder(entityType: string): string {
  const label = getDmsEntityTypeLabel(entityType);
  return `Search ${label.toLowerCase()} by name or code...`;
}
