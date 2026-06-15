"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

const REVALIDATE_PATH = "/admin/notifications/templates";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type NotificationTemplateRow = {
  id: number;
  templateCode: string;
  templateName: string;
  sourceModule: string;
  notificationType: string;
  subjectTemplate: string;
  htmlTemplate: string | null;
  textTemplate: string;
  defaultSeverity: string;
  defaultChannelInApp: boolean;
  defaultChannelEmail: boolean;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function rowToTemplate(r: Record<string, unknown>): NotificationTemplateRow {
  return {
    id: r.id as number,
    templateCode: r.template_code as string,
    templateName: r.template_name as string,
    sourceModule: r.source_module as string,
    notificationType: r.notification_type as string,
    subjectTemplate: r.subject_template as string,
    htmlTemplate: r.html_template as string | null,
    textTemplate: r.text_template as string,
    defaultSeverity: r.default_severity as string,
    defaultChannelInApp: r.default_channel_in_app as boolean,
    defaultChannelEmail: r.default_channel_email as boolean,
    isSystem: r.is_system as boolean,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

const templateSchema = z.object({
  template_code: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/),
  template_name: z.string().min(1).max(200),
  source_module: z.string().min(1).max(50),
  notification_type: z.string().min(1).max(100),
  subject_template: z.string().min(1).max(998),
  html_template: z.string().nullable().optional(),
  text_template: z.string().min(1),
  default_severity: z.enum(["info", "success", "warning", "urgent", "critical"]).default("info"),
  default_channel_in_app: z.boolean().default(true),
  default_channel_email: z.boolean().default(false),
  is_system: z.boolean().default(false),
});

import { renderTemplate } from "@/lib/notifications/template-renderer";

export async function getNotificationTemplates(): Promise<ActionResult<NotificationTemplateRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.templates.view") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const { data, error } = await supabase
      .from("erp_notification_templates")
      .select("*")
      .is("deleted_at", null)
      .order("source_module", { ascending: true })
      .order("template_code", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToTemplate(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getNotificationTemplate(idOrCode: number | string): Promise<ActionResult<NotificationTemplateRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const q = typeof idOrCode === "number"
      ? supabase.from("erp_notification_templates").select("*").eq("id", idOrCode).single()
      : supabase.from("erp_notification_templates").select("*").eq("template_code", idOrCode).single();

    const { data, error } = await q;
    if (error || !data) return { success: false, error: "Template not found" };
    return { success: true, data: rowToTemplate(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createNotificationTemplate(
  input: z.infer<typeof templateSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.templates.manage") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("erp_notification_templates")
      .insert({ ...parsed.data, created_by: ctx.profile.id, updated_by: ctx.profile.id, created_at: now, updated_at: now })
      .select("id").single();

    if (error) return { success: false, error: error.message };
    const row = data as Record<string, unknown>;

    await logAudit({ module_code: "NOTIFICATIONS", entity_name: "erp_notification_templates", entity_id: row.id as number, entity_reference: parsed.data.template_code, action: "create", new_values: { template_code: parsed.data.template_code } });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: row.id as number } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateNotificationTemplate(
  id: number,
  input: Partial<z.infer<typeof templateSchema>>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.templates.manage") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_notification_templates")
      .update({ ...input, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "NOTIFICATIONS", entity_name: "erp_notification_templates", entity_id: id, entity_reference: String(id), action: "update", new_values: input });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function activateNotificationTemplate(id: number): Promise<ActionResult> {
  return updateNotificationTemplate(id, { is_system: undefined });
}

export async function deactivateNotificationTemplate(id: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.templates.manage") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const now = new Date().toISOString();
    await supabase.from("erp_notification_templates").update({ is_active: false, updated_at: now }).eq("id", id);
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function renderNotificationTemplate(
  templateCode: string,
  variables: Record<string, string>
): Promise<ActionResult<{ subject: string; textBody: string; htmlBody: string | null }>> {
  try {
    const result = await getNotificationTemplate(templateCode);
    if (!result.success || !result.data) return { success: false, error: "Template not found" };
    const t = result.data;
    return {
      success: true,
      data: {
        subject: renderTemplate(t.subjectTemplate, variables),
        textBody: renderTemplate(t.textTemplate, variables),
        htmlBody: t.htmlTemplate ? renderTemplate(t.htmlTemplate, variables) : null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
