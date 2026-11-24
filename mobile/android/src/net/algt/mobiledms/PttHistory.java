package net.algt.mobiledms;

import android.content.Context;
import android.media.*;
import android.os.*;
import android.view.View;
import java.io.*;
import java.nio.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;
import static net.algt.mobiledms.ErpApi.object;

/** Activity history always requires the unlocked view. The live-service entry points use their own floor/session fences. */
final class PttHistory {
    private static final ExecutorService IO=Executors.newCachedThreadPool();
    private static final ScheduledExecutorService RECHECK=Executors.newScheduledThreadPool(2);
    private static final Set<String> RECOVERING=ConcurrentHashMap.newKeySet();
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private final LauncherActivity a;
    private final AtomicLong viewGeneration=new AtomicLong(), playGeneration=new AtomicLong();
    PttHistory(LauncherActivity a){this.a=a;}
    void home(String channel,Runnable back){page(channel,"participant",null,back);}
    void review(String channel,Runnable back){page(channel,"review",null,back);}
    void stopPlayback(){playGeneration.incrementAndGet();}
    static void openNotice(LauncherActivity a,String channel,String id) {
        if(!ChatRules.uuid(channel) || !ChatRules.uuid(id) || !a.communicationsSessionTicket().getAsBoolean())return;
        PttHistory screen=new PttHistory(a);
        Runnable back=()->screen.home(channel,()->a.mobile().home());
        a.page(MobileRoute.Id.PTT_HISTORY,back,false);a.title("PTT transmission");
        ErpApi erp=a.api;String owner=erp.user();BooleanSupplier visible=a.communicationsTicket();
        IO.execute(()->{try{
            JSONObject info=authorize(new CommunicationsApi(erp,visible),id,"participant",false);
            if(!channel.equals(info.getString("channelId")))throw new IOException("Transmission unavailable.");
            MAIN.post(()->{if(!visible.getAsBoolean())return;a.subtitle(info.optString("sender")+" · "+info.optString("startedAt"));
                a.action("Play transmission",()->{long play=screen.playGeneration.incrementAndGet();BooleanSupplier valid=()->visible.getAsBoolean() && play==screen.playGeneration.get();
                    IO.execute(()->{try{run(a,erp,owner,channel,id,"participant",valid,null,false);}catch(Exception e){screen.error(valid,e);}});},true);
            });
        }catch(Exception e){screen.error(visible,e);}});
    }
    private void page(String channel,String mode,String cursor,Runnable back) {
        stopPlayback();long generation=viewGeneration.incrementAndGet();
        a.page(MobileRoute.Id.PTT_HISTORY,()->{stopPlayback();back.run();},false);
        a.title(mode.equals("review")?"PTT history review":"PTT history");
        if (!ChatRules.uuid(channel)) {a.message("Select a channel to open history.",true);return;}
        BooleanSupplier ticket=a.communicationsTicket();
        BooleanSupplier current=()->generation==viewGeneration.get() && ticket.getAsBoolean();
        ErpApi erp=a.api;String owner=erp.user();
        PttService service=PttService.forAccount(erp);
        String liveEpoch=service==null?null:service.epoch();
        SosControl.history(a,channel,mode);
        a.action("Clear saved PTT audio on this phone",()->{
            android.app.AlertDialog d=new android.app.AlertDialog.Builder(a).setTitle("Clear saved PTT audio?")
                .setMessage("This removes all PTT audio saved on this phone for your account.")
                .setNegativeButton("Cancel",null).setPositiveButton("Clear",(dialog,which)->{
                    if(!current.getAsBoolean())return;
                    stopPlayback();
                    IO.execute(()->{try{new PttReplayCache(a,erp,owner,channel,mode,current).clearAccount();
                        MAIN.post(()->{if(current.getAsBoolean())page(channel,mode,null,back);});}catch(Exception e){error(current,e);}});
                }).create();a.showTrackedDialog(d);
        },false);
        a.content.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
            public void onViewAttachedToWindow(View v){}
            public void onViewDetachedFromWindow(View v){if(generation==viewGeneration.get())stopPlayback();v.removeOnAttachStateChangeListener(this);}
        });
        PttReplayCache cache=new PttReplayCache(a,erp,owner,channel,mode,current);
        IO.execute(()->{
            try{
                List<JSONObject> rows=new ArrayList<>();String more="";
                if(PttService.online(a)) {
                    JSONObject args=object("channelId",channel,"mode",mode);
                    if(cursor!=null)args.put("cursor",cursor);
                    JSONObject result=new CommunicationsApi(erp,current).page("pttRecording.history",args);
                    cache.learn(result.isNull("episode")?"":result.getString("episode"));
                    JSONArray items=result.getJSONArray("items");
                    for(int i=0;i<items.length();i++)rows.add(items.getJSONObject(i));
                    if(!result.isNull("nextCursor"))more=result.getString("nextCursor");
                    reconcileCache(erp,current,cache,channel,mode);
                    if(mode.equals("participant") && liveEpoch!=null)recoverReceived(a,erp,owner,liveEpoch,channel,current);
                } else rows=cache.saved();
                final List<JSONObject> items=rows;final String next=more;
                MAIN.post(()->{
                    if(!current.getAsBoolean())return;
                    if(items.isEmpty())a.subtitle("No transmissions available.");
                    for(JSONObject row:items) {
                        String id=row.optString("id"),state=row.optString("state","sent");
                        String title=row.optString("sender","User "+row.optString("senderProfileId"))+" · "+row.optString("startedAt");
                        a.section(title);
                        if(state.equals("sent"))a.action("Play · "+Math.max(1,Math.round(row.optLong("durationMs")/1000f))+" s",()->{
                            long play=playGeneration.incrementAndGet();
                            BooleanSupplier playing=()->playGeneration.get()==play && current.getAsBoolean();
                            IO.execute(()->{try{run(a,erp,owner,channel,id,mode,playing,null,false);}
                              catch(Exception e){error(playing,e);}});
                        },false);
                        else a.subtitle(state.equals("failed")?"Transmission interrupted · no recording":"Processing recording");
                        if(mode.equals("participant") && PttService.online(a))
                            a.action("Report transmission",()->report(id,current),false);
                        if(row.optBoolean("mine") && mode.equals("participant") && PttService.online(a))
                            a.action("Recipient status",()->recipients(id,null,current),false);
                        if(!row.isNull("played") && !row.optBoolean("mine"))a.subtitle(row.optBoolean("played")?"Played":"Unheard");
                    }
                    if(!next.isEmpty())a.action("Older transmissions",()->page(channel,mode,next,back),false);
                });
            }catch(Exception e){invalidateOnDenial(cache,e);error(current,e);}
        });
    }
    private void report(String id,BooleanSupplier current) {
        String[] labels={"Harassment or threats","Hate or discrimination","Privacy misuse","Other"};
        String[] reasons={"harassment_threats","hate_discrimination","privacy","other"};
        a.showTrackedDialog(a.dialogBuilder().setTitle("Report transmission").setItems(labels,(dialog,which)->{
            if(!current.getAsBoolean())return;
            IO.execute(()->{try{
                new CommunicationsApi(a.api,current).mutate("policy.report",object("kind","ptt_transmission","targetId",id,"reason",reasons[which]));
                MAIN.post(()->{if(current.getAsBoolean())a.message("Report submitted.",false);});
            }catch(Exception e){error(current,e);}});
        }).create());
    }
    private void recipients(String id,String cursor,BooleanSupplier current) {
        IO.execute(()->{try{
            JSONObject args=object("recordingId",id,"mode","participant");
            if(cursor!=null)args.put("afterProfileId",cursor);
            JSONObject page=new CommunicationsApi(a.api,current).page("pttRecording.recipients",args);
            StringBuilder text=new StringBuilder();JSONArray rows=page.getJSONArray("items");
            for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);text.append(r.optString("name")).append(" · ").append(r.optString("state")).append('\n');}
            MAIN.post(()->{if(!current.getAsBoolean())return;
                android.app.AlertDialog.Builder d=new android.app.AlertDialog.Builder(a).setTitle("Recipient status")
                    .setMessage(text.length()==0?"No other recipients.":text.toString()).setNegativeButton("Close",null);
                if(!page.isNull("nextCursor"))d.setPositiveButton("More",(dialog,which)->recipients(id,page.optString("nextCursor"),current));
                a.showTrackedDialog(d.create());
            });
        }catch(Exception e){error(current,e);}});
    }
    private void error(BooleanSupplier current,Exception e){
        MAIN.post(()->{if(current.getAsBoolean())a.message("PTT history is unavailable. Check your connection and current access.",true);});
    }
    private static void invalidateItem(PttReplayCache cache,CommunicationsApi api,String channel,String id,String mode,Exception error) {
        if(!(error instanceof ErpApi.Rejected))return;
        int status=((ErpApi.Rejected)error).status;
        if(status!=401 && status!=403 && status!=404)return;
        try{
            JSONObject checked=api.call("pttRecording.cacheCheck",object("channelId",channel,"mode",mode,"ids",new JSONArray().put(id)));
            if(checked.getJSONArray("ids").length()==0){cache.remove(id);cache.heard(id,false);}
        }catch(Exception unconfirmed){try{cache.clear();}catch(Exception ignored){}}
    }
    static void revoke(Context c,ErpApi erp,String owner,String channel) {
        try {new PttReplayCache(c,erp,owner,channel,"participant",()->owner.equals(erp.user())).clear();}
        catch(Exception ignored){}
    }
    static void received(Context c,ErpApi erp,String owner,String epoch,String channel,String id,BooleanSupplier current){
        IO.execute(()->{try{
            PttReplayCache cache=new PttReplayCache(c,erp,owner,channel,"participant",current);
            cache.heard(id,true);
            if(!recoverOne(c,erp,owner,epoch,channel,id,current,cache)) {
                for(int delay:new int[]{15,90})RECHECK.schedule(()->{
                    if(current.getAsBoolean() && PttService.online(c))recoverReceived(c,erp,owner,epoch,channel,current);
                },delay,TimeUnit.SECONDS);
            }
        }catch(Exception ignored){}});
    }
    static void recoverReceived(Context c,ErpApi erp,String owner,String epoch,String channel,BooleanSupplier current) {
        IO.execute(()->{try{
            PttReplayCache cache=new PttReplayCache(c,erp,owner,channel,"participant",current);
            for(String id:cache.heard()){ChatRules.check(current);recoverOne(c,erp,owner,epoch,channel,id,current,cache);}
        }catch(Exception ignored){}});
    }
    private static boolean recoverOne(Context c,ErpApi erp,String owner,String epoch,String channel,String id,BooleanSupplier current,PttReplayCache cache) {
        String key=owner+"/"+erp.sessionEpoch()+"/"+id;
        if(!RECOVERING.add(key))return true;
        try{run(c,erp,owner,channel,id,"participant",current,epoch,true);cache.heard(id,false);return true;}
        catch(Exception unavailable){return false;}
        finally{RECOVERING.remove(key);}
    }
    static void playQueued(Context c,ErpApi erp,String owner,String epoch,String channel,String id,BooleanSupplier current,Runnable done){
        IO.execute(()->{try{run(c,erp,owner,channel,id,"participant",current,epoch,false);}
            catch(Exception ignored){}finally{MAIN.post(done);}});
    }
    private static void invalidateOnDenial(PttReplayCache cache,Exception e) {
        if(e instanceof ErpApi.Rejected) {
            int code=((ErpApi.Rejected)e).status;
            if(code==401 || code==403 || code==404)try{cache.clear();}catch(Exception ignored){}
        }
    }
    private static JSONObject authorize(CommunicationsApi client,String id,String mode,boolean wait) throws Exception {
        return authorize(client,id,mode,wait,null,null);
    }
    private static JSONObject authorize(CommunicationsApi client,String id,String mode,boolean wait,String epoch,String channel) throws Exception {
        String op=epoch==null?"pttRecording.authorize":"pttRecording.liveAuthorize";
        JSONObject args=object("recordingId",id,"mode",mode);
        if(epoch!=null){args.put("epoch",epoch);args.put("channelId",channel);}
        long deadline=SystemClock.elapsedRealtime()+(wait?90000:0);
        int delay=400;
        while(true){
            try{return client.call(op,args);}
            catch(ErpApi.Rejected pending){
                if(pending.status!=409 || SystemClock.elapsedRealtime()>=deadline)throw pending;
                ChatRules.check(client.current); Thread.sleep(delay);delay=Math.min(4000,delay*2);
            }
        }
    }
    private static byte[] fetch(ErpApi erp,JSONObject info,String mode,BooleanSupplier current) throws Exception {
        String id=CommunicationsApi.id(info,"id");int limit=info.getInt("byteSize");
        if(limit<=44 || limit>PttWave.LIMIT)throw new IOException("Invalid recording size.");
        HttpsURLConnection c=erp.communicationsConnection("/ptt/recordings/"+id+"?mode="+mode,"GET",current);
        try{
            int status=c.getResponseCode();
            if(status!=200)throw new ErpApi.Rejected("Recording unavailable.",status,null);
            if(!"audio/wav".equals(c.getContentType()) || c.getContentLengthLong()!=limit)throw new IOException("Invalid audio response.");
            try(InputStream in=c.getInputStream()){
                byte[] b=new byte[limit];int pos=0;
                while(pos<b.length){ChatRules.check(current);int n=in.read(b,pos,Math.min(32768,b.length-pos));if(n<0)throw new EOFException();pos+=n;}
                if(in.read()!=-1 || !PttWave.hash(b).equals(info.getString("sha256")))throw new IOException("Recording verification failed.");
                return b;
            }
        }finally{c.disconnect();}
    }
    private static void receipt(CommunicationsApi client,String id,String event)throws Exception{
        client.call("pttRecording.receipt",object("recordingId",id,"mode","participant","event",event));
    }
    private static void reconcileCache(ErpApi erp,BooleanSupplier current,PttReplayCache cache,String channel,String mode) throws Exception {
        CommunicationsApi client=new CommunicationsApi(erp,current);List<JSONObject> items=cache.saved();
        for(int pos=0;pos<items.size();pos+=100) {
            List<JSONObject> group=items.subList(pos,Math.min(pos+100,items.size()));JSONArray ids=new JSONArray();
            for(JSONObject item:group)ids.put(item.getString("id"));
            JSONArray response=client.call("pttRecording.cacheCheck",object("channelId",channel,"mode",mode,"ids",ids)).getJSONArray("ids");
            Set<String> allowed=new HashSet<>();for(int i=0;i<response.length();i++)allowed.add(response.getString(i));
            for(JSONObject item:group){
                String id=item.getString("id");
                if(!allowed.contains(id)){cache.remove(id);continue;}
                if(mode.equals("participant") && item.optBoolean("pendingPlayed")){receipt(client,id,"played");cache.ack(id);}
            }
        }
    }
    private static void run(Context ctx,ErpApi erp,String owner,String channel,String id,String mode,BooleanSupplier current,
                            String epoch,boolean alreadyHeard) throws Exception {
        boolean live=epoch!=null;
        long session=erp.sessionEpoch();
        BooleanSupplier allowed=()->current.getAsBoolean() && session==erp.sessionEpoch() && owner.equals(erp.user());
        PttReplayCache cache=new PttReplayCache(ctx,erp,owner,channel,mode,allowed);
        CommunicationsApi client=new CommunicationsApi(erp,allowed);
        byte[] bytes=null;
        try{
            ChatRules.check(allowed);boolean online=PttService.online(ctx);
            if(live && !online)throw new IOException("Live connection ended.");
            JSONObject info=online?authorize(client,id,mode,live,epoch,channel):cache.metadata(id);
            if(live && info!=null && "failed".equals(info.optString("state")))return;
            if(info==null || !channel.equals(info.getString("channelId")))throw new IOException("Recording unavailable.");
            if(online)cache.learn(info.isNull("episode")?"":info.getString("episode"));
            long cacheRevision=cache.revision();
            AtomicBoolean permission=new AtomicBoolean(true);
            BooleanSupplier authorized=()->permission.get() && allowed.getAsBoolean() && cacheRevision==cache.revision();
            bytes=cache.read(info);
            if(bytes==null && online)bytes=fetch(erp,info,mode,authorized);
            if(bytes==null)throw new IOException("Connect to load this recording.");
            if(online && mode.equals("participant"))receipt(client,id,"delivered");
            if(!alreadyHeard){
                ScheduledFuture<?> watcher=RECHECK.scheduleWithFixedDelay(()->{
                    if(!authorized.getAsBoolean() || !PttService.online(ctx))return;
                    try{authorize(client,id,mode,false,epoch,channel);}
                    catch(Exception denied){permission.set(false);invalidateItem(cache,client,channel,id,mode,denied);}
                },3,3,TimeUnit.SECONDS);
                try{play(ctx,bytes,authorized,live);}finally{watcher.cancel(false);}
            }
            ChatRules.check(authorized);
            if(online)authorize(client,id,mode,false,epoch,channel);
            ChatRules.check(authorized);cache.save(info,bytes,mode.equals("participant"),cacheRevision);
            if(mode.equals("participant") && PttService.online(ctx)){receipt(client,id,"played");cache.ack(id);}
        }catch(Exception e){invalidateItem(cache,client,channel,id,mode,e);throw e;}finally{if(bytes!=null)Arrays.fill(bytes,(byte)0);}
    }
    @SuppressWarnings("deprecation")
    private static void play(Context ctx,byte[] wav,BooleanSupplier current,boolean live) throws Exception {
        ByteBuffer header=ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        int channels=header.getShort(22),hz=header.getInt(24),mask=channels==1?AudioFormat.CHANNEL_OUT_MONO:AudioFormat.CHANNEL_OUT_STEREO;
        if(wav.length<=44 || channels<1 || channels>2 || hz<8000 || hz>192000 || header.getInt(40)!=wav.length-44)throw new IOException("Invalid audio.");
        AtomicBoolean focus=new AtomicBoolean(true);AudioManager manager=ctx.getSystemService(AudioManager.class);
        AudioManager.OnAudioFocusChangeListener listener=change->{if(change<0)focus.set(false);};
        if(!live && manager.requestAudioFocus(listener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
            throw new IOException("Audio output unavailable.");
        AudioTrack track=null;
        try {
            track=new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(live?AudioAttributes.USAGE_VOICE_COMMUNICATION:AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(hz).setChannelMask(mask).build())
                .setBufferSizeInBytes(Math.max(hz*channels/5,AudioTrack.getMinBufferSize(hz,mask,AudioFormat.ENCODING_PCM_16BIT)))
                .setTransferMode(AudioTrack.MODE_STREAM).build();
            track.play();int pos=44; long deadline=SystemClock.elapsedRealtime()+65000;
            while(pos<wav.length || track.getPlaybackHeadPosition()<(wav.length-44)/(2*channels)){
                ChatRules.check(current);
                if(!focus.get() || SystemClock.elapsedRealtime()>deadline)throw new IOException("Playback interrupted.");
                if(pos<wav.length){int n=track.write(wav,pos,Math.min(8192,wav.length-pos),AudioTrack.WRITE_NON_BLOCKING);
                    if(n<0)throw new IOException("Audio output unavailable.");pos+=n;}
                Thread.sleep(8);
            }
        }finally{if(track!=null){try{track.pause();track.flush();}finally{track.release();}}
            if(!live)manager.abandonAudioFocus(listener);}
    }
}
