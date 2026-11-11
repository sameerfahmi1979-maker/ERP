import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canUseApplication, type AuthContext } from "@/lib/rbac/check";
import { dmsEmailApprovalEvent, isContextualDmsEmail } from "@/lib/email/queue/dms-notice";

export function dmsRouteId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** Opening an email link reads only. The document page and approval mutations
 * retain their own current authorization. Mail scanners cannot settle anything. */
export async function readDmsEmailDestination(ctx: AuthContext, documentId: number, rawNotice: unknown) {
  const notice = dmsRouteId(rawNotice);
  if (!notice || !canUseApplication(ctx) || !ctx.profile) return null;
  const db = await createClient();
  const alert = await db.rpc("dms_email_link_type", { p_notification: notice, p_document: documentId });
  if (alert.error || typeof alert.data !== "string" || !isContextualDmsEmail(alert.data)) return null;
  return { notice, section: dmsEmailApprovalEvent(alert.data) ? "approvals" : "overview" } as const;
}
