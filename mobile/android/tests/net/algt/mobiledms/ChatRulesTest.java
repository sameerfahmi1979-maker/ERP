package net.algt.mobiledms;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

public final class ChatRulesTest {
    static int count;
    static void verify(boolean predicate,String message) {
        if (!predicate) throw new AssertionError(message);
        count++;
    }
    interface Checked {void run()throws Exception;}
    static void denied(Checked action,String message)throws Exception {
        try { action.run(); }catch(IOException expected){count++;return;}
        throw new AssertionError(message);
    }
    public static void main(String[] args)throws Exception {
        String uuid=ChatRules.nextId();
        verify(ChatRules.uuid(uuid),"generated ID must be a canonical UUID");
        verify(!ChatRules.uuid("../"+uuid)&&!ChatRules.uuid("1-1-1-1-1")&&!ChatRules.uuid(uuid+"?mode=review"),"reject path confusion");
        verify(ChatRules.profile("9223372036854775807")&&!ChatRules.profile("9223372036854775808"),"int64 boundary");
        verify(!ChatRules.profile("01")&&!ChatRules.profile("0")&&!ChatRules.profile("-1")&&!ChatRules.profile("1.0"),"decimal only");
        verify(ChatRules.mayResume(5,5,0,0,false),"same session can retry");
        verify(!ChatRules.mayResume(5,6,0,0,false),"account switch A/B/A fences a retained draft");
        verify(!ChatRules.mayResume(5,5,0,1,false),"logout marker fences without waiting for token deactivation");
        verify(!ChatRules.mayResume(5,5,2,2,true),"permanent send failure requires manual action");
        verify(ChatRules.filename("../../invoice.pdf").equals(".._.._invoice.pdf"),"safe display filename");
        verify(ChatRules.filename("..").equals("attachment"),"reject bare traversal");
        byte[] content="عربي and English".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        verify(ChatRules.copy(new ByteArrayInputStream(content),out,content.length,()->true)==content.length && Arrays.equals(content,out.toByteArray()),"exact boundary/Unicode payload");
        denied(()->ChatRules.copy(new ByteArrayInputStream(content),new ByteArrayOutputStream(),content.length-1,()->true),"overflow");
        AtomicInteger checks=new AtomicInteger();
        ByteArrayOutputStream rejected=new ByteArrayOutputStream();
        denied(()->ChatRules.copy(new ByteArrayInputStream(content),rejected,content.length,()->checks.incrementAndGet()<2),"fence after read");
        verify(rejected.size()==0,"late pre-write cancellation leaks no bytes");
        byte[] large=new byte[65536];ByteArrayOutputStream partial=new ByteArrayOutputStream();
        denied(()->ChatRules.copy(new ByteArrayInputStream(large),partial,large.length,()->partial.size()==0),"mid transfer cancellation");
        verify(partial.size()==32768,"next chunk guarded after logout");
        denied(()->ChatRules.copy(new ByteArrayInputStream(content),new OutputStream(){
            public void write(int n)throws IOException{throw new IOException("disk full");}
        },content.length,()->true),"disk full must propagate");
        verify(ChatRules.zipHeader(new ByteArrayInputStream(new byte[]{80,75,3,4})),"ZIP export local header");
        verify(!ChatRules.zipHeader(new ByteArrayInputStream("<html>".getBytes(StandardCharsets.UTF_8))),"reject an HTML error page returned as successful binary");
        verify(ChatRules.FILE_LIMIT==52_428_800L,"shared transfer limit");
        SecretKey key=KeyGenerator.getInstance("AES").generateKey();
        ByteArrayOutputStream encrypted=new ByteArrayOutputStream();
        EncryptedFiles.encrypt(new ByteArrayInputStream(content),encrypted,key,"account-A/draft",content.length);
        verify(!Arrays.equals(content,encrypted.toByteArray()),"draft is encrypted");
        denied(()->EncryptedFiles.decrypt(new ByteArrayInputStream(encrypted.toByteArray()),new ByteArrayOutputStream(),key,"account-B/draft",content.length),"wrong account AAD");
        ByteArrayOutputStream decrypted=new ByteArrayOutputStream();
        EncryptedFiles.decrypt(new ByteArrayInputStream(encrypted.toByteArray()),decrypted,key,"account-A/draft",content.length);
        verify(Arrays.equals(content,decrypted.toByteArray()),"same-account recovery");
        byte[] damaged=encrypted.toByteArray();damaged[damaged.length-1]^=42;
        denied(()->EncryptedFiles.decrypt(new ByteArrayInputStream(damaged),new ByteArrayOutputStream(),key,"account-A/draft",content.length),"authenticated content");
        System.out.println("ChatRulesTest passed "+count+" checks.");
    }
}
