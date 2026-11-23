package net.algt.mobiledms;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PersistableBundle;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.Iterator;
import java.util.Objects;
import java.util.UUID;

/** Persistent upload recovery and scheduled, generic ERP-change notifications. */
public final class UploadJobs {
    /** All foreground draft mutations/session changes and background transfers use this monitor. */
    public static final Object LOCK = new Object();
    static final int UPLOAD_JOB = 40101, NOTIFICATION_JOB = 40102;
    private static final int NOTICE = 40103;
    private static final String CHANNEL = "dms-status";
    static final class NeedsAttention extends IOException {
        NeedsAttention(String message, Throwable cause) { super(message, cause); }
    }
    private UploadJobs() { }

    /** Returns false if Android declined scheduling; the frozen draft remains manually recoverable. */
    public static boolean schedule(Context context, String user) {
        synchronized (LOCK) { return schedule(context, user, false); }
    }

    public static boolean scheduleNotifications(Context context) {
        synchronized (LOCK) {
            if (!canNotify(context)) return false;
            return schedule(context, new ErpApi(context).user(), true);
        }
    }

    private static boolean schedule(Context context, String user, boolean periodic) {
        if (!LocalSecurity.isAccount(context, user) || !user.equals(new ErpApi(context).user())) return false;
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return false;
        int id = periodic ? NOTIFICATION_JOB : UPLOAD_JOB;
        long generation = LocalSecurity.generation(context);
        JobInfo pending = scheduler.getPendingJob(id);
        if (pending != null && CaptureJobRules.sameAccount(user, pending.getExtras().getString("user"),
            generation, pending.getExtras().getLong("generation", -1))) return true;
        PersistableBundle extras = new PersistableBundle();
        extras.putString("user", user); extras.putLong("generation", generation);
        JobInfo.Builder builder = new JobInfo.Builder(id, new ComponentName(context, DmsJobService.class))
            .setExtras(extras).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if (periodic) builder.setPeriodic(15 * 60_000L);
        else builder.setMinimumLatency(30_000);
        try { return scheduler.schedule(builder.build()) == JobScheduler.RESULT_SUCCESS; }
        catch (RuntimeException error) { return false; }
    }

    /** Call before clearing the ERP session/account, under LOCK, when signing out. */
    public static void cancel(Context context) {
        synchronized (LOCK) {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) { scheduler.cancel(UPLOAD_JOB); scheduler.cancel(NOTIFICATION_JOB); }
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(NOTICE);
        }
    }

    /**
     * Shared foreground/background transaction. Returns a scoped duplicate advisory, or null on completion.
     * A new operation is frozen locally before network preflight. Every retry reuses that frozen operation.
     */
    static JSONObject transfer(Context context, ErpApi api, LocalDraft draft, String requestedName) throws Exception {
        synchronized (LOCK) {
            String user = api.user(); long generation = LocalSecurity.generation(context);
            check(context, api, user, generation);
            draft.reload();
            if (draft.frozen == null && draft.pages.isEmpty() && draft.lastUpload != null) return null;
            boolean resuming = draft.frozen != null;
            JSONObject request = draft.prepareUpload(user, requestedName == null ? "" : requestedName, api.sessionEpoch());
            if (!user.equals(request.getString("authUserId"))) throw new IOException("This upload belongs to a different ERP account.");
            UUID.fromString(request.getString("operationId"));
            JSONObject metadata = request.getJSONObject("metadata");
            String signature = draft.sourceSignature();
            AtomicFile queueFile = queueFile(context, user);
            JSONObject queue;
            if (!resuming) {
                // Journal first: a crash can leave an unused journal, never an unjournaled
                // newly frozen request which could incorrectly skip duplicate preflight.
                queue = journal(request, false);
                LocalSecurity.writeJson(context, user, "dms-upload-queue", queueFile, queue);
                draft.retain(request,api.sessionEpoch());
            } else {
                try { queue = LocalSecurity.readJson(context, user, "dms-upload-queue", queueFile, false); }
                catch (IOException error) { throw new NeedsAttention("The saved upload queue could not be opened. Check this upload in ERP.", error); }
                if (queue == null) {
                    // 3.x frozen requests were retained only after successful preflight.
                    queue = journal(request, true);
                    LocalSecurity.writeJson(context, user, "dms-upload-queue", queueFile, queue);
                }
            }
            schedule(context, user, false);
            if (pending(queue, request)) {
                JSONObject previous = draft.previousFingerprint(signature);
                if (previous != null && !ErpApi.str(previous, "sha256").equals(ErpApi.str(metadata, "sha256_hash"))) {
                    check(context, api, user, generation);
                    JSONObject match = duplicate(api, previous.getLong("size"), previous.getString("sha256"));
                    if (!"no_visible_match".equals(ErpApi.str(match, "status"))) {
                        draft.unfreeze(); queueFile.delete(); return match;
                    }
                }
                check(context, api, user, generation);
                JSONObject match = duplicate(api, metadata.getLong("file_size_bytes"), metadata.getString("sha256_hash"));
                if (!"no_visible_match".equals(ErpApi.str(match, "status"))) {
                    draft.unfreeze(); queueFile.delete(); return match;
                }
                // Persist before admit. Recovery must not treat our own retained
                // server admission as somebody else's duplicate on the next run.
                queue.put("preflightComplete", true);
                LocalSecurity.writeJson(context, user, "dms-upload-queue", queueFile, queue);
            }
            // Verify bytes as well as size before resuming a retained admission.
            File original;
            try {
                original = draft.uploadFile();
                FileFingerprint fingerprint = FileFingerprint.read(original);
                if (fingerprint.size != metadata.getLong("file_size_bytes") || !fingerprint.sha256.equals(metadata.getString("sha256_hash"))) {
                    throw new IOException("Saved upload fingerprint does not match");
                }
            } catch (IOException error) {
                throw new NeedsAttention("The saved original has changed or is unavailable. Check the retained upload in ERP.", error);
            }
            check(context, api, user, generation);
            JSONObject admitted;
            try { admitted = api.get(ErpApi.object("op", "admit", "request", request)); }
            catch (ErpApi.Rejected error) {
                JSONObject retained = error.response == null ? null : error.response.optJSONObject("recovery");
                if (retained == null) {
                    if (error.response != null && error.response.optJSONObject("cancelled") != null) { draft.clear(); queueFile.delete(); }
                    throw error;
                }
                UUID.fromString(retained.getString("operationId"));
                for (String key : new String[]{"version", "authUserId", "metadata", "scope", "context"}) {
                    if (!sameJson(request.opt(key), retained.opt(key))) throw error;
                }
                check(context, api, user, generation);
                // Retain both IDs across the two atomic files, so process death
                // between the journal and draft writes remains recoverable.
                queue.put("operationId", request.getString("operationId"));
                queue.put("recoveredOperationId", retained.getString("operationId"));
                LocalSecurity.writeJson(context, user, "dms-upload-queue", queueFile, queue);
                draft.retain(retained,api.sessionEpoch()); request = retained;
                admitted = api.get(ErpApi.object("op", "admit", "request", request));
            }
            if (admitted.optBoolean("duplicate")) {
                check(context, api, user, generation); draft.unfreeze(); queueFile.delete();
                JSONObject match = duplicate(api, metadata.getLong("file_size_bytes"), metadata.getString("sha256_hash"));
                return "existing_document".equals(ErpApi.str(match, "status")) ? match : ErpApi.object("status", "existing_document");
            }
            String url = ErpApi.str(admitted, "uploadUrl");
            if (!url.isEmpty()) {
                check(context, api, user, generation);
                api.upload(url, original, "application/pdf");
            }
            check(context, api, user, generation);
            api.call(ErpApi.object("op", "complete", "request", request, "sessionId", admitted.getLong("id")));
            check(context, api, user, generation);
            draft.uploaded(admitted, signature);
            queueFile.delete();
            // AI start, review and approval remain explicit foreground/ERP actions.
            return null;
        }
    }

    private static AtomicFile queueFile(Context context, String user) {
        return new AtomicFile(new File(new File(context.getNoBackupFilesDir(), user), "upload-queue.enc"));
    }

    private static JSONObject journal(JSONObject request, boolean complete) throws Exception {
        JSONObject metadata = request.getJSONObject("metadata");
        return ErpApi.object("operationId", request.getString("operationId"), "preflightComplete", complete,
            "size", metadata.getLong("file_size_bytes"), "sha256", metadata.getString("sha256_hash"));
    }

    private static boolean pending(JSONObject queue, JSONObject request) throws Exception {
        JSONObject metadata = request.getJSONObject("metadata");
        if (!(queue.opt("preflightComplete") instanceof Boolean)
            || queue.getLong("size") != metadata.getLong("file_size_bytes")
            || !queue.getString("sha256").equals(metadata.getString("sha256_hash"))) {
            throw new NeedsAttention("The saved queue could not be verified. Open the retained upload in ERP.", null);
        }
        try {
            return CaptureJobRules.needsPreflight(request.getString("operationId"), queue.getString("operationId"),
                queue.optString("recoveredOperationId", ""), queue.getBoolean("preflightComplete"));
        } catch (IllegalArgumentException error) {
            throw new NeedsAttention("The saved queue belongs to a different upload. Open it in ERP.", error);
        }
    }

    /** Safe UI hint; a missing/unreadable journal never enables local discard. */
    static boolean awaitingPreflight(Context context, LocalDraft draft) {
        synchronized (LOCK) {
            try {
                String user = new ErpApi(context).user();
                LocalSecurity.requireAccount(context, user);
                if (draft == null || draft.frozen == null) return false;
                JSONObject queue = LocalSecurity.readJson(context, user, "dms-upload-queue", queueFile(context, user), false);
                return queue != null && pending(queue, draft.frozen);
            } catch (Exception error) { return false; }
        }
    }

    /** Only a locally queued request which has never begun admission can be discarded locally. */
    static void discardQueued(Context context, LocalDraft draft) throws Exception {
        synchronized (LOCK) {
            String user = new ErpApi(context).user(); LocalSecurity.requireAccount(context, user);
            draft.reload();
            if (!awaitingPreflight(context, draft)) throw new IOException("This upload may already be retained in ERP. Resume it or check ERP before cancelling.");
            draft.clear(); queueFile(context, user).delete();
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) scheduler.cancel(UPLOAD_JOB);
        }
    }

    private static JSONObject duplicate(ErpApi api, long size, String sha256) throws Exception {
        return api.duplicate(size, sha256).put("size", size).put("sha256", sha256);
    }

    private static void check(Context context, ErpApi api, String user, long generation) throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Background work stopped; the saved upload can be resumed.");
        LocalSecurity.requireAccount(context, user, generation);
        if (!CaptureJobRules.sameAccount(user, api.user(), generation, LocalSecurity.generation(context))
            || !user.equals(new ErpApi(context).user())) throw new IOException("Sign in to the same ERP account to resume this upload.");
    }

    private static boolean sameJson(Object first, Object second) {
        if (first instanceof JSONObject && second instanceof JSONObject) {
            JSONObject a = (JSONObject) first, b = (JSONObject) second;
            if (a.length() != b.length()) return false;
            Iterator<String> keys = a.keys();
            while (keys.hasNext()) { String key = keys.next(); if (!sameJson(a.opt(key), b.opt(key))) return false; }
            return true;
        }
        if (first instanceof JSONArray && second instanceof JSONArray) {
            JSONArray a = (JSONArray) first, b = (JSONArray) second;
            if (a.length() != b.length()) return false;
            for (int i = 0; i < a.length(); i++) if (!sameJson(a.opt(i), b.opt(i))) return false;
            return true;
        }
        if (first instanceof Number && second instanceof Number) return first.toString().equals(second.toString());
        return Objects.equals(first, second);
    }

    static boolean validJob(Context context, PersistableBundle extras) {
        String user = extras.getString("user", "");
        return LocalSecurity.isAccount(context, user) && CaptureJobRules.sameAccount(user, new ErpApi(context).user(),
            extras.getLong("generation", -1), LocalSecurity.generation(context));
    }

    /** Called on a worker thread. No row titles/document numbers are persisted or displayed in notifications. */
    static void poll(Context context, ErpApi api, String user, long generation) throws Exception {
        check(context, api, user, generation);
        AtomicFile file = new AtomicFile(new File(new File(context.getNoBackupFilesDir(), user), "jobs.enc"));
        JSONObject before = LocalSecurity.readJson(context, user, "dms-job-observations", file, false);
        JSONObject next = new JSONObject(); boolean changed = false;
        JSONObject profile = api.get(ErpApi.object("op", "profile"));
        JSONObject capabilities = profile.optJSONObject("capabilities");
        if (capabilities == null || !user.equals(ErpApi.str(profile, "userId"))) throw new IOException("The ERP background account could not be confirmed.");
        for (String kind : new String[]{"notifications", "uploads"}) {
            if (!CaptureJobRules.mayPoll(kind, capabilities.optBoolean("view"), capabilities.optBoolean("upload"),
                capabilities.optBoolean("review"), capabilities.optBoolean("notifications"))) continue;
            check(context, api, user, generation);
            Object result;
            try { result = api.call(ErpApi.object("op", "tasks", "kind", kind, "page", 1)); }
            catch (ErpApi.Rejected error) {
                // Authority can change after profile. Skip the denied channel;
                // do not turn denial into empty success or block another permitted reader.
                if (error.status == 403) continue;
                throw error;
            }
            JSONArray rows;
            if (result instanceof JSONArray) rows = (JSONArray) result;
            else if (result instanceof JSONObject) rows = ((JSONObject) result).optJSONArray("rows");
            else rows = null;
            if (rows == null) throw new IOException("The ERP task response could not be confirmed.");
            JSONObject oldRows = before == null ? null : before.optJSONObject(kind);
            JSONObject states = new JSONObject();
            for (int index = 0; index < rows.length() && index < 100; index++) {
                JSONObject row = rows.optJSONObject(index);
                if (row == null) continue;
                String id = ErpApi.str(row, "id"), status = ErpApi.str(row, "status");
                if (id.isEmpty() || id.length() > 160 || status.isEmpty() || status.length() > 80) continue;
                states.put(id, status);
                if (oldRows != null && CaptureJobRules.changed(oldRows.has(id) ? oldRows.optString(id) : null, status)) changed = true;
            }
            next.put(kind, states);
        }
        check(context, api, user, generation);
        LocalSecurity.writeJson(context, user, "dms-job-observations", file, next);
        if (changed) notifyChange(context, "Your upload status or ERP tasks changed. Open the app to review.");
    }

    static boolean canNotify(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    static void notifyChange(Context context, String message) {
        if (!canNotify(context)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "ERP status updates", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Scheduled upload and ERP task changes. No document details are shown.");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE); manager.createNotificationChannel(channel);
        Intent open = new Intent(context, LauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, NOTICE, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification generic = new Notification.Builder(context, CHANNEL).setSmallIcon(R.mipmap.erp_launcher)
            .setContentTitle("ALGT ERP System").setContentText("Open the app to check ERP updates.")
            .setVisibility(Notification.VISIBILITY_PUBLIC).build();
        Notification notice = new Notification.Builder(context, CHANNEL).setSmallIcon(R.mipmap.erp_launcher)
            .setContentTitle("ALGT ERP System").setContentText(message).setContentIntent(pending)
            .setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(generic).build();
        try { manager.notify(NOTICE, notice); } catch (SecurityException ignored) { /* Runtime grant may be revoked during polling. */ }
    }
}
