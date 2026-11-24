package net.algt.mobiledms;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.net.*;
import android.os.*;
import android.provider.OpenableColumns;
import android.text.*;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;
import static net.algt.mobiledms.CommunicationsApi.*;

/** Ordinary company chat. Every network operation and UI completion belongs to one signed-in visit. */
final class ChatWorkspace {
    final LauncherActivity a;
    final ExecutorService worker = Executors.newSingleThreadExecutor();
    final Handler main = new Handler(Looper.getMainLooper());
    volatile Screen active;
    MediaRecorder recorder;
    MediaPlayer player;
    File recording, playing, videoFile;
    VideoView video;
    External external;
    Screen micRequest;
    boolean closed;
    ConnectivityManager watching;
    final ConnectivityManager.NetworkCallback connectivity=new ConnectivityManager.NetworkCallback(){
        @Override public void onAvailable(Network network){main.post(()->resumeForeground());}
    };
    final android.app.Application.ActivityLifecycleCallbacks lifecycle=new android.app.Application.ActivityLifecycleCallbacks(){
        public void onActivityResumed(Activity activity){if(activity==a)main.post(()->resumeForeground());}
        public void onActivityCreated(Activity activity,Bundle state){}
        public void onActivityStarted(Activity activity){}
        public void onActivityPaused(Activity activity){}
        public void onActivityStopped(Activity activity){}
        public void onActivitySaveInstanceState(Activity activity,Bundle state){}
        public void onActivityDestroyed(Activity activity){}
    };
    boolean pumping,pumpAgain;
    void resumeForeground(){
        Screen s=active;
        if(s!=null && s.pilot && s.current() && s.refresh!=null)s.refresh.run();
        resumeOutbox();
    }
    void resumeOutbox(){
        if(closed||a.api==null||!a.api.signedIn()||!a.communicationsSessionTicket().getAsBoolean()||!online())return;
        if(pumping){pumpAgain=true;return;}
        Screen s=new Screen(true);
        if(!s.current())return;
        pumping=true;
        int stamp=interruption;
        worker.execute(()->{
            operationStamp.set(stamp);
            try{
                for(JSONObject d:s.store.drafts())if(s.store.pending(d)){
                    try{send(s,d);}catch(Exception error){if(!s.current()||!online())break;}
                }
            }catch(Exception ignored){/* Existing draft and error details remain available in the outbox. */}
            finally{
                operationStamp.remove();
                main.post(()->{
                    pumping=false;
                    if(pumpAgain){pumpAgain=false;resumeOutbox();}
                });
            }
        });
    }
    ChatWorkspace(LauncherActivity a) {
        this.a=a;
        a.getApplication().registerActivityLifecycleCallbacks(lifecycle);
        watching=(ConnectivityManager)a.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(watching!=null)watching.registerDefaultNetworkCallback(connectivity);
        worker.execute(()->{
            try{ChatStore.sweepAfterRestart(a);}catch(IOException ignored){/* Every temporary-file allocation retries this sweep. */}
        });
    }

    static long pollDelay(boolean manual, long interval) { return manual ? 0 : interval; }

    /** Limits a connected pilot view locally and coalesces simultaneous resume/connectivity events. */
    static final class PilotRefresh {
        private static final long VIEW_LEASE_MS=60_000, EVENT_COALESCE_MS=2_000, ACTIVITY_INTERVAL_MS=30_000;
        private long started, lastConnectedAttempt=-EVENT_COALESCE_MS, lastActivity=-ACTIVITY_INTERVAL_MS;
        private long validUntil;
        private boolean inFlight, offlineAvailable;

        boolean begin(long now,boolean connected,boolean automatic){
            if(inFlight || automatic && connected && now-lastConnectedAttempt<EVENT_COALESCE_MS)return false;
            inFlight=true;
            started=now;
            if(connected)lastConnectedAttempt=now;
            return true;
        }
        void complete(boolean authorized,boolean connected){
            inFlight=false;
            offlineAvailable=authorized;
            validUntil=authorized&&connected?started+VIEW_LEASE_MS:0;
        }
        boolean visible(long now,boolean connected){ return connected ? now<validUntil : offlineAvailable; }
        void suspend(){
            complete(false,false);
            lastConnectedAttempt=-EVENT_COALESCE_MS;
        }
        boolean beginActivity(long now){
            if(now-lastActivity<ACTIVITY_INTERVAL_MS)return false;
            lastActivity=now;
            return true;
        }
    }

    final class Screen {
        final String owner;
        final long generation, epoch, logout;
        final ErpApi erp;
        final BooleanSupplier shell;
        final ChatStore store;
        final CommunicationsApi api;
        boolean working;
        final boolean outboxOnly;
        final boolean pilot=a.communications.chatManualRefresh();
        final PilotRefresh pilotRefresh=new PilotRefresh();
        Runnable refresh, hideProtected;
        AlertDialog dialog;
        final Runnable expire=()->{
            if(active==this && (!current() || !historyVisible()))hide();
        };
        Screen() {this(false);}
        Screen(boolean outboxOnly) {
            this.outboxOnly=outboxOnly;
            erp=a.api; owner=erp.user(); generation=LocalSecurity.generation(a); epoch=erp.sessionEpoch();
            shell=outboxOnly?a.communicationsSessionTicket():a.communicationsViewTicket();
            api=new CommunicationsApi(erp,this::current);
            store=new ChatStore(a,owner,this::current);
            logout=store.logoutMarker();
        }
        boolean current() {
            Integer stamp=operationStamp.get();
            return (stamp==null || stamp==interruption) && !closed && (outboxOnly||active==this) && accountCurrent()
                && shell.getAsBoolean() && LocalSecurity.unlocked(a);
        }
        boolean accountCurrent() {
            return a.api==erp && epoch==erp.sessionEpoch() && owner.equals(erp.user())
                && !(owner.equals(closingOwner)&&epoch==closingEpoch) && logout==store.logoutMarker()
                && generation==LocalSecurity.generation(a);
        }
        boolean historyVisible(){ return !pilot || hideProtected==null || pilotRefresh.visible(SystemClock.elapsedRealtime(),online()); }
        void hide(){
            if(dialog!=null){dialog.dismiss();dialog=null;}
            if(hideProtected!=null)hideProtected.run();
        }
        void completeRefresh(boolean authorized,boolean connected){
            if(!pilot)return;
            pilotRefresh.complete(authorized,connected);
            main.removeCallbacks(expire);
            if(authorized && connected)
                main.postDelayed(expire,Math.max(0,pilotRefresh.validUntil-SystemClock.elapsedRealtime()));
            if(!historyVisible())hide();
        }
        void suspend(){
            if(!pilot)return;
            main.removeCallbacks(expire);
            pilotRefresh.suspend();
            hide();
        }
    }
    interface Job<T> { T run() throws Exception; }
    interface Select { void row(JSONObject item); }
    Screen page(MobileRoute.Id route,String title,Runnable back) {
        a.page(route,back,true);
        Screen s=new Screen(); active=s;
        a.title(title); return s;
    }
    <T> void run(Screen s,Job<T> job,Consumer<T> ok) { run(s,job,ok,e->notice(s,e)); }
    <T> void run(Screen s,Job<T> job,Consumer<T> ok,Consumer<Exception> fail) {
        if (s==null || !s.current() || closed) return;
        final int ticket=interruption;
        worker.execute(()->{
            operationStamp.set(ticket);
            try { ChatRules.check(s::current); T value=job.run(); main.post(()->{ if(s.current() && ticket==interruption) ok.accept(value); }); }
            catch(Exception e) { main.post(()->{ if(s.current() && ticket==interruption) fail.accept(e); }); }
            finally{operationStamp.remove();}
        });
    }
    void notice(Screen s,Exception e) { if(s.current()) a.message(e.getMessage()==null?"Chat request failed.":e.getMessage(),true); }
    void button(Screen s,String label,Runnable action) { a.action(label,()->{if(s.current()) action.run();},false); }
    void choice(Screen s,String title,List<String> names,Consumer<Integer> pick) {
        if(!s.current())return;
        s.dialog=a.dialogBuilder().setTitle(title).setItems(names.toArray(new String[0]),(d,i)->{if(s.current()) pick.accept(i);}).show();
    }
    void confirm(Screen s,String title,String details,Runnable yes) {
        s.dialog=a.dialogBuilder().setTitle(title).setMessage(details).setPositiveButton("Continue",(d,b)->{if(s.current())yes.run();}).setNegativeButton("Cancel",null).show();
    }
    void ask(Screen s,String title,String initial,Consumer<String> yes) {
        EditText input=new EditText(a);input.setText(initial);input.setSelectAllOnFocus(true);
        s.dialog=a.dialogBuilder().setTitle(title).setView(input).setNegativeButton("Cancel",null).setPositiveButton("Continue",(d,b)->{
            if(s.current()) yes.accept(input.getText().toString().trim());
        }).show();
    }
    void write(Screen s,String op,JSONObject args,Runnable done) {
        if(s.working)return;
        s.working=true;
        run(s,()->s.api.mutate(op,args),r->{s.working=false;done.run();},e->{
            s.working=false; notice(s,e);
            button(s,"Retry operation",()->write(s,op,args,done));
        });
    }
    boolean online(){
        ConnectivityManager cm=(ConnectivityManager)a.getSystemService(Context.CONNECTIVITY_SERVICE);
        return cm!=null && cm.getActiveNetwork()!=null;
    }
    boolean wifi(){
        ConnectivityManager cm=(ConnectivityManager)a.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(cm==null)return false;
        NetworkCapabilities caps=cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps!=null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !cm.isActiveNetworkMetered();
    }
    String conversationFolder(String mode,String cid) throws IOException {
        if(!ChatRules.uuid(cid)||!("participant".equals(mode)||"review".equals(mode)))throw new IOException("Invalid conversation.");
        return "cache/"+mode+"/"+cid;
    }
    static String revision(JSONObject obj) { return text(obj,"revision"); }
    static String rowLabel(JSONObject c) { return text(c,"title").isEmpty()?"Conversation":text(c,"title"); }
    static boolean blockedAccess(Exception e) {
        if(!(e instanceof ErpApi.Rejected))return false;
        int status=((ErpApi.Rejected)e).status;
        return status==401 || status==403 || status==404;
    }
    void home(Runnable back){ list("participant",false,back); }
    void list(String mode,boolean archived,Runnable back){
        boolean review=mode.equals("review");
        Screen s=page(MobileRoute.Id.CHAT_HOME,review?"Review chat history":archived?"Archived chats":"Company chat",back);
        Runnable here=()->list(mode,archived,back);
        if(!review){
            button(s,"People",()->directory("People",here,null));
            button(s,"Unsent messages",()->outbox(here));
            button(s,"Starred messages",()->stars(here));
            button(s,archived?"Active chats":"Archived chats",()->list(mode,!archived,here));
            button(s,"Privacy and safety",()->safety(here));
        }
        button(s,"Search",()->search(mode,here));
        run(s,()->{
            if(!online())return s.store.snapshot("cache", "capabilities");
            JSONObject caps=s.api.call("chat.capabilities",args());
            if(!caps.optBoolean("canReviewHistory")&&!caps.optBoolean("isGlobalSystemAdmin"))s.store.clear("cache/review");
            s.store.snapshot("cache","capabilities",caps);
            return caps;
        },caps->{
            if(!review && caps.optBoolean("canCreateGroup"))button(s,"Create group",()->contribute(s,here,()->createGroup(here)));
            if(!review && (caps.optBoolean("canReviewHistory")||caps.optBoolean("isGlobalSystemAdmin")))button(s,"Review chat history",()->list("review",false,here));
            if(!review && caps.optBoolean("isGlobalSystemAdmin"))button(s,"Named permissions",()->directory("Select employee",here,p->grant(p,here)));
        });
        LinearLayout chats=a.column();a.add(a.content,chats,8);
        if(s.pilot){
            a.subtitle("Pilot mode · Refresh conversations to check for updates.");
            s.hideProtected=chats::removeAllViews;
            s.refresh=()->refreshManifest(s,chats,mode,archived,here,"",true,true);
            button(s,"Refresh conversations",()->refreshManifest(s,chats,mode,archived,here,"",true,false));
        }
        refreshManifest(s,chats,mode,archived,here,"",true,false);
    }
    void refreshManifest(Screen s,LinearLayout chats,String mode,boolean archived,Runnable here,String old,boolean first,boolean automatic){
        if(!s.current())return;
        boolean connectedAtStart=online();
        if(s.pilot && !s.pilotRefresh.begin(SystemClock.elapsedRealtime(),connectedAtStart,automatic))return;
        if(!s.historyVisible())s.hide();
        run(s,()->{
            boolean connected=s.pilot?connectedAtStart:online();
            ChatManifest.Result manifest=ChatManifest.list(s,mode,archived,connected);
            if(connected && mode.equals("participant") && !s.store.conversationIds("review").isEmpty()){
                try{ChatManifest.list(s,"review",false,true);}catch(ErpApi.Rejected e){
                    if(e.status!=403 || !"permission_denied".equals(ChatManifest.errorCode(e)) || e.getSuppressed().length>0)throw e;
                }
            }
            return manifest;
        },manifest->{
            s.completeRefresh(true,connectedAtStart);
            if(s.pilot && !s.historyVisible()){
                if(!connectedAtStart && online())s.refresh.run();
                return;
            }
            String sign=(online()?"online":"offline")+manifest.signature();
            if(first||!sign.equals(old)){
                chats.removeAllViews();
                if(!online())chats.addView(a.text("Offline · saved conversations",14,a.getColor(R.color.erp_text_secondary),false));
                if(manifest.rows.isEmpty())chats.addView(a.text("No conversations.",16,a.getColor(R.color.erp_text_secondary),false));
                showConversationRows(s,chats,manifest.rows,0,mode,here);
            }
            if(online() && (!s.pilot||connectedAtStart))run(s,()->{
                for(JSONObject c:manifest.all)ChatManifest.refreshPages(s,c,mode);
                return true;
            },ok->{});
            if(mode.equals("participant")){
                a.communications.updateUnread(s::current,(int)manifest.unread);
                if(online()){
                    if(!s.pilot)drain(s);
                    else if(!automatic)resumeOutbox();
                }
                if(wifi())cacheIncoming(s,manifest.all);
            }
            long delay=pollDelay(s.pilot||a.communications.chatManualRefresh(),20_000);
            if(delay>0)main.postDelayed(()->{
                if(s.current() && !a.communications.chatManualRefresh())refreshManifest(s,chats,mode,archived,here,sign,false,true);
            },delay);
        },e->{
            s.completeRefresh(false,connectedAtStart);
            if(e instanceof ErpApi.Rejected){
                ErpApi.Rejected failure=(ErpApi.Rejected)e;
                if(ChatManifest.deniedHistoryFolder(mode,failure.status,ChatManifest.errorCode(failure))!=null)chats.removeAllViews();
            }
            if(s.pilot && !connectedAtStart && online()){s.refresh.run();return;}
            notice(s,e);
            if(!s.pilot)button(s,"Reload conversations",here);
        });
    }
    void showConversationRows(Screen s,LinearLayout list,List<JSONObject> rows,int offset,String mode,Runnable here){
        int end=Math.min(rows.size(),offset+40);
        for(int n=offset;n<end;n++){
            JSONObject c=rows.get(n);int unread=c.optInt("unreadCount");
            a.add(list,a.button(rowLabel(c)+(unread>0?" · "+unread+" unread":""),()->{if(s.current()&&s.historyVisible())thread(c,mode,"",here);},false),4);
        }
        if(end<rows.size()){
            Button more=a.button("More conversations",()->{},false);
            more.setOnClickListener(v->{if(s.current()&&s.historyVisible()){list.removeView(more);showConversationRows(s,list,rows,end,mode,here);}});
            a.add(list,more,4);
        }
    }
    void paged(Screen s,String op,JSONObject fields,String folder,String key,Select row){
        loadPage(s,op,fields,folder,key,row,"",new HashSet<>());
    }
    void loadPage(Screen s,String op,JSONObject fields,String folder,String key,Select row,String cursor,Set<String> visited){
        boolean shared=op.equals("chat.media")&&folder!=null;
        String pageKey=(shared?"media":key)+"|"+cursor;
        run(s,()->{
            if(!online() && folder!=null)return shared?s.store.page(folder,pageKey,key):s.store.snapshot(folder,pageKey);
            JSONObject next=new JSONObject(fields.toString());
            if(!cursor.isEmpty())next.put("cursor",cursor);
            JSONObject data=s.api.page(op,next);
            if(shared)s.store.page(folder,pageKey,key,data);else if(folder!=null)s.store.snapshot(folder,pageKey,data);
            return data;
        },data->{
            visited.add(cursor);
            JSONArray rows=data.optJSONArray("items"); if(rows==null)return;
            if(rows.length()==0 && cursor.isEmpty())a.subtitle("No results.");
            for(int i=0;i<rows.length();i++) if(rows.optJSONObject(i)!=null)row.row(rows.optJSONObject(i));
            String next=text(data,"nextCursor");
            if(!next.isEmpty() && !visited.contains(next)){
                Button more=a.button("Load more",()->{},false);
                more.setOnClickListener(v->{if(s.current()){more.setVisibility(View.GONE);loadPage(s,op,fields,folder,key,row,next,visited);}});
                a.add(a.content,more,4);
            }
        });
    }
    void directory(String title,Runnable back,Consumer<JSONObject> select){
        people(title,"",back,select);
    }
    void people(String title,String query,Runnable back,Consumer<JSONObject> select){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,title,back);
        EditText name=a.field(a.content,"Employee name",query,128,1);
        button(s,"Find people",()->people(title,name.getText().toString(),back,select));
        paged(s,"chat.directory",args("query",query),null,"",p->{
            if(!ChatRules.profile(text(p,"profileId")))return;
            String label=text(p,"name");
            for(String key:new String[]{"jobTitle","companyName","branchName"})if(!text(p,key).isEmpty())label+=" · "+text(p,key);
            button(s,label,()->{if(select!=null)select.accept(p);else person(p,()->people(title,query,back,null));});
        });
    }
    void person(JSONObject p,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,text(p,"name"),back);
        a.subtitle(text(p,"jobTitle")+"  "+text(p,"companyName")+"  "+text(p,"branchName"));
        String peer=text(p,"profileId");
        if(!text(p,"photoRef").isEmpty()) avatar(s,peer);
        button(s,"Message",()->openDirect(peer,back));
        button(s,"Report user",()->report(s,"user",peer));
        button(s,"Block private contact",()->block(s,peer,true,back));
    }
    void avatar(Screen s,String peer) {
        run(s,()->{
            File tmp=s.store.temp();
            try {
                s.api.download("/avatars/"+peer,null,tmp,5*1024*1024,-1);
                android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();
                options.inJustDecodeBounds=true;
                android.graphics.BitmapFactory.decodeFile(tmp.getPath(),options);
                options.inSampleSize=1;
                while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>512)options.inSampleSize*=2;
                options.inJustDecodeBounds=false;
                return android.graphics.BitmapFactory.decodeFile(tmp.getPath(),options);
            } finally { tmp.delete(); }
        },bitmap->{if(bitmap!=null){ImageView image=new ImageView(a);image.setImageBitmap(bitmap);image.setContentDescription("ERP profile photo");a.content.addView(image,new LinearLayout.LayoutParams(a.dp(72),a.dp(72)));}});
    }
    void openDirect(String peer,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_CONVERSATION,"Private conversation",back);
        if(!ChatRules.profile(peer)){a.message("Invalid ERP profile.",true);return;}
        JSONObject fields=args("peerProfileId",peer);
        run(s,()->s.api.mutate("chat.direct",fields),c->thread(c,"participant","",back));
    }
    void openConversation(String id,String message,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_CONVERSATION,"Open conversation",back);
        if(!ChatRules.uuid(id)||message!=null&&!message.isEmpty()&&!ChatRules.uuid(message)){a.message("Invalid message link.",true);return;}
        if(s.pilot){thread(args("id",id),"participant",message==null?"":message,back);return;}
        run(s,()->findConversation(s,id,"participant"),c->thread(c,"participant",message==null?"":message,back));
    }
    JSONObject findConversation(Screen s,String cid,String mode)throws Exception{
        String folder=conversationFolder(mode,cid);
        if(!online())return s.store.snapshot(folder,"conversation");
        try {
            JSONObject c=s.api.call("chat.conversation",args("conversationId",cid,"mode",mode));
            if(!cid.equals(id(c,"id")))throw new IOException("Incorrect ERP conversation.");
            required(c,"changeSeq");
            s.store.snapshot(folder,"conversation",c);
            return c;
        }catch(Exception e){if(blockedAccess(e))s.store.clear(folder);throw e;}
    }

    void thread(JSONObject c,String mode,String focus,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_CONVERSATION,a.communications.chatManualRefresh()?"Conversation":rowLabel(c),back);
        try { new ThreadView(s,c,mode,focus,back).show(); }catch(Exception e){notice(s,e);}
    }
    final class ThreadView {
        final Screen s; JSONObject c; final String cid,mode,folder; final boolean review;
        final Runnable back;
        String focus,reply="",self="",readThrough="",visibleJson="",dmsToken="";
        final LinkedHashSet<String> mentions=new LinkedHashSet<>();
        final Map<String,String> names=new HashMap<>();
        LinearLayout rows; EditText editor; TextView activity,replyLabel,conversationTitle;
        String cursor="",pageStart=""; boolean polling, loading;
        volatile long typedAt;
        int lastLease;
        final Runnable expireActivity=()->activity.setText("");
        ThreadView(Screen s,JSONObject c,String mode,String focus,Runnable back)throws Exception{
            this.s=s;this.c=c;this.mode=mode;this.focus=focus;this.back=back;
            cid=id(c,"id");folder=conversationFolder(mode,cid);review=mode.equals("review");
        }
        Runnable here(){return ()->thread(c,mode,"",back);}
        void show(){
            if(review)a.subtitle("Authorized history review");
            if(s.pilot){
                conversationTitle=a.text("",18,a.getColor(R.color.erp_text),true);
                a.add(a.content,conversationTitle,4);
                a.subtitle("Pilot mode · Refresh messages to check for updates.");
                button(s,"Refresh messages",()->load("",true));
                if(!review)button(s,"Check activity",()->{if(online())pulse(true);});
            }
            button(s,"Conversation details",()->{
                if(!s.historyVisible())return;
                if(!s.pilot || !online()){details(c,mode,here());return;}
                run(s,()->findConversation(s,cid,mode),latest->details(latest,mode,here()),e->{
                    if(blockedAccess(e))s.completeRefresh(false,true);
                    notice(s,e);
                });
            });
            activity=a.text("",14,a.getColor(R.color.erp_text_secondary),false); a.add(a.content,activity,4);
            rows=a.column();a.add(a.content,rows,8);
            if(s.pilot){
                s.hideProtected=this::hideHistory;
                s.refresh=()->load(pageStart,true,true);
            }
            if(!review){
                replyLabel=a.text("",14,a.getColor(R.color.erp_text_secondary),false);a.add(a.content,replyLabel,8);
                editor=a.field(a.content,"Message","",32000,android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
                editor.addTextChangedListener(new TextWatcher(){
                    public void beforeTextChanged(CharSequence v,int start,int count,int after){}
                    public void afterTextChanged(Editable e){}
                    public void onTextChanged(CharSequence v,int start,int before,int count){
                        long now=SystemClock.elapsedRealtime();boolean wasIdle=now-typedAt>4000;typedAt=now;
                        if(wasIdle && v.length()>0 && s.current() && online())pulse(!s.pilot);
                    }
                });
                button(s,"Mention member",()->pickMember(s,cid,mode,"Mention",p->{
                    String id=text(p,"profileId");if(ChatRules.profile(id)){mentions.add(id);editor.append("@"+text(p,"name")+" ");}
                }));
                button(s,"Add protected DMS link",()->ask(s,"Paste the recipient’s ERP document link","",link->{
                    String token=DmsRules.parseLink(link);
                    if(token==null){a.message("Select a valid ERP document share link.",true);return;}
                    dmsToken=token;replyLabel.setText("Protected ERP document attached");
                }));
                button(s,"Send",()->contribute(s,here(),()->queue(null,"","",false)));
                button(s,"Attach file",()->contribute(s,here(),()->pickFile(this)));
                button(s,"Record voice note",()->contribute(s,here(),()->microphone(this)));
            }
            load("",true);
            if(!review)run(s,()->{
                JSONObject caps=online()?s.api.call("chat.capabilities",args()):s.store.snapshot("cache","capabilities");
                if(online())s.store.snapshot("cache","capabilities",caps);
                return required(caps,"profileId");
            },v->{self=v;if(!s.pilot&&online())pulse(true);});
            schedule();
        }
        void hideHistory(){
            rows.removeAllViews();
            visibleJson="";
            names.clear();
            conversationTitle.setText("");
            main.removeCallbacks(expireActivity);
            activity.setText("");
            if(replyLabel!=null && !reply.isEmpty())replyLabel.setText("Reply selected");
        }
        void schedule(){
            long delay=pollDelay(s.pilot||a.communications.chatManualRefresh(),12_000);
            if(delay==0)return;
            main.postDelayed(()->{
                if(active!=s || a.communications.chatManualRefresh())return;
                if(lastLease!=interruption){loading=false;polling=false;lastLease=interruption;}
                if(s.current()&&online()&&!loading){
                    if(pageStart.isEmpty())load("",false,true);
                    if(!review){pulse(true);drain(s);}
                }
                schedule();
            },delay);
        }
        void pulse(boolean activityRequested){
            if(polling || !s.current() || !s.historyVisible())return;
            if(s.pilot && !s.pilotRefresh.beginActivity(SystemClock.elapsedRealtime()))return;
            polling=true;
            run(s,()->{
                boolean typing=typedAt>0&&SystemClock.elapsedRealtime()-typedAt<4500;
                if(activityRequested||typing)s.api.mutate("chat.pulse",args("conversationId",cid,"typing",typing));
                return activityRequested?s.api.call("chat.activity",args("conversationId",cid)):null;
            },r->{
                polling=false;
                if(r==null || !s.historyVisible())return;
                JSONArray people=r.optJSONArray("items");int typing=0,connected=0;String typer="";
                if(people!=null)for(int i=0;i<people.length();i++){
                    JSONObject p=people.optJSONObject(i);if(p==null||self.equals(text(p,"profileId")))continue;
                    if(p.optBoolean("online"))connected++;if(p.optBoolean("typing")){typing++;typer=names.getOrDefault(text(p,"profileId"),"Someone");}
                }
                activity.setText(typing>0?(typing==1?typer+" is typing…":typing+" people are typing…"):connected>0?(connected+" online"):"");
                if(s.pilot){
                    main.removeCallbacks(expireActivity);
                    main.postDelayed(expireActivity,typing>0?5_000:15_000);
                }
            },e->{polling=false;activity.setText("");});
        }
        void load(String start,boolean jump){load(start,jump,false);}
        void load(String start,boolean jump,boolean automatic){
            if(s.pilot && lastLease!=interruption){loading=false;polling=false;lastLease=interruption;}
            if(!s.current() || loading)return;
            boolean connectedAtStart=online();
            if(s.pilot && !s.pilotRefresh.begin(SystemClock.elapsedRealtime(),connectedAtStart,automatic))return;
            if(!s.historyVisible())s.hide();
            loading=true;
            String requested=focus;
            run(s,()->{
                boolean connected=s.pilot?connectedAtStart:online();
                JSONObject latest=connected?findConversation(s,cid,mode):s.store.snapshot(folder,"conversation");
                String change=required(latest,"changeSeq");
                if(connected&&!s.pilot)ChatManifest.refreshPages(s,latest,mode);
                String at=start;
                Set<String> seen=new HashSet<>();
                JSONObject data;
                do{
                    JSONObject args=args("conversationId",cid,"mode",mode,"limit",12);
                    if(!at.isEmpty())args.put("cursor",at);
                    String key="messages|"+at;
                    try {
                        data=connected?s.api.page("chat.messages",args):s.store.page(folder,key,change);
                    }catch(Exception e){
                        if(s.pilot && blockedAccess(e))s.store.clear(folder);
                        throw e;
                    }
                    JSONArray items=data.getJSONArray("items");
                    boolean found=false;
                    for(int i=0;i<items.length();i++){
                        JSONObject message=items.getJSONObject(i);
                        if(!cid.equals(id(message,"conversationId"))||!ChatRules.profile(required(message,"seq")))throw new IOException("Invalid chat history.");
                        if(id(message,"id").equals(requested))found=true;
                    }
                    if(connected){s.store.page(folder,key,change,data);s.store.snapshot(folder,"conversation",latest); }
                    if(!jump||requested.isEmpty()||found)break;
                    String next=text(data,"nextCursor");
                    if(next.isEmpty()||!seen.add(next))throw new IOException("The selected message is unavailable.");
                    at=next;
                }while(s.current());
                return args("page",data,"start",at,"online",connected,"conversation",latest);
            },result->{
                loading=false;
                s.completeRefresh(true,result.optBoolean("online"));
                if(!s.historyVisible()){
                    if(!connectedAtStart && online())s.refresh.run();
                    return;
                }
                if(s.pilot){c=result.optJSONObject("conversation");conversationTitle.setText(rowLabel(c));}
                pageStart=text(result,"start");
                JSONObject p=result.optJSONObject("page");
                if(p==null)return;
                cursor=text(p,"nextCursor");
                if(!p.toString().equals(visibleJson)||jump){visibleJson=p.toString();render(p,requested);}
                if(!review && result.optBoolean("online") && p.optJSONArray("items")!=null){
                    JSONObject newest=p.optJSONArray("items").optJSONObject(0);
                    String seq=text(newest,"seq");
                    if(!seq.isEmpty()&&!seq.equals(readThrough)){
                        run(s,()->s.api.mutate("chat.read",args("conversationId",cid,"upToSeq",seq)),r->readThrough=seq);
                    }
                }
                focus="";
            },e->{
                loading=false;
                s.completeRefresh(false,connectedAtStart);
                if(s.pilot && !connectedAtStart && online()){s.refresh.run();return;}
                if(!s.pilot && blockedAccess(e)){rows.removeAllViews();visibleJson="";run(s,()->{s.store.clear(folder);return true;},v->{});}
                notice(s,e);
            });
        }
        void render(JSONObject p,String selected){
            rows.removeAllViews();
            if(!online())rows.addView(a.text("Offline · cached history",14,a.getColor(R.color.erp_text_secondary),false));
            if(!cursor.isEmpty())rows.addView(a.button("Earlier messages",()->load(cursor,false),false));
            JSONArray items=p.optJSONArray("items"); if(items==null)return;
            if(items.length()==0) rows.addView(a.text("No messages yet.",16,a.getColor(R.color.erp_text_secondary),false));
            for(int i=items.length()-1;i>=0;i--){
                JSONObject m=items.optJSONObject(i);if(m==null)continue;
                boolean tomb=m.optBoolean("deleted")&&!review;
                if(!text(m,"senderName").isEmpty())names.put(text(m,"senderProfileId"),text(m,"senderName"));
                String label=text(m,"senderName")+"   "+text(m,"sentAt");
                if(m.optBoolean("forwarded")&&!tomb)label+=" · Forwarded";
                if(m.optBoolean("pinned")&&!tomb)label+=" · Pinned";
                if(m.optBoolean("starred")&&!tomb)label+=" · Starred";
                if(!text(m,"editedAt").isEmpty()&&!tomb)label+=" · Edited";
                if(m.optBoolean("deleted")&&review)label+=" · Deleted";
                JSONObject quote=m.optJSONObject("reply");
                if(!tomb&&quote!=null)label+="\n↳ "+(quote.optBoolean("deleted")?"Message deleted":text(quote,"body"));
                label+="\n"+(tomb?"Message deleted":text(m,"body"));
                JSONArray reactions=m.optJSONArray("reactions");
                if(!tomb&&reactions!=null)for(int j=0;j<reactions.length();j++)label+=" "+text(reactions.optJSONObject(j),"emoji");
                boolean highlight=text(m,"id").equals(selected);
                Button view=a.button(label,()->messageMenu(m),highlight);a.add(rows,view,6);
                if(highlight)view.post(()->{if(s.current())view.requestRectangleOnScreen(new android.graphics.Rect(0,0,view.getWidth(),view.getHeight()));});
                JSONArray files=m.optJSONArray("attachments");
                if(!tomb&&files!=null)for(int j=0;j<files.length();j++){
                    JSONObject f=files.optJSONObject(j);if(f==null||!cid.equals(text(f,"conversationId")))continue;
                    a.add(rows,a.button(text(f,"filename"),()->mediaAction(s,f,mode),false),2);
                    if(!review&&!self.isEmpty()&&wifi()&&!self.equals(text(m,"senderProfileId")))autoDownload(s,f,mode);
                }
                JSONObject ref=m.optJSONObject("dmsRef");
                if(!tomb && ref!=null) a.add(rows,a.button("Open protected DMS document",()->openDms(s,ref),false),2);
            }
            if(!pageStart.isEmpty())rows.addView(a.button("Latest messages",()->load("",true),false));
        }
        void messageMenu(JSONObject m){
            if(!s.current() || !s.historyVisible())return;
            String mid=text(m,"id");
            LinkedHashMap<String,Runnable> actions=new LinkedHashMap<>();
            if(!review && !m.optBoolean("deleted")){
                actions.put("Reply",()->{reply=mid;replyLabel.setText("Reply to "+text(m,"senderName")+": "+text(m,"body"));editor.requestFocus();});
                actions.put("Forward",()->forward(m,here()));
                actions.put("React",()->ask(s,"Emoji reaction","",emoji->{
                    boolean enabled=true;JSONArray reactions=m.optJSONArray("reactions");
                    if(reactions!=null)for(int i=0;i<reactions.length();i++){JSONObject r=reactions.optJSONObject(i);if(self.equals(text(r,"profileId"))&&emoji.equals(text(r,"emoji")))enabled=false;}
                    write(s,"chat.reaction",args("messageId",mid,"emoji",emoji,"enabled",enabled),()->load(pageStart,true));
                }));
                actions.put(m.optBoolean("starred")?"Remove star":"Star",()->write(s,"chat.star",args("messageId",mid,"enabled",!m.optBoolean("starred")),()->load(pageStart,true)));
                if(c.optBoolean("canPin")) actions.put(m.optBoolean("pinned")?"Unpin":"Pin",()->write(s,"chat.pin",args("messageId",mid,"enabled",!m.optBoolean("pinned")),()->load(pageStart,true)));
                boolean own=!self.isEmpty()&&self.equals(text(m,"senderProfileId"));
                boolean window=false;try{window=Instant.now().isBefore(Instant.parse(text(m,"sentAt")).plusSeconds(900));}catch(RuntimeException ignored){}
                if(own && window)actions.put("Edit",()->ask(s,"Edit message",text(m,"body"),body->write(s,"chat.edit",args("messageId",mid,"body",body,"expectedRevision",revision(m),"mentionProfileIds",m.optJSONArray("mentions")),()->load(pageStart,true))));
                if(own && window || !own && c.optBoolean("canManageMembers"))actions.put("Delete",()->confirm(s,"Delete message","Participants will see “Message deleted”.",()->write(s,"chat.delete",args("messageId",mid,"expectedRevision",revision(m)),()->load(pageStart,true))));
                if(own)actions.put("Read by",()->readers(m,here()));
            }
            actions.put("Report message",()->report(s,"chat_message",mid));
            if(ChatRules.profile(text(m,"senderProfileId"))&&!self.equals(text(m,"senderProfileId")))actions.put("Report sender",()->report(s,"user",text(m,"senderProfileId")));
            choice(s,"Message",new ArrayList<>(actions.keySet()),i->new ArrayList<>(actions.values()).get(i).run());
        }
        void queue(InputStreamSource file,String name,String mime,boolean voice){
            if(!s.current()||s.working)return;
            String originalText=editor.getText().toString();String body=originalText;
            String standalone=DmsRules.parseLink(body.trim());
            if(standalone!=null){dmsToken=standalone;body="";}
            else if(body.contains("/api/mobile/dms/shared#")||body.contains("algt-erp://dms/share/")){
                a.message("Use Add protected DMS link to attach this document.",true);return;
            }
            if(body.trim().isEmpty()&&file==null&&dmsToken.isEmpty()){a.message("Enter a message or select an attachment.",true);return;}
            s.working=true;
            String key=ChatRules.nextId();
            JSONObject d=args("id",key,"conversationId",cid,"title",rowLabel(c),"created",System.currentTimeMillis(),
                "generation",s.generation,"logout",s.store.logoutMarker(),"manual",false,"body",body,"reply",reply,"dmsToken",dmsToken,
                "mentions",new JSONArray(mentions),"filename",name,"mime",mime,"voice",voice,"reserveId",ChatRules.nextId());
            run(s,()->{
                try {
                    if(file!=null)try(InputStream in=file.open()){
                        if(in==null)throw new IOException("The selected file could not be opened.");
                        long n=s.store.seal("outbox/"+key,key,in);if(n==0)throw new IOException("Empty attachment.");
                        d.put("byteLength",n);
                    }
                    s.store.saveDraft(d); return true;
                }catch(Exception e){if(s.current())s.store.clear("outbox/"+key);throw e;}
                finally{if(file!=null)file.finish();}
            },ok->{s.working=false;if(editor.getText().toString().equals(originalText))editor.setText("");reply="";dmsToken="";replyLabel.setText("");mentions.clear();
                a.message(online()?"Saved to outbox. Sending…":"Queued on this phone.",false);
                if(online())run(s,()->send(s,d),v->{a.message("Message sent.",false);load("",true);});
            },e->{s.working=false;notice(s,e);});
        }
    }
    interface InputStreamSource { InputStream open() throws Exception; default void finish(){} }

    boolean send(Screen s,JSONObject draft)throws Exception{
        s.store.check();
        if(!s.store.pending(draft))throw new IOException("Review this draft and choose Send.");
        String cid=id(draft,"conversationId"), key=id(draft,"id");
        try{
            s.api.page("chat.members",args("conversationId",cid,"mode","participant","limit",1));
            JSONObject fields=args("conversationId",cid,"clientMutationId",key,"mentionProfileIds",draft.getJSONArray("mentions"));
            if(!text(draft,"body").isEmpty())fields.put("body",text(draft,"body"));
            String token=text(draft,"dmsToken");
            if(!token.isEmpty()){
                JSONObject doc=s.api.call("chat.resolveDmsReference",args("token",token));
                if(!token.equals(text(doc,"token"))||!ChatRules.profile(text(doc,"shareId")))throw new IOException("Protected document unavailable.");
                fields.put("dmsRef",args("shareId",text(doc,"shareId"),"token",token));
            }
            String reply=text(draft,"reply");if(!reply.isEmpty())fields.put("replyToMessageId",reply);
            if(draft.has("byteLength")){
                String upload=text(draft,"uploadId");
                if(upload.isEmpty()){
                    JSONObject reservation=args("conversationId",cid,"filename",text(draft,"filename"),"mime",text(draft,"mime"),
                        "byteLength",draft.getLong("byteLength"),"clientMutationId",required(draft,"reserveId"));
                    if(draft.optBoolean("voice"))reservation.put("kind","voice");
                    JSONObject reserved=s.api.mutate("chat.uploadBegin",reservation);
                    upload=id(reserved,"uploadId");draft.put("uploadId",upload);s.store.saveDraft(draft);
                }
                JSONObject status=s.api.call("chat.uploadStatus",args("uploadId",upload));
                if(!cid.equals(id(status,"conversationId")))throw new IOException("Incorrect upload reservation.");
                String state=required(status,"state");
                if(state.equals("reserved")){
                    File file=s.store.open("outbox/"+key,key);
                    try{s.api.upload(upload,text(draft,"mime"),file);}finally{file.delete();}
                    status=s.api.call("chat.uploadStatus",args("uploadId",upload));state=required(status,"state");
                }
                if(state.equals("failed")){
                    draft.put("manual",true);draft.remove("uploadId");draft.put("reserveId",ChatRules.nextId());
                    throw new IOException("The upload failed verification. Review the attachment before retrying.");
                }
                if(!state.equals("verified")&&!state.equals("attached"))throw new IOException("The ERP has not verified this attachment.");
                fields.put("uploadIds",new JSONArray().put(upload));
            }
            ChatRules.check(()->s.current()&&s.store.pending(draft));
            JSONObject receipt=s.api.mutate("chat.send",fields);
            id(receipt,"id");
            if(!cid.equals(id(receipt,"conversationId")))throw new IOException("Incorrect ERP send receipt.");
            s.store.clear("outbox/"+key);
            return true;
        }catch(Exception e){
            if(s.current()){
                if(e instanceof ErpApi.Rejected){
                    int code=((ErpApi.Rejected)e).status;
                    if(code>=400&&code<500&&code!=429)draft.put("manual",true);
                }
                draft.put("lastError",e.getMessage());s.store.saveDraft(draft);
            }
            throw e;
        }
    }
    void drain(Screen s){
        run(s,()->{
            for(JSONObject d:s.store.drafts())if(s.store.pending(d))send(s,d);
            return true;
        },v->{});
    }
    void outbox(Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Unsent messages",back);
        Runnable here=()->outbox(back);
        run(s,()->{
            List<JSONObject> rows=s.store.drafts();
            for(JSONObject d:rows){
                String cid=id(d,"conversationId");
                try{
                    findConversation(s,cid,"participant");
                    d.put("availableOnVisit",true);
                }catch(Exception e){
                    d.put("availableOnVisit",false);
                    d.put("accessMessage",e.getMessage());
                }
            }
            return rows;
        },rows->{
            if(rows.isEmpty())a.subtitle("No unsent messages on this phone.");
            for(JSONObject d:rows){
                if(!d.optBoolean("availableOnVisit")){
                    a.section("Protected unsent draft");
                    a.subtitle(text(d,"accessMessage"));
                    continue;
                }
                d.remove("availableOnVisit");d.remove("accessMessage");
                String title=text(d,"title"), error=text(d,"lastError");
                a.section(title);a.subtitle(text(d,"body"));
                if(!text(d,"filename").isEmpty())a.subtitle(text(d,"filename"));
                if(!text(d,"dmsToken").isEmpty())a.subtitle("Protected ERP document");
                a.subtitle(s.store.pending(d)?"Queued":"Draft · review before sending");
                if(!error.isEmpty())a.subtitle(error);
                button(s,"Send",()->confirm(s,"Send this draft?",title,()->run(s,()->{
                    findConversation(s,id(d,"conversationId"),"participant");
                    if(!online())throw new IOException("Connect to verify conversation access before sending this draft.");
                    d.put("generation",s.generation).put("logout",s.store.logoutMarker()).put("manual",false);
                    s.store.saveDraft(d);return send(s,d);
                },v->here.run())));
                button(s,"Discard draft",()->confirm(s,"Discard draft?","This removes the unsent copy from this phone.",()->run(s,()->{s.store.clear("outbox/"+id(d,"id"));return true;},v->here.run())));
            }
        });
    }
    void openDms(Screen s,JSONObject ref){
        String token=text(ref,"token");
        if(!s.current()||!DmsRules.tokenValid(token)||!ChatRules.profile(text(ref,"shareId")))return;
        a.dms.sharing.accept(new Intent(Intent.ACTION_VIEW,Uri.parse(DmsRules.LINK+token)));
        a.dms.sharing.resolve();
    }
    void stars(Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Starred messages",back);
        paged(s,"chat.stars",args(),null,"",m->button(s,text(m,"senderName")+" · "+text(m,"body"),()->openConversation(text(m,"conversationId"),text(m,"id"),()->stars(back))));
    }
    void readers(JSONObject m,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Read by",back);
        run(s,()->{
            Map<String,String> names=new HashMap<>();
            String cursor="";Set<String> seen=new HashSet<>();
            do{
                JSONObject fields=args("conversationId",id(m,"conversationId"),"mode","participant","limit",100);
                if(!cursor.isEmpty())fields.put("cursor",cursor);
                JSONObject page=s.api.page("chat.members",fields);
                JSONArray rows=page.getJSONArray("items");
                for(int i=0;i<rows.length();i++){JSONObject person=rows.getJSONObject(i);names.put(required(person,"profileId"),required(person,"name"));}
                cursor=text(page,"nextCursor");
            }while(!cursor.isEmpty()&&seen.add(cursor));
            return names;
        },names->paged(s,"chat.readers",args("messageId",text(m,"id")),null,"",r->{
            String id=text(r,"profileId");
            a.subtitle(names.getOrDefault(id,"ERP profile "+id)+" · "+text(r,"readAt"));
        }));
    }
    void forward(JSONObject m,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Forward to conversation",back);
        Select pick=c->button(s,rowLabel(c),()->confirm(s,"Forward message?",rowLabel(c),()->write(s,"chat.forward",args(
            "sourceMessageId",text(m,"id"),"destinationConversationId",text(c,"id"),"expectedRevision",revision(m)),back)));
        paged(s,"chat.conversations",args("mode","participant","archived",false),null,"",pick);
        button(s,"Archived destinations",()->paged(s,"chat.conversations",args("mode","participant","archived",true),null,"",pick));
    }
    void pickMember(Screen s,String cid,String mode,String title,Consumer<JSONObject> selected){
        selectPage(s,"chat.members",args("conversationId",cid,"mode",mode),title,selected);
    }
    void selectPage(Screen s,String op,JSONObject fields,String title,Consumer<JSONObject> selected){
        run(s,()->s.api.page(op,fields),p->{
            List<String> labels=new ArrayList<>();List<JSONObject> choices=new ArrayList<>();
            JSONArray rows=p.optJSONArray("items");
            for(int i=0;rows!=null&&i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null){choices.add(row);labels.add(text(row,"name")+" · "+text(row,"companyName"));}}
            String next=text(p,"nextCursor");if(!next.isEmpty())labels.add("More people");
            choice(s,title,labels,i->{if(i<choices.size())selected.accept(choices.get(i));else{
                try{fields.put("cursor",next);selectPage(s,op,fields,title,selected);}catch(Exception e){notice(s,e);}
            }});
        });
    }
    void createGroup(Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Create group",back);
        EditText name=a.field(a.content,"Group name","",160,1);
        TextView members=a.text("",16,a.getColor(R.color.erp_text),false);a.add(a.content,members,6);
        LinkedHashMap<String,String> selected=new LinkedHashMap<>();
        String[] lastIntent={"",""};
        button(s,"Choose member",()->ask(s,"Find employee","",q->selectPage(s,"chat.directory",args("query",q),"Choose member",p->{
            String id=text(p,"profileId");if(ChatRules.profile(id))selected.put(id,text(p,"name"));members.setText(String.join(", ",selected.values()));
        })));
        button(s,"Create",()->{
            if(s.working)return;s.working=true;
            JSONObject fields=args("name",name.getText().toString(),"memberProfileIds",new JSONArray(selected.keySet()));
            String fingerprint=fields.toString();
            if(!fingerprint.equals(lastIntent[0])){lastIntent[0]=fingerprint;lastIntent[1]=ChatRules.nextId();}
            try{fields.put("clientMutationId",lastIntent[1]);}catch(JSONException e){s.working=false;notice(s,e);return;}
            run(s,()->s.api.mutate("chat.groupCreate",fields),c->{s.working=false;thread(c,"participant","",back);},e->{s.working=false;notice(s,e);});
        });
    }
    void grant(JSONObject target,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Named permissions",back);
        a.subtitle(text(target,"name"));
        for(String kind:new String[]{"historyReview","groupCreate"}){
            String name=kind.equals("historyReview")?"Review all chat history":"Create chat groups";
            a.section(name);
            for(boolean enabled:new boolean[]{true,false})button(s,enabled?"Grant":"Revoke",()->confirm(s,name,(enabled?"Grant to ":"Revoke from ")+text(target,"name")+"?",()->write(s,"chat.namedGrant",args("targetProfileId",text(target,"profileId"),"kind",kind,"enabled",enabled),back)));
        }
    }
    void details(JSONObject c,String mode,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,rowLabel(c),back);
        String cid=text(c,"id");boolean participant=mode.equals("participant"),group=text(c,"kind").equals("group");
        Runnable refresh=()->run(s,()->findConversation(s,cid,mode),v->details(v,mode,back));
        button(s,"Shared media and files",()->media(c,mode,()->details(c,mode,back)));
        button(s,"Export transcript and attachments",()->export(c,mode,()->details(c,mode,back)));
        if(participant){
            button(s,c.optBoolean("muted")?"Unmute":"Mute",()->write(s,"chat.personal",args("conversationId",cid,"muted",!c.optBoolean("muted")),refresh));
            button(s,c.optBoolean("archived")?"Unarchive":"Archive",()->write(s,"chat.personal",args("conversationId",cid,"archived",!c.optBoolean("archived")),refresh));
            if(!group){String peer=text(c,"peerProfileId");button(s,"Report user",()->report(s,"user",peer));button(s,"Block private contact",()->block(s,peer,true,refresh));}
            else button(s,"Leave group",()->confirm(s,"Leave group?",rowLabel(c),()->groupChange(s,c,"leave","","",()->home(back))));
        }
        if(group){
            button(s,"Report group",()->report(s,"chat_thread",cid));
            if(c.optBoolean("canManageMembers")){
                button(s,"Rename group",()->ask(s,"Group name",rowLabel(c),name->groupChange(s,c,"rename","",name,refresh)));
                button(s,"Add member",()->ask(s,"Find employee","",q->selectPage(s,"chat.directory",args("query",q),"Add member",p->groupChange(s,c,"add",text(p,"profileId"),"",refresh))));
            }
            a.section("Members");
            paged(s,"chat.members",args("conversationId",cid,"mode",mode),null,"",p->button(s,text(p,"name")+" · "+text(p,"role"),()->{
                LinkedHashMap<String,Runnable> options=new LinkedHashMap<>();String peer=text(p,"profileId"),role=text(p,"role");
                options.put("Report user",()->report(s,"user",peer));
                if(c.optBoolean("canManageMembers")&&!role.equals("owner"))options.put("Remove member",()->groupChange(s,c,"remove",peer,"",refresh));
                if(c.optBoolean("canManageAdmins")&&!role.equals("owner"))options.put(role.equals("admin")?"Remove administrator":"Appoint administrator",()->groupChange(s,c,role.equals("admin")?"demote":"promote",peer,"",refresh));
                if(c.optBoolean("canManageAdmins")&&text(c,"ownerProfileId").isEmpty())options.put("Appoint replacement owner",()->groupChange(s,c,"replaceOwner",peer,"",refresh));
                choice(s,text(p,"name"),new ArrayList<>(options.keySet()),i->new ArrayList<>(options.values()).get(i).run());
            }));
        }
    }
    void groupChange(Screen s,JSONObject c,String action,String target,String name,Runnable done){
        JSONObject fields=args("conversationId",text(c,"id"),"action",action,"expectedRevision",revision(c));
        try{if(!target.isEmpty())fields.put("targetProfileId",target);if(action.equals("rename"))fields.put("name",name);}catch(Exception e){notice(s,e);return;}
        write(s,"chat.groupChange",fields,done);
    }
    void search(String mode,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Search chats",back);
        EditText query=a.field(a.content,"People, groups, messages or filenames","",240,1);
        final String[] sender={""};
        button(s,"Filter by sender",()->ask(s,"Find sender","",q->selectPage(s,"chat.directory",args("query",q),"Select sender",p->{
            sender[0]=text(p,"profileId");a.subtitle("Sender · "+text(p,"name"));
        })));
        EditText from=a.field(a.content,"From date (YYYY-MM-DD, optional)","",10,1);
        EditText until=a.field(a.content,"Through date (YYYY-MM-DD, optional)","",10,1);
        button(s,"Search",()->{
            try{
                JSONObject fields=args("mode",mode,"query",query.getText().toString());
                dates(fields,from,until);
                if(!sender[0].isEmpty())fields.put("senderProfileId",sender[0]);
                Screen r=page(MobileRoute.Id.CHAT_PAGE,"Search results",()->search(mode,back));
                Runnable returnTo=()->search(mode,back);
                paged(r,"chat.search",fields,null,"",hit->button(r,text(hit,"label")+" "+text(hit,"snippet"),()->{
                    if("person".equals(text(hit,"kind")))openDirect(text(hit,"id"),returnTo);
                    else run(r,()->findConversation(r,id(hit,"conversationId"),mode),c->thread(c,mode,text(hit,"messageId"),returnTo));
                }));
            }catch(Exception e){notice(s,e);}
        });
    }
    void dates(JSONObject fields,EditText fromBox,EditText throughBox)throws Exception{
        String low=fromBox.getText().toString().trim(),high=throughBox.getText().toString().trim();
        LocalDate from=low.isEmpty()?null:LocalDate.parse(low), through=high.isEmpty()?null:LocalDate.parse(high);
        if(from!=null&&through!=null&&through.isBefore(from))throw new IOException("The end date precedes the start date.");
        ZoneId zone=ZoneId.systemDefault();
        if(from!=null)fields.put("from",from.atStartOfDay(zone).toInstant().toString());
        if(through!=null)fields.put("until",through.plusDays(1).atStartOfDay(zone).toInstant().toString());
    }

    static final int ATTACH=7901, SAVE=7902, RECORD=7903;
    ThreadView micThread;
    static final class External {
        final int code;
        final Screen s;
        final Consumer<Uri> result;
        External(int code,Screen s,Consumer<Uri> result){this.code=code;this.s=s;this.result=result;}
    }
    void picker(Screen s,int code,Intent intent,Consumer<Uri> result){
        if(external!=null){a.message("Finish the open file selection first.",true);return;}
        external=new External(code,s,result);
        try{a.startActivityForResult(intent,code);}catch(RuntimeException e){external=null;notice(s,e);}
    }
    boolean activityResult(int code,int result,Intent intent){
        if(code!=ATTACH && code!=SAVE)return false;
        External x=external;external=null;
        if(x==null||x.code!=code||result!=Activity.RESULT_OK||intent==null)return true;
        Uri uri=intent.getData();
        if(uri!=null && "content".equals(uri.getScheme())) onResumeResult(x.s,()->x.result.accept(uri),0);
        return true;
    }
    void onResumeResult(Screen s,Runnable r,int attempt){
        if(active!=s || !LocalSecurity.isAccount(a,s.owner) || s.epoch!=s.erp.sessionEpoch() || s.generation!=LocalSecurity.generation(a)||!LocalSecurity.unlocked(a))return;
        if(s.current()){r.run();return;}
        if(attempt<30)main.postDelayed(()->onResumeResult(s,r,attempt+1),100);
    }
    void pickFile(ThreadView t){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        picker(t.s,ATTACH,i,uri->{
            run(t.s,()->{
                String name="";
                try(Cursor cursor=a.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){
                    if(cursor!=null&&cursor.moveToFirst()){
                        name=cursor.getString(0);
                        if(!cursor.isNull(1)&&cursor.getLong(1)>ChatRules.FILE_LIMIT)throw new IOException("Maximum attachment size is 50 MB.");
                    }
                }
                String mime=a.getContentResolver().getType(uri);
                if(mime==null||mime.contains("\r")||mime.contains("\n"))throw new IOException("The attachment type is unavailable.");
                return new String[]{ChatRules.filename(name),mime};
            },meta->confirm(t.s,"Send attachment?",meta[0],()->t.queue(()->a.getContentResolver().openInputStream(uri),meta[0],meta[1],false)));
        });
    }
    void microphone(ThreadView t){
        if(recorder!=null || micRequest!=null)return;
        confirm(t.s,"Record a voice note","Your microphone will record until you stop. You can review or discard the recording before sending.",()->{
            if(a.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){record(t);return;}
            micRequest=t.s;micThread=t;
            a.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},RECORD);
        });
    }
    boolean permissionResult(int code,String[] permissions,int[] results){
        if(code!=RECORD)return false;
        Screen s=micRequest;ThreadView t=micThread;micRequest=null;micThread=null;
        if(s!=null&&t!=null)onResumeResult(s,()->{
            if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)record(t);
            else a.message("Microphone permission is required to record a voice note.",true);
        },0);
        return true;
    }
    @SuppressWarnings("deprecation")
    void record(ThreadView t){
        stopAudio();
        try{
            recording=t.s.store.temp();
            recorder=Build.VERSION.SDK_INT>=31?new MediaRecorder(a):new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setMaxFileSize(ChatRules.FILE_LIMIT);
            recorder.setOutputFile(recording.getAbsolutePath());
            recorder.setOnErrorListener((r,w,e)->{if(recorder==r){stopAudio();notice(t.s,new IOException("Voice recording failed."));}});
            recorder.setOnInfoListener((r,w,e)->{if(recorder==r&&w==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)finishRecording(t);});
            recorder.prepare();recorder.start();
            a.message("Recording voice note",false);
            button(t.s,"Stop recording",()->finishRecording(t));
            button(t.s,"Discard recording",this::stopAudio);
        }catch(Exception e){stopAudio();notice(t.s,e);}
    }
    void finishRecording(ThreadView t){
        if(recorder==null||!t.s.current())return;
        MediaRecorder r=recorder;recorder=null;
        try{r.stop();}catch(RuntimeException e){stopAudio();notice(t.s,new IOException("The recording could not be completed."));return;}
        finally{r.release();}
        final File file=recording;
        if(file==null||file.length()==0||file.length()>ChatRules.FILE_LIMIT){stopAudio();notice(t.s,new IOException("Voice recording could not be saved."));return;}
        a.message("Voice note ready.",false);
        button(t.s,"Listen to recording",()->{if(file.equals(recording))play(t.s,file,false);});
        button(t.s,"Send voice note",()->{
            if(!file.equals(recording)||t.s.working)return;
            stopPlayer();recording=null;
            t.queue(new InputStreamSource(){public InputStream open()throws Exception{return new FileInputStream(file);} public void finish(){file.delete();}},"Voice note.m4a","audio/mp4",true);
        });
    }
    void play(Screen s,File file,boolean remove){
        if(!s.current()){if(remove)file.delete();return;}
        stopPlayer();
        try{
            playing=remove?file:null;player=new MediaPlayer();player.setDataSource(file.getAbsolutePath());
            player.setOnCompletionListener(p->{if(player==p)stopPlayer();});
            player.setOnErrorListener((p,w,e)->{if(player==p){stopPlayer();notice(s,new IOException("The audio file could not be played."));}return true;});
            player.prepare();player.start();
            button(s,"Stop playback",this::stopPlayer);
        }catch(Exception e){stopPlayer();notice(s,e);}
    }
    void stopPlayer(){
        if(player!=null){player.release();player=null;}
        if(playing!=null){playing.delete();playing=null;}
    }
    void stopAudio(){
        stopPlayer();
        if(video!=null){video.stopPlayback();video=null;}
        if(videoFile!=null){videoFile.delete();videoFile=null;}
        if(recorder!=null){try{recorder.stop();}catch(RuntimeException ignored){}recorder.release();recorder=null;}
        if(recording!=null){recording.delete();recording=null;}
    }
    void media(JSONObject c,String mode,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Shared media and files",back);
        String cid=text(c,"id");
        try {
            String folder=conversationFolder(mode,cid);
            run(s,()->findConversation(s,cid,mode),current->paged(s,"chat.media",args("conversationId",cid,"mode",mode),folder,text(current,"changeSeq"),
                f->{if(cid.equals(text(f,"conversationId")))button(s,text(f,"filename")+" · "+f.optLong("byteLength")+" bytes",()->mediaAction(s,f,mode));}));
        }catch(Exception e){notice(s,e);}
    }
    void cacheIncoming(Screen s,List<JSONObject> conversations){
        run(s,()->{
            JSONObject profile=s.store.snapshot("cache","capabilities");
            String self=required(profile,"profileId");
            for(JSONObject c:conversations) {
                if(!wifi())break;
                String cid=id(c,"id"),folder=conversationFolder("participant",cid);
                String latest=required(c,"latestSeq"),revision=required(c,"changeSeq");
                if(latest.equals("0"))continue;
                JSONObject checkpoint=s.store.get(folder,"wifi-position");
                long previous=checkpoint==null?-1:checkpoint.getLong("seq");
                if(previous>=Long.parseLong(latest))continue;
                String cursor="";Set<String> seen=new HashSet<>();
                boolean reached=false;
                do {
                    if(!wifi())return false;
                    JSONObject fields=args("conversationId",cid,"mode","participant","limit",12);
                    if(!cursor.isEmpty())fields.put("cursor",cursor);
                    JSONObject data=s.api.page("chat.messages",fields);
                    JSONArray rows=data.getJSONArray("items");
                    for(int i=0;i<rows.length();i++){
                        JSONObject m=rows.getJSONObject(i);
                        if(!cid.equals(id(m,"conversationId")))throw new IOException("Incorrect conversation in sync.");
                        if(Long.parseLong(required(m,"seq"))<=previous){reached=true;break;}
                        if(m.optBoolean("deleted")||self.equals(text(m,"senderProfileId")))continue;
                        JSONArray files=m.optJSONArray("attachments");
                        for(int j=0;files!=null&&j<files.length();j++){
                            JSONObject f=files.getJSONObject(j);
                            if(!cid.equals(id(f,"conversationId")))throw new IOException("Incorrect attachment in sync.");
                            if(!s.store.hasMedia(folder+"/files",id(f,"id")))download(s,f,"participant",true);
                        }
                    }
                    s.store.page(folder,"messages|"+cursor,revision,data);
                    cursor=text(data,"nextCursor");
                    // At first admission only the newest page is incoming on this phone.
                    if(previous<0)break;
                }while(!reached&&!cursor.isEmpty()&&seen.add(cursor));
                s.store.put(folder,"wifi-position",args("seq",latest));
            }
            return true;
        },v->{});
    }
    void autoDownload(Screen s,JSONObject f,String mode){
        run(s,()->{
            if(!wifi())return false;
            String folder=conversationFolder(mode,id(f,"conversationId"))+"/files",aid=id(f,"id");
            if(!s.store.hasMedia(folder,aid))download(s,f,mode,true);
            return true;
        },ok->{});
    }
    void download(Screen s,JSONObject f,String mode,boolean wifiOnly)throws Exception{
        String folder=conversationFolder(mode,id(f,"conversationId"))+"/files",aid=id(f,"id");
        long length=f.getLong("byteLength");
        if(length<1||length>ChatRules.FILE_LIMIT)throw new IOException("Invalid attachment size.");
        File tmp=s.store.temp();
        try{
            CommunicationsApi binary=new CommunicationsApi(s.erp,()->s.current()&&(!wifiOnly||wifi()));
            binary.download("/attachments/"+aid+"?mode="+mode,null,tmp,ChatRules.FILE_LIMIT,length);
            try(InputStream in=new FileInputStream(tmp)){s.store.seal(folder,aid,in);}
        }finally{tmp.delete();}
    }
    File materialize(Screen s,JSONObject f,String mode)throws Exception{
        String folder=conversationFolder(mode,id(f,"conversationId")),aid=id(f,"id");
        if(online())download(s,f,mode,false);
        else s.store.snapshot(folder,"conversation");
        if(!s.store.hasMedia(folder+"/files",aid))throw new IOException("Connect and tap the file to download it.");
        return s.store.open(folder+"/files",aid);
    }
    void mediaAction(Screen s,JSONObject f,String mode){
        String mime=text(f,"mime");
        List<String> options=new ArrayList<>();if(mime.startsWith("audio/"))options.add("Play audio");
        if(mime.startsWith("image/"))options.add("View image");
        if(mime.startsWith("video/"))options.add("Play video");
        if(mime.equals("application/pdf"))options.add("View PDF");
        options.add("Save a copy");options.add("Download to chat cache");
        choice(s,text(f,"filename"),options,i->{
            String act=options.get(i);
            if(act.equals("Save a copy"))save(s,text(f,"filename"),mime,()->materialize(s,f,mode));
            else if(act.equals("Download to chat cache"))run(s,()->{download(s,f,mode,false);return true;},ok->a.message("Downloaded on this phone.",false));
            else if(act.equals("Play video"))runFile(s,()->materialize(s,f,mode),file->playVideo(s,file,text(f,"filename")));
            else if(act.equals("View PDF"))viewPdf(s,f,mode,0);
            else if(act.equals("Play audio"))runFile(s,()->materialize(s,f,mode),file->play(s,file,true));
            else run(s,()->{
                File tmp=materialize(s,f,mode);
                try{
                    android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();
                    opts.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(tmp.getPath(),opts);
                    opts.inSampleSize=1;while(Math.max(opts.outWidth,opts.outHeight)/opts.inSampleSize>1600)opts.inSampleSize*=2;
                    opts.inJustDecodeBounds=false;
                    android.graphics.Bitmap bm=android.graphics.BitmapFactory.decodeFile(tmp.getPath(),opts);
                    if(bm==null)throw new IOException("Image preview unavailable.");return bm;
                }finally{tmp.delete();}
            },bm->{ImageView view=new ImageView(a);view.setImageBitmap(bm);view.setAdjustViewBounds(true);view.setContentDescription(text(f,"filename"));a.dialogBuilder().setTitle(text(f,"filename")).setView(view).setPositiveButton("Close",null).show();});
        });
    }
    void playVideo(Screen s,File file,String name){
        stopAudio();
        videoFile=file;video=new VideoView(a);VideoView view=video;
        MediaController controls=new MediaController(a);controls.setAnchorView(view);view.setMediaController(controls);
        android.app.AlertDialog dialog=a.dialogBuilder().setTitle(name).setView(view).setPositiveButton("Close",null).show();
        view.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
            public void onViewAttachedToWindow(View ignored){}
            public void onViewDetachedFromWindow(View ignored){if(video==view)stopAudio();}
        });
        view.setOnErrorListener((v,w,e)->{dialog.dismiss();notice(s,new IOException("Video playback unavailable."));return true;});
        view.setVideoURI(Uri.fromFile(file));view.start();
    }
    void viewPdf(Screen s,JSONObject f,String mode,int page){
        run(s,()->{
            File file=materialize(s,f,mode);
            try(android.os.ParcelFileDescriptor descriptor=android.os.ParcelFileDescriptor.open(file,android.os.ParcelFileDescriptor.MODE_READ_ONLY);
                android.graphics.pdf.PdfRenderer pdf=new android.graphics.pdf.PdfRenderer(descriptor);
                android.graphics.pdf.PdfRenderer.Page sheet=pdf.openPage(page)){
                double scale=1600.0/Math.max(sheet.getWidth(),sheet.getHeight());
                int width=Math.max(1,(int)(sheet.getWidth()*scale)),height=Math.max(1,(int)(sheet.getHeight()*scale));
                android.graphics.Bitmap image=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888);
                image.eraseColor(android.graphics.Color.WHITE);
                sheet.render(image,null,null,android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                return new Object[]{image,pdf.getPageCount()};
            }finally{file.delete();}
        },out->{
            ImageView view=new ImageView(a);view.setAdjustViewBounds(true);view.setImageBitmap((android.graphics.Bitmap)out[0]);
            int count=(Integer)out[1];
            android.app.AlertDialog.Builder dialog=a.dialogBuilder().setTitle(text(f,"filename")+" · "+(page+1)+"/"+count).setView(view).setPositiveButton("Close",null);
            if(page>0)dialog.setNeutralButton("Previous",(d,w)->{if(s.current())viewPdf(s,f,mode,page-1);});
            if(page+1<count)dialog.setNegativeButton("Next",(d,w)->{if(s.current())viewPdf(s,f,mode,page+1);});
            dialog.show();
        });
    }
    void runFile(Screen s,Job<File> job,Consumer<File> use){
        final int stamp=interruption;
        run(s,()->{
            File f=job.run();
            main.post(()->{if(s.current()&&stamp==interruption)use.accept(f);else f.delete();});
            return true;
        },ok->{});
    }
    void export(JSONObject c,String mode,Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Export conversation",back);
        a.subtitle("The ZIP includes the PDF transcript and permitted attachments. Leave dates empty for all history. Dates use "+ZoneId.systemDefault()+".");
        EditText from=a.field(a.content,"From date (YYYY-MM-DD)","",10,1);
        EditText until=a.field(a.content,"Through date (YYYY-MM-DD)","",10,1);
        button(s,"Save ZIP",()->{
            try{
                JSONObject filter=args("conversationId",id(c,"id"),"mode",mode);
                dates(filter,from,until);
                save(s,"Chat transcript.zip","application/zip",()->{
                    File file=s.store.temp();s.api.download("/export",filter,file,file.getParentFile().getUsableSpace(),-1);return file;
                });
            }catch(Exception e){notice(s,e);}
        });
    }
    void save(Screen s,String name,String mime,Job<File> source){
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,ChatRules.filename(name));
        picker(s,SAVE,i,uri->run(s,()->{
            File file=source.run();boolean complete=false,started=false;
            try{
                ChatRules.check(s::current);
                try(InputStream in=new FileInputStream(file);OutputStream out=a.getContentResolver().openOutputStream(uri,"wt")){
                    if(out==null)throw new IOException("Android could not open this destination.");
                    started=true;long copied=ChatRules.copy(in,out,file.length(),s::current);out.flush();if(copied!=file.length())throw new IOException("The file changed before saving.");
                }
                complete=true;
            }finally{
                file.delete();
                if(started&&!complete)try(OutputStream reset=a.getContentResolver().openOutputStream(uri,"wt")){}catch(Exception ignored){}
            }
            return true;
        },ok->a.message("File saved.",false)));
    }

    void safety(Runnable back){
        Screen s=page(MobileRoute.Id.CHAT_PAGE,"Privacy and safety",back);
        Runnable here=()->safety(back);
        button(s,"Blocked users",()->{
            Screen b=page(MobileRoute.Id.CHAT_PAGE,"Blocked users",here);
            run(b,()->safelist(b),rows->{
                if(rows.isEmpty())a.subtitle("No blocked users.");
                for(JSONObject p:rows){
                    String id=text(p,"targetProfileId");
                    String display=text(p,"displayName");
                    button(b,"Unblock "+(display.isEmpty()?"ERP profile "+id:display),()->block(b,id,false,here));
                }
            });
        });
        button(s,"Clear downloaded chat cache",()->confirm(s,"Clear chat cache?","This removes saved history and downloaded chat files from this phone. Your unsent drafts are kept.",()->run(s,()->{s.store.clear("cache");return true;},v->a.message("Chat cache cleared.",false))));
        run(s,()->policyStatus(s),p->policyDetails(s,p,here));
    }
    List<JSONObject> safelist(Screen s)throws Exception{
        JSONArray rows=s.api.call("policy.blocks",args()).getJSONArray("blocks");
        List<JSONObject> result=new ArrayList<>();
        for(int i=0;i<rows.length();i++){
            JSONObject p=rows.getJSONObject(i);
            if(!ChatRules.profile(required(p,"targetProfileId")))throw new IOException("Invalid blocked user.");
            result.add(p);
        }
        return result;
    }
    JSONObject policyStatus(Screen s)throws Exception{
        if(!online())return s.store.snapshot("policy","status");
        JSONObject p=s.api.call("policy.status",args());
        if(!(p.opt("accepted") instanceof Boolean))throw new IOException("Invalid policy response.");
        s.store.snapshot("policy","status",p);
        return p;
    }
    void policyDetails(Screen s,JSONObject p,Runnable done){
        String version=text(p,"currentVersion"),terms=text(p,"termsText");
        if(!terms.isEmpty()){a.section("Terms of use");a.subtitle(terms);}
        if("/communications-disclosure.html".equals(text(p,"privacyPath")))button(s,"Privacy disclosure",()->{
            try{a.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://erp.algt.net/communications-disclosure.html")));}
            catch(ActivityNotFoundException e){notice(s,e);}
        });
        if(version.isEmpty()||terms.isEmpty()){a.subtitle("Communications terms are awaiting publication.");return;}
        if(p.optBoolean("accepted")&&version.equals(text(p,"acceptedVersion"))){a.subtitle("Accepted policy "+version);return;}
        button(s,"Accept terms",()->write(s,"policy.accept",args("version",version),done));
    }
    void contribute(Screen s,Runnable returnTo,Runnable action){
        if(s.working)return;s.working=true;
        run(s,()->policyStatus(s),p->{
            s.working=false;
            String version=text(p,"currentVersion");
            if(!version.isEmpty()&&p.optBoolean("accepted")&&version.equals(text(p,"acceptedVersion")))action.run();
            else{
                a.message(version.isEmpty()?"Communications terms are awaiting publication.":"Accept the current communications terms before contributing.",true);
                button(s,"Review terms and privacy",()->safety(returnTo));
            }
        },e->{s.working=false;notice(s,e);});
    }
    void block(Screen s,String target,boolean blocked,Runnable done){
        if(!ChatRules.profile(target))return;
        confirm(s,blocked?"Block private contact?":"Unblock private contact?",
            blocked?"New private chat and private Walkie-Talkie contact stops in both directions. Existing history, directory access, shared groups and required channel broadcasts remain available.":"Eligible future private contact may resume. Unsent drafts require review.",
            ()->write(s,"policy.block",args("targetProfileId",target,"blocked",blocked),done));
    }
    void report(Screen s,String kind,String target){
        String[] reasons={"harassment_threats","hate_discrimination","sexual_exploitation","impersonation_spam","privacy","other"};
        choice(s,"Report "+kind.replace("chat_","").replace("_"," "),Arrays.asList("Harassment or threats","Hate or discrimination","Sexual or exploitative content","Impersonation or spam","Privacy misuse","Other"),i->ask(s,"Details for the moderation team (optional)","",details->{
            if(details.length()>1000){a.message("Use at most 1,000 characters for the report details.",true);return;}
            JSONObject fields=args("kind",kind,"targetId",target,"reason",reasons[i]);
            if(!details.isEmpty())try{fields.put("details",details);}catch(JSONException e){notice(s,e);return;}
            submitReport(s,fields);
        }));
    }
    void submitReport(Screen s,JSONObject fields){
        if(s.working)return;s.working=true;
        run(s,()->s.api.mutate("policy.report",fields),result->{
            s.working=false;String reference=text(result,"caseId");
            if(!ChatRules.uuid(reference)){a.message("Invalid ERP report receipt.",true);return;}
            a.message("Report submitted"+(reference.isEmpty()?".":" · "+reference),false);
        },e->{s.working=false;notice(s,e);button(s,"Retry report",()->submitReport(s,fields));});
    }
    volatile int interruption;
    volatile String closingOwner="";
    volatile long closingEpoch=-1;
    final ThreadLocal<Integer> operationStamp=new ThreadLocal<>();
    void pause(){
        interruption++;
        if(active!=null){active.working=false;active.suspend();}
        stopAudio();
    }
    void leaving(){
        if(active!=null)active.suspend();
        active=null;external=null;micRequest=null;micThread=null;
        stopAudio();
    }
    void beforeSignOut(String account)throws IOException{
        if(active!=null)active.suspend();
        active=null;
        closingEpoch=a.api.sessionEpoch();closingOwner=account;
        ChatStore.signOut(a,account);
    }
    void close(){
        closed=true;leaving();
        a.getApplication().unregisterActivityLifecycleCallbacks(lifecycle);
        if(watching!=null){watching.unregisterNetworkCallback(connectivity);watching=null;}
        worker.shutdownNow();
    }
}

