import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate } from "@/lib/notifications/template-renderer";

/** The authorized DMS bridge chooses the wording for its verified source. */
export async function renderDmsNotificationWording(
  templateCode: "DMS_DOCUMENT_EXPIRED" | "DMS_EXPIRY_REMINDER",
  variables: Record<string, string>,
  signal: AbortSignal,
) {
  const { data, error } = await createAdminClient().from("erp_notification_templates")
    .select("subject_template,text_template")
    .eq("template_code", templateCode)
    .eq("is_active", true).is("deleted_at", null).abortSignal(signal).maybeSingle();
  if (error || !data) return null;
  return { subject: renderTemplate(data.subject_template, variables), textBody: renderTemplate(data.text_template, variables) };
}
