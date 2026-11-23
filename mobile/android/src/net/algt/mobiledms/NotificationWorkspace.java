package net.algt.mobiledms;

import android.Manifest;
import android.app.NotificationManager;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import android.widget.EditText;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.json.*;
import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;

final class NotificationWorkspace implements MobileCommunications.Notifications {
    private final LauncherActivity a;
    private static final ExecutorService worker=Executors.newSingleThreadExecutor();
    NotificationWorkspace(LauncherActivity activity) { a=activity; }

    private static JSONObject rpc(ErpApi api,String op,JSONObject args,BooleanSupplier live)throws Exception {
        if(!live.getAsBoolean()) throw new IllegalStateException("Sign in again to continue.");
        Object result=api.communicationsCall(object("op","notifications."+op,"args",args),live);
        if(!(result instanceof JSONObject)) throw new IllegalStateException("The response is unavailable.");
        return (JSONObject)result;
    }
    private void call(String op,JSONObject args,Consumer<JSONObject> show) {
        final ErpApi api=a.api; final BooleanSupplier live=a.communicationsViewTicket();
        if(!live.getAsBoolean())return;
        worker.execute(()->{
            try {JSONObject result=rpc(api,op,args,live);a.runOnUiThread(()->{if(live.getAsBoolean())show.accept(result);});}
            catch(Exception failure){a.runOnUiThread(()->{if(live.getAsBoolean())a.message("This update is unavailable. Check your connection, access and service status.",true);});}
        });
    }
    static void refreshRegistration(LauncherActivity a) {
        if(!BuildConfig.FIREBASE_CLIENT_CONFIGURED || a.api==null || !ErpMessagingService.permitted(a))return;
        final ErpApi api=a.api;
        final String owner=api.user(); final BooleanSupplier live=a.communicationsSessionTicket();
        SharedPreferences prefs=ErpMessagingService.prefs(a);
        final String session=owner+"."+api.sessionEpoch();
        if(!NotificationRules.uuid(owner) || !live.getAsBoolean() || !prefs.getBoolean("enabled."+owner,false) || session.equals(prefs.getString("registeredSession","")))return;
        worker.execute(()->{
            try {
                if(!live.getAsBoolean() || !rpc(api,"status",object(),live).optBoolean("pushConfigured"))return;
                String token=Tasks.await(FirebaseMessaging.getInstance().getToken(),15,TimeUnit.SECONDS);
                JSONObject result=rpc(api,"registerDevice",object("installation",ErpMessagingService.installation(a),"token",token,"clientMutationId",UUID.randomUUID().toString()),live);
                synchronized(ErpMessagingService.class) {
                    if(live.getAsBoolean() && result.optBoolean("registered") && prefs.getBoolean("enabled."+owner,false))
                        prefs.edit().putString("bound",owner).putString("registeredSession",session).apply();
                }
            } catch(Exception unavailable){ /* Reconcile on the next unlocked session or explicit user retry. */ }
        });
    }
    static void clearDevice(LauncherActivity a) {
        synchronized(ErpMessagingService.class) {
            SharedPreferences p=ErpMessagingService.prefs(a);
            p.edit().remove("bound").remove("registeredSession").apply();
            // Cancel this subsystem's tagged banners only; the PTT foreground service has its own IDs.
            NotificationManager manager=a.getSystemService(NotificationManager.class);
            for(android.service.notification.StatusBarNotification n:manager.getActiveNotifications())
                if(n.getId()==6101 && n.getTag()!=null)manager.cancel(n.getTag(),6101);
        }
    }
    static void offlineReminder(LauncherActivity a,String account,String fileId,boolean expired,String grantId) {
        if(a.api==null || !NotificationRules.uuid(account) || !account.equals(a.api.user()) || !a.communicationsSessionTicket().getAsBoolean()
            || fileId==null || !fileId.matches("[1-9][0-9]{0,18}") || grantId==null || grantId.isEmpty() || !ErpMessagingService.permitted(a))return;
        SharedPreferences p=ErpMessagingService.prefs(a);
        if(!p.getBoolean("offline."+account,true))return;
        String ref=NotificationRules.ref(account,fileId+"."+grantId,expired?"expired":"due");
        p.edit().putString("route."+account+"."+ref,"offline|"+fileId).apply();
        ErpMessagingService.post(a,account,ref,false,"Offline document",expired?"A saved copy has expired.":"A saved copy will expire soon.",true,true,true);
    }
    @Override public void home(Runnable back) { list("all",null,back); }
    private void list(String filter,String cursor,Runnable back) {
        a.page(MobileRoute.Id.NOTIFICATION_CENTER,back,true);a.title("Notifications");
        a.action("All updates",()->list("all",null,back),false);
        a.action("Messages",()->list("messages",null,back),false);
        a.action("ERP updates",()->list("erp",null,back),false);
        a.action("Safety and budget alerts",()->controls(null,back),false);
        a.action("Notification settings",()->settings(()->list(filter,null,back)),false);
        JSONObject args=cursor==null?object("filter",filter):object("filter",filter,"cursor",cursor);
        call("list",args,result->{
            a.communications.updateUnread(a.communicationsViewTicket(),result.optInt("unreadMessages"));
            JSONArray items=result.optJSONArray("items");
            if(items==null || items.length()==0)a.subtitle("No updates.");
            if(items!=null)for(int index=0;index<items.length();index++){
                JSONObject row=items.optJSONObject(index);if(row==null)continue;
                String title=title(row);
                a.card((row.optBoolean("read")?"":"Unread · ")+title,str(row,"createdAt"),()->openEvent(str(row,"eventId"),()->list(filter,null,back)));
            }
            String next=result.isNull("nextCursor")?"":str(result,"nextCursor");
            if(!next.isEmpty())a.action("Older updates",()->list(filter,next,()->list(filter,cursor,back)),false);
        });
    }
    private void controls(String cursor,Runnable back) {
        a.page(MobileRoute.Id.NOTIFICATION_CENTER,back,true);a.title("Safety and budget alerts");
        call("controlInbox",cursor==null?object():object("cursor",cursor),r->{
            JSONArray rows=r.optJSONArray("items");
            if(rows==null||rows.length()==0)a.subtitle("No current alerts on this page.");
            if(rows!=null)for(int n=0;n<rows.length();n++){
                JSONObject row=rows.optJSONObject(n);if(row==null)continue;
                String event=str(row,"eventId");
                a.card(title(row),str(row,"createdAt"),()->openResolved(event,true,"",()->controls(cursor,back)));
            }
            if(!r.isNull("nextCursor"))a.action("Older alerts",()->controls(str(r,"nextCursor"),back),false);
        });
    }
    static String title(JSONObject row){
        String kind=str(row,"kind"),label=NotificationRules.safeLabel(str(row,"label"));
        if("chat".equals(kind))return label.isEmpty()?"Message":label;
        if("ptt".equals(kind))return "Walkie-Talkie transmission";
        if("sos".equals(kind))return "SOS channel update";
        if("budget".equals(kind))return "Communications budget alert";
        if("timesheet".equals(kind))return "Timesheet update";
        if("employeeExpiry".equals(kind))return "Document renewal";
        if("leaveChange".equals(kind))return "Leave request update";
        if("leaveStart".equals(kind))return "Upcoming approved leave";
        if("intake".equals(kind))return "approved".equals(str(row,"stage"))?"Processing completed":"Your document needs review";
        if("moderation".equals(kind))return "Moderation report";
        return "ERP task update";
    }
    @Override public void openEvent(String ref,Runnable back){
        if(!NotificationRules.uuid(ref) || !a.notificationReady())return;
        String owner=a.api.user();
        String mapping=ErpMessagingService.prefs(a).getString("route."+owner+"."+ref,"");
        String[] parts=mapping.split("\\|",2);
        if(parts.length==2 && "offline".equals(parts[0])){
            a.mobile().openOfflineReminder(owner,parts[1]);return;
        }
        String event=parts.length==2?parts[1]:ref;
        if(!NotificationRules.uuid(event))return;
        String action=parts.length==2?parts[0]:"";
        boolean control=ErpMessagingService.prefs(a).getBoolean("control."+owner+"."+event,false);
        openResolved(event,control,action,back);
    }
    private void openResolved(String event,boolean control,String action,Runnable back){
        a.page(MobileRoute.Id.NOTIFICATION_CENTER,back,true);
        a.title("Notification");
        call(control?"controlResolve":"resolve",object("eventId",event),r->{
            if(!event.equals(str(r,"eventId")))return;
            a.subtitle(title(r));
            if("reply".equals(action)){reply(event,back);return;}
            if("read".equals(action)){a.action("Confirm mark as read",()->mark(event,control,back),true);return;}
            String kind=str(r,"kind"),id=str(r,"id"),ch=str(r,"channelId"),path=str(r,"path");
            if("chat".equals(kind)){a.communications.chat.openConversation(str(r,"conversationId"),id,back);return;}
            if("sos".equals(kind)){SosControl.openNotice(a,ch,id);return;}
            if("ptt".equals(kind)){PttHistory.openNotice(a,ch,id);return;}
            if("intake".equals(kind)){if(r.optLong("documentId")>0){a.document(r.optLong("documentId"),back);return;}a.openReview(a.dms.intakeSource(r.optLong("id"),str(r,"sessionCode")));return;}
            if(path.matches("/dms/documents/record/[1-9][0-9]*")){a.document(Long.parseLong(path.substring(path.lastIndexOf('/')+1)),back);return;}
            if("employeeExpiry".equals(kind)){
                a.card("Renewal record "+id,"Expiry "+str(r,"date"),null);
                if(r.optLong("documentId")>0)a.action("Open document",()->a.document(r.optLong("documentId"),back),true);
            }else if("leaveStart".equals(kind)||"leaveChange".equals(kind)){
                a.card("Leave request "+id,str(r,"date")+(str(r,"endDate").isEmpty()?"":" to "+str(r,"endDate"))+" · "+str(r,"status"),null);
            }else if("timesheet".equals(kind)){a.card("Timesheet "+id,str(r,"date")+" · "+str(r,"status")+" · Employee "+str(r,"employeeId"),null);}
            else if("budget".equals(kind)){a.card("Budget alert",str(r,"reason").isEmpty()?id:str(r,"reason"),null);}
            else if("moderation".equals(kind)){openCase(id);}
            if(path.matches("/(?:modules/fleet/[1-9][0-9]*|admin/reports/templates/governance\\?template_id=[1-9][0-9]*|admin/hr/(?:employees|recruitment/candidates)/record/[1-9][0-9]*(?:\\?task=[a-z-]+&task_id=[1-9][0-9]*)?|dms/review-queue\\?item_id=[1-9][0-9]*)"))
                {
                    Runnable open=()->{
                        try{a.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://erp.algt.net"+path)));}
                        catch(ActivityNotFoundException missing){a.message("A browser is required to open this ERP record.",true);}
                    };
                    a.action("Open exact ERP record",open,true);
                    if("erp".equals(kind))open.run();
                }
            if(!r.optBoolean("read"))a.action("Mark as read",()->mark(event,control,back),false);
        });
    }
    private void openCase(String id) {
        ErpApi api=a.api;BooleanSupplier live=a.communicationsViewTicket();
        worker.execute(()->{
            try{Object result=api.communicationsCall(object("op","policy.case","args",object("caseId",id)),live);
                if(result instanceof JSONObject){JSONObject c=(JSONObject)result;a.runOnUiThread(()->{if(live.getAsBoolean())a.card("Report "+id,str(c,"status"),null);});}
            }catch(Exception stale){a.runOnUiThread(()->{if(live.getAsBoolean())a.message("This case is unavailable.",true);});}
        });
    }
    private void mark(String event,boolean control,Runnable back){
        call(control?"controlMarkRead":"markRead",object("eventId",event,"clientMutationId",NotificationRules.ref(a.api.user(),event,"markRead")),r->back.run());
    }
    private void reply(String event,Runnable back){
        EditText body=new EditText(a);body.setHint("Reply");
        BooleanSupplier live=a.communicationsViewTicket();
        a.dialogBuilder().setTitle("Reply to message").setView(body).setNegativeButton("Cancel",null).setPositiveButton("Send",(d,w)->{
            String text=body.getText().toString().trim();
            if(!live.getAsBoolean()||text.isEmpty())return;
            call("reply",object("eventId",event,"body",text,"clientMutationId",NotificationRules.ref(a.api.user(),event,"reply")),r->back.run());
        }).show();
    }
    private void settings(Runnable back){
        a.page(MobileRoute.Id.NOTIFICATION_CENTER,back,true);a.title("Notification settings");
        String owner=a.api.user();SharedPreferences p=ErpMessagingService.prefs(a);
        boolean offline=p.getBoolean("offline."+owner,true);
        a.action("Offline copy reminders · "+(offline?"On":"Off"),()->{
            p.edit().putBoolean("offline."+owner,!offline).apply();settings(back);
        },false);
        if(Build.VERSION.SDK_INT>=33&&!ErpMessagingService.permitted(a))
            a.action("Allow Android notifications",()->a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},4107),false);
        if(!BuildConfig.FIREBASE_CLIENT_CONFIGURED)a.subtitle("Push setup is on hold. This build has no registered Firebase configuration.");
        else call("status",object(),status->{
            if(!status.optBoolean("pushConfigured")){a.subtitle("ERP push sender setup is on hold.");return;}
            boolean enabled=p.getBoolean("enabled."+owner,false);
            a.subtitle(p.getString("registeredSession","").equals(owner+"."+a.api.sessionEpoch())?"This device is registered.":"Device registration is pending.");
            a.action(enabled?"Disable push on this device":"Enable push on this device",()->{
                p.edit().putBoolean("enabled."+owner,!enabled).apply();
                if(enabled){clearDevice(a);call("unregisterDevice",object("installation",ErpMessagingService.installation(a),"clientMutationId",UUID.randomUUID().toString()),r->settings(back));}
                else {refreshRegistration(a);settings(back);}
            },false);
            if(enabled)a.action("Retry device registration",()->refreshRegistration(a),false);
        });
        String[] keys={"direct","groups","mentions","erp","intake","leaveStart","timesheet","ptt","sos","budget","moderation","textPreview","label","sound","vibrate"};
        String[] names={"Private messages","Group messages","Mentions","ERP tasks","Upload processing","Upcoming leave","Timesheets","Walkie-Talkie","SOS","Budget","Moderation","Show eligible message text on this lock screen","Show sender or group on lock screen","Sound","Vibration"};
        call("preferences",object(),pref->{
            for(int i=0;i<keys.length;i++){
                String key=keys[i];boolean preview=key.equals("textPreview");
                boolean current=preview?pref.optBoolean(key,false) && p.getBoolean("textPreview."+owner,false):pref.optBoolean(key,true);
                a.action(names[i]+" · "+(current?"On":"Off"),()->call("setPreferences",object("settings",object(key,!current),"clientMutationId",UUID.randomUUID().toString()),r->{if(preview)p.edit().putBoolean("textPreview."+owner,!current).apply();settings(back);}),false);
            }
        });
    }
}

