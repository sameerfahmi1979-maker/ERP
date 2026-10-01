import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContextForProfileId, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { DeliveryPolicyError, requireQueuePermission } from "./policy";
import type { EmailClaim } from "./worker";
import type { EmailMessageInput } from "../providers/types";
export interface DeliveryClaim extends EmailClaim {
    created_by: number | null;
    source_module: string;
    source_entity_type: string | null;
    source_entity_id: number | null;
    notification_id: number | null;
    provider_config_id: number | null;
    report_schedule_run_id: number | null;
    source_revision: string | null;
    to_emails: string[];
    cc_emails: string[] | null;
    bcc_emails: string[] | null;
    subject: string;
    html_body: string | null;
    text_body: string | null;
    reply_to_email: string | null;
}
/** DMS machine events send only a generic notification, never stale document
 * titles, medical/payroll text, attachments or deep links from the queue.
 * Detailed confidential output belongs to the reviewed F08 source adapter. */
async function prepareDmsNotice(q: DeliveryClaim): Promise<EmailMessageInput> {
    const db = createAdminClient();
    const settings = await db.from("dms_notification_settings").select("is_enabled,email_enabled").eq("id", 1).maybeSingle();
    if (settings.error)
        throw new Error("DMS delivery settings lookup failed");
    if (!settings.data?.is_enabled || !settings.data?.email_enabled)
        throw new DeliveryPolicyError();
    if (!q.notification_id || q.cc_emails?.length || q.bcc_emails?.length || q.to_emails.length !== 1)
        throw new DeliveryPolicyError();
    const { data: n, error } = await db.from("erp_notifications").select("*")
        .eq("id", q.notification_id).is("deleted_at", null).maybeSingle();
    if (error)
        throw new Error("Notification lookup failed");
    if (!n || n.source_module !== "DMS" || n.source_entity_type !== "dms_documents"
        || !n.recipient_user_id || !n.source_entity_id
        || !((q.source_entity_type === "dms_documents" && q.source_entity_id === n.source_entity_id)
            || (q.source_entity_type === "dms_notification" && q.source_entity_id === n.id)))
        throw new DeliveryPolicyError();
    const recipient = await getAuthContextForProfileId(n.recipient_user_id);
    if (!hasPermission(recipient, "notifications.view"))
        throw new DeliveryPolicyError();
    const { data: doc, error: docError } = await db.from("dms_documents")
        .select("id,owning_company_id,owning_branch_id,confidentiality_level").eq("id", n.source_entity_id)
        .is("deleted_at", null).maybeSingle();
    if (docError)
        throw new Error("Source lookup failed");
    if (!doc || !["internal", "company", "hr", "finance", "legal", "executive"].includes(doc.confidentiality_level))
        throw new DeliveryPolicyError();
    const permits = (code: string) => hasPermissionInScope(recipient, code, doc.owning_company_id, doc.owning_branch_id);
    if (!(permits("dms.documents.view") || permits("dms.admin"))
        || (!["internal", "company"].includes(doc.confidentiality_level)
            && !permits("dms.documents.view." + doc.confidentiality_level)))
        throw new DeliveryPolicyError();
    // Independently check the current confirmed auth mailbox; never use metadata as authorization.
    const { data: auth, error: authError } = await db.auth.admin.getUserById(recipient.profile!.auth_user_id);
    if (authError)
        throw new Error("Recipient lookup failed");
    const email = auth.user?.email;
    if (!email || !auth.user?.email_confirmed_at || email.toLowerCase() !== q.to_emails[0].toLowerCase())
        throw new DeliveryPolicyError();
    if (q.created_by !== null) {
        const sender = await getAuthContextForProfileId(q.created_by);
        requireQueuePermission(sender, "manage");
        requireQueuePermission(sender, "process");
    }
    return { to: [email], subject: "ALGT ERP notification",
        textBody: "Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application." };
}
export async function prepareQueueMessage(q: DeliveryClaim, signal: AbortSignal): Promise<EmailMessageInput> {
    signal.throwIfAborted();
    if (q.report_schedule_run_id) {
        if (q.source_module !== "REPORTS" || q.source_entity_type !== "erp_report_schedules")
            throw new DeliveryPolicyError();
        const { prepareScheduleMessage } = await import("@/lib/report-center/schedule-execution");
        return prepareScheduleMessage(q, signal);
    }
    if (q.source_module === "REPORTS")
        throw new DeliveryPolicyError(); // no legacy attachment bypass
    if (q.source_module === "DMS")
        return prepareDmsNotice(q);
    if (!q.created_by || q.source_entity_id || q.notification_id)
        throw new DeliveryPolicyError();
    const actor = await getAuthContextForProfileId(q.created_by);
    requireQueuePermission(actor, "manage");
    requireQueuePermission(actor, "process");
    return { to: q.to_emails, cc: q.cc_emails ?? undefined, bcc: q.bcc_emails ?? undefined,
        subject: q.subject, htmlBody: q.html_body ?? undefined, textBody: q.text_body ?? undefined,
        replyTo: q.reply_to_email ?? undefined };
}
