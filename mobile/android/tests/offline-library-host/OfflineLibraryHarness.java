package net.algt.mobiledms;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.json.JSONObject;

public final class OfflineLibraryHarness {
    static final String A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222";
    static final byte[] CONTENT="Synthetic document for local verification".getBytes(StandardCharsets.UTF_8);
    static final long DAY=86_400_000L;
    static int checks;
    interface Work { void run() throws Exception; }
    static void check(boolean condition) { if(!condition)throw new AssertionError(); checks++; }
    static void denied(Work work)throws Exception{
        try{work.run();throw new AssertionError("Expected closed library");}catch(IOException expected){checks++;}
    }
    static JSONObject grant(int days,int id)throws Exception{
        long issued=System.currentTimeMillis()-10;
        StringBuilder hash=new StringBuilder();
        for(byte value:MessageDigest.getInstance("SHA-256").digest(CONTENT))hash.append(String.format("%02x",value & 255));
        return ErpApi.object("authUserId",A,"documentId",5,"fileId",id,"version","2026-11-20","versionId",14,"currentVersionId",16,
            "name","synthetic.pdf","title","Synthetic label","sha256",hash.toString(),"size",CONTENT.length,"leaseVersion",2,
            "retention",days==0?"permanent":"timed","days",days,"authorizedAt",issued,"expiresAt",days==0?null:issued+DAY*days);
    }
    public static void main(String[]args)throws Exception{
        Context c=new Context(new File(args[0])); File original=new File(c.getCacheDir(),"source"), preview=new File(c.getCacheDir(),"preview");
        Files.write(original.toPath(),CONTENT);
        LocalSecurity.activate(c,A);
        OfflineDocuments first=new OfflineDocuments(c,A);
        JSONObject saved=grant(0,6);
        first.save(saved,original,0,1000);
        first.save(grant(1,7),original,1,1000);
        first.save(grant(0,6),original,0,1000);
        check(first.list("").length()==2);
        File[] encrypted=new File(new File(c.root,"offline"),A).listFiles();
        check(encrypted!=null && encrypted.length==3);
        for(File file:encrypted){check(EncryptedFiles.sealed(file));check(!new String(Files.readAllBytes(file.toPath()),StandardCharsets.ISO_8859_1).contains("Synthetic"));}
        Settings.Global.boot=9; SystemClock.elapsed=80;
        check(first.item(6).getBoolean("available"));
        check(!first.item(7).getBoolean("available"));
        c.guard.locked=true; denied(()->first.open(6,saved,preview)); c.guard.locked=false;
        LocalSecurity.appLocked=true; denied(()->first.open(6,saved,preview)); LocalSecurity.appLocked=false;
        first.open(6,saved,preview); check(java.util.Arrays.equals(CONTENT,Files.readAllBytes(preview.toPath())));
        OfflineDocuments.onExplicitSignOut(c,A);
        denied(()->first.open(6,saved,preview));
        LocalSecurity.activate(c,B); OfflineDocuments b=new OfflineDocuments(c,B); check(b.list("").length()==0);
        LocalSecurity.activate(c,A); OfflineDocuments second=new OfflineDocuments(c,A);
        check(second.list("").length()==1);
        check(!second.item(6).has("name") && !second.item(6).has("documentId"));
        check(second.list("synthetic").length()==0);
        ErpApi api=new ErpApi(A); api.grant=grant(1,6);
        denied(()->second.reconcile(api,0));       // Persisted token after a crash is insufficient.
        OfflineDocuments.onCredentialSignIn(c,A);
        api.failure=new java.net.ConnectException();
        denied(()->second.reconcile(api,6)); denied(()->second.open(6,saved,preview));
        api.failure=null; second.reconcile(api,6); second.open(6,saved,preview);
        check(second.item(6).isNull("expiresAt"));
        api.failure=new java.net.ConnectException(); denied(()->second.reconcile(api,6));
        second.open(6,saved,preview);               // Same account, prior valid grant and transport loss.
        api.failure=new ErpApi.Rejected(409); denied(()->second.reconcile(api,6)); denied(()->second.open(6,saved,preview));
        api.failure=null; second.reconcile(api,6); second.open(6,saved,preview);
        api.grant.put("currentVersionId",99); second.reconcile(api,6); check(second.item(6)==null);
        second.save(grant(0,6),original,0,80);
        api.failure=new ErpApi.Rejected(403); denied(()->second.reconcile(api,6)); check(second.item(6)==null);
        second.save(grant(0,6),original,0,80);
        api.failure=new ErpApi.Rejected(401); denied(()->second.reconcile(api,6)); denied(()->second.open(6,saved,preview));
        OfflineDocuments.onCredentialSignIn(c,A); api.failure=null; api.grant=grant(1,6);
        second.reconcile(api,6); second.remove(6); check(second.list("").length()==0);
        second.save(grant(0,6),original,0,80);
        LocalSecurity.activate(c,B); denied(()->second.open(6,saved,preview)); LocalSecurity.activate(c,A);
        OfflineDocuments third=new OfflineDocuments(c,A);
        denied(()->third.open(6,saved,preview));
        OfflineDocuments.onCredentialSignIn(c,A); denied(()->third.open(6,saved,preview));
        api.grant=grant(1,6); third.reconcile(api,6); third.open(6,saved,preview);
        check(third.item(6).getBoolean("available"));
        System.out.println("PASS OfflineLibraryHarness: "+checks+" encrypted-library checks");
    }
}
