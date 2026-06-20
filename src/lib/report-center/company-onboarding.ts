/**
 * Report Center — New Owner Company Onboarding Hook
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Ensures every owner company has default branding profile and report templates.
 * All operations are idempotent (safe to call multiple times).
 * Does NOT hardcode any company name, color, or logo.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingResult {
  success: boolean;
  brandingProfileId?: number;
  reportTemplateId?: number;
  letterTemplateId?: number;
  wasAlreadyPresent: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core helper — single company
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure a new owner company has default branding profile and report templates.
 *
 * Creates:
 * - `COMPANY_{id}_DEFAULT` branding profile (from owner_companies row)
 * - `COMPANY_{id}_REPORT_TEMPLATE` (report type, tied to branding profile)
 * - `COMPANY_{id}_LETTER_TEMPLATE` (letter type, tied to branding profile)
 *
 * Updates:
 * - `owner_companies.default_report_template_id`
 * - `owner_companies.default_letter_template_id`
 *
 * Idempotent: if any of these already exist, they are left unchanged.
 *
 * NOTE: This function uses the service-role admin client and must be called
 * from a server-only context (server action or API route).
 */
export async function ensureReportBrandingForOwnerCompany(
  ownerCompanyId: number
): Promise<OnboardingResult> {
  try {
    const db = createAdminClient();

    // ── 1. Fetch the owner company record ─────────────────────────────────
    const { data: companyData, error: companyError } = await db
      .from("owner_companies")
      .select(
        "id, company_name, company_code, phone, email, website, " +
          "default_report_template_id, default_letter_template_id"
      )
      .eq("id", ownerCompanyId)
      .single();

    if (companyError || !companyData) {
      return {
        success: false,
        wasAlreadyPresent: false,
        error: companyError?.message ?? "Owner company not found",
      };
    }

    // Narrow to plain record type (Supabase may return a union with GenericStringError in some SDK versions)
    const company = companyData as unknown as {
      id: number;
      company_name: string;
      company_code: string;
      phone: string | null;
      email: string | null;
      website: string | null;
      default_report_template_id: number | null;
      default_letter_template_id: number | null;
    };

    const profileCode = `COMPANY_${ownerCompanyId}_DEFAULT`;
    const reportTplCode = `COMPANY_${ownerCompanyId}_REPORT_TEMPLATE`;
    const letterTplCode = `COMPANY_${ownerCompanyId}_LETTER_TEMPLATE`;

    // ── 2. Ensure branding profile ────────────────────────────────────────
    let brandingProfileId: number;
    let wasAlreadyPresent = false;

    const { data: existingProfile } = await db
      .from("erp_report_branding_profiles")
      .select("id")
      .eq("profile_code", profileCode)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingProfile) {
      brandingProfileId = existingProfile.id;
      wasAlreadyPresent = true;
    } else {
      const { data: newProfile, error: profileInsertError } = await db
        .from("erp_report_branding_profiles")
        .insert({
          profile_code: profileCode,
          profile_name: company.company_name,
          profile_type: "company",
          owner_company_id: ownerCompanyId,
          is_default_for_company: true,
          is_group_profile: false,
          is_neutral_profile: false,
          is_active: true,
          phone: company.phone ?? null,
          email: company.email ?? null,
          website: company.website ?? null,
          // Colors default to neutral until admin customizes
          theme_primary_color: "#1e293b",
          theme_secondary_color: "#64748b",
          theme_header_bg_color: "#1e293b",
          theme_header_text_color: "#ffffff",
        })
        .select("id")
        .single();

      if (profileInsertError || !newProfile) {
        return {
          success: false,
          wasAlreadyPresent: false,
          error: profileInsertError?.message ?? "Failed to create branding profile",
        };
      }
      brandingProfileId = newProfile.id;
    }

    // ── 3. Ensure report template ─────────────────────────────────────────
    let reportTemplateId: number;

    const { data: existingReportTpl } = await db
      .from("erp_report_templates")
      .select("id")
      .eq("template_code", reportTplCode)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingReportTpl) {
      reportTemplateId = existingReportTpl.id;
    } else {
      const { data: newTpl, error: tplError } = await db
        .from("erp_report_templates")
        .insert({
          template_code: reportTplCode,
          template_name: `${company.company_name} — Report`,
          template_type: "report",
          branding_profile_id: brandingProfileId,
          default_orientation: "portrait",
          page_size: "a4",
          font_family: "helvetica",
          language_mode: "en",
          show_logo: true,
          show_small_logo: false,
          show_address: true,
          show_trn: true,
          show_license: true,
          show_signatory: false,
          show_stamp: false,
          show_watermark: false,
          requires_stamp_permission: false,
          is_default: false,
          is_active: true,
        })
        .select("id")
        .single();

      if (tplError || !newTpl) {
        return {
          success: false,
          wasAlreadyPresent,
          brandingProfileId,
          error: tplError?.message ?? "Failed to create report template",
        };
      }
      reportTemplateId = newTpl.id;
    }

    // ── 4. Ensure letter template ─────────────────────────────────────────
    let letterTemplateId: number;

    const { data: existingLetterTpl } = await db
      .from("erp_report_templates")
      .select("id")
      .eq("template_code", letterTplCode)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingLetterTpl) {
      letterTemplateId = existingLetterTpl.id;
    } else {
      const { data: newLetter, error: letterError } = await db
        .from("erp_report_templates")
        .insert({
          template_code: letterTplCode,
          template_name: `${company.company_name} — Letter`,
          template_type: "letter",
          branding_profile_id: brandingProfileId,
          default_orientation: "portrait",
          page_size: "a4",
          font_family: "helvetica",
          language_mode: "bilingual",
          show_logo: true,
          show_small_logo: true,
          show_address: true,
          show_trn: true,
          show_license: true,
          show_signatory: true,
          show_stamp: false,
          show_watermark: false,
          requires_stamp_permission: false,
          is_default: false,
          is_active: true,
        })
        .select("id")
        .single();

      if (letterError || !newLetter) {
        return {
          success: false,
          wasAlreadyPresent,
          brandingProfileId,
          reportTemplateId,
          error: letterError?.message ?? "Failed to create letter template",
        };
      }
      letterTemplateId = newLetter.id;
    }

    // ── 5. Update owner_companies FK columns (only if currently null) ─────
    const updates: Record<string, unknown> = {};
    if (!company.default_report_template_id) updates.default_report_template_id = reportTemplateId;
    if (!company.default_letter_template_id) updates.default_letter_template_id = letterTemplateId;

    if (Object.keys(updates).length > 0) {
      await db.from("owner_companies").update(updates).eq("id", ownerCompanyId);
    }

    return {
      success: true,
      brandingProfileId,
      reportTemplateId,
      letterTemplateId,
      wasAlreadyPresent,
    };
  } catch (error) {
    console.error("[ensureReportBrandingForOwnerCompany] Exception:", error);
    return {
      success: false,
      wasAlreadyPresent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill helper — all companies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backfill report branding for ALL active owner companies that are missing it.
 * Requires reports.manage or system-admin permission — enforced by the caller.
 * This function itself does not check permissions; it must be called from a
 * guarded server action.
 *
 * Returns summary of created/skipped counts.
 */
export async function ensureReportBrandingForAllOwnerCompanies(): Promise<{
  success: boolean;
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}> {
  const db = createAdminClient();

  const { data: companies, error } = await db
    .from("owner_companies")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id");

  if (error || !companies) {
    return {
      success: false,
      total: 0,
      created: 0,
      skipped: 0,
      errors: [error?.message ?? "Failed to list companies"],
    };
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const company of companies) {
    const result = await ensureReportBrandingForOwnerCompany(company.id);
    if (!result.success) {
      errors.push(`Company ${company.id}: ${result.error}`);
    } else if (result.wasAlreadyPresent) {
      skipped++;
    } else {
      created++;
    }
  }

  return {
    success: errors.length === 0,
    total: companies.length,
    created,
    skipped,
    errors,
  };
}
