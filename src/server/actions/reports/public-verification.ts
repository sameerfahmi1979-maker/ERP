"use server";

/**
 * Public Verification — Server Actions
 * Phase: BRANDING.6 — Public QR Verification System
 *
 * Security contract:
 * - createOutputPublicLink requires reports.publish or reports.manage
 * - getPublicVerificationByToken is PUBLIC — no login required — uses SECURITY DEFINER RPC
 * - cancelOutputPublicLink requires reports.publish or reports.manage
 * - supersedeOutputPublicLink requires reports.publish or reports.manage
 * - listOutputPublicLinks requires reports.view or reports.manage
 * - No internal IDs are returned from public actions
 * - No salary, IBAN, medical, HR restricted content in any response
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  generateVerificationToken,
  buildVerificationPath,
  buildVerificationUrl,
  sanitizePublicPayload,
  buildVerificationSummary,
} from "@/lib/public-verification";
import { checkTemplateIsIssuable } from "@/server/actions/reports/template-governance";
import type {
  CreateOutputPublicLinkInput,
  OutputPublicLink,
  PublicVerificationResult,
  SafeSummaryField,
} from "@/lib/public-verification";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateOutputPublicLinkResult {
  id: number;
  public_token: string;
  public_url: string;
  public_url_path: string;
}

/**
 * Create a new public verification link for an issued ERP output.
 * Requires: reports.publish OR reports.manage
 */
export async function createOutputPublicLink(
  input: CreateOutputPublicLinkInput
): Promise<ActionResult<CreateOutputPublicLinkResult>> {
  const supabase = await createClient();
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "reports.publish") &&
    !hasPermission(ctx, "reports.manage")
  ) {
    return { success: false, error: "Permission denied: reports.publish required." };
  }

  const token = generateVerificationToken();
  const urlPath = buildVerificationPath(token);
  const accessLevel = input.access_level ?? "verify_only";

  // BRANDING.7 guardrail: if a template_id is provided, it must be approved or published
  if (input.template_id != null) {
    const templateCheck = await checkTemplateIsIssuable(input.template_id);
    if (!templateCheck.isIssuable) {
      return {
        success: false,
        error: `Cannot issue QR link: template is '${templateCheck.governanceStatus ?? "unknown"}'. Only approved or published templates may be used for official public verification.`,
      };
    }
  }

  // BRANDING.8: Require template_id for all official formal output types
  const FORMAL_ISSUANCE_TYPES = ["letter", "certificate", "form"] as const;
  if (
    (FORMAL_ISSUANCE_TYPES as readonly string[]).includes(input.output_type) &&
    input.template_id == null
  ) {
    return {
      success: false,
      error:
        "A template_id is required for official letter, certificate, or form issuance. Select an approved or published template before issuing a public verification link.",
    };
  }

  const safeSummary = buildVerificationSummary(
    (input.verification_summary ?? {}) as Partial<Record<SafeSummaryField, string | null>>
  );

  const safePayload = input.public_payload
    ? sanitizePublicPayload(input.public_payload as Record<string, unknown>)
    : {};

  const userProfileId = ctx.profile?.id ?? null;

  const insertData = {
    public_token: token,
    public_url_path: urlPath,
    output_type: input.output_type,
    source_module: input.source_module,
    source_entity_type: input.source_entity_type ?? null,
    source_entity_id: input.source_entity_id ?? null,
    source_record_ref: input.source_record_ref ?? null,
    document_title: input.document_title,
    document_subtitle: input.document_subtitle ?? null,
    document_ref: input.document_ref ?? null,
    document_date: input.document_date ?? null,
    owner_company_id: input.owner_company_id ?? null,
    branding_profile_id: input.branding_profile_id ?? null,
    template_id: input.template_id ?? null,
    report_run_id: input.report_run_id ?? null,
    issued_by_user_profile_id: userProfileId,
    expires_at: input.expires_at ?? null,
    access_level: accessLevel,
    verification_summary_json: safeSummary,
    public_payload_json: safePayload,
    status: "valid" as const,
    created_by: userProfileId,
    updated_by: userProfileId,
  };

  const { data: inserted, error } = await supabase
    .from("erp_output_public_links")
    .insert(insertData)
    .select("id, public_token, public_url_path")
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? "Failed to create verification link." };
  }

  await logAudit({
    module_code: "REPORTS",
    entity_name: "erp_output_public_links",
    entity_id: inserted.id,
    entity_reference: inserted.public_token.slice(0, 12),
    action: "create",
    new_values: {
      output_type: input.output_type,
      source_module: input.source_module,
      access_level: accessLevel,
      document_title: input.document_title,
    },
  });

  return {
    success: true,
    data: {
      id: inserted.id,
      public_token: inserted.public_token,
      public_url: buildVerificationUrl(inserted.public_token),
      public_url_path: inserted.public_url_path,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC READ — no login required, uses SECURITY DEFINER RPC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a public verification token.
 * PUBLIC — does not require authentication.
 * Uses the SECURITY DEFINER `get_public_verification_by_token` RPC via admin client.
 */
export async function getPublicVerificationByToken(
  token: string
): Promise<ActionResult<PublicVerificationResult | null>> {
  if (!token || token.length < 32) {
    return { success: true, data: null };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("get_public_verification_by_token", {
    p_token: token,
  });

  if (error) {
    return { success: true, data: null };
  }

  if (!data) {
    return { success: true, data: null };
  }

  const result = data as Record<string, unknown>;

  return {
    success: true,
    data: {
      status: (result.status as PublicVerificationResult["status"]) ?? "expired",
      access_level: (result.access_level as PublicVerificationResult["access_level"]) ?? "verify_only",
      output_type: (result.output_type as PublicVerificationResult["output_type"]) ?? "other",
      document_title: (result.document_title as string) ?? "",
      document_subtitle: (result.document_subtitle as string) ?? null,
      document_ref: (result.document_ref as string) ?? null,
      document_date: (result.document_date as string) ?? null,
      issued_at: (result.issued_at as string) ?? "",
      expires_at: (result.expires_at as string) ?? null,
      cancelled_at: (result.cancelled_at as string) ?? null,
      cancel_reason: (result.cancel_reason as string) ?? null,
      verification_summary: (result.verification_summary as Record<string, unknown>) ?? {},
      public_payload: (result.public_payload as Record<string, unknown>) ?? {},
      download_enabled: Boolean(result.download_enabled),
      superseded_by_token: (result.superseded_by_token as string) ?? null,
    } satisfies PublicVerificationResult,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel an active verification link.
 * Requires: reports.publish OR reports.manage OR reports.verify.admin
 */
export async function cancelOutputPublicLink(
  id: number,
  reason?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "reports.publish") &&
    !hasPermission(ctx, "reports.manage") &&
    !hasPermission(ctx, "reports.verify.admin")
  ) {
    return { success: false, error: "Permission denied." };
  }

  const userProfileId = ctx.profile?.id ?? null;

  const { error } = await supabase
    .from("erp_output_public_links")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_profile_id: userProfileId,
      cancel_reason: reason ?? null,
      updated_by: userProfileId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .in("status", ["valid", "expired"]);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    module_code: "REPORTS",
    entity_name: "erp_output_public_links",
    entity_id: id,
    entity_reference: String(id),
    action: "cancel",
    new_values: { status: "cancelled", reason: reason ?? null },
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPERSEDE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark an existing link as superseded by a new link.
 * Requires: reports.publish OR reports.manage
 */
export async function supersedeOutputPublicLink(
  oldId: number,
  newLinkId: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "reports.publish") &&
    !hasPermission(ctx, "reports.manage")
  ) {
    return { success: false, error: "Permission denied." };
  }

  const userProfileId = ctx.profile?.id ?? null;

  const { error } = await supabase
    .from("erp_output_public_links")
    .update({
      status: "superseded",
      superseded_by_link_id: newLinkId,
      updated_by: userProfileId,
    })
    .eq("id", oldId)
    .is("deleted_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    module_code: "REPORTS",
    entity_name: "erp_output_public_links",
    entity_id: oldId,
    entity_reference: String(oldId),
    action: "supersede",
    new_values: { status: "superseded", superseded_by_link_id: newLinkId },
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST (internal admin)
// ─────────────────────────────────────────────────────────────────────────────

export interface ListOutputPublicLinksFilters {
  status?: string;
  source_module?: string;
  owner_company_id?: number;
  limit?: number;
  offset?: number;
}

/**
 * List issued public verification links for internal admin use.
 * Requires: reports.view OR reports.manage OR reports.publish OR reports.verify.admin
 */
export async function listOutputPublicLinks(
  filters: ListOutputPublicLinksFilters = {}
): Promise<ActionResult<{ links: Partial<OutputPublicLink>[]; total: number }>> {
  const supabase = await createClient();
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "reports.view") &&
    !hasPermission(ctx, "reports.manage") &&
    !hasPermission(ctx, "reports.publish") &&
    !hasPermission(ctx, "reports.verify.admin")
  ) {
    return { success: false, error: "Permission denied." };
  }

  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let query = supabase
    .from("erp_output_public_links")
    .select(
      "id, public_token, public_url_path, output_type, source_module, document_title, document_ref, document_date, status, access_level, view_count, issued_at, expires_at, cancelled_at, created_at",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("issued_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.source_module) query = query.eq("source_module", filters.source_module);
  if (filters.owner_company_id) query = query.eq("owner_company_id", filters.owner_company_id);

  const { data, error, count } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: { links: (data ?? []) as Partial<OutputPublicLink>[], total: count ?? 0 },
  };
}
