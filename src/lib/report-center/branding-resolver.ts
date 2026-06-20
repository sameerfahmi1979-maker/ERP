/**
 * Global ERP Report Center — Branding Resolver
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server-side only. Do NOT import in client components.
 * Never hardcodes company names, logos, or identities.
 * Supports unlimited future companies via DB lookup.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ReportBrandingProfile,
  ReportTemplate,
  ResolvedReportTemplate,
  ReportCompanyContext,
  ReportRegistryEntry,
} from "./types";
import {
  NEUTRAL_BRANDING_PROFILE_CODE,
  GROUP_BRANDING_PROFILE_CODE,
  DEFAULT_REPORT_TEMPLATE_CODES,
} from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
// Company context detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect which owner companies are represented in a set of data rows.
 *
 * @param rows             Array of data objects
 * @param ownerCompanyAccessor  Key path to the owner_company_id field (default: "owner_company_id")
 */
export function detectReportCompanyContext(
  rows: Record<string, unknown>[],
  ownerCompanyAccessor: string = "owner_company_id"
): ReportCompanyContext {
  const ids = new Set<number>();

  for (const row of rows) {
    const val = row[ownerCompanyAccessor];
    if (typeof val === "number" && val > 0) {
      ids.add(val);
    }
  }

  const ownerCompanyIds = Array.from(ids);
  const isMultiCompany = ownerCompanyIds.length > 1;

  return {
    ownerCompanyIds,
    isMultiCompany,
    requiresManualTemplateSelection: isMultiCompany,
  };
}

/**
 * Returns true when the resolved context requires the user to manually
 * select a template before the report can be generated.
 */
export function requiresManualTemplateSelection(
  context: ReportCompanyContext
): boolean {
  return context.requiresManualTemplateSelection;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding profile loader
// ─────────────────────────────────────────────────────────────────────────────

async function loadBrandingProfileByCode(
  code: string
): Promise<ReportBrandingProfile | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_branding_profiles")
    .select("*")
    .eq("profile_code", code)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data as ReportBrandingProfile | null;
}

async function loadBrandingProfileByCompanyId(
  ownerCompanyId: number
): Promise<ReportBrandingProfile | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_branding_profiles")
    .select("*")
    .eq("owner_company_id", ownerCompanyId)
    .eq("is_default_for_company", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data as ReportBrandingProfile | null;
}

async function loadTemplateById(
  templateId: number
): Promise<ResolvedReportTemplate | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_templates")
    .select("*, branding_profile:branding_profile_id(*)")
    .eq("id", templateId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as ReportTemplate),
    branding_profile: (data as Record<string, unknown>)
      .branding_profile as ReportBrandingProfile | null,
  };
}

async function loadDefaultTemplateByCode(
  code: string
): Promise<ResolvedReportTemplate | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_templates")
    .select("*, branding_profile:branding_profile_id(*)")
    .eq("template_code", code)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as ReportTemplate),
    branding_profile: (data as Record<string, unknown>)
      .branding_profile as ReportBrandingProfile | null,
  };
}

async function loadCompanyDefaultTemplate(
  ownerCompanyId: number,
  templateType: "report" | "letter" = "report"
): Promise<ResolvedReportTemplate | null> {
  const db = createAdminClient();

  // Try company-specific template first
  const companyCode =
    templateType === "letter"
      ? `COMPANY_${ownerCompanyId}_LETTER_TEMPLATE`
      : `COMPANY_${ownerCompanyId}_REPORT_TEMPLATE`;

  const { data: companyTmpl } = await db
    .from("erp_report_templates")
    .select("*, branding_profile:branding_profile_id(*)")
    .eq("template_code", companyCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (companyTmpl) {
    return {
      ...(companyTmpl as ReportTemplate),
      branding_profile: (companyTmpl as Record<string, unknown>)
        .branding_profile as ReportBrandingProfile | null,
    };
  }

  // Fallback: owner_companies.default_report_template_id / default_letter_template_id
  const field =
    templateType === "letter"
      ? "default_letter_template_id"
      : "default_report_template_id";

  const { data: company } = await db
    .from("owner_companies")
    .select(field)
    .eq("id", ownerCompanyId)
    .maybeSingle();

  if (company && (company as Record<string, unknown>)[field]) {
    return loadTemplateById(
      (company as Record<string, number>)[field] as number
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback template
// ─────────────────────────────────────────────────────────────────────────────

export async function buildFallbackResolvedTemplate(): Promise<ResolvedReportTemplate | null> {
  return loadDefaultTemplateByCode(
    DEFAULT_REPORT_TEMPLATE_CODES.DEFAULT_REPORT
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main resolver
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveBrandingInput {
  /** Explicit template override (user-selected or report-fixed) */
  templateId?: number;
  /** Owner company IDs in the report data (can be 0, 1, or many) */
  ownerCompanyIds: number[];
  /** Registry entry for the report being run */
  registryEntry: ReportRegistryEntry;
  /** Whether the report is a letter type */
  isLetterType?: boolean;
}

export interface ResolveBrandingOutput {
  resolvedTemplate: ResolvedReportTemplate | null;
  resolvedBrandingProfile: ReportBrandingProfile | null;
  requiresManualTemplateSelection: boolean;
  isFallback: boolean;
}

/**
 * Resolve the correct branding profile and template for a report run.
 *
 * Decision tree:
 * 1. If templateId provided → load that template and its branding profile.
 * 2. If single ownerCompanyId → load that company's default template/branding.
 * 3. If multiple ownerCompanyIds → return requiresManualTemplateSelection=true.
 * 4. If no ownerCompanyId → use group/neutral fallback.
 *
 * Never hardcodes ALGT, ALS, or any specific company.
 */
export async function resolveReportBranding(
  input: ResolveBrandingInput
): Promise<ResolveBrandingOutput> {
  const { templateId, ownerCompanyIds, registryEntry, isLetterType } = input;
  const strategy = registryEntry.branding_strategy;

  // ── 1. Explicit template override ──────────────────────────────────────────
  if (templateId) {
    const template = await loadTemplateById(templateId);
    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: template?.branding_profile ?? null,
      requiresManualTemplateSelection: false,
      isFallback: template === null,
    };
  }

  // ── 2. Template fixed by registry ──────────────────────────────────────────
  if (strategy === "template_fixed" && registryEntry.default_template_id) {
    const template = await loadTemplateById(registryEntry.default_template_id);
    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: template?.branding_profile ?? null,
      requiresManualTemplateSelection: false,
      isFallback: template === null,
    };
  }

  // ── 3. No branding required ────────────────────────────────────────────────
  if (strategy === "none") {
    return {
      resolvedTemplate: null,
      resolvedBrandingProfile: null,
      requiresManualTemplateSelection: false,
      isFallback: false,
    };
  }

  // ── 4. Group default strategy ─────────────────────────────────────────────
  if (strategy === "group_default") {
    const profile = await loadBrandingProfileByCode(GROUP_BRANDING_PROFILE_CODE);
    const template = await loadDefaultTemplateByCode(
      DEFAULT_REPORT_TEMPLATE_CODES.GROUP_REPORT
    );
    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: profile,
      requiresManualTemplateSelection: false,
      isFallback: false,
    };
  }

  // ── 5. Manual required ────────────────────────────────────────────────────
  if (strategy === "manual_required") {
    return {
      resolvedTemplate: null,
      resolvedBrandingProfile: null,
      requiresManualTemplateSelection: true,
      isFallback: false,
    };
  }

  // ── 6. Auto by owner company ──────────────────────────────────────────────
  if (ownerCompanyIds.length > 1) {
    return {
      resolvedTemplate: null,
      resolvedBrandingProfile: null,
      requiresManualTemplateSelection: true,
      isFallback: false,
    };
  }

  if (ownerCompanyIds.length === 1) {
    const companyId = ownerCompanyIds[0];
    const templateType = isLetterType ? "letter" : "report";
    const template = await loadCompanyDefaultTemplate(companyId, templateType);
    const brandingProfile =
      template?.branding_profile ??
      (await loadBrandingProfileByCompanyId(companyId));

    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: brandingProfile,
      requiresManualTemplateSelection: false,
      isFallback: template === null,
    };
  }

  // ── 7. No company context — use neutral fallback ──────────────────────────
  const profile = await loadBrandingProfileByCode(NEUTRAL_BRANDING_PROFILE_CODE);
  const template = await buildFallbackResolvedTemplate();
  return {
    resolvedTemplate: template,
    resolvedBrandingProfile: profile,
    requiresManualTemplateSelection: false,
    isFallback: true,
  };
}
