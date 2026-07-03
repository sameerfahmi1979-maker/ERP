"use server";

/**
 * ERP Branding — App Settings Server Actions
 * Phase: BRANDING.1 — Unified Branding Assets and Storage Foundation
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  DEFAULT_APP_BRANDING_SETTINGS_CODE,
  type AppBrandingSettings,
} from "@/lib/branding";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

function canViewAppBranding(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "branding.app.view") ||
    hasPermission(ctx, "reports.manage")
  );
}

function canManageAppBranding(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "branding.app.manage");
}

const updateAppBrandingSettingsSchema = z.object({
  id: z.number().int().positive(),
  app_name: z.string().min(1).max(200).optional(),
  app_short_name: z.string().max(50).nullable().optional(),
  tagline: z.string().max(300).nullable().optional(),
  support_email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  support_phone: z.string().max(50).nullable().optional(),
  footer_text: z.string().max(1000).nullable().optional(),
  theme_primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color")
    .nullable()
    .optional(),
  theme_secondary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color")
    .nullable()
    .optional(),
  theme_accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color")
    .nullable()
    .optional(),
  login_title: z.string().max(200).nullable().optional(),
  login_subtitle: z.string().max(300).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function getActiveAppBrandingSettings(): Promise<
  ActionResult<AppBrandingSettings>
> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAppBranding(ctx)) {
      return { success: false, error: "Permission denied: requires branding.app.view" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_app_branding_settings")
      .select("*")
      .eq("settings_code", DEFAULT_APP_BRANDING_SETTINGS_CODE)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Active app branding settings not found" };

    return { success: true, data: data as AppBrandingSettings };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function listAppBrandingSettings(): Promise<
  ActionResult<AppBrandingSettings[]>
> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAppBranding(ctx)) {
      return { success: false, error: "Permission denied: requires branding.app.view" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_app_branding_settings")
      .select("*")
      .is("deleted_at", null)
      .order("id", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as AppBrandingSettings[] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateAppBrandingSettings(
  input: z.infer<typeof updateAppBrandingSettingsSchema>
): Promise<ActionResult<AppBrandingSettings>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageAppBranding(ctx)) {
      return { success: false, error: "Permission denied: requires branding.app.manage" };
    }

    const parsed = updateAppBrandingSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    }

    const { id, ...updates } = parsed.data;
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("erp_app_branding_settings")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!existing) return { success: false, error: "App branding settings not found" };

    const { data, error } = await supabase
      .from("erp_app_branding_settings")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "BRANDING",
      entity_name: "erp_app_branding_settings",
      entity_id: id,
      entity_reference: existing.settings_code as string,
      action: "update",
      old_values: existing as Record<string, unknown>,
      new_values: data as Record<string, unknown>,
    });

    return { success: true, data: data as AppBrandingSettings };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
