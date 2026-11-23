package net.algt.mobiledms;

import android.content.Context;
import android.os.SystemClock;
import java.io.*;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Owned by a single outbound floor. Interrupted audio is never staged on disk or resent offline. */
final class PttRecording {
    private static final ExecutorService UPLOADS=new ThreadPoolExecutor(0,2,30,TimeUnit.SECONDS,new SynchronousQueue<>());
    private final PttWave wave=new PttWave();
    private final ErpApi api;
    private final String epoch,channel,lease;
    private final BooleanSupplier current;
    private boolean finished, sealed;
    private byte[] held;
    PttRecording(Context context,ErpApi api,String account,String epoch,String channel,String lease,BooleanSupplier current) {
        this.api=api;this.epoch=epoch;this.channel=channel;this.lease=lease;
        long generation=api.sessionEpoch();
        this.current=()->current.getAsBoolean() && account.equals(api.user()) && generation==api.sessionEpoch();
    }
    private JSONObject call(String op) throws Exception {
        return new CommunicationsApi(api,current).call("pttRecording."+op,ErpApi.object("recordingId",lease,"channelId",channel,"epoch",epoch));
    }
    void prepare() throws Exception {
        if (!"ready".equals(call("preflight").optString("state"))) throw new IOException("PTT recording is unavailable.");
    }
    void samples(int sampleRate,int channels,int audioFormat,byte[] pcm) {
        if (current.getAsBoolean()) wave.append(sampleRate,channels,audioFormat,pcm,SystemClock.elapsedRealtimeNanos());
        else wave.interrupt();
    }
    synchronized void endCapture() {
        if (sealed) return;
        sealed=true;
        held=wave.finish(true,SystemClock.elapsedRealtimeNanos());
    }
    synchronized void finish(boolean completed) {
        if (finished) return;
        finished=true;
        endCapture();
        if ((!completed || !current.getAsBoolean()) && held!=null) {Arrays.fill(held,(byte)0);held=null;}
        byte[] bytes=held; held=null;
        try {UPLOADS.execute(()->{
            try {
                if (!current.getAsBoolean()) return;
                if (bytes==null) { call("fail"); return; }
                JSONObject plan=call("prepare");
                if ("sent".equals(plan.optString("state"))) return;
                if (!"ready".equals(plan.optString("state"))) throw new IOException("Transmission cannot be saved.");
                HttpsURLConnection c=api.communicationsConnection("/ptt/uploads/"+lease,"POST",current);
                try {
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(bytes.length);
                    c.setRequestProperty("Content-Type","audio/wav");
                    c.setRequestProperty("X-Ptt-Epoch",epoch);
                    c.setRequestProperty("X-Ptt-Channel",channel);
                    c.setRequestProperty("X-Ptt-Sha256",PttWave.hash(bytes));
                    try(OutputStream out=c.getOutputStream()) {
                        for(int pos=0;pos<bytes.length;pos+=32768) {
                            ChatRules.check(current);out.write(bytes,pos,Math.min(32768,bytes.length-pos));
                        }
                    }
                    if(c.getResponseCode()/100!=2) throw new IOException("Recording was not confirmed.");
                } finally {c.disconnect();}
            } catch(Exception unavailable) {
                // Ambiguous finalization is resolved by the ERP. Never resend speech after loss.
            } finally {if(bytes!=null) Arrays.fill(bytes,(byte)0);}
        });} catch(RejectedExecutionException occupied){if(bytes!=null)Arrays.fill(bytes,(byte)0);}
    }
}
