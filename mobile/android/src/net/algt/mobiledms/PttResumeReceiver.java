package net.algt.mobiledms;

import static net.algt.mobiledms.ErpApi.object;
import android.app.*;
import android.content.*;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** A reboot may suggest opening the app. It never starts live audio or a microphone service. */
public final class PttResumeReceiver extends BroadcastReceiver {
    static final String OPEN = "net.algt.mobiledms.OPEN_PTT";
    @Override public void onReceive(Context context,Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        PendingResult token = goAsync();
        AtomicBoolean finished=new AtomicBoolean();
        Runnable done=()->{if(finished.compareAndSet(false,true))token.finish();};
        new Handler(Looper.getMainLooper()).postDelayed(done,7500);
        check(context.getApplicationContext(),done);
    }
    static void check(Context c,Runnable finished) {
        long deadline=SystemClock.elapsedRealtime()+7000;
        PttService.io.execute(() -> {
            SharedPreferences p = PttService.prefs(c);
            try {
                String account=p.getString("account",""), epoch=p.getString("epoch","");
                ErpApi api=new ErpApi(c);
                java.util.function.BooleanSupplier current=() -> SystemClock.elapsedRealtime()<deadline && !epoch.isEmpty() && p.getBoolean("enabled",false)
                    && epoch.equals(p.getString("epoch","")) && api.signedIn() && account.equals(api.user())
                    && p.getLong("login",-1)==api.sessionEpoch() && !"offDuty".equals(p.getString("availability",""));
                if (!current.getAsBoolean() || !PttService.online(c)) return;
                JSONObject state=PttService.call(api,"state",object(),current);
                if (!PttState.recover(current.getAsBoolean(),account.equals(api.user()),epoch.equals(state.optString("epoch")),
                    state.optBoolean("stopped",true),state.optString("availability"))) return;
                Intent open=new Intent(c,LauncherActivity.class).setAction(OPEN).putExtra("pttEpoch",epoch)
                    .putExtra("pttAccount",account).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent tap=PendingIntent.getActivity(c,PttService.RESUME,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
                if (current.getAsBoolean()) c.getSystemService(NotificationManager.class).notify(PttService.RESUME,
                    PttService.notice(c).setAutoCancel(true).setContentTitle("Walkie-Talkie").setContentText("Tap to resume your session")
                        .setContentIntent(tap).build());
            } catch (Exception unavailable) { /* Recovery requires current ERP authority. */ }
            finally { finished.run(); }
        });
    }
}
