package net.algt.mobiledms;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import org.webrtc.*;
import org.webrtc.audio.JavaAudioDeviceModule;

import static net.algt.mobiledms.ErpApi.object;

/** One peer, factory and audio device module per turn. A receive peer never owns an AudioSource. */
final class PttAudioEngine implements AutoCloseable {
    interface Listener {
        void connected();
        void failed();
        void samples(int rate, int channels, int format, byte[] data);
    }
    private static boolean initialized;
    private static synchronized void initialize(Context context) {
        if (initialized) return;
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context)
            .createInitializationOptions());
        initialized = true;
    }
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Context context;
    private final ErpApi api;
    private final String epoch, channel, lease;
    private final BooleanSupplier authorized;
    private final boolean publish;
    private final Listener listener;
    private final CompletableFuture<Void> gathered = new CompletableFuture<>();
    private volatile boolean closed, capturing;
    private volatile boolean negotiated, transportConnected, reported;
    private volatile boolean outputStarted;
    private JavaAudioDeviceModule device;
    private PeerConnectionFactory factory;
    private PeerConnection peer;
    private AudioSource source;
    private AudioTrack track;
    private RtpTransceiver transceiver;

    PttAudioEngine(Context c, ErpApi api, String epoch, String channel, String lease,
                   boolean publish, BooleanSupplier authorized, Listener listener) {
        context = c.getApplicationContext();
        this.api = api; this.epoch = epoch; this.channel = channel; this.lease = lease;
        this.publish = publish; this.authorized = authorized; this.listener = listener;
    }
    boolean current() { return !closed && authorized.getAsBoolean(); }
    private void check() throws IOException { if (!current()) throw new IOException("Transmission ended."); }
    private JSONObject signal(String action, Object... fields) throws Exception {
        JSONObject args = object(fields);
        args.put("epoch",epoch).put("channelId",channel).put("action",action)
            .put("signalId",UUID.randomUUID().toString());
        check();
        return (JSONObject)api.communicationsCall(object("op","ptt.signal","args",args),this::current);
    }
    private synchronized void create() throws Exception {
        check();
        initialize(context);
        JavaAudioDeviceModule.Builder audio = JavaAudioDeviceModule.builder(context);
        audio.setAudioRecordErrorCallback(new JavaAudioDeviceModule.AudioRecordErrorCallback(){
            public void onWebRtcAudioRecordInitError(String message){fail();}
            public void onWebRtcAudioRecordStartError(JavaAudioDeviceModule.AudioRecordStartErrorCode code,String message){fail();}
            public void onWebRtcAudioRecordError(String message){fail();}
        });
        audio.setAudioTrackErrorCallback(new JavaAudioDeviceModule.AudioTrackErrorCallback(){
            public void onWebRtcAudioTrackInitError(String message){fail();}
            public void onWebRtcAudioTrackStartError(JavaAudioDeviceModule.AudioTrackStartErrorCode code,String message){fail();}
            public void onWebRtcAudioTrackError(String message){fail();}
        });
        if (!publish) audio.setPlaybackSamplesReadyCallback(frame -> {
            if (!closed && reported && frame.getData().length > 0) outputStarted=true;
        });
        if (publish) audio.setSamplesReadyCallback(frame -> {
            if (capturing && !closed) listener.samples(frame.getSampleRate(),frame.getChannelCount(),
                frame.getAudioFormat(),frame.getData());
        });
        device = audio.createAudioDeviceModule();
        factory = PeerConnectionFactory.builder().setAudioDeviceModule(device).createPeerConnectionFactory();
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(Collections.singletonList(
            PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer()));
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        peer = factory.createPeerConnection(config, new Observer());
        if (peer == null) throw new IOException("Audio connection unavailable.");
        peer.setAudioRecording(false);
        peer.setAudioPlayout(false);
        if (publish) {
            source = factory.createAudioSource(new MediaConstraints());
            track = factory.createAudioTrack("turn",source);
            transceiver = peer.addTransceiver(track,new RtpTransceiver.RtpTransceiverInit(
                RtpTransceiver.RtpTransceiverDirection.SEND_ONLY));
            if (transceiver == null) throw new IOException("Audio transmission unavailable.");
        }
    }
    /** Run on network worker. No lock spans a network request, SDP wait or ICE gathering wait. */
    void negotiate() {
        try {
            String endpoint = signal("open").getString("endpointId");
            create();
            if (publish) {
                JSONObject offer = local(true);
                String mid;
                synchronized (this) { check(); mid = transceiver.getMid(); }
                JSONObject result = signal("publish","endpointId",endpoint,"leaseId",lease,
                    "mid",mid,"sessionDescription",offer);
                remote(result.getJSONObject("sessionDescription"),SessionDescription.Type.ANSWER);
            } else {
                JSONObject result = signal("subscribe","endpointId",endpoint,"leaseId",lease);
                remote(result.getJSONObject("sessionDescription"),SessionDescription.Type.OFFER);
                signal("answer","endpointId",endpoint,"leaseId",lease,"sessionDescription",local(false));
            }
            negotiated = true;
            main.post(this::connected);
        } catch (Exception failure) { fail(); }
    }
    private void fail() { capturing=false;main.post(() -> { if (!closed) listener.failed(); }); }
    private synchronized void connected() {
        if (reported || !negotiated || !transportConnected || !current() || peer == null) return;
        reported = true;
        if (publish) {
            capturing = true;
            peer.setAudioRecording(true);
        } else peer.setAudioPlayout(true);
        listener.connected();
    }
    private static final class Description implements SdpObserver {
        final CompletableFuture<SessionDescription> done = new CompletableFuture<>();
        public void onCreateSuccess(SessionDescription result) { done.complete(result); }
        public void onSetSuccess() { done.complete(null); }
        public void onCreateFailure(String error) { done.completeExceptionally(new IOException("Audio negotiation failed.")); }
        public void onSetFailure(String error) { onCreateFailure(error); }
        SessionDescription await() throws Exception { return done.get(5,TimeUnit.SECONDS); }
    }
    private JSONObject local(boolean offer) throws Exception {
        Description created = new Description(), applied = new Description();
        synchronized (this) {
            check();
            if (offer) peer.createOffer(created,new MediaConstraints());
            else peer.createAnswer(created,new MediaConstraints());
        }
        SessionDescription local = created.await();
        synchronized (this) { check(); peer.setLocalDescription(applied,local); }
        applied.await();
        gathered.get(7,TimeUnit.SECONDS);
        synchronized (this) {
            check();
            SessionDescription result = peer.getLocalDescription();
            return object("type",result.type.canonicalForm(),"sdp",result.description);
        }
    }
    private void remote(JSONObject input, SessionDescription.Type type) throws Exception {
        if (!type.canonicalForm().equals(input.getString("type"))) throw new IOException("Unexpected audio description.");
        Description applied = new Description();
        synchronized (this) {
            check();
            peer.setRemoteDescription(applied,new SessionDescription(type,input.getString("sdp")));
        }
        applied.await();
    }
    volatile boolean receivedSamples;
    synchronized void checkInbound() {
        if (closed || publish || !reported || peer == null || receivedSamples) return;
        peer.getStats(report -> {
            for (RTCStats stat : report.getStatsMap().values()) {
                Object samples = stat.getMembers().get("totalSamplesReceived");
                if ("inbound-rtp".equals(stat.getType()) && samples instanceof Number
                    && ((Number)samples).longValue() > 0 && outputStarted) receivedSamples = true;
            }
        });
    }
    synchronized void stopMicrophone() {
        capturing=false;
        if(publish && peer!=null)peer.setAudioRecording(false);
    }
    @Override public synchronized void close() {
        if (closed) return;
        closed = true; capturing = false; gathered.completeExceptionally(new IOException("Audio closed."));
        if (peer != null) {
            peer.setAudioRecording(false);
            peer.close();
            peer.dispose(); peer = null;
        }
        if (track != null) { track.dispose(); track = null; }
        if (source != null) { source.dispose(); source = null; }
        if (factory != null) { factory.dispose(); factory = null; }
        if (device != null) { device.release(); device = null; }
    }
    private final class Observer implements PeerConnection.Observer {
        public void onConnectionChange(PeerConnection.PeerConnectionState state) {
            transportConnected = state == PeerConnection.PeerConnectionState.CONNECTED;
            if (transportConnected) main.post(PttAudioEngine.this::connected);
            if (state == PeerConnection.PeerConnectionState.FAILED || state == PeerConnection.PeerConnectionState.DISCONNECTED) {
                capturing = false;
                main.post(() -> { if (!closed) listener.failed(); });
            }
        }
        public void onIceGatheringChange(PeerConnection.IceGatheringState state) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) gathered.complete(null);
        }
        public void onSignalingChange(PeerConnection.SignalingState state) {}
        public void onIceConnectionChange(PeerConnection.IceConnectionState state) {}
        public void onIceConnectionReceivingChange(boolean active) {}
        public void onIceCandidate(IceCandidate candidate) {}
        public void onIceCandidatesRemoved(IceCandidate[] removed) {}
        public void onAddStream(MediaStream stream) {}
        public void onRemoveStream(MediaStream stream) {}
        public void onDataChannel(DataChannel channel) {}
        public void onRenegotiationNeeded() {}
    }
}
