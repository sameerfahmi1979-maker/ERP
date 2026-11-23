package net.algt.mobiledms;

import static net.algt.mobiledms.ErpApi.object;
import android.Manifest;
import android.app.NotificationManager;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.json.*;

/** Foreground navigation owns account/view tickets; enabled audio sessions belong to PttService. */
final class PttWorkspace {
    static final int AUDIO = 13101, OVERLAY = 13102, BLUETOOTH = 13103;
    final LauncherActivity a;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Screen panel, permissionPanel;
    private Runnable permissionDone;
    private boolean starting;
    PttWorkspace(LauncherActivity a) { this.a=a; }
    final class Screen {
        final ErpApi api=a.api;
        final BooleanSupplier view=a.communicationsViewTicket();
        boolean accepted;
        boolean current() { return this==panel && a.api==api && view.getAsBoolean(); }
    }
    private Screen page(MobileRoute.Id route,String title,Runnable back) {
        a.page(route,back,true); a.title(title);
        return panel=new Screen();
    }
    private void button(Screen s,String label,Runnable click) {
        a.action(label,() -> { if(s.current()) click.run(); },false);
    }
    private void confirm(Screen s,String title,String message,Runnable yes) {
        a.dialogBuilder().setTitle(title).setMessage(message).setPositiveButton("Continue",(d,w)->{
            if(s.current()) yes.run();
        }).setNegativeButton("Cancel",null).show();
    }
    private void ask(Screen s,String title,Consumer<String> result) {
        EditText field=new EditText(a); field.setSingleLine(true);
        a.dialogBuilder().setTitle(title).setView(field).setPositiveButton("Continue",(d,w)->{
            if(s.current()) result.accept(field.getText().toString().trim());
        }).setNegativeButton("Cancel",null).show();
    }
    private void call(Screen s,String op,JSONObject args,Consumer<JSONObject> yes) {
        if(!s.current()) return;
        BooleanSupplier ticket=a.communicationsTicket();
        PttService.io.execute(()-> {
            try {
                Object raw=s.api.communicationsCall(object("op",op,"args",args),ticket);
                if(!(raw instanceof JSONObject)) throw new java.io.IOException("Invalid Walkie-Talkie response.");
                main.post(()->{ if(s.current() && ticket.getAsBoolean()) yes.accept((JSONObject)raw); });
            } catch(Exception e) {
                main.post(()->{ if(s.current() && ticket.getAsBoolean()) a.message(e.getMessage()==null?"Walkie-Talkie unavailable.":e.getMessage(),true); });
            }
        });
    }
    private void list(Screen s,String op,JSONObject args,Consumer<JSONObject> row) {
        call(s,op,args,result->{
            JSONArray items=result.optJSONArray("items");
            if(items==null) { a.message("Invalid list response.",true); return; }
            for(int i=0;i<items.length();i++) {JSONObject item=items.optJSONObject(i); if(item!=null) row.accept(item);}
            if(!result.isNull("nextCursor")) {
                JSONObject next=copy(args,"cursor",result.optString("nextCursor"));
                Button more=a.button("Load more",()->{},false);
                more.setOnClickListener(v->{if(s.current()){more.setVisibility(View.GONE);list(s,op,next,row);} });
                a.add(a.content,more,4);
            } else if(items.length()==0 && !args.has("cursor")) a.subtitle("No results.");
        });
    }
    static JSONObject copy(JSONObject base,Object... pairs) {
        JSONObject result=object(pairs);
        try {
            Iterator<String> keys=base.keys();
            while(keys.hasNext()) { String key=keys.next(); if(!result.has(key)) result.put(key,base.get(key)); }
        } catch(JSONException e) { throw new IllegalArgumentException(e); }
        return result;
    }
    void home(Runnable back) {
        Screen s=page(MobileRoute.Id.PTT_HOME,"Walkie-Talkie",back);
        Runnable here=()->home(back);
        PttService live=PttService.forAccount(s.api);
        call(s,"policy.status",object(),policy->{
            s.accepted=policy.optBoolean("accepted");
            if(live!=null)live.acceptance(s.accepted);
            if(!s.accepted && a.communications.chat!=null) {
                a.subtitle("Review and accept the communications terms before transmitting.");
                button(s,"Review communications terms",()->a.communications.chat.safety(here));
            }
        });
        if(live!=null) {
            controls(a.content,live,s::current);
            button(s,"Availability",()->{
                String[] labels={"Available","Busy","Off-duty"}, values={"available","busy","offDuty"};
                a.dialogBuilder().setTitle("Availability").setItems(labels,(d,i)->{ if(s.current()) live.availability(values[i]); }).show();
            });
            button(s,"Resume audio focus",live::resumeFocus);
            button(s,"Audio output",()->audioDevices(s,live));
            button(s,"Floating Talk control",()->overlay(s,live));
        }
        call(s,"communications.profile",object(),profile->{
            String me=profile.optString("profileId");
            JSONObject ptt=profile.optJSONObject("ptt");
            if(ptt==null || !ptt.optBoolean("eligible")) {a.message("Walkie-Talkie unavailable.",true);return;}
            if("held".equals(ptt.optString("availability"))) a.subtitle("Live audio is on hold.");
            if(live==null) {
                call(s,"ptt.state",object(),state->{
                    String old=PttService.prefs(a).getString("epoch","");
                    boolean resume=!old.isEmpty() && PttState.recover(PttService.prefs(a).getBoolean("enabled",false),
                        s.api.user().equals(PttService.prefs(a).getString("account","")),old.equals(state.optString("epoch")),
                        state.optBoolean("stopped",true),state.optString("availability"));
                    button(s,resume?"Resume Walkie-Talkie":"Start Walkie-Talkie",()->permissions(s,me,here));
                });
            }
            button(s,"Private contacts",()->directory(here,peer->call(panel,"ptt.direct",
                object("peerProfileId",peer.optString("profileId")),card->channel(card,here))));
            button(s,"Channels and discovery",()->channels(here,false));
            if(profile.optBoolean("canCreatePttChannel")) button(s,"Create channel",()->create(s,here));
            if(profile.optBoolean("isGlobalSystemAdmin")) button(s,"Manage channel creator permissions",()->directory(here,peer->{
                Screen picker=panel;
                call(picker,"ptt.creatorStatus",object("profileId",peer.optString("profileId")),grant->{
                    boolean enable=!grant.optBoolean("enabled");
                    confirm(picker,enable?"Grant channel creation?":"Revoke channel creation?",peer.optString("name"),
                        ()->call(picker,"ptt.creatorGrant",object("profileId",peer.optString("profileId"),"enabled",enable,
                            "expectedRevision",grant.optString("revision","0")),result->here.run()));
                });
            }));
            if(profile.optBoolean("canReviewHistory") || profile.optBoolean("isGlobalSystemAdmin"))
                button(s,"Review channel history",()->channels(here,true));
            if(a.communications.chat!=null) button(s,"Privacy and safety",()->a.communications.chat.safety(here));
        });
    }
    private void permissions(Screen s,String me,Runnable here) {
        List<String> missing=new ArrayList<>();
        if(a.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)
            missing.add(Manifest.permission.RECORD_AUDIO);
        if(Build.VERSION.SDK_INT>=33 && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        Runnable proceed=()->{
            if(!a.getSystemService(NotificationManager.class).areNotificationsEnabled()) {
                a.message("Enable Walkie-Talkie notifications to see the active session and Stop control.",true);
                button(s,"Open notification settings",()->a.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE,a.getPackageName())));return;
            }
            if(a.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)
                confirm(s,"Start listen-only session?","Microphone access is required for Hold to talk.",()->start(s,me,"",here));
            else start(s,me,"",here);
        };
        String disclosure="capture-disclosure-v1-"+s.api.user();
        if(missing.isEmpty() && PttService.prefs(a).getBoolean(disclosure,false)) proceed.run();
        else confirm(s,"Enable Walkie-Talkie","Walkie-Talkie uses your microphone only while you hold Talk in an active session. Complete transmissions are saved for in-app replay by eligible members and authorized company reviewers. An active session can receive audio in the background. Use Stop to end it.",()->{
            PttService.prefs(a).edit().putBoolean(disclosure,true).apply();
            if(missing.isEmpty())proceed.run();
            else {permissionPanel=s;permissionDone=proceed;a.requestPermissions(missing.toArray(new String[0]),AUDIO);}
        });
    }
    private void start(Screen s,String me,String expected,Runnable here) {
        if(starting || !s.current()) return;
        starting=true;
        String owner=s.api.user();
        String device=ErpMessagingService.installation(a);
        JSONObject args=object("deviceId",device,"confirmTakeover",!expected.isEmpty());
        if(!expected.isEmpty()) args=copy(args,"expectedEpoch",expected);
        JSONObject command=args;
        BooleanSupplier ticket=a.communicationsTicket();
        long login=s.api.sessionEpoch();
        BooleanSupplier same=()->owner.equals(s.api.user()) && login==s.api.sessionEpoch();
        PttService.io.execute(()->{
            try {
                if(!ticket.getAsBoolean()) throw new java.io.IOException("Open Walkie-Talkie again.");
                JSONObject grant=PttService.call(s.api,"start",command,same);
                main.post(()->{
                    starting=false;
                    String epoch=grant.optString("epoch","");
                    if(epoch.isEmpty())return;
                    if(grant.optBoolean("takeoverRequired")) {
                        if(ticket.getAsBoolean()) confirm(s,"Take over Walkie-Talkie?","This ends live Walkie-Talkie on the other phone.",
                            ()->start(s,me,epoch,here));return;
                    }
                    if(!ticket.getAsBoolean() || !s.current()) { cancelStart(s.api,epoch,same); return; }
                    try { PttService.start(a,epoch,grant.optString("availability","available"),me,s.accepted); }
                    catch(RuntimeException denied) {PttService.clear(a,owner);cancelStart(s.api,epoch,same);a.message("Android could not start the session.",true);return;}
                    a.message("Starting Walkie-Talkie…",false);
                    main.postDelayed(()->{if(s.current())here.run();},500);
                });
            } catch(Exception e) {main.post(()->{starting=false;if(s.current()) a.message("Walkie-Talkie could not start. "+e.getMessage(),true);});}
        });
    }
    private static void cancelStart(ErpApi api,String epoch,BooleanSupplier same) {
        PttService.io.execute(()->{try{PttService.call(api,"stop",object("epoch",epoch),same);}catch(Exception ignored){}});
    }
    private void channels(Runnable back,boolean review) {
        Screen s=page(MobileRoute.Id.PTT_CHANNEL,review?"Review channel history":"Channels and discovery",back);
        Runnable here=()->channels(back,review);
        list(s,"ptt.channels",object("mode",review?"review":"participant","limit",60),card->{
            String membership=card.optString("membership","");
            String label=card.optString("name");
            if("required".equals(membership))label+=" · Required";
            else if(!card.has("kind"))label+=" · Request access";
            if(card.optBoolean("archived"))label+=" · Archived";
            button(s,label,()->{ if(review && card.optBoolean("canManage") && "group".equals(card.optString("kind")))
                a.dialogBuilder().setTitle(card.optString("name")).setItems(new String[]{"Review history","Manage channel"},(d,i)->{
                    if (!s.current())return;
                    if(i==0)new PttHistory(a).review(card.optString("id"),here);else members(card,here);
                }).show();
                else if(review) new PttHistory(a).review(card.optString("id"),here);
                else channel(card,here); });
        });
    }
    private void directory(Runnable back,Consumer<JSONObject> chosen) { directory(back,chosen,""); }
    private void directory(Runnable back,Consumer<JSONObject> chosen,String query) {
        Screen s=page(MobileRoute.Id.PTT_CHANNEL,"ERP contacts",back);
        button(s,"Search contacts",()->ask(s,"Name, company or branch",q->directory(back,chosen,q)));
        list(s,"chat.directory",object("query",query,"limit",40),peer->{
            String name=peer.optString("name");
            String company=ErpApi.str(peer,"companyName");
            button(s,name+(company.isEmpty()?"":" · "+company),()->chosen.accept(peer));
        });
    }
    void openChannel(String channelId,Runnable back) {
        Screen s=page(MobileRoute.Id.PTT_CHANNEL,"Walkie-Talkie channel",back);
        // A notification only opens a currently visible record. Selection requires a separate tap.
        findChannel(s,channelId,back,"");
    }
    private void findChannel(Screen s,String id,Runnable back,String cursor) {
        JSONObject args=object("limit",100);
        if(!cursor.isEmpty()) args=copy(args,"cursor",cursor);
        call(s,"ptt.channels",args,page->{
            JSONArray rows=page.optJSONArray("items");
            if(rows!=null) for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);
                if(row!=null && id.equals(row.optString("id"))) {channel(row,back);return;}
            }
            if(!page.isNull("nextCursor") && !cursor.equals(page.optString("nextCursor"))) findChannel(s,id,back,page.optString("nextCursor"));
            else a.message("Channel unavailable.",true);
        });
    }
    private void channel(JSONObject card,Runnable back) {
        String id=card.optString("id"), label=card.optString("name");
        Screen s=page(MobileRoute.Id.PTT_CHANNEL,label,back);
        Runnable here=()->openChannel(id,back);
        a.subtitle(ErpApi.str(card,"description"));
        if(card.isNull("membership")) {
            button(s,"Request to join",()->call(s,"ptt.request",object("channelId",id),r->a.message("Request submitted.",false)));
            return;
        }
        boolean required="required".equals(card.optString("membership")), archived=card.optBoolean("archived");
        a.subtitle(archived?"Archived":required?"Required channel":"Optional connection");
        PttService live=PttService.forAccount(s.api);
        if(live!=null && !archived) {
            controls(a.content,live,s::current);
            button(s,"Select "+label+" for Talk and SOS",()->{live.select(id,label);here.run();});
            if(!required) {
                connection(s,live,id,here);
                if("group".equals(card.optString("kind"))) button(s,"Leave channel",()->confirm(s,"Leave "+label+"?",
                    "Leaving ends access through your current membership.",()->call(s,"ptt.leave",object("epoch",live.epoch(),"channelId",id),r->{
                        PttHistory.revoke(a,s.api,s.api.user(),id);back.run();
                    })));
            }
        }
        button(s,"History and unheard transmissions",()->new PttHistory(a).home(id,here));
        if("group".equals(card.optString("kind"))) button(s,"Members and channel settings",()->members(card,here));
    }
    private void connection(Screen screen,PttService live,String id,Runnable here) {
        Button action=a.button("Connect",()->{
            if(!screen.current() || PttService.forAccount(a.api)!=live)return;
            boolean connected=live.channels.containsKey(id);
            call(screen,connected?"ptt.disconnect":"ptt.join",object("epoch",live.epoch(),"channelId",id),r->{
                a.message(connected?"Disconnected.":"Connection requested.",false);here.run();
            });
        },false);
        a.add(a.content,action,4);
        action.post(new Runnable(){
            public void run(){
                if(!action.isAttachedToWindow())return;
                JSONObject row=live.channels.get(id);
                String text=row==null?"Connect":"waiting".equals(row.optString("admission"))?"Channel full · waiting · Disconnect":"Connected · Disconnect";
                if(!text.contentEquals(action.getText()))action.setText(text);
                action.setEnabled(screen.current() && live.liveControls());
                main.postDelayed(this,600);
            }
        });
    }
    private void create(Screen s,Runnable back) {
        ask(s,"Channel name",name->ask(s,"Description",detail->{
            String[] labels={"Discoverable · Optional","Hidden · Optional","Discoverable · Required","Hidden · Required"};
            a.dialogBuilder().setTitle("Channel access").setItems(labels,(d,i)->{
                if(s.current()) call(s,"ptt.channelCreate",object("name",name,"description",detail,"discoverable",i%2==0,
                    "required",i>=2,"clientMutationId",UUID.randomUUID().toString()),c->channel(c,back));
            }).show();
        }));
    }
    private void members(JSONObject card,Runnable back) {
        Screen s=page(MobileRoute.Id.PTT_CHANNEL,"Members · "+card.optString("name"),back);
        String id=card.optString("id");
        call(s,"ptt.members",object("channelId",id),data->{
            String revision=data.optString("revision");
            JSONArray members=data.optJSONArray("items"), requests=data.optJSONArray("requests");
            if(members!=null)for(int i=0;i<members.length();i++){
                JSONObject member=members.optJSONObject(i); if(member==null)continue;
                String label=member.optString("name")+" · "+member.optString("role");
                boolean appoint=card.optBoolean("canAppoint"), replace=card.optBoolean("canReplaceOwner"), manage=card.optBoolean("canManage");
                List<String> names=new ArrayList<>(), actions=new ArrayList<>();
                if(appoint) {
                    boolean admin="admin".equals(member.optString("role"));
                    names.add(admin?"Remove admin role":"Appoint admin");actions.add(admin?"demote":"promote");
                }
                if(replace){names.add("Appoint replacement owner");actions.add("replaceOwner");}
                if(manage && !"owner".equals(member.optString("role")) && (!"admin".equals(member.optString("role")) || appoint)){
                    names.add("Remove member");actions.add("remove");
                }
                if(names.isEmpty()) a.subtitle(label);
                else button(s,label,()->{
                    a.dialogBuilder().setTitle(label).setItems(names.toArray(new String[0]),(d,n)->confirm(s,names.get(n)+"?",member.optString("name"),
                        ()->manage(s,id,revision,actions.get(n),object("profileId",member.optString("profileId")),back))).show();
                });
            }
            if(requests==null)return;
            for(int i=0;i<requests.length();i++){
                JSONObject req=requests.optJSONObject(i);if(req==null)continue;
                String who=ErpApi.str(req,"name"); if(who.isEmpty()) who="ERP profile "+req.optString("profileId");
                String[] labels=req.optBoolean("invited")?new String[]{"Withdraw invitation"}:new String[]{"Approve request","Reject request"};
                button(s,who+" · "+(req.optBoolean("invited")?"Invited":"Requested"),()->
                    a.dialogBuilder().setItems(labels,(d,n)->manage(s,id,revision,(labels.length==2 && n==0)?"approve":"reject",
                        object("profileId",req.optString("profileId")),back)).show());
            }
            if(!card.optBoolean("archived")) {
                button(s,"Add or invite ERP contact",()->directory(back,peer->{
                    Screen picker=panel;
                    a.dialogBuilder().setTitle(peer.optString("name")).setItems(new String[]{"Add member","Invite"},(d,i)->
                        manage(picker,id,revision,i==0?"add":"invite",object("profileId",peer.optString("profileId")),back)).show();
                }));
                button(s,"Channel settings",()->ask(s,"Channel name",name->ask(s,"Description",description->
                    a.dialogBuilder().setTitle("Visibility").setItems(new String[]{"Discoverable","Hidden"},(d,i)->
                        manage(s,id,revision,"settings",object("name",name,"description",description,"discoverable",i==0),back)).show())));
                button(s,"Archive channel",()->confirm(s,"Archive channel?","This stops new transmissions and requests.",
                    ()->manage(s,id,revision,"archive",object(),back)));
            } else button(s,"Review members before reopening",()->call(s,"ptt.reopenReview",object("channelId",id),review->{
                JSONArray list=review.optJSONArray("items");StringBuilder names=new StringBuilder();
                if(list!=null)for(int i=0;i<list.length();i++){JSONObject m=list.optJSONObject(i);if(m!=null)names.append(m.optString("name")).append(" · ").append(m.optString("role")).append('\n');}
                confirm(s,"Reopen channel with these members?",names.toString(),()->manage(s,id,review.optString("revision"),"reopen",
                    object("reviewToken",review.optString("reviewToken")),back));
            }));
            button(s,"Required or Optional",()->a.dialogBuilder().setTitle("Channel membership").setItems(
                new String[]{"Required","Optional"},(d,i)->manage(s,id,revision,"setRequired",object("required",i==0),back)).show());
        });
    }
    private void manage(Screen s,String id,String revision,String action,JSONObject fields,Runnable done) {
        call(s,"ptt.manage",copy(fields,"channelId",id,"expectedRevision",revision,"action",action),r->done.run());
    }
    private void controls(LinearLayout parent,PttService service,BooleanSupplier screen) {
        LinearLayout box=a.column(); a.add(parent,box,8);
        TextView status=a.text(service.display(),18,a.getColor(R.color.erp_text),true);status.setMinLines(2);a.add(box,status,4);
        Button talk=a.button("Hold to talk",()->{},true);talk.setFilterTouchesWhenObscured(true);a.add(box,talk,6);
        BooleanSupplier valid=()->screen.getAsBoolean() && box.isShown() && PttService.forAccount(a.api)==service;
        PttOverlay.Gesture gesture=new PttOverlay.Gesture(talk,service,valid);
        LinearLayout sosPanel=a.column();a.add(box,sosPanel,0);
        a.add(box,a.button("Stop Walkie-Talkie",()->{
            if(valid.getAsBoolean()){service.stop();box.setVisibility(View.GONE); if(a.at(MobileRoute.Id.PTT_HOME))home(a.mobile()::home);}
        },false),6);
        Runnable refresh=new Runnable(){
            String mounted="";
            public void run(){
                if(!box.isAttachedToWindow()) return;
                if(PttService.forAccount(a.api)!=service) {gesture.end(false);box.setVisibility(View.GONE);return;}
                if(!valid.getAsBoolean() || !talk.hasWindowFocus()) gesture.end(false);
                String id=service.state.selected;
                String wanted=service.selectedGroup(id)?id:"";
                if(!wanted.equals(mounted)) {
                    sosPanel.removeAllViews();mounted=wanted;
                    if(!wanted.isEmpty())SosControl.mount(a,sosPanel,id,service.state.name,service.epoch(),
                        ()->valid.getAsBoolean() && service.canSOS(id));
                }
                String label=service.display();
                if(!label.contentEquals(status.getText()))status.setText(label);
                String spoken=service.state.name.isEmpty()?"Hold to talk":"Hold to talk to "+service.state.name+". Release to finish.";
                if(!spoken.contentEquals(talk.getContentDescription()==null?"":talk.getContentDescription()))talk.setContentDescription(spoken);
                talk.setEnabled(valid.getAsBoolean() && (service.canTalk() || service.state.hold!=null));
                main.postDelayed(this,350);
            }
        };
        box.post(refresh);
    }
    void renderActiveControls(LinearLayout parent) {
        PttService live=PttService.forAccount(a.api);
        if(live!=null && live.unlocked()) controls(parent,live,()->a.at(MobileRoute.Id.LOCKED) && a.onlineForeground() && live.unlocked());
    }
    private void overlay(Screen s,PttService live) {
        if(PttService.prefs(a).getBoolean("overlay",false)) {live.setOverlay(false);a.message("Floating control disabled.",false);return;}
        if(Settings.canDrawOverlays(a)) {live.setOverlay(true);return;}
        confirm(s,"Allow floating Talk?","Android can show a Hold to talk control over other apps during your active session.",()->{
            permissionPanel=s;permissionDone=()->{
                if(PttService.forAccount(a.api)==live) live.setOverlay(Settings.canDrawOverlays(a));
            };
            try { a.startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+a.getPackageName())),OVERLAY); }
            catch(ActivityNotFoundException missing){permissionDone=null;a.message("Overlay settings unavailable. In-app Talk is available.",true);}
        });
    }
    private void audioDevices(Screen s,PttService live) {
        if(Build.VERSION.SDK_INT>=31 && a.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED) {
            permissionPanel=s; permissionDone=()->chooseDevice(s,live);
            a.requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT},BLUETOOTH);
        } else chooseDevice(s,live);
    }
    private void chooseDevice(Screen s,PttService live) {
        List<AudioDeviceInfo> devices=live.routes.choices();List<String> names=new ArrayList<>();
        names.add("Automatic · headset, then speaker");
        for(AudioDeviceInfo d:devices)names.add(d.getProductName()+" · "+deviceType(d.getType()));
        a.dialogBuilder().setTitle("Audio output").setItems(names.toArray(new String[0]),(dialog,i)->{
            if(s.current() && PttService.forAccount(a.api)==live) live.routes.choose(i==0?0:devices.get(i-1).getId());
        }).show();
    }
    private static String deviceType(int type) {
        switch(type) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "Speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "Earpiece";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:case AudioDeviceInfo.TYPE_BLE_HEADSET:return "Bluetooth headset";
            default:return "Audio device";
        }
    }
    boolean permissionResult(int code,String[] permissions,int[] grants) {
        if(code!=AUDIO && code!=BLUETOOTH)return false; finishPermission();return true;
    }
    boolean activityResult(int code,int result,Intent intent) {
        if(code!=OVERLAY)return false;finishPermission();return true;
    }
    private void finishPermission() {
        Runnable done=permissionDone; Screen s=permissionPanel; permissionDone=null;permissionPanel=null;
        if(done==null || s==null)return;
        main.postDelayed(()->{if(s.current()) done.run();},180);
    }
    void stopForSignOut(String account) {
        permissionDone=null; permissionPanel=null;panel=null;
        PttService.stopAccount(account);
        PttService.clear(a,account);
    }
}
