/**
 * DMS.1 — DMS Expiry Notification Scheduler
 *
 * Supabase Edge Function invoked daily by pg_cron to automate
 * the entire DMS expiry notification pipeline:
 *
 *   1. generateDmsExpiryNotifications  — create dms_notification_queue rows from due reminders
 *   2. bridgeDueDmsNotificationsToGlobal — copy to erp_notifications (+ erp_email_queue if flag enabled)
 *   3. processEmailQueue               — send queued emails via configured provider
 *
 * IDEMPOTENT: each step checks existing state before acting.
 * NO SECRETS IN CODE: uses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from env.
 * DEPLOYMENT: see deployment notes at bottom of this file.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEDULER_SECRET = Deno.env.get("DMS_SCHEDULER_SECRET");
const APP_URL = (Deno.env.get("APP_URL") ?? "https://erp.algt.net").replace(/\/$/, "");

Deno.serve(async (req: Request) => {
  // ── Auth gate: only allow requests with matching scheduler secret ──────────
  if (SCHEDULER_SECRET) {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== SCHEDULER_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const log: string[] = [];

  function record(msg: string) {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  }

  record(`DMS Expiry Scheduler started. runId=${runId}`);

  // Service-role client bypasses RLS
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const result = {
    runId,
    startedAt,
    completedAt: "",
    steps: {} as Record<string, unknown>,
    errors: [] as string[],
    success: false,
  };

  try {
    // ── Step 1: Get global notification settings ─────────────────────────────
    const { data: settings } = await supabase
      .from("dms_notification_settings")
      .select("is_enabled, in_app_enabled, email_enabled")
      .eq("id", 1)
      .single();

    const isEnabled = (settings as Record<string, unknown> | null)?.is_enabled as boolean ?? true;

    if (!isEnabled) {
      record("DMS notifications are disabled in settings. Skipping pipeline.");
      result.steps.disabled = true;
      result.success = true;
      result.completedAt = new Date().toISOString();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Generate expiry notifications from due reminders ─────────────
    record("Step 1: Generating expiry notifications...");
    const today = new Date().toISOString().split("T")[0];

    const { data: dueReminders, error: remError } = await supabase
      .from("dms_expiry_reminders")
      .select(`
        id, document_id, reminder_days_before, reminder_date, notification_status,
        document:dms_documents!document_id(id, document_no, title, expiry_date, created_by, owner_user_id, status, expiry_tracking_override)
      `)
      .lte("reminder_date", today)
      .eq("status", "pending")
      .neq("notification_status", "sent")
      .limit(200);

    if (remError) {
      result.errors.push(`Reminder fetch error: ${remError.message}`);
      record(`ERROR fetching reminders: ${remError.message}`);
    } else {
      let created = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      for (const reminder of dueReminders ?? []) {
        const rem = reminder as Record<string, unknown>;
        const doc = rem.document as Record<string, unknown> | null;
        if (!doc) { skipped++; continue; }

        const documentId = rem.document_id as number;
        const remId = rem.id as number;
        const daysBefore = rem.reminder_days_before as number;
        const expiryDate = doc.expiry_date as string | null;

        // Skip if document is ignored, superseded, archived, or deleted
        const docStatus = doc.status as string | null;
        if (doc.expiry_tracking_override === "ignored") {
          record(`Skipping reminder ${remId}: document ${documentId} has expiry tracking ignored.`);
          // Also cancel this reminder row so it never re-triggers
          await supabase.from("dms_expiry_reminders").update({ status: "cancelled", updated_at: now }).eq("id", remId);
          skipped++;
          continue;
        }
        if (docStatus && ["superseded", "archived", "deleted"].includes(docStatus)) {
          record(`Skipping reminder ${remId}: document ${documentId} status is '${docStatus}'.`);
          await supabase.from("dms_expiry_reminders").update({ status: "cancelled", updated_at: now }).eq("id", remId);
          skipped++;
          continue;
        }

        const isExpired = daysBefore === 0 || (expiryDate && new Date(expiryDate) < new Date());

        const subject = isExpired
          ? `DMS Document Expired: ${doc.document_no} — ${doc.title}`
          : `DMS Expiry Reminder: ${doc.document_no} — ${doc.title} (${daysBefore}d)`;
        const message = isExpired
          ? `Document ${doc.document_no} (${doc.title}) has expired on ${expiryDate ?? "N/A"}.`
          : `Document ${doc.document_no} (${doc.title}) expires on ${expiryDate}. ${daysBefore} days remaining.`;

        // Resolve recipients from settings
        const recipientIds: number[] = [];
        if (doc.owner_user_id) recipientIds.push(doc.owner_user_id as number);
        if (doc.created_by && doc.created_by !== doc.owner_user_id) {
          recipientIds.push(doc.created_by as number);
        }

        // Expand role recipients using user_roles + roles tables
        const recipientRoles = ((settings as Record<string, unknown> | null)?.recipient_roles as string[] | null) ?? [];
        if (recipientRoles.length > 0) {
          const { data: roleUsers } = await supabase
            .from("user_roles")
            .select("user_profile_id, role:roles!role_id(role_code)")
            .eq("is_active", true);
          for (const ru of roleUsers ?? []) {
            const rur = ru as Record<string, unknown>;
            const roleRow = rur.role as Record<string, unknown> | null;
            if (
              roleRow?.role_code &&
              recipientRoles.includes(roleRow.role_code as string) &&
              rur.user_profile_id
            ) {
              recipientIds.push(rur.user_profile_id as number);
            }
          }
        }

        // Include all explicit recipient_user_ids from notification settings
        // This ensures configured users (e.g. sameer@algt.net) always receive
        // every expiry notification regardless of document ownership.
        const settingsUserIds = ((settings as Record<string, unknown> | null)?.recipient_user_ids as number[] | null) ?? [];
        for (const uid of settingsUserIds) {
          recipientIds.push(uid);
        }

        // Deduplicate and insert one notification per recipient
        const uniqueRecipients = [...new Set(recipientIds)];
        if (uniqueRecipients.length === 0) {
          skipped++;
          continue;
        }

        for (const recipientId of uniqueRecipients) {
          const { error: insertErr } = await supabase.from("dms_notification_queue").insert({
            document_id: documentId,
            reminder_id: remId,
            notification_type: isExpired ? "document_expired" : "expiry_reminder",
            channel: "in_app",
            status: "pending",
            recipient_user_id: recipientId,
            subject,
            message,
            scheduled_for: now,
            metadata_json: { days_before: daysBefore, expiry_date: expiryDate, run_id: runId },
            created_at: now,
            updated_at: now,
          });

          if (!insertErr) {
            created++;
          } else {
            skipped++;
            record(`Insert error for doc ${documentId}: ${insertErr.message}`);
          }
        }

        // Mark reminder as sent (regardless of how many recipients)
        await supabase
          .from("dms_expiry_reminders")
          .update({ notification_status: "sent", last_notification_at: now, updated_at: now })
          .eq("id", remId);
      }

      result.steps.step1_generate = { created, skipped };
      record(`Step 1 done: created=${created}, skipped=${skipped}`);
    }

    // ── Step 3: Bridge pending DMS notifications to erp_notifications ─────────
    record("Step 2: Bridging DMS notifications to global...");
    const { data: pendingRows } = await supabase
      .from("dms_notification_queue")
      .select("id")
      .in("bridge_status", ["not_bridged", "failed"])
      .in("status", ["pending", "queued", "email_ready"])
      .limit(100);

    let bridged = 0;
    let bridgeFailed = 0;

    for (const row of pendingRows ?? []) {
      const dmsId = (row as Record<string, unknown>).id as number;
      try {
        // Call the bridge RPC inline (simplified — direct DB writes)
        const { data: dmsRow } = await supabase
          .from("dms_notification_queue")
          .select("id, document_id, notification_type, recipient_user_id, recipient_email, subject, message, scheduled_for, bridge_status, bridge_attempt_count, metadata_json")
          .eq("id", dmsId)
          .single();

        if (!dmsRow) continue;
        const r = dmsRow as Record<string, unknown>;

        if (r.bridge_status === "bridged" || r.global_notification_id) {
          continue; // already done
        }

        const severity = r.notification_type === "document_expired" ? "urgent" : "warning";
        const docId = r.document_id as number | null;

        const { data: notifRow } = await supabase
          .from("erp_notifications")
          .insert({
            notification_code: `DMS_SCHEDULER_${dmsId}_${runId.slice(0, 8)}`,
            source_module: "DMS",
            source_entity_type: "dms_documents",
            source_entity_id: docId,
            notification_type: r.notification_type as string,
            severity,
            title: r.subject as string,
            message: r.message as string,
            recipient_user_id: r.recipient_user_id as number | null,
            recipient_email: r.recipient_email as string | null,
            channel_in_app: true,
            channel_email: !!(r.recipient_email),
            scheduled_for: r.scheduled_for as string ?? new Date().toISOString(),
            action_url: docId ? `/dms/documents/record/${docId}` : null,
            action_label: "View Document",
            metadata_json: { dms_notification_id: dmsId, run_id: runId },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (notifRow) {
          const globalId = (notifRow as Record<string, unknown>).id as number;
          await supabase.from("dms_notification_queue").update({
            global_notification_id: globalId,
            bridge_status: "bridged",
            bridge_attempt_count: ((r.bridge_attempt_count as number) ?? 0) + 1,
            bridged_at: new Date().toISOString(),
            last_bridge_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", dmsId);
          bridged++;
        } else {
          bridgeFailed++;
        }
      } catch (e) {
        bridgeFailed++;
        record(`Bridge error for dmsId=${dmsId}: ${String(e)}`);
      }
    }

    result.steps.step2_bridge = { bridged, failed: bridgeFailed };
    record(`Step 2 done: bridged=${bridged}, failed=${bridgeFailed}`);

    // ── Step 3: Queue emails for bridged notifications (if email_enabled) ────────
    const emailEnabled = (settings as Record<string, unknown> | null)?.email_enabled as boolean ?? false;

    if (emailEnabled) {
      record("Step 3: Queuing emails for bridged DMS notifications...");

      // Fetch erp_notifications from DMS that haven't been emailed yet
      const { data: pendingEmailNotifs } = await supabase
        .from("erp_notifications")
        .select("id, recipient_user_id, title, message, action_url")
        .eq("source_module", "DMS")
        .eq("channel_email", false)
        .not("recipient_user_id", "is", null)
        .limit(200);

      let emailsQueued = 0;
      let emailsFailed = 0;

      for (const notif of pendingEmailNotifs ?? []) {
        const n = notif as Record<string, unknown>;
        const userId = n.recipient_user_id as number;

        // Resolve email: user_profiles.auth_user_id → auth.users.email
        const { data: profileRow } = await supabase
          .from("user_profiles")
          .select("auth_user_id")
          .eq("id", userId)
          .single();

        const authUserId = (profileRow as Record<string, unknown> | null)?.auth_user_id as string | null;
        if (!authUserId) { emailsFailed++; continue; }

        const { data: authData } = await supabase.auth.admin.getUserById(authUserId);
        const recipientEmail = authData?.user?.email ?? null;
        if (!recipientEmail) { emailsFailed++; continue; }

        const actionUrl = n.action_url as string | null;
        const absoluteActionUrl = actionUrl ? `${APP_URL}${actionUrl}` : null;
        const { error: emailErr } = await supabase.from("erp_email_queue").insert({
          source_module: "DMS",
          source_entity_type: "dms_notification",
          source_entity_id: n.id as number,
          notification_id: n.id as number,
          priority: "normal",
          status: "pending",
          to_emails: [recipientEmail],
          subject: n.title as string,
          html_body: `<p>${n.message as string}</p>${absoluteActionUrl ? `<p><a href="${absoluteActionUrl}">View Document</a></p>` : ""}`,
          text_body: `${n.message as string}${absoluteActionUrl ? `\n\nView: ${absoluteActionUrl}` : ""}`,
          template_code: "DMS_EXPIRY_NOTIFICATION",
          scheduled_for: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (!emailErr) {
          // Mark channel_email = true so we don't re-queue on next run
          await supabase.from("erp_notifications")
            .update({ channel_email: true, updated_at: new Date().toISOString() })
            .eq("id", n.id as number);
          emailsQueued++;
        } else {
          record(`Email queue error for notif ${n.id}: ${emailErr.message}`);
          emailsFailed++;
        }
      }

      result.steps.step3_email = { queued: emailsQueued, failed: emailsFailed };
      record(`Step 3 done: queued=${emailsQueued}, failed=${emailsFailed}`);

      // ── Step 4: Trigger the Railway app to process (send) the queued emails ──
      if (emailsQueued > 0) {
        record("Step 4: Triggering email queue processor on app server...");
        const appUrl = Deno.env.get("APP_URL") ?? "https://erp.algt.net";
        const internalSecret = Deno.env.get("INTERNAL_API_SECRET");

        if (!internalSecret) {
          record("Step 4: SKIPPED — INTERNAL_API_SECRET not set on Edge Function.");
          result.steps.step4_send = { skipped: true, reason: "INTERNAL_API_SECRET not configured" };
        } else {
          try {
            const sendResp = await fetch(`${appUrl}/api/internal/process-email-queue`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${internalSecret}`,
              },
              body: JSON.stringify({ module: "DMS", limit: 200 }),
            });
            if (sendResp.ok) {
              const sendData = await sendResp.json() as Record<string, unknown>;
              result.steps.step4_send = sendData;
              record(`Step 4 done: sent=${sendData.sent}, failed=${sendData.failed}`);
            } else {
              const errText = await sendResp.text();
              record(`Step 4: App server returned ${sendResp.status}: ${errText}`);
              result.steps.step4_send = { error: `HTTP ${sendResp.status}`, detail: errText.slice(0, 200) };
            }
          } catch (e) {
            record(`Step 4: Fetch error — ${String(e)}`);
            result.steps.step4_send = { error: String(e) };
          }
        }
      } else {
        record("Step 4: Skipped (no emails queued).");
      }
    } else {
      record("Step 3: Skipped (email_enabled=false).");
    }

    result.success = true;
    result.completedAt = new Date().toISOString();
    record(`Scheduler completed successfully. runId=${runId}`);
  } catch (e) {
    result.errors.push(String(e));
    result.completedAt = new Date().toISOString();
    record(`FATAL ERROR: ${String(e)}`);
  }

  return new Response(JSON.stringify({ ...result, log }), {
    status: result.success ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * DEPLOYMENT REQUIREMENTS
 * ========================
 *
 * 1. Deploy this Edge Function:
 *    supabase functions deploy dms-expiry-scheduler
 *
 * 2. Set required secrets (never commit these):
 *    supabase secrets set DMS_SCHEDULER_SECRET=<your-random-secret>
 *
 * 3. Register a pg_cron job to call this function daily at 06:00 UTC:
 *    (Run this SQL in Supabase SQL editor as a one-time setup)
 *
 *    SELECT cron.schedule(
 *      'dms-expiry-scheduler-daily',
 *      '0 6 * * *',
 *      $$
 *        SELECT net.http_post(
 *          url := current_setting('app.settings.supabase_url') || '/functions/v1/dms-expiry-scheduler',
 *          headers := jsonb_build_object(
 *            'Content-Type', 'application/json',
 *            'Authorization', 'Bearer ' || current_setting('app.settings.dms_scheduler_secret')
 *          ),
 *          body := '{}'::jsonb
 *        );
 *      $$
 *    );
 *
 * 4. Or use a simpler pg_cron job with the service-role URL (requires pg_net extension):
 *    Verify pg_net is enabled: SELECT * FROM pg_extension WHERE extname = 'pg_net';
 *
 * 5. Manual invocation for testing (without pg_cron):
 *    curl -X POST https://<project>.supabase.co/functions/v1/dms-expiry-scheduler \
 *      -H "Authorization: Bearer <DMS_SCHEDULER_SECRET>"
 *
 * NOTES:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase Edge Runtime.
 * - DMS_SCHEDULER_SECRET must be set manually via `supabase secrets set`.
 * - The function is idempotent: re-running will not create duplicate notifications.
 * - Email sending is handled by processEmailQueue (existing global email pipeline).
 *   The scheduler does NOT directly call the email provider.
 */
