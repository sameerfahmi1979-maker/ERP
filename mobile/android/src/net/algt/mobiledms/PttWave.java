package net.algt.mobiledms;

import java.io.*;
import java.nio.*;
import java.security.MessageDigest;
import java.util.Arrays;

/** Immutable canonical PCM16 once sealed. No filesystem or network activity on the WebRTC audio callback. */
final class PttWave {
    static final int LIMIT=52_428_800;
    private ByteArrayOutputStream pcm=new ByteArrayOutputStream();
    private int rate, channels;
    private long firstNanos, lastNanos;
    private boolean broken;

    synchronized void interrupt() { broken=true;if(pcm!=null)pcm.reset(); }
    synchronized void append(int hz,int count,int format,byte[] bytes,long now) {
        if (pcm==null || broken) return;
        if (format!=2 || hz<8000 || hz>192000 || count<1 || count>2 || bytes==null ||
            bytes.length==0 || bytes.length%(2*count)!=0 ||
            (rate!=0 && (rate!=hz || count!=channels || now<lastNanos || now-lastNanos>250_000_000L))) {
            broken=true; pcm.reset(); return;
        }
        if (rate==0) { rate=hz; channels=count; firstNanos=now; }
        long size=(long)pcm.size()+bytes.length;
        if (size+44>LIMIT || size>60L*rate*channels*2) { broken=true; pcm.reset(); return; }
        pcm.write(bytes,0,bytes.length);
        lastNanos=now;
    }
    synchronized byte[] finish(boolean complete,long now) {
        if (pcm==null) return null;
        ByteArrayOutputStream data=pcm;
        pcm=null;
        if (!complete || broken || rate==0 || data.size()==0 || now-lastNanos>350_000_000L) return null;
        long durationMs=(long)data.size()*1000/(rate*channels*2);
        if (Math.abs(durationMs-(lastNanos-firstNanos)/1_000_000)>250) return null;
        ByteBuffer out=ByteBuffer.allocate(44+data.size()).order(ByteOrder.LITTLE_ENDIAN);
        out.putInt(0x46464952).putInt(36+data.size()).putInt(0x45564157).putInt(0x20746d66)
           .putInt(16).putShort((short)1).putShort((short)channels).putInt(rate).putInt(rate*channels*2)
           .putShort((short)(channels*2)).putShort((short)16).putInt(0x61746164).putInt(data.size());
        byte[] copy=data.toByteArray();
        out.put(copy); Arrays.fill(copy,(byte)0);
        return out.array();
    }
    static String hash(byte[] bytes) throws Exception {
        char[] alphabet="0123456789abcdef".toCharArray();
        byte[] sha=MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result=new StringBuilder(64);
        for (byte b:sha) result.append(alphabet[(b>>>4)&15]).append(alphabet[b&15]);
        return result.toString();
    }
}
