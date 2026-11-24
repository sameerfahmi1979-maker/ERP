package net.algt.mobiledms;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import java.util.UUID;

public final class ErpMessagingService extends FirebaseMessagingService {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("erp-notification-device",Context.MODE_PRIVATE); }
    static boolean permitted(Context c) {
        return (Build.VERSION.SDK_INT<33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            && c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }
    @Override public void onNewToken(String token) {
        // Only the unlocked ERP session may bind a rotated token. Never retain the token in application preferences.
        prefs(this).edit().remove("registeredSession").apply();
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        Map<String,String> data=message.getData();
        String account=data.get("accountId"), event=data.get("eventId"), category=data.get("category");
        String preview="";
        if (NotificationRules.uuid(account) && NotificationRules.uuid(event) && NotificationRules.chat(category) && permitted(this) &&
              account.equals(prefs(this).getString("bound","")) && prefs(this).getBoolean("textPreview."+account,false)) {
            // Only this opt-in, one-event projection is requested. No chat history, local
            // encrypted store, read receipts or navigation are touched by background delivery.
            try {
                ErpApi api=new ErpApi(this);
                BooleanSupplier eligible=()->account.equals(prefs(this).getString("bound","")) && prefs(this).getBoolean("textPreview."+account,false)
                    && api.signedIn() && account.equals(api.user());
                if(eligible.getAsBoolean()){
                    Object row=api.communicationsCall(ErpApi.object("op","notifications.preview","args",ErpApi.object("eventId",event,"installation",installation(this))),eligible);
                    if(row instanceof JSONObject && eligible.getAsBoolean())preview=NotificationRules.safePreview(ErpApi.str((JSONObject)row,"text"));
                }
            }catch(Exception unavailable){ /* Remain metadata-only when locked credentials, policy, budget or transport deny access. */ }
        }
        synchronized (ErpMessagingService.class) {
            if (!NotificationRules.uuid(account) || !NotificationRules.uuid(event) || !account.equals(prefs(this).getString("bound","")) || !permitted(this)) return;
            if(!prefs(this).getBoolean("textPreview."+account,false))preview="";
            if("control".equals(category)||"sos".equals(category))prefs(this).edit().putBoolean("control."+account+"."+event,true).apply();
            boolean chat=NotificationRules.chat(category);
            String label=chat ? NotificationRules.safeLabel(data.get("label")) : "";
            post(this,account,event,chat,label.isEmpty()?(chat?"New message":"ERP notification"):label,
                chat?(preview.isEmpty()?"Open Messages to view the update.":preview):"Open ALGT ERP to view the update.",!"false".equals(data.get("sound")),!"false".equals(data.get("vibrate")),false);
        }
    }
    static synchronized void post(Context c,String account,String event,boolean chat,String title,String detail,boolean sound,boolean vibrate,boolean local) {
        if (!permitted(c)) return;
        SharedPreferences p=prefs(c);
        String key="seen."+account+"."+event;
        if (p.getBoolean(key,false)) return;
        NotificationManager manager=c.getSystemService(NotificationManager.class);
        String channel="erp-"+(local?"offline":chat?"messages":"updates")+"-"+(sound?"sound":"silent")+"-"+(vibrate?"vibrate":"steady");
        NotificationChannel settings=new NotificationChannel(channel,local?"Offline documents":chat?"Messages":"ERP updates",NotificationManager.IMPORTANCE_HIGH);
        if (!sound) settings.setSound(null,null);
        settings.enableVibration(vibrate);
        settings.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(settings);
        Notification.Builder b=new Notification.Builder(c,channel).setSmallIcon(R.drawable.action_notifications)
            .setContentTitle(title).setContentText(detail).setContentIntent(intent(c,account,event))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true).setAutoCancel(true)
            .setPublicVersion(new Notification.Builder(c,channel).setSmallIcon(R.drawable.action_notifications)
                .setContentTitle(chat && !title.equals("New message")?title:"ALGT ERP").setContentText(chat && p.getBoolean("textPreview."+account,false)?detail:chat?"New message":"ERP update").build());
        if (!local) {
            b.addAction(action(c,account,event,"read","Mark as read"));
            if (chat) b.addAction(action(c,account,event,"reply","Reply"));
        }
        try {
            manager.notify(account+"."+event,6101,b.build());
            p.edit().putBoolean(key,true).apply();
        } catch(SecurityException denied) { /* permission can change after the initial check */ }
    }
    private static Notification.Action action(Context c,String account,String event,String op,String caption) {
        String ref=NotificationRules.ref(account,event,op);
        prefs(c).edit().putString("route."+account+"."+ref,op+"|"+event).apply();
        Notification.Action.Builder b=new Notification.Action.Builder(null,caption,intent(c,account,ref));
        if (Build.VERSION.SDK_INT>=31) b.setAuthenticationRequired(true);
        return b.build();
    }
    private static PendingIntent intent(Context c,String account,String ref) {
        Intent launch=new Intent(c,LauncherActivity.class).setAction(MobileCommunications.OPEN_NOTIFICATION)
            .setData(Uri.parse("algt-notification://event/"+account+"/"+ref))
            .putExtra(MobileCommunications.EVENT_ID,ref).putExtra(MobileCommunications.ACCOUNT_ID,account)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,0,launch,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static String installation(Context c) {
        SharedPreferences p=prefs(c);
        synchronized(ErpMessagingService.class) {
            String id=p.getString("installation","");
            if (!NotificationRules.uuid(id)) { id=UUID.randomUUID().toString();p.edit().putString("installation",id).commit(); }
            return id;
        }
    }
}

