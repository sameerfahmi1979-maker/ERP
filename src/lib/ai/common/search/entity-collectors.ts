/**
 * ERP COMMON AI.6 — Entity Collectors
 *
 * Safe, RLS-aware queries against entity tables.
 * Returns only safe display fields — never content_text, OCR, or raw AI output.
 */

import { createClient } from "@/lib/supabase/server";
import type { ErpSearchResult, ErpSearchFilters } from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function resolveLimit(input?: number): number {
  if (!input) return DEFAULT_LIMIT;
  return Math.min(input, MAX_LIMIT);
}

// ── Organizations (owner_companies) ───────────────────────────────────────────

export async function queryOrganizations(
  input: ErpSearchFilters
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "organization";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const { data, error } = await supabase
      .from("owner_companies")
      .select("id, trade_name, company_code, status, updated_at")
      .ilike("trade_name", `%${q}%`)
      .order("trade_name")
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      trade_name: string;
      company_code: string | null;
      status: string | null;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => ({
      key: `organization:${row.id}`,
      resultType: "organization",
      entityType: "organization",
      entityId: row.id,
      title: row.trade_name ?? `Company #${row.id}`,
      subtitle: row.company_code ?? null,
      snippet: row.status ? `Status: ${row.status}` : null,
      route: `/admin/organizations/record/${row.id}`,
      relevanceScore: 70,
      updatedAt: row.updated_at ?? null,
    }));

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

// ── Branches ──────────────────────────────────────────────────────────────────

export async function queryBranches(
  input: ErpSearchFilters
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "branch";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const { data, error } = await supabase
      .from("branches")
      .select("id, branch_name_en, branch_code, status, updated_at")
      .ilike("branch_name_en", `%${q}%`)
      .order("branch_name_en")
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      branch_name_en: string | null;
      branch_code: string | null;
      status: string | null;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => ({
      key: `branch:${row.id}`,
      resultType: "branch",
      entityType: "branch",
      entityId: row.id,
      title: row.branch_name_en ?? `Branch #${row.id}`,
      subtitle: row.branch_code ?? null,
      snippet: row.status ? `Status: ${row.status}` : null,
      route: `/admin/branches/record/${row.id}`,
      relevanceScore: 65,
      updatedAt: row.updated_at ?? null,
    }));

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

// ── Parties ───────────────────────────────────────────────────────────────────

export async function queryParties(
  input: ErpSearchFilters
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "party";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const { data, error } = await supabase
      .from("parties")
      .select("id, display_name, party_ref, party_type_code, is_active, updated_at")
      .eq("is_active", true)
      .ilike("display_name", `%${q}%`)
      .order("display_name")
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      display_name: string | null;
      party_ref: string | null;
      party_type_code: string | null;
      is_active: boolean;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => ({
      key: `party:${row.id}`,
      resultType: "party",
      entityType: "party",
      entityId: row.id,
      title: row.display_name ?? `Party #${row.id}`,
      subtitle: row.party_ref ?? null,
      snippet: row.party_type_code ? `Type: ${row.party_type_code}` : null,
      route: `/admin/master-data/parties/record/${row.id}`,
      relevanceScore: 65,
      updatedAt: row.updated_at ?? null,
    }));

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

// ── Work Sites ────────────────────────────────────────────────────────────────

export async function queryWorkSites(
  input: ErpSearchFilters
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "site";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const { data, error } = await supabase
      .from("work_sites")
      .select("id, site_name, site_code, site_type, deleted_at, updated_at")
      .is("deleted_at", null)
      .ilike("site_name", `%${q}%`)
      .order("site_name")
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      site_name: string | null;
      site_code: string | null;
      site_type: string | null;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => ({
      key: `site:${row.id}`,
      resultType: "site",
      entityType: "site",
      entityId: row.id,
      title: row.site_name ?? `Site #${row.id}`,
      subtitle: row.site_code ?? null,
      snippet: row.site_type ? `Type: ${row.site_type}` : null,
      route: `/admin/common-master-data/work-sites/record/${row.id}`,
      relevanceScore: 60,
      updatedAt: row.updated_at ?? null,
    }));

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

// ── DMS Documents (quick/keyword) ─────────────────────────────────────────────

export async function queryDmsDocumentsQuick(
  input: ErpSearchFilters,
  isAdmin: boolean
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "dms_document";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

    const { data, error } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, confidentiality_level, ai_risk_level, expiry_date, updated_at")
      .is("deleted_at", null)
      .or(`title.ilike.%${q}%,document_no.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      document_no: string | null;
      title: string | null;
      confidentiality_level: string | null;
      ai_risk_level: string | null;
      expiry_date: string | null;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => {
      const isConfidential =
        !!row.confidentiality_level &&
        CONFIDENTIAL_LEVELS.includes(row.confidentiality_level) &&
        !isAdmin;

      return {
        key: `dms_document:${row.id}`,
        resultType: "dms_document",
        entityType: "dms_document",
        entityId: row.id,
        title: row.title ?? row.document_no ?? `Document #${row.id}`,
        subtitle: row.document_no ?? null,
        snippet: isConfidential ? null : null,
        route: `/dms/documents/record/${row.id}`,
        isConfidential,
        badges: isConfidential
          ? undefined
          : {
              riskLevel: (row.ai_risk_level as ErpSearchResult["badges"] extends undefined ? never : NonNullable<ErpSearchResult["badges"]>["riskLevel"]) ?? null,
            },
        relevanceScore: 60,
        updatedAt: row.updated_at ?? null,
      };
    });

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

// ── DMS Documents (FTS content search) ───────────────────────────────────────

export async function queryDmsDocumentsFts(
  input: ErpSearchFilters,
  isAdmin: boolean
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "dms_document_fts";
  try {
    const supabase = await createClient();
    const limit = resolveLimit(input.limit);
    const q = input.query.trim();

    const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

    const { data, error } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, confidentiality_level, ai_risk_level, updated_at")
      .is("deleted_at", null)
      .textSearch("content_tsv", q, { type: "websearch" })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) return { results: [], source, failed: true };

    const rows = (data ?? []) as Array<{
      id: number;
      document_no: string | null;
      title: string | null;
      confidentiality_level: string | null;
      ai_risk_level: string | null;
      updated_at: string | null;
    }>;

    const results: ErpSearchResult[] = rows.map((row) => {
      const isConfidential =
        !!row.confidentiality_level &&
        CONFIDENTIAL_LEVELS.includes(row.confidentiality_level) &&
        !isAdmin;

      return {
        key: `dms_document:${row.id}`,
        resultType: "dms_document",
        entityType: "dms_document",
        entityId: row.id,
        title: row.title ?? row.document_no ?? `Document #${row.id}`,
        subtitle: row.document_no ?? null,
        snippet: isConfidential ? null : null,
        route: `/dms/documents/record/${row.id}`,
        isConfidential,
        relevanceScore: 55,
        updatedAt: row.updated_at ?? null,
      };
    });

    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}
