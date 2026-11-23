package net.algt.mobiledms;

import static net.algt.mobiledms.ErpApi.object;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.net.*;
import android.os.*;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.json.*;

/** Explicitly enabled foreground service. All state transitions and native peer disposal run on main. */
public final class PttService extends Service {
    static final String PREFS = "ptt-session-v1", START = "ptt.START", STOP = "ptt.STOP";
    static final int ONGOING = 13601, RESUME = 13602;
    static final String NOTICE = "ptt-session-v1";
    static final ExecutorService io = Executors.newCachedThreadPool();
    private static volatile PttService active;
    private final ExecutorService changes = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    final PttState state = new PttState();
    final Map<String,JSONObject> channels = new LinkedHashMap<>();
    private volatile boolean selectedGroup, selectedArchived;
    private final PttIncoming incoming = new PttIncoming();
    private volatile long playbackGeneration;
    private PttIncoming.Item delayed;
    private PttIncoming.Item waitingForAudio;
    private volatile boolean ended;
    private ErpApi erp;
    private String account, epoch, profile;
    private long login, revision, nextPoll;
    private volatile long lastMonitor = -1;
    private long reconnectDelay = 1000;
    private boolean microphone, polling, syncingPause, remotePaused, mutating, accepted;
    private boolean phoneCall;
    private PttAudioEngine publisher, receiver;
    private PttRecording recording;
    private String rxLease = "", rxChannel = "", rxLabel = "";
    private String rxStarted="";
    private long rxUntil;
    String status = "Checking live connection";
    PttRouting routes;
    private PttOverlay overlay;
    private ConnectivityManager connectivity;
    private final ConnectivityManager.NetworkCallback network = new ConnectivityManager.NetworkCallback() {
        @Override public void onLost(Network net) { main.post(() -> { if (!ended && !online()) offline(); }); }
    };
    static PttService forAccount(ErpApi api) {
        PttService live = active;
        return live != null && live.identity() && api != null && api.sessionEpoch() == live.login
            && live.account.equals(api.user()) ? live : null;
    }
    static void stopAccount(String owner) {
        PttService live=active;
        if(live!=null && owner!=null && owner.equals(live.account))live.stop();
    }
    String epoch() { return epoch; }
    private boolean identity() { return !ended && erp != null && login == erp.sessionEpoch() && account.equals(erp.user()); }
    private boolean sameLogin() { return erp != null && login == erp.sessionEpoch() && account.equals(erp.user()); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS,MODE_PRIVATE); }
    static boolean online(Context c) {
        ConnectivityManager manager = c.getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    boolean online() { return online(this); }
    boolean unlocked() { return !getSystemService(KeyguardManager.class).isDeviceLocked(); }
    boolean liveControls() { return identity() && unlocked() && online() && lastMonitor >= 0 && now()-lastMonitor <= PttState.MAX_STATUS_AGE_MS; }
    boolean canSOS(String id) {
        return liveControls() && selectedGroup(id);
    }
    boolean selectedGroup(String id) {return !id.isEmpty() && id.equals(state.selected) && selectedGroup && !selectedArchived;}
    static long now() { return SystemClock.elapsedRealtime(); }
    static long remaining(JSONObject data) {
        try { return Math.min(PttState.MAX_TURN_MS,Instant.parse(data.getString("expiresAt")).toEpochMilli()-System.currentTimeMillis()); }
        catch (Exception malformed) { return 0; }
    }
    static JSONObject call(ErpApi api,String op,JSONObject args,BooleanSupplier current) throws Exception {
        Object result = api.communicationsCall(object("op","ptt."+op,"args",args),current);
        if (!(result instanceof JSONObject)) throw new IOException("Invalid Walkie-Talkie response.");
        return (JSONObject)result;
    }
    static void start(LauncherActivity a,String grant,String availability,String profile,boolean accepted) {
        String account = a.api.user();
        SharedPreferences p = prefs(a);
        SharedPreferences.Editor edit = p.edit();
        if (!account.equals(p.getString("account","")) || a.api.sessionEpoch() != p.getLong("login",-1))
            edit.remove("selected").remove("overlay");
        edit.putString("account",account).putLong("login",a.api.sessionEpoch()).putString("epoch",grant)
            .putString("availability",availability).putBoolean("enabled",true).apply();
        Intent intent = new Intent(a,PttService.class).setAction(START)
            .putExtra("epoch",grant).putExtra("profile",profile).putExtra("accepted",accepted);
        a.startForegroundService(intent);
    }
    static void cancelReminder(Context c) { c.getSystemService(NotificationManager.class).cancel(RESUME); }
    static void clear(Context c,String owner) {
        SharedPreferences pref = prefs(c);
        if (owner.equals(pref.getString("account",""))) {
            pref.edit().remove("account").remove("epoch").remove("selected").remove("enabled").remove("overlay").apply();
            cancelReminder(c);
        }
    }
    static Notification.Builder notice(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(NOTICE,"Walkie-Talkie session",NotificationManager.IMPORTANCE_LOW);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(ch);
        Intent home = new Intent(c,LauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(c,ONGOING,home,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(c,NOTICE).setSmallIcon(R.drawable.nav_walkie_talkie)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setOnlyAlertOnce(true);
    }
    private Notification ongoing() {
        Intent stop = new Intent(this,PttService.class).setAction(STOP).putExtra("epoch",epoch);
        PendingIntent action = PendingIntent.getService(this,ONGOING,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return notice(this).setOngoing(true).setContentTitle("Walkie-Talkie").setContentText("Live session enabled")
            .addAction(new Notification.Action.Builder(null,"Stop",action).build()).build();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent==null) {
            // An OS recreation may offer recovery. Only a fresh foreground user action may enable audio.
            PttResumeReceiver.check(getApplicationContext(),()->main.post(()->stopSelf(startId)));
            return START_NOT_STICKY;
        }
        String supplied = intent == null ? null : intent.getStringExtra("epoch");
        if (intent == null || !START.equals(intent.getAction())) {
            if (STOP.equals(intent == null ? "" : intent.getAction()) && supplied != null
                && supplied.equals(prefs(this).getString("epoch",""))) {
                if (active == this) stop();
                else {
                    SharedPreferences saved=prefs(this);account=saved.getString("account","");login=saved.getLong("login",-1);
                    epoch=supplied;erp=new ErpApi(this);clear(this,account);stopRemote();stopSelf();
                }
            } else if (active != this) stopSelf();
            return START_NOT_STICKY;
        }
        if (active == this) return START_NOT_STICKY;
        SharedPreferences p = prefs(this);
        epoch = p.getString("epoch",""); account = p.getString("account",""); login = p.getLong("login",-1);
        if (!epoch.equals(supplied) || !p.getBoolean("enabled",false)) { stopSelf(); return START_NOT_STICKY; }
        erp = new ErpApi(this);
        if (!identity()) { clear(this,account); stopSelf(); return START_NOT_STICKY; }
        profile = intent.getStringExtra("profile");
        accepted=intent.getBooleanExtra("accepted",false);
        state.selected = p.getString("selected","");
        state.availability = p.getString("availability","available");
        microphone = checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ONGOING,ongoing(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK | (microphone && Build.VERSION.SDK_INT >= 30 ?
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0));
            else startForeground(ONGOING,ongoing());
        } catch (RuntimeException denied) { clear(this,account); stopRemote(); stopSelf(); return START_NOT_STICKY; }
        active = this; cancelReminder(this);
        connectivity = getSystemService(ConnectivityManager.class);
        connectivity.registerDefaultNetworkCallback(network);
        routes = new PttRouting(this,main,this::focusChanged);
        overlay = new PttOverlay(this);
        if ("available".equals(state.availability)) routes.acquire();
        main.post(tick);
        return START_STICKY;
    }
    private void stopRemote() {
        if (!sameLogin()) return;
        io.execute(() -> { try { call(erp,"stop",object("epoch",epoch),this::sameLogin); } catch (Exception ignored) {} });
    }
    void stop() { if (!ended) { clear(this,account); shutdown(); stopRemote(); stopSelf(); } }
    private void shutdown() {
        if (ended) return;
        ended = true;
        if (active == this) active = null;
        main.removeCallbacks(tick);
        release(false); interruptIncoming();
        if (overlay != null) overlay.close();
        if (routes != null) routes.close();
        if (connectivity != null) connectivity.unregisterNetworkCallback(network);
        changes.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
    }
    @Override public void onDestroy() {
        boolean unexpected = !ended && active == this;
        shutdown();
        if (unexpected) PttResumeReceiver.check(getApplicationContext(),() -> {});
        super.onDestroy();
    }
    private final Runnable tick = new Runnable() {
        public void run() {
            if (!identity()) { stop(); return; }
            NotificationManager manager=getSystemService(NotificationManager.class);
            NotificationChannel channel=manager.getNotificationChannel(NOTICE);
            if(!manager.areNotificationsEnabled() || (channel!=null && channel.getImportance()==NotificationManager.IMPORTANCE_NONE)){
                stop();return;
            }
            boolean calling=routes.call();
            if(phoneCall && !calling && "available".equals(state.availability)) routes.acquire();
            phoneCall=calling;
            focusChanged();
            if((receiver!=null || delayed!=null) && !soundAllowed())interruptIncoming();
            if (!online()) offline();
            if (lastMonitor >= 0 && now()-lastMonitor > PttState.MAX_STATUS_AGE_MS) offline();
            if (state.hold != null && (!unlocked() || !online() || routes.interrupted())) release(false);
            if (state.hold != null && state.hold.deadline > 0 && now() >= state.hold.deadline) release(true);
            if (receiver != null && now() >= rxUntil) closeReceive(true);
            if (receiver != null) receiver.checkInbound();
            if (online() && !polling && !mutating && now()>=nextPoll) monitor();
            if (overlay != null) overlay.update();
            main.postDelayed(this,900);
        }
    };
    private void offline() {
        revision++;
        lastMonitor = -1; state.status("none",-1); status = "Connection unavailable";
        release(false); interruptIncoming();
    }
    private void monitor() {
        polling = true;
        long version = revision, sampled = now();
        String target=state.selected;
        io.execute(() -> {
            try {
                JSONObject data = call(erp,"monitor",target.isEmpty()?object("epoch",epoch):
                    object("epoch",epoch,"selectedChannelId",target),this::identity);
                main.post(() -> {
                    polling = false;
                    if (!identity() || version != revision || mutating) return;
                    if (!epoch.equals(data.optString("epoch")) || data.optBoolean("stopped")) { stop(); return; }
                    if (now()-sampled > PttState.MAX_STATUS_AGE_MS) { offline(); return; }
                    try {
                        applyMonitor(data,sampled);
                        reconnectDelay=1000;
                        nextPoll="available".equals(state.availability)?0:sampled+4000;
                    } catch (JSONException bad) { offline(); }
                });
            } catch (Exception error) {
                main.post(() -> {
                    polling = false;
                    if (!identity() || version != revision) return;
                    if (error instanceof ErpApi.Rejected) {
                        int code = ((ErpApi.Rejected)error).status;
                        if (code == 401 || code == 403 || code == 404 || code == 409) { stop(); return; }
                    }
                    offline();
                    nextPoll=now()+reconnectDelay;
                    reconnectDelay=Math.min(15000,reconnectDelay*2);
                });
            }
        });
    }
    private void applyMonitor(JSONObject data,long sampled) throws JSONException {
        state.availability = data.getString("availability");
        remotePaused = data.getBoolean("paused");
        JSONArray items = data.getJSONArray("items");
        Map<String,JSONObject> previous = new HashMap<>(channels);
        channels.clear();
        Map<String,JSONObject> floors = new LinkedHashMap<>();
        for (int i=0;i<items.length();i++) {
            JSONObject row = items.getJSONObject(i);
            String id = row.getString("channelId");
            channels.put(id,row);
            JSONObject floor = row.optJSONObject("floor");
            if (floor != null && "live".equals(row.getString("admission"))
                && !floor.optString("speakerProfileId").equals(profile) && remaining(floor)>0) {
                floors.put(floor.getString("leaseId"),row);
            }
        }
        for (Map.Entry<String,JSONObject> old : previous.entrySet()) {
            JSONObject row=channels.get(old.getKey());
            if (row!=null && !row.optString("joinedAt").equals(old.getValue().optString("joinedAt")))
                PttHistory.revoke(this,erp,account,old.getKey());
        }
        lastMonitor = sampled;
        JSONObject selected = channels.get(state.selected);
        JSONObject confirmed=data.optJSONObject("selected");
        selectedGroup=false;selectedArchived=false;
        if(!state.selected.isEmpty()) {
            if(confirmed==null || !state.selected.equals(confirmed.optString("channelId"))) {
                PttHistory.revoke(this,erp,account,state.selected);
                release(false);state.select("","");prefs(this).edit().remove("selected").apply();
                selected=null;
            } else {
                state.name=confirmed.getString("name");
                selectedArchived=confirmed.optBoolean("archived");
                selectedGroup="group".equals(confirmed.optString("kind"));
            }
        }
        state.status(selected == null ? "none" : selected.getString("admission"),sampled);
        if (selected != null) state.name = selected.getString("name");
        focusChanged();
        PttState.Hold hold = state.hold;
        if (hold != null && !hold.lease.isEmpty()) {
            JSONObject floor = selected == null ? null : selected.optJSONObject("floor");
            if (!"live".equals(state.admission) || floor == null || !hold.lease.equals(floor.optString("leaseId"))) release(false);
        }
        if (!state.available() || routes.interrupted() || remotePaused || !soundAllowed()) interruptIncoming();
        else {
            if (delayed!=null && !channels.containsKey(delayed.channel)) interruptIncoming();
            if (!rxLease.isEmpty() && !floors.containsKey(rxLease)) closeReceive(channels.containsKey(rxChannel));
            List<PttIncoming.Item> observed=new ArrayList<>();
            for(Map.Entry<String,JSONObject> item : floors.entrySet()) {
                JSONObject row=item.getValue(), floor=row.getJSONObject("floor");
                observed.add(new PttIncoming.Item(item.getKey(),row.getString("channelId"),row.getString("name"),floor.optString("startedAt"),false));
            }
            observed.sort(Comparator.comparing(item->item.started));
            boolean occupied=receiver!=null || delayed!=null || state.hold!=null;
            incoming.observe(observed,channels.keySet(),true,occupied || waitingForAudio!=null);
            if (!occupied) {
                PttIncoming.Item next=waitingForAudio!=null ? waitingForAudio : incoming.poll();
                waitingForAudio=null;
                if(next!=null) {
                    if(!channels.containsKey(next.channel))return;
                    JSONObject live=floors.get(next.lease);
                    if(next.delayed || live==null) playDelayed(next);
                    else if(live.getJSONObject("floor").optBoolean("mediaReady")) listen(next.lease,live);
                    else waitingForAudio=next;
                }
            }
        }
        if ("Checking live connection".equals(status) || "Connection unavailable".equals(status)) status = "";
    }
    private void focusChanged() {
        if (!identity() || routes == null) return;
        boolean pause = "available".equals(state.availability) && routes.interrupted();
        if (state.paused != pause) {
            state.paused = pause; revision++;
            if (pause) { release(false); interruptIncoming(); }
        }
        if (lastMonitor < 0 || pause == remotePaused || syncingPause || mutating) return;
        syncingPause = true;
        changes.execute(() -> {
            try {
                JSONObject result = call(erp,"pause",object("epoch",epoch,"paused",pause),this::identity);
                main.post(() -> { if (identity()) { syncingPause=false; remotePaused=result.optBoolean("paused"); } });
            } catch (Exception error) { main.post(() -> { syncingPause=false; }); }
        });
    }
    void resumeFocus() { routes.acquire(); focusChanged(); }
    void acceptance(boolean current) { accepted=current;if(!accepted)release(false); }
    void availability(String next) {
        if (mutating || ended) return;
        mutating=true; revision++; lastMonitor=-1;
        release(false); interruptIncoming();
        changes.execute(() -> {
            try {
                JSONObject result = call(erp,"availability",object("epoch",epoch,"availability",next),this::identity);
                main.post(() -> {
                    if (!identity()) return;
                    mutating=false;
                    state.availability=result.optString("availability");
                    prefs(this).edit().putString("availability",state.availability).apply();
                    if ("available".equals(state.availability)) routes.acquire(); else routes.abandon();
                    status="Checking live connection";
                });
            } catch (Exception error) { main.post(() -> { mutating=false; offline(); }); }
        });
    }
    void select(String channel,String name) {
        if (!identity() || state.hold!=null) return;
        revision++; nextPoll=0; selectedGroup=false; state.select(channel,name);
        prefs(this).edit().putString("selected",channel).apply();
    }
    void press() {
        if (!identity() || !microphone || receiver != null && rxChannel.equals(state.selected)
            || checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            status = receiver != null ? "Channel busy" : "Microphone access required"; if(receiver!=null) busyTone(); return;
        }
        if (!accepted || mutating || selectedArchived || remotePaused || routes.interrupted() || delayed!=null) return;
        PttState.Hold h = state.down(online(),unlocked(),now());
        if (h == null) return;
        if(receiver!=null)incoming.replayFirst(new PttIncoming.Item(rxLease,rxChannel,rxLabel,rxStarted,true));
        closeReceive(false); status="Requesting to speak"; revision++;
        io.execute(() -> {
            try {
                JSONObject grant = call(erp,"press",object("epoch",epoch,"channelId",h.channel,"pressId",h.id),this::identity);
                main.post(() -> granted(h,grant));
            } catch (Exception denied) { main.post(() -> { if (state.hold == h) { release(false); status="Talk unavailable"; } }); }
        });
    }
    private void granted(PttState.Hold h,JSONObject data) {
        if (!data.optBoolean("granted")) {
            if (state.hold==h) {
                release(false); status="busy".equals(data.optString("reason")) ? "Channel busy" : "Talk unavailable";
                if ("Channel busy".equals(status)) busyTone();
            }
            return;
        }
        String lease=data.optString("leaseId");
        if (!identity() || !online() || !unlocked() || routes.interrupted() ||
            !state.grant(h,lease,remaining(data),now())) {
            releaseRemote(h.channel,lease,null,false);
            if (state.hold==h) release(false);
            return;
        }
        revision++;
        final PttRecording capture = new PttRecording(this,erp,account,epoch,h.channel,lease,this::sameLogin);
        recording=capture;
        status="Connecting audio";
        publisher = new PttAudioEngine(this,erp,epoch,h.channel,lease,true,
            () -> identity() && online() && unlocked() && now()<h.deadline,new PttAudioEngine.Listener() {
                public void connected() { if (state.hold==h) { h.connected=true; status="Transmitting"; } }
                public void failed() { if (state.hold==h) { release(false); status="Transmission interrupted"; } }
                public void samples(int rate,int channels,int format,byte[] pcm) { capture.samples(rate,channels,format,pcm); }
            });
        PttAudioEngine peer=publisher;
        io.execute(()->{
            try {
                if (!peer.current()) return;
                capture.prepare();
                if(peer.current()) peer.negotiate();
            } catch(Exception denied) {
                main.post(()->{if(state.hold==h){release(false);status="Recording unavailable · Talk ended";}});
            }
        });
        main.postDelayed(() -> { if (state.hold==h) release(true); },Math.max(0,h.deadline-now()));
    }
    void release(boolean complete) {
        PttState.Hold h=state.release();
        if (h==null) return;
        revision++;
        PttRecording record=recording; recording=null;
        PttAudioEngine peer=publisher; publisher=null;
        if(peer!=null)peer.stopMicrophone();
        if(record!=null) record.endCapture();
        if (peer!=null) peer.close();
        if (!h.lease.isEmpty()) releaseRemote(h.channel,h.lease,record,complete && h.connected && identity() && online());
        status="";
    }
    private void releaseRemote(String channel,String lease,PttRecording record,boolean complete) {
        io.execute(() -> {
            boolean released=false;
            try {
                JSONObject result=call(erp,"release",object("epoch",epoch,"channelId",channel,"leaseId",lease),this::sameLogin);
                String reason=result.optString("endReason","");
                released=result.getBoolean("released") || "released".equals(reason) || "expired".equals(reason);
            } catch (Exception ignored) {}
            finally { if(record!=null) record.finish(complete && released); }
        });
    }
    private boolean soundAllowed() {
        return routes.audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL &&
            getSystemService(NotificationManager.class).getCurrentInterruptionFilter()==NotificationManager.INTERRUPTION_FILTER_ALL;
    }
    private void busyTone() {
        if (!soundAllowed()) return;
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_VOICE_CALL,40);
            tone.startTone(ToneGenerator.TONE_PROP_NACK,110);
            main.postDelayed(tone::release,180);
        } catch (RuntimeException ignored) {}
    }
    private void listen(String lease,JSONObject row) {
        JSONObject floor=row.optJSONObject("floor");
        if(floor==null) return;
        rxChannel=row.optString("channelId"); rxLabel=row.optString("name"); rxLease=lease;rxStarted=floor.optString("startedAt");
        rxUntil=now()+Math.max(0,remaining(floor));
        final long deadline=rxUntil;
        receiver=new PttAudioEngine(this,erp,epoch,rxChannel,lease,false,() -> identity() && now()<deadline,
            new PttAudioEngine.Listener() {
                public void connected() { if (lease.equals(rxLease)) status="Receiving · "+rxLabel; }
                public void failed() { if (lease.equals(rxLease)) {
                    boolean retry=!receiver.receivedSamples && liveControls() && state.available();
                    PttIncoming.Item item=new PttIncoming.Item(lease,rxChannel,rxLabel,floor.optString("startedAt"),true);
                    closeReceive(false);
                    if(retry)playDelayed(item);else status="Incoming audio unavailable";
                } }
                public void samples(int rate,int channels,int format,byte[] data) {}
            });
        io.execute(receiver::negotiate);
    }
    private void closeReceive(boolean endedNormally) {
        if (receiver==null) return;
        boolean delivered=endedNormally && receiver.receivedSamples && identity();
        receiver.close(); receiver=null;
        String lease=rxLease,channel=rxChannel;
        rxLease=""; rxChannel=""; rxLabel="";
        if (delivered) PttHistory.received(this,erp,account,epoch,channel,lease,this::sameLogin);
        if (status.startsWith("Receiving")) status="";
    }
    private void interruptIncoming() {
        playbackGeneration++; delayed=null; waitingForAudio=null; incoming.interrupt(); closeReceive(false);
        if(status.startsWith("Delayed transmission"))status="";
    }
    private void playDelayed(PttIncoming.Item item) {
        delayed=item;
        long generation=++playbackGeneration;
        status="Delayed transmission · "+item.name+(item.started.isEmpty()?"":" · "+item.started);
        PttHistory.playQueued(this,erp,account,epoch,item.channel,item.lease,
            ()->playbackGeneration==generation && identity() && online(),()->main.post(()->{
                if(playbackGeneration==generation){delayed=null;status="";}
            }));
    }
    String display() {
        String selected = state.name.isEmpty() ? "Select a Talk destination" : "Talk to "+state.name;
        String detail = !online() ? "Offline · Talk unavailable" : state.paused ? "Audio paused" :
            !"available".equals(state.availability) ? ("busy".equals(state.availability) ? "Busy" : "Off-duty") :
            !status.isEmpty() ? status : selectedArchived ? "Archived" : "waiting".equals(state.admission) ? "Channel full · waiting" :
            !soundAllowed() ? "Incoming audio silenced by phone" :
            "live".equals(state.admission) ? "Connected" : "Disconnected";
        if (state.hold!=null && state.hold.connected) detail="Transmitting · "+Math.max(0,(state.hold.deadline-now()+999)/1000)+" s";
        return selected+"\n"+detail+(!microphone?" · Listen only":!accepted?" · Accept terms to talk":"");
    }
    boolean canTalk() { return identity() && microphone && accepted && !mutating && !selectedArchived && !remotePaused && delayed==null && !routes.interrupted()
        && state.canPress(online(),unlocked(),now()); }
    void setOverlay(boolean enabled) { prefs(this).edit().putBoolean("overlay",enabled).apply(); overlay.update(); }
}
