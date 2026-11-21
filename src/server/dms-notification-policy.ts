import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const policy = z.object({
  is_enabled: z.boolean(),
  email_enabled: z.boolean(),
  in_app_enabled: z.boolean(),
  reminder_days_before: z.array(z.number().int().min(0).max(365)),
  include_document_owner: z.boolean(),
  include_document_creator: z.boolean(),
  recipient_roles: z.array(z.string()),
  recipient_user_ids: z.array(z.number().int().positive()),
});

/** Operational consumers resolve this policy after checking authority for the source document or batch. */
export async function getDmsNotificationSettingsForScheduler(signal?: AbortSignal) {
  try {
    const settings = createAdminClient().from("dms_notification_settings")
      .select("is_enabled,email_enabled,in_app_enabled,reminder_days_before,include_document_owner,include_document_creator,recipient_roles,recipient_user_ids")
      .eq("id", 1);
    if (signal) settings.abortSignal(signal);
    const { data, error } = await settings.maybeSingle();
    const parsed = policy.safeParse(data);
    return !error && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
