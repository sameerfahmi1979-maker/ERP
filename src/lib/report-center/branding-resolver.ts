/**
 * Global ERP Report Center — Branding Resolver
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server-side only. Do NOT import in client components.
 * Never hardcodes company names, logos, or identities.
 * Supports unlimited future companies via DB lookup.
 */

import "server-only";
import type { AuthContext } from "@/lib/rbac/check";
import { canUseApplication, hasPermission } from "@/lib/rbac/scope";
import { brandingPermission, canViewReportBrandingAssets } from "@/lib/branding/asset-permissions";
import { resolveReportBrandingProfileAssets } from "@/lib/branding/resolve-report-branding-assets";
import { requireBrandingRevision } from "@/lib/branding/issuance-provenance";
import { createReportBrandingReadAuthority, type ReportBrandingReadAuthority } from "@/server/report-branding-read-authority";
import type {
  ReportBrandingProfile,
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

const unavailable = () => new Error("Report branding is unavailable or not authorized. Reload and try again.");
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;

function requirePrincipal(ctx: AuthContext) {
  if (!ctx || !canUseApplication(ctx) || (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.manage"))) {
    throw unavailable();
  }
}

/** Safe profile fields and governed image URLs; never return stored legacy capabilities. */
async function resolveProfile(profile: ReportBrandingProfile, ctx: AuthContext): Promise<ReportBrandingProfile> {
  if (!validId(profile.id) || !profile.is_active || profile.deleted_at ||
      (profile.owner_company_id !== null && !validId(profile.owner_company_id)) ||
      !canViewReportBrandingAssets(ctx, profile.owner_company_id)) throw unavailable();
  const { urls } = await resolveReportBrandingProfileAssets(profile.id, ctx, requireBrandingRevision(profile.workspace_revision));
  const canSign = brandingPermission(ctx, "reports.sign", profile.owner_company_id);
  return {
    ...profile,
    logo_url: urls.report_logo ?? null,
    small_logo_url: urls.report_logo_small ?? null,
    watermark_url: urls.watermark ?? null,
    stamp_url: canSign ? urls.stamp ?? null : null,
    signature_url: canSign ? urls.signature ?? null : null,
    signatory_name: canSign ? profile.signatory_name : null,
    signatory_title_en: canSign ? profile.signatory_title_en : null,
    signatory_title_ar: canSign ? profile.signatory_title_ar : null,
  };
}

async function loadBrandingProfileByCode(code: string, read: ReportBrandingReadAuthority): Promise<ReportBrandingProfile | null> {
  const profile = await read.profile({ code });
  return profile ? resolveProfile(profile, await read.refresh()) : null;
}

async function loadBrandingProfileByCompanyId(ownerCompanyId: number, read: ReportBrandingReadAuthority): Promise<ReportBrandingProfile | null> {
  const profile = await read.profile({ companyId: ownerCompanyId });
  return profile ? resolveProfile(profile, await read.refresh()) : null;
}

async function resolveSelectedTemplate(selected: NonNullable<Awaited<ReturnType<ReportBrandingReadAuthority['template']>>>, read: ReportBrandingReadAuthority): Promise<ResolvedReportTemplate> {
  const ctx = await read.refresh();
  if (!canViewReportBrandingAssets(ctx, selected.companyId)) throw unavailable();
  const profile = selected.profile ? await resolveProfile(selected.profile, ctx) : null;
  const canSign = brandingPermission(ctx, "reports.sign", selected.companyId);
  return { ...selected.template, branding_profile: profile, show_stamp: selected.template.show_stamp && canSign, show_signatory: selected.template.show_signatory && canSign };
}

async function loadTemplateById(templateId: number, read: ReportBrandingReadAuthority, expectedCompany?: number | null): Promise<ResolvedReportTemplate> {
  const selected = await read.template({ id: templateId }, expectedCompany);
  if (!selected) throw unavailable();
  return resolveSelectedTemplate(selected, read);
}

async function loadDefaultTemplateByCode(code: string, read: ReportBrandingReadAuthority, expectedCompany: number | null): Promise<ResolvedReportTemplate | null> {
  const selected = await read.template({ code }, expectedCompany);
  return selected ? resolveSelectedTemplate(selected, read) : null;
}

async function loadCompanyDefaultTemplate(
  ownerCompanyId: number,
  read: ReportBrandingReadAuthority,
  templateType: "report" | "letter" = "report"
): Promise<ResolvedReportTemplate | null> {

  // Try company-specific template first
  const companyCode =
    templateType === "letter"
      ? `COMPANY_${ownerCompanyId}_LETTER_TEMPLATE`
      : `COMPANY_${ownerCompanyId}_REPORT_TEMPLATE`;

  const companyTmpl = await loadDefaultTemplateByCode(companyCode, read, ownerCompanyId);
  if (companyTmpl) return companyTmpl;

  // Fallback: owner_companies.default_report_template_id / default_letter_template_id
  const id = await read.companyDefaultTemplateId(ownerCompanyId, templateType === "letter");
  return id === null ? null : loadTemplateById(id, read, ownerCompanyId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback template
// ─────────────────────────────────────────────────────────────────────────────

export async function buildFallbackResolvedTemplate(ctx: AuthContext): Promise<ResolvedReportTemplate | null> {
  try {
    const read = await createReportBrandingReadAuthority(ctx);
    const template = await loadDefaultTemplateByCode(DEFAULT_REPORT_TEMPLATE_CODES.DEFAULT_REPORT, read, null);
    const result = await finalizeBranding({ resolvedTemplate: template, resolvedBrandingProfile: template?.branding_profile ?? null,
      requiresManualTemplateSelection: false, isFallback: true }, read);
    return result.resolvedTemplate;
  } catch { throw unavailable(); }
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
  input: ResolveBrandingInput,
  ctx: AuthContext
): Promise<ResolveBrandingOutput> {
  try {
    if (!input || !Array.isArray(input.ownerCompanyIds) || input.ownerCompanyIds.some(id => !validId(id)) ||
        (input.templateId !== undefined && !validId(input.templateId))) throw unavailable();
    const read = await createReportBrandingReadAuthority(ctx);
    return await finalizeBranding(await resolveAuthorizedReportBranding(input, read), read);
  } catch { throw unavailable(); }
}

async function resolveAuthorizedReportBranding(
  input: ResolveBrandingInput,
  read: ReportBrandingReadAuthority
): Promise<ResolveBrandingOutput> {
  const { templateId, ownerCompanyIds, registryEntry, isLetterType } = input;
  const strategy = registryEntry.branding_strategy;

  // ── 1. Explicit template override ──────────────────────────────────────────
  if (templateId) {
    const template = await loadTemplateById(templateId, read);
    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: template?.branding_profile ?? null,
      requiresManualTemplateSelection: false,
      isFallback: template === null,
    };
  }

  // ── 2. Template fixed by registry ──────────────────────────────────────────
  if (strategy === "template_fixed" && registryEntry.default_template_id) {
    const template = await loadTemplateById(registryEntry.default_template_id, read);
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
    const template = await loadDefaultTemplateByCode(
      DEFAULT_REPORT_TEMPLATE_CODES.GROUP_REPORT, read, null
    );
    const profile = template?.branding_profile ?? await loadBrandingProfileByCode(GROUP_BRANDING_PROFILE_CODE, read);
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
    const template = await loadCompanyDefaultTemplate(companyId, read, templateType);
    const brandingProfile =
      template?.branding_profile ??
      (await loadBrandingProfileByCompanyId(companyId, read));

    return {
      resolvedTemplate: template,
      resolvedBrandingProfile: brandingProfile,
      requiresManualTemplateSelection: false,
      isFallback: template === null,
    };
  }

  // ── 7. No company context — use neutral fallback ──────────────────────────
  const template = await loadDefaultTemplateByCode(DEFAULT_REPORT_TEMPLATE_CODES.DEFAULT_REPORT, read, null);
  const profile = template?.branding_profile ?? await loadBrandingProfileByCode(NEUTRAL_BRANDING_PROFILE_CODE, read);
  return {
    resolvedTemplate: template,
    resolvedBrandingProfile: profile,
    requiresManualTemplateSelection: false,
    isFallback: true,
  };
}

/** Recheck current authority after metadata/asset I/O, including late signing
 * revocation. These checks do not confer access to any report business records. */
async function finalizeBranding(result: ResolveBrandingOutput, read: ReportBrandingReadAuthority): Promise<ResolveBrandingOutput> {
  if (result.resolvedTemplate) await read.verifyTemplate(result.resolvedTemplate);
  const ctx = await read.refresh();
  requirePrincipal(ctx);
  const profile = result.resolvedBrandingProfile;
  if (!profile && !result.resolvedTemplate) return result;
  const companyId = profile?.owner_company_id ?? null;
  if (!canViewReportBrandingAssets(ctx, companyId)) throw unavailable();
  const canSign = brandingPermission(ctx, "reports.sign", companyId);
  const safeProfile = profile && !canSign ? { ...profile, stamp_url: null, signature_url: null,
    signatory_name: null, signatory_title_en: null, signatory_title_ar: null } : profile;
  return { ...result, resolvedBrandingProfile: safeProfile, resolvedTemplate: result.resolvedTemplate ? {
    ...result.resolvedTemplate, branding_profile: safeProfile,
    show_stamp: result.resolvedTemplate.show_stamp && canSign,
    show_signatory: result.resolvedTemplate.show_signatory && canSign,
  } : null };
}
