package net.algt.mobiledms;

import static net.algt.mobiledms.ErpApi.object;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

final class SosControl {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService IO = Executors.newCachedThreadPool();
    private static final int LOCATION_PERMISSION = 15101;
    private final LauncherActivity a;
    private final ErpApi api;
    private final String channel, name, epoch, key, account;
    private final long session;
    private final BooleanSupplier active;
    private final SharedPreferences receipts;
    private final SosHold hold = new SosHold();
    private final Button trigger, check, cancel, reset;
    private final TextView status;
    private volatile Location availableFix;
    private volatile long gesture;
    private boolean busy;
    private int pointer = -1;

    static void mount(LauncherActivity a, LinearLayout panel, String channel, String channelName,
                      String epoch, BooleanSupplier active) {
        if (ChatRules.uuid(channel) && ChatRules.uuid(epoch) && channelName != null && !channelName.isEmpty())
            new SosControl(a,panel,channel,channelName,epoch,active);
    }

    private SosControl(LauncherActivity a, LinearLayout panel, String channel, String name,
                       String epoch, BooleanSupplier active) {
        this.a=a; this.api=a.api; this.channel=channel; this.name=name; this.epoch=epoch; this.active=active;
        account=api.user(); session=api.sessionEpoch();
        // A receipt stores only an opaque incident ID/state. There is no message, location or job to replay.
        receipts=a.getSharedPreferences("sos_receipts_v1",Context.MODE_PRIVATE);
        key=account+"."+channel+"."+epoch;
        trigger=a.button(label(),()->{},false);
        trigger.setFilterTouchesWhenObscured(true);
        a.add(panel,trigger,6);
        status=a.text("",16,a.getColor(R.color.erp_text),false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        a.add(panel,status,3);
        check=a.button("Check SOS status",()->command("status"),false); a.add(panel,check,2);
        cancel=a.button("Cancel my SOS",()->command("cancel"),false); a.add(panel,cancel,2);
        reset=a.button("Start a separate SOS",()->{
            if (!current() || busy) return;
            a.showTrackedDialog(a.dialogBuilder().setTitle("Start a separate SOS?")
                .setMessage("The earlier SOS may have reached ERP. A new three-second hold will create a separate alert.")
                .setPositiveButton("Start separately",(d,w)->{
                    if(current() && !busy) {receipts.edit().remove(key).apply();status.setText("");refresh();}
                }).setNegativeButton("Keep checking",null).create());
        },false); a.add(panel,reset,2);
        if (!a.at(MobileRoute.Id.LOCKED) && !hasLocation(a)) {
            Button enable=a.button("Allow approximate SOS location",()->{
                BooleanSupplier ticket=a.communicationsTicket();
                if(!current() || a.at(MobileRoute.Id.LOCKED) || !ticket.getAsBoolean())return;
                a.showTrackedDialog(a.dialogBuilder().setTitle("Include approximate location with SOS?")
                    .setMessage("When you send SOS, a recent approximate location can be included once. Eligible channel members can view it. It stays in authorized history after cancellation. You can send SOS without location.")
                    .setNegativeButton("Keep location off",null).setPositiveButton("Allow location",(d,w)->{
                        if(ticket.getAsBoolean() && current())
                            a.requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_PERMISSION);
                    }).create());
            },false);
            a.add(panel,enable,2);
        }
        trigger.setOnTouchListener(this::touch);
        trigger.setOnKeyListener((v,code,e)->{
            if(code!=KeyEvent.KEYCODE_ENTER && code!=KeyEvent.KEYCODE_DPAD_CENTER && code!=KeyEvent.KEYCODE_SPACE) return false;
            if(e.getAction()==KeyEvent.ACTION_DOWN && e.getRepeatCount()==0) down(e.getEventTime());
            if(e.getAction()==KeyEvent.ACTION_UP) end(e.getEventTime(),!e.isCanceled());
            return true;
        });
        trigger.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
            public void onViewAttachedToWindow(View v) {}
            public void onViewDetachedFromWindow(View v) {end(0,false);}
        });
        refresh();
    }

    private String label() { return "Hold 3 seconds for SOS · "+name; }
    private boolean current() {
        return a.api==api && api.signedIn() && api.sessionEpoch()==session && account.equals(api.user())
            && trigger.isAttachedToWindow() && active.getAsBoolean();
    }
    private String saved() { return receipts.getString(key,""); }
    private static String state(String value) {int pos=value.indexOf('/');return pos<0?"":value.substring(0,pos);}
    private static String incident(String value) {int pos=value.indexOf('/');return pos<0?"":value.substring(pos+1);}
    private void refresh() {
        String s=state(saved());
        boolean unknown=s.equals("uncertain");
        check.setVisibility(unknown?View.VISIBLE:View.GONE);
        reset.setVisibility(unknown?View.VISIBLE:View.GONE);
        cancel.setVisibility(s.equals("recorded")?View.VISIBLE:View.GONE);
        trigger.setEnabled(!busy && !unknown);
        check.setEnabled(!busy);cancel.setEnabled(!busy);reset.setEnabled(!busy);
        trigger.setText(label());
        if (unknown && status.length()==0) status.setText("SOS outcome unknown. Check the original alert.");
    }
    private boolean ready() {
        if(!PttService.online(a)) {status.setText("SOS not sent — no internet.");return false;}
        if(!current() || !trigger.hasWindowFocus()) {status.setText("This channel is unavailable.");return false;}
        return true;
    }
    private boolean touch(View v,MotionEvent e) {
        switch(e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                pointer=e.getPointerId(0);down(e.getEventTime());v.getParent().requestDisallowInterceptTouchEvent(true);break;
            case MotionEvent.ACTION_MOVE:
                int i=e.findPointerIndex(pointer);
                if(i<0 || e.getX(i)<0 || e.getY(i)<0 || e.getX(i)>=v.getWidth() || e.getY(i)>=v.getHeight()) end(0,false);
                break;
            case MotionEvent.ACTION_UP: end(e.getEventTime(),true);v.performClick();break;
            case MotionEvent.ACTION_POINTER_DOWN: case MotionEvent.ACTION_CANCEL: end(0,false);break;
            default: break;
        }
        return true;
    }
    private void down(long eventTime) {
        if(busy || state(saved()).equals("uncertain") || !ready()
                || !hold.begin(channel,eventTime,SystemClock.uptimeMillis(),true)) return;
        long generation=++gesture;
        availableFix=null;
        if(hasLocation(a)) IO.execute(()->{
            Location fix=availableLocation(a);
            if(gesture==generation) availableFix=fix;
        });
        status.setText(""); tick.run();
    }
    private final Runnable tick=new Runnable(){
        public void run(){
            if (!hold.holding()) return;
            long now=SystemClock.uptimeMillis();
            if(!current() || !trigger.hasWindowFocus()) {
                end(0,false);
                if(!PttService.online(a)) status.setText("SOS not sent — no internet.");
                return;
            }
            if(hold.timerDue(channel,now,true)) {command("send");return;}
            long left=hold.remaining(now);
            String text="Keep holding · "+((left+999)/1000)+" · "+name;
            if(!text.contentEquals(trigger.getText()))trigger.setText(text);
            MAIN.postDelayed(this,Math.min(SosHold.TICK_MS,left));
        }
    };
    private void end(long now,boolean released) {
        MAIN.removeCallbacks(tick);
        if(released && hold.holding() && hold.release(channel,now,current() && trigger.hasWindowFocus())) command("send");
        hold.cancel();gesture++;availableFix=null;trigger.setText(label());pointer=-1;
    }

    private static boolean hasLocation(Context a) {
        return a.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    }
    private static Location availableLocation(Context a) {
        try {
            LocationManager manager=a.getSystemService(LocationManager.class);
            if(manager==null || !hasLocation(a)) return null;
            Location best=null;
            for(String provider:manager.getProviders(true)) {
                Location l;
                try { l=manager.getLastKnownLocation(provider); }
                catch (SecurityException unavailable){continue;}
                if(l!=null && l.hasAccuracy() && l.getAccuracy()>=0
                   && SosHold.freshFix(SystemClock.elapsedRealtimeNanos(),l.getElapsedRealtimeNanos())
                   && (best==null || l.getElapsedRealtimeNanos()>best.getElapsedRealtimeNanos())) best=l;
            }
            return best;
        } catch(RuntimeException unavailable){return null;}
    }
    private void command(String op) {
        if(busy) return;
        if(!PttService.online(a)) {
            status.setText(op.equals("cancel")?"Cancellation not sent — no internet.":"Connect to ERP to continue.");
            return;
        }
        if(!current()) {status.setText("This channel is unavailable.");return;}
        String previous=saved();
        boolean sending=op.equals("send");
        if(sending && state(previous).equals("uncertain"))return;
        String id=sending?UUID.randomUUID().toString():incident(previous);
        if(!ChatRules.uuid(id))return;
        Location fix=sending?availableFix:null;
        availableFix=null;gesture++;
        busy=true;status.setText(op.equals("status")?"Checking SOS status…":"Contacting ERP…");refresh();
        IO.execute(()->{
            String result="uncertain";
            boolean attempted=false, refused=false;
            try {
                synchronized(SosControl.class) {
                    if(!previous.equals(saved()) || !current())throw new java.io.IOException();
                    if(!op.equals("status") && !receipts.edit().putString(key,"uncertain/"+id).commit())throw new java.io.IOException();
                }
                JSONObject args=object("channelId",channel,"epoch",epoch,"incidentId",id);
                if(fix!=null && hasLocation(a) && SosHold.freshFix(SystemClock.elapsedRealtimeNanos(),fix.getElapsedRealtimeNanos()))
                    args.put("location",object("latitude",fix.getLatitude(),"longitude",fix.getLongitude(),
                        "accuracyM",(double)fix.getAccuracy(),"capturedAt",Instant.ofEpochMilli(fix.getTime()).toString()));
                if(!current())throw new java.io.IOException();
                attempted=true;
                JSONObject data=new CommunicationsApi(api,this::current).call("sos."+op,args);
                if(!id.equals(data.getString("incidentId")))throw new java.io.IOException();
                String returned=data.getString("state");
                if(returned.equals("recorded") || returned.equals("cancelled")) result=returned;
            } catch(ErpApi.Rejected denied) {
                // A typed business refusal is conclusive. Gateway/transport errors are ambiguous.
                refused=denied.beforeBusinessRequest || denied.status==400 || denied.status==401 || denied.status==403 || denied.status==404;
                if(refused)result=sending?"refused":state(previous);
            } catch(Exception unavailable) {
                if(!attempted) {refused=true;result=sending?"refused":state(previous);}
            }
            final String resolved=result;
            final boolean rejected=refused;
            synchronized(SosControl.class) {
                if(id.equals(incident(saved()))) {
                    if(result.equals("refused"))receipts.edit().remove(key).commit();
                    else receipts.edit().putString(key,result+"/"+id).commit();
                }
            }
            MAIN.post(()->{
                busy=false;
                if(a.api!=api || !account.equals(api.user()) || !trigger.isAttachedToWindow())return;
                status.setText(rejected && op.equals("cancel")?"Cancellation was not sent.":rejected && op.equals("status")?"SOS status is unavailable.":resolved.equals("recorded")?"SOS recorded by ERP.":resolved.equals("cancelled")?
                    "Cancellation recorded by ERP.":resolved.equals("refused")?"SOS unavailable.":"SOS outcome unknown. Check the original alert.");
                refresh();
            });
        });
    }

    static void history(LauncherActivity a,String channel,String mode) {
        if(!ChatRules.uuid(channel) || a.at(MobileRoute.Id.LOCKED))return;
        a.action("Channel SOS history",()->historyPage(a,channel,mode,null,null),false);
    }
    static void openNotice(LauncherActivity a,String channel,String event) {
        if(!ChatRules.uuid(channel) || !ChatRules.uuid(event) || !a.communicationsTicket().getAsBoolean()) return;
        historyPage(a,channel,"participant",null,event);
    }
    private static void historyPage(LauncherActivity a,String channel,String mode,String cursor,String event) {
        if(!a.communicationsTicket().getAsBoolean())return;
        a.page(MobileRoute.Id.PTT_HISTORY,()->a.communications.ptt.home(a.mobile()::home),false);
        a.title(event==null?"Channel SOS history":"Channel SOS notice");
        BooleanSupplier ticket=a.communicationsTicket();
        ErpApi api=a.api;
        IO.execute(()->{
            try {
                JSONObject args=object("channelId",channel,"mode",mode);
                if(cursor!=null)args.put("cursor",cursor);
                if(event!=null)args.put("eventId",event);
                JSONObject page=new CommunicationsApi(api,ticket).page("sos.history",args);
                MAIN.post(()->{
                    if(!ticket.getAsBoolean())return;
                    JSONArray rows=page.optJSONArray("items");
                    if(rows==null || rows.length()==0){a.subtitle("No SOS notices available.");return;}
                    for(int i=0;i<rows.length();i++){
                        JSONObject row=rows.optJSONObject(i); if(row==null)continue;
                        boolean original="original".equals(row.optString("action"));
                        a.section(original?"SOS alert":"SOS cancelled");
                        a.subtitle(row.optString("sender")+" · "+row.optString("createdAt"));
                        JSONObject location=row.optJSONObject("location");
                        if(location!=null) a.subtitle("Location "+location.optString("latitude")+", "+location.optString("longitude")
                            +" · ±"+location.optString("accuracyM")+" m · "+location.optString("capturedAt"));
                        if(mode.equals("participant") && original && row.optBoolean("mine")) {
                            a.action("Check this SOS status",()->checkFromHistory(a,channel,row.optString("id"),ticket),false);
                            a.action("Cancel this SOS",()->cancelFromHistory(a,channel,row.optString("id"),ticket),false);
                        }
                        if(mode.equals("participant")) {
                            String id=row.optString("id");
                            a.action("Report notice",()->report(a,id,ticket),false);
                        }
                    }
                    if(!page.isNull("nextCursor"))a.action("Older notices",()->historyPage(a,channel,mode,page.optString("nextCursor"),null),false);
                });
            } catch(Exception unavailable){MAIN.post(()->{if(ticket.getAsBoolean())a.message("SOS history is unavailable.",true);});}
        });
    }

    private static void checkFromHistory(LauncherActivity a,String channel,String id,BooleanSupplier ticket) {
        if(!ticket.getAsBoolean())return;
        ErpApi api=a.api;
        PttService phone=PttService.forAccount(api);
        if(phone==null || !phone.canSOS(channel)){
            a.message("Select this channel in an active online Walkie-Talkie session to check its status.",true);
            return;
        }
        String epoch=phone.epoch();
        BooleanSupplier current=()->ticket.getAsBoolean() && PttService.forAccount(api)==phone && phone.canSOS(channel);
        IO.execute(()->{
            String message="ERP could not confirm this SOS.";
            try{
                JSONObject row=new CommunicationsApi(api,current).call("sos.status",object("incidentId",id,"channelId",channel,"epoch",epoch));
                if(id.equals(row.optString("incidentId"))) {
                    if("recorded".equals(row.optString("state")))message="SOS recorded by ERP.";
                    if("cancelled".equals(row.optString("state")))message="Cancellation recorded by ERP.";
                }
            }catch(Exception denied){ /* Keep status unconfirmed. */ }
            String feedback=message;MAIN.post(()->{if(current.getAsBoolean())a.message(feedback,false);});
        });
    }

    private static void cancelFromHistory(LauncherActivity a,String channel,String id,BooleanSupplier ticket) {
        if(!ticket.getAsBoolean())return;
        if(!PttService.online(a)){a.message("Cancellation not sent — no internet.",true);return;}
        ErpApi api=a.api;
        PttService service=PttService.forAccount(api);
        if(service==null || !service.canSOS(channel)) {a.message("Select this channel in an active Walkie-Talkie session to cancel.",true);return;}
        String epoch=service.epoch(), key=api.user()+"."+channel+"."+epoch;
        BooleanSupplier current=()->ticket.getAsBoolean() && PttService.forAccount(api)==service && service.canSOS(channel);
        a.showTrackedDialog(a.dialogBuilder().setTitle("Cancel this SOS?").setMessage("ERP will add a cancellation notice to this channel.")
            .setNegativeButton("Keep alert",null).setPositiveButton("Cancel SOS",(d,w)->{
                if(!current.getAsBoolean())return;
                IO.execute(()->{
                    String message="Cancellation outcome unknown. Check the original SOS.";
                    try {
                        JSONObject result=new CommunicationsApi(api,current).call("sos.cancel",object("channelId",channel,"epoch",epoch,"incidentId",id));
                        if(id.equals(result.getString("incidentId")) && "cancelled".equals(result.getString("state")))
                            message="Cancellation recorded by ERP.";
                    } catch(Exception unavailable){ /* Status lookup uses this same incident identifier. */ }
                    SharedPreferences prefs=a.getSharedPreferences("sos_receipts_v1",Context.MODE_PRIVATE);
                    synchronized(SosControl.class) {
                        String prior=prefs.getString(key,"");
                        if(prior.isEmpty() || id.equals(incident(prior)))prefs.edit().putString(key,
                            (message.startsWith("Cancellation recorded")?"cancelled/":"uncertain/")+id).commit();
                    }
                    String feedback=message;
                    MAIN.post(()->{if(ticket.getAsBoolean())a.message(feedback,true);});
                });
            }).create());
    }

    private static void report(LauncherActivity a,String id,BooleanSupplier ticket) {
        if(!ticket.getAsBoolean() || !ChatRules.uuid(id))return;
        String[] labels={"Harassment or threats","Hate or discrimination","Privacy misuse","Other"};
        String[] reasons={"harassment_threats","hate_discrimination","privacy","other"};
        a.showTrackedDialog(a.dialogBuilder().setTitle("Report this notice").setItems(labels,(d,i)->{
            if(!ticket.getAsBoolean())return;
            ErpApi api=a.api;
            IO.execute(()->{
                String message;
                try {new CommunicationsApi(api,ticket).mutate("policy.report",object("kind","ptt_sos","targetId",id,"reason",reasons[i]));message="Report submitted.";}
                catch(Exception denied){message="Report unavailable.";}
                String feedback=message;MAIN.post(()->{if(ticket.getAsBoolean())a.message(feedback,true);});
            });
        }).create());
    }
}
