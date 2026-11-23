package net.algt.mobiledms;
import java.io.*;
import java.nio.*;
import java.util.*;
import javax.crypto.*;

public final class PttReplayTest {
    private static void check(boolean ok) {if(!ok)throw new AssertionError();}
    public static void main(String[] args)throws Exception{
        PttWave wave=new PttWave();byte[] tenMs=new byte[160];new Random(15).nextBytes(tenMs);
        for(int i=0;i<6000;i++)wave.append(8000,1,2,tenMs,1+(long)i*10_000_000);
        byte[] wav=wave.finish(true,60_000_000_000L);check(wav.length==960044);check(wave.finish(true,1)==null);
        check(ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN).getInt(40)==960000);
        PttWave interrupted=new PttWave();interrupted.append(8000,1,2,tenMs,1);
        check(interrupted.finish(false,1)==null);
        PttWave gap=new PttWave();gap.append(8000,1,2,tenMs,1);gap.append(8000,1,2,tenMs,600000001);check(gap.finish(true,600000002)==null);
        PttWave mixed=new PttWave();mixed.append(8000,1,2,tenMs,1);mixed.append(16000,1,2,tenMs,2);check(mixed.finish(true,3)==null);
        PttWave overflow=new PttWave();overflow.append(8000,1,2,new byte[960002],1);check(overflow.finish(true,1)==null);
        SecretKey key=KeyGenerator.getInstance("AES").generateKey();
        String scope="account-A/ptt/channel/participant/9/record";
        ByteArrayOutputStream encrypted=new ByteArrayOutputStream();
        EncryptedFiles.encrypt(new ByteArrayInputStream(wav),encrypted,key,scope,PttWave.LIMIT);
        check(!Arrays.equals(wav,encrypted.toByteArray()));
        ByteArrayOutputStream plain=new ByteArrayOutputStream();
        EncryptedFiles.Info info=EncryptedFiles.decrypt(new ByteArrayInputStream(encrypted.toByteArray()),plain,key,scope,PttWave.LIMIT);
        check(info.sha256.equals(PttWave.hash(wav)) && Arrays.equals(wav,plain.toByteArray()));
        for(String wrong:new String[]{scope.replace("A","B"),scope.replace("9","10"),scope.replace("participant","review")}){
            try{EncryptedFiles.decrypt(new ByteArrayInputStream(encrypted.toByteArray()),new ByteArrayOutputStream(),key,wrong,PttWave.LIMIT);throw new AssertionError();}
            catch(IOException expected){}
        }
        byte[] bad=encrypted.toByteArray();bad[bad.length-1]^=1;
        try{EncryptedFiles.decrypt(new ByteArrayInputStream(bad),new ByteArrayOutputStream(),key,scope,PttWave.LIMIT);throw new AssertionError();}
        catch(IOException expected){}
        System.out.println("PASS PCM 60s, gap/format/interrupt/overflow and encrypted playback isolation/integrity");
    }
}
