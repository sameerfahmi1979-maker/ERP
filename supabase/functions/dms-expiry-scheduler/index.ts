/**
 * DMS.1 — DMS Expiry Notification Scheduler
 *
 * Supabase Edge Function invoked daily by pg_cron to automate
 * DMS expiry sources. In the reviewed F10 durable mode this producer only
 * creates per-person sources; the independent F10 worker qualifies recipients
 * and F09 alone dispatches email. The following stages are legacy mode only:
 *
 *   1. generateDmsExpiryNotifications  — create dms_notification_queue rows from due reminders
 *   2. bridgeDueDmsNotificationsToGlobal — copy to erp_notifications (+ erp_email_queue if flag enabled)
 *   3. processEmailQueue               — send queued emails via configured provider
 *
 * IDEMPOTENT: each step checks existing state before acting.
 * NO SECRETS IN CODE: uses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from env.
 * DEPLOYMENT: see deployment notes at bottom of this file.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { schedulerGate } from "./auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEDULER_SECRET = Deno.env.get("DMS_SCHEDULER_SECRET");

Deno.serve(async (req: Request) => {
  // This mandatory custom gate replaces the incompatible JWT gateway contract.
  const denied = await schedulerGate(req, SCHEDULER_SECRET);
  if (denied) return denied;
  const mode = new URL(req.url).searchParams.get("mode") ?? "run";
  if (mode !== "run" && mode !== "health") {
    return Response.json({ error: "Unknown mode" }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !Deno.env.get("INTERNAL_API_SECRET")) {
    return Response.json({ error: "Scheduler dependencies are not configured" }, { status: 503 });
  }
  // Strictly no-work: before constructing a DB client, generating notifications,
  // queuing messages or calling Railway. Does not certify provider delivery.
  if (mode === "health") {
    return Response.json({ ok: true, mode: "health", processed: 0, sent: 0 });
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const log: string[] = [];

  function record(msg: string) {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  }

  record(`DMS Expiry Scheduler started. runId=${runId}`);

  const producerDeadline=AbortSignal.timeout(25000);
  const durableNotifications=Deno.env.get('F10_DURABLE_NOTIFICATIONS')==='true';

  // Service-role client bypasses RLS
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([producerDeadline,AbortSignal.timeout(5000),...(init?.signal?[init.signal]:[])])})},
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
    const { data: settings,error:settingsError } = await supabase
      .from("dms_notification_settings")
      // Additional candidate routes are admitted only with the matching F10
      // canonical authority/receipt worker, never the legacy direct bridge.
      .select('is_enabled,in_app_enabled,email_enabled,include_document_owner,include_document_creator,recipient_roles,recipient_user_ids')
      .eq("id", 1)
      .single();

    if(settingsError||!settings)throw Error('DMS settings unavailable; no delivery started.');
    const isEnabled = settings.is_enabled===true;

    if (!isEnabled||durableNotifications&&!settings.in_app_enabled&&!settings.email_enabled) {
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
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

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
      result.errors.push('Reminder fetch failed.');
      record('ERROR fetching reminders; reconcile the original sources.');
    } else {
      let created = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      for (const reminder of dueReminders ?? []) {
        producerDeadline.throwIfAborted();
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

        const isExpired = !!expiryDate&&expiryDate<today;

        const subject = isExpired
          ? `DMS Document Expired: ${doc.document_no} — ${doc.title}`
          : `DMS Expiry Reminder: ${doc.document_no} — ${doc.title} (${daysBefore}d)`;
        const message = isExpired
          ? `Document ${doc.document_no} (${doc.title}) has expired on ${expiryDate ?? "N/A"}.`
          : `Document ${doc.document_no} (${doc.title}) expires on ${expiryDate}. ${daysBefore} days remaining.`;

        // Resolve recipients from settings
        const recipientIds: number[] = [];
        if (doc.owner_user_id&&(!durableNotifications||settings.include_document_owner===true)) recipientIds.push(doc.owner_user_id as number);
        if (doc.created_by&&(!durableNotifications||settings.include_document_creator===true)) {
          recipientIds.push(doc.created_by as number);
        }

        // Expand role recipients using user_roles + roles tables
        const recipientRoles = ((settings as Record<string, unknown> | null)?.recipient_roles as string[] | null) ?? [];
        if (recipientRoles.length > 0) {
          const { data: roleUsers,error:roleError } = await supabase
            .from("user_roles")
            .select("user_profile_id, role:roles!role_id(role_code,is_active)")
            .eq("is_active", true).limit(1001);
          if(roleError||(roleUsers?.length??0)>1000)throw Error('Configured recipient inventory could not be completely verified.');
          for (const ru of roleUsers ?? []) {
            const rur = ru as Record<string, unknown>;
            const roleRow = rur.role as Record<string, unknown> | null;
            if (
              roleRow?.role_code &&roleRow.is_active===true&&
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

        let allEnsured=true;
        for (const recipientId of uniqueRecipients) {
          producerDeadline.throwIfAborted();
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
            allEnsured=false;
            skipped++;
            record(`Recipient creation unconfirmed for document ${documentId}.`);
          }
        }

        // Source generation, NOT email receipt. Partial failure stays eligible;
        // the database fence reconciles already-created recipients on retry.
        if(!allEnsured){result.errors.push('Reminder recipient creation incomplete.');continue;}
        const marked=await supabase
          .from("dms_expiry_reminders")
          .update({ notification_status: "sent", last_notification_at: now, updated_at: now })
          .eq("id", remId);
        if(marked.error)result.errors.push('Reminder completion marker unconfirmed.');
      }

      result.steps.step1_generate = { created, skipped };
      record(`Step 1 done: created=${created}, skipped=${skipped}`);
    }

    if(durableNotifications){
      // Each NEW per-person source captured a transactional F10 event. The
      // existing authenticated Railway worker admits authorized personal/channel
      // receipts and F09 delivers them. Do not run a second direct bridge/send.
      result.steps.durableAdmission={queuedForCurrentRecipientAuthorization:true,deliveryConfirmed:false};
      result.success=result.errors.length===0;result.completedAt=new Date().toISOString();
      return Response.json(result,{status:result.success?200:503});
    }

    // ── Step 3: Bridge pending DMS notifications to erp_notifications ─────────
    record("Step 2: Bridging DMS notifications to global...");
    const { data: pendingRows,error:pendingError } = await supabase
      .from("dms_notification_queue")
      .select("id")
      .in("bridge_status", ["not_bridged", "failed"])
      .in("status", ["pending", "queued", "email_ready"])
      .limit(100);
    if(pendingError)throw Error('Pending bridge sources unavailable.');

    let bridged = 0;
    let bridgeFailed = 0;

    for (const row of pendingRows ?? []) {
      producerDeadline.throwIfAborted();
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

        let { data: notifRow, error: notifError } = await supabase
          .from("erp_notifications")
          .insert({
            notification_code: `DMS_BRIDGE_${dmsId}`,
            source_module: "DMS",
            source_entity_type: "dms_documents",
            source_entity_id: docId,
            notification_type: r.notification_type as string,
            severity,
            title: r.subject as string,
            message: r.message as string,
            recipient_user_id: r.recipient_user_id as number | null,
            recipient_email: r.recipient_email as string | null,
            channel_in_app: settings.in_app_enabled===true,
            channel_email: false, // Queue creation, not a supplied address, sets this marker.
            scheduled_for: r.scheduled_for as string ?? new Date().toISOString(),
            action_url: docId ? `/dms/documents/record/${docId}` : null,
            action_label: "View Document",
            metadata_json: { dms_notification_id: dmsId, run_id: runId },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (notifError?.code === "23505") {
          const existing = await supabase.from("erp_notifications").select("id")
            .eq("notification_code", `DMS_BRIDGE_${dmsId}`).maybeSingle();
          notifRow = existing.data;
          notifError = existing.error;
        }
        if (notifRow && !notifError) {
          const globalId = (notifRow as Record<string, unknown>).id as number;
          const linked=await supabase.from("dms_notification_queue").update({
            global_notification_id: globalId,
            bridge_status: "bridged",
            bridge_attempt_count: ((r.bridge_attempt_count as number) ?? 0) + 1,
            bridged_at: new Date().toISOString(),
            last_bridge_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", dmsId).eq("bridge_status",r.bridge_status).select('id');
          if(linked.error||!Array.isArray(linked.data)||linked.data.length!==1){
            bridgeFailed++;record(`Bridge tracking unconfirmed for dmsId=${dmsId}; original notification retained.`);continue;
          }
          bridged++;
        } else {
          bridgeFailed++;
        }
      } catch (e) {
        bridgeFailed++;
        void e;record(`Bridge unconfirmed for dmsId=${dmsId}.`);
      }
    }

    result.steps.step2_bridge = { bridged, failed: bridgeFailed };
    if(bridgeFailed>0)result.errors.push('One or more bridge outcomes remain unconfirmed.');
    record(`Step 2 done: bridged=${bridged}, failed=${bridgeFailed}`);

    // ── Step 3: Queue emails for bridged notifications (if email_enabled) ────────
    const emailEnabled = (settings as Record<string, unknown> | null)?.email_enabled as boolean ?? false;

    if (emailEnabled) {
      record("Step 3: Queuing emails for bridged DMS notifications...");

      // Fetch erp_notifications from DMS that haven't been emailed yet
      const { data: pendingEmailNotifs,error:pendingEmailError } = await supabase
        .from("erp_notifications")
        .select("id, recipient_user_id, title, message, action_url, scheduled_for")
        .eq("source_module", "DMS")
        .eq("channel_email", false)
        .not("recipient_user_id", "is", null)
        .limit(200);
      if(pendingEmailError)throw Error('Pending delivery intents unavailable.');

      let emailsQueued = 0;
      let emailsFailed = 0;

      for (const notif of pendingEmailNotifs ?? []) {
        producerDeadline.throwIfAborted();
        const n = notif as Record<string, unknown>;
        const userId = n.recipient_user_id as number;

        // Resolve email: user_profiles.auth_user_id → auth.users.email
        const { data: profileRow } = await supabase
          .from("user_profiles")
          .select("auth_user_id,status,must_change_password")
          .eq("id", userId)
          .single();

        const authUserId = (profileRow as Record<string, unknown> | null)?.auth_user_id as string | null;
        if (!authUserId||profileRow?.status!=='active'||profileRow?.must_change_password===true) { emailsFailed++; continue; }

        const { data: authData } = await supabase.auth.admin.getUserById(authUserId);
        const recipientEmail = authData?.user?.email ?? null;
        if (!recipientEmail||!authData.user?.email_confirmed_at) { emailsFailed++; continue; }

        const { error: emailErr } = await supabase.from("erp_email_queue").upsert({
          intent_key: `notification-${n.id}`,
          source_module: "DMS",
          source_entity_type: "dms_notification",
          source_entity_id: n.id as number,
          notification_id: n.id as number,
          priority: "normal",
          status: "pending",
          to_emails: [recipientEmail],
          subject: 'ALGT ERP notification',
          html_body: null,
          text_body: 'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.',
          template_code: null,
          scheduled_for: n.scheduled_for as string ?? new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {onConflict: "intent_key", ignoreDuplicates: true});

        if (!emailErr) {
          // Mark channel_email = true so we don't re-queue on next run
          await supabase.from("erp_notifications")
            .update({ channel_email: true, updated_at: new Date().toISOString() })
            .eq("id", n.id as number);
          emailsQueued++;
        } else {
          record(`Email intent unconfirmed for notif ${n.id}.`);
          emailsFailed++;
        }
      }

      if(emailsFailed>0)result.errors.push('One or more email intents require reconciliation.');
      result.steps.step3_email = { ensuredIntents: emailsQueued, failed: emailsFailed };
      record(`Step 3 done: queued=${emailsQueued}, failed=${emailsFailed}`);

      // ── Step 4: Trigger the Railway app to process (send) the queued emails ──
      if (Deno.env.get("F09_EMAIL_TRIGGER_ENABLED") === "true") {
        record("Step 4: Triggering email queue processor on app server...");
        const appUrl = Deno.env.get("APP_URL") ?? "https://erp.algt.net";
        const internalSecret = Deno.env.get("INTERNAL_API_SECRET");

        if (!internalSecret || internalSecret.length < 32) {
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
              body: JSON.stringify({ module: "DMS", limit: 20 }),
      // F09 queue budget is <75s; leave transport headroom. Configure pg_net
      // and the ERP host separately at cutover; a timeout never proves no send.
      signal: AbortSignal.timeout(120000),
              redirect: "error",
            });
            if (sendResp.ok) {
              const sendData = await sendResp.json() as Record<string, unknown>;
              result.steps.step4_send = sendData;
              record(`Step 4 done: sent=${sendData.sent}, failed=${sendData.failed}`);
            } else {
              record(`Step 4: App server returned ${sendResp.status}; inspect durable attempts before retrying.`);
              result.steps.step4_send = { error: `HTTP ${sendResp.status}` };
              result.errors.push('Queue processing did not return a successful response.');
            }
          } catch (e) {
            void e;record('Step 4 response unavailable; reconcile durable attempts before retrying.');
            result.steps.step4_send = { error: 'Processing response unconfirmed' };
            result.errors.push('Processing response unconfirmed.');
          }
        }
      } else {
        record("Step 4: Skipped (no emails queued).");
      }
    } else {
      record("Step 3: Skipped (email_enabled=false).");
    }

    if(bridgeFailed>0)result.errors.push('One or more notification bridges require reconciliation.');
    result.success = result.errors.length===0;
    result.completedAt = new Date().toISOString();
    record(`Scheduler ${result.success?'completed':'completed with reconciliation required'}. runId=${runId}`);
  } catch (e) {
    void e;result.errors.push('Scheduler processing failed; reconcile the original sources.');
    result.completedAt = new Date().toISOString();
    record('Scheduler processing failed; no automatic replacement or resend is authorized.');
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
 * Deploy auth.ts with index.ts and the explicit verify_jwt=false configuration.
 * The mandatory custom gate must pass negative/positive tests before deployment.
 * Set DMS_SCHEDULER_SECRET through the approved secret store; the same value is
 * held in Vault as algt_dms_scheduler_secret. Cron sends it only in the
 * x-dms-scheduler-secret header. Never embed it in cron SQL or shell arguments.
 * Update existing cron job 1 in place; do not create a second daily producer.
 * Coordinate INTERNAL_API_SECRET with Railway and the separate email cron job.
 * Authorized POST ?mode=health returns zero work; it cannot send mail or certify
 * business-delivery idempotency. F10_DURABLE_NOTIFICATIONS=true bypasses the
 * legacy bridge/direct-send stages even if an old follow-on flag remains set.
 * Keep the provider-owned net schema out of the Data API; never expose raw
 * request headers, secrets or response bodies through an operational projection.
 * See docs/remediation/F10_NOTIFICATION_RELEASE.md for the coordinated cutover.
 */
