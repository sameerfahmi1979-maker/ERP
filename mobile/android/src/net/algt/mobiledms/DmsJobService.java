package net.algt.mobiledms;

import android.app.job.JobParameters;
import android.app.job.JobService;
import org.json.JSONObject;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** JobScheduler owns wake-up/retry timing; network and encrypted-storage work never runs on the main thread. */
public final class DmsJobService extends JobService {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<Integer, Work> running = new ConcurrentHashMap<>();
    private static final class Work {
        volatile boolean stopped;
        volatile Future<?> future;
    }

    @Override public boolean onStartJob(JobParameters parameters) {
        Work work = new Work();
        if (running.putIfAbsent(parameters.getJobId(), work) != null) return false;
        work.future = executor.submit(() -> {
            boolean retry = false;
            try {
                synchronized (UploadJobs.LOCK) {
                    if (work.stopped || !UploadJobs.validJob(this, parameters.getExtras())) return;
                    String user = parameters.getExtras().getString("user");
                    ErpApi api = new ErpApi(this);
                    if (parameters.getJobId() == UploadJobs.UPLOAD_JOB) {
                        LocalDraft draft = new LocalDraft(this, user);
                        if (draft.frozen == null) return;
                        if (!user.equals(draft.frozen.optString("authUserId"))) return;
                        JSONObject duplicate = UploadJobs.transfer(this, api, draft, "");
                        notifyCurrent(parameters, work,
                            duplicate == null ? "Your queued upload was transferred. Open the app to review its status."
                                : "An upload needs your attention. Open the app to review.");
                    } else if (parameters.getJobId() == UploadJobs.NOTIFICATION_JOB && UploadJobs.canNotify(this)) {
                        UploadJobs.poll(this, api, user, parameters.getExtras().getLong("generation", -1));
                    }
                }
            } catch (ErpApi.Rejected error) {
                retry = CaptureJobRules.retryStatus(error.status);
                if (!retry) notifyCurrent(parameters, work, "An ERP action needs your attention. Open the app to review.");
            } catch (UploadJobs.NeedsAttention error) {
                notifyCurrent(parameters, work, "An upload needs your attention. Open the app to review.");
            } catch (IOException error) {
                // Includes interrupted transfers: retain the same operation and recover on connectivity.
                retry = !work.stopped && UploadJobs.validJob(this, parameters.getExtras());
            } catch (Exception error) {
                // Invalid saved data cannot be made safe by repeatedly creating a new server request.
                notifyCurrent(parameters, work, "An ERP action needs your attention. Open the app to review.");
            } finally {
                running.remove(parameters.getJobId(), work);
                if (!work.stopped) jobFinished(parameters, retry);
            }
        });
        return true;
    }

    private void notifyCurrent(JobParameters parameters, Work work, String message) {
        synchronized (UploadJobs.LOCK) {
            if (!work.stopped && UploadJobs.validJob(this, parameters.getExtras())) UploadJobs.notifyChange(this, message);
        }
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        Work work = running.remove(parameters.getJobId());
        if (work != null) { work.stopped = true; if (work.future != null) work.future.cancel(true); }
        // JobScheduler only retries the retained operation, subject to the same account/generation checks.
        return true;
    }

    @Override public void onDestroy() {
        for (Work work : running.values()) { work.stopped = true; if (work.future != null) work.future.cancel(true); }
        running.clear(); executor.shutdownNow(); super.onDestroy();
    }
}
