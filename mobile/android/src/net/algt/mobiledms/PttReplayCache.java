package net.algt.mobiledms;

import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import java.io.*;
import java.security.KeyStore;
import java.util.*;
import java.util.function.BooleanSupplier;
import javax.crypto.*;
import org.json.*;
import static net.algt.mobiledms.ErpApi.object;

/** Private, per-account encrypted retained audio. An online denial invalidates the complete local scope. */
final class PttReplayCache {
    private static final java.util.concurrent.ConcurrentHashMap<String,java.util.concurrent.atomic.AtomicLong> REVISIONS=new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicLong revision;
    private final Context ctx;
    private final String owner,channel,mode;
    private final long session;
    private final ErpApi erp;
    private final BooleanSupplier current;
    PttReplayCache(Context c,ErpApi erp,String owner,String channel,String mode,BooleanSupplier current) {
        this.ctx=c.getApplicationContext();this.erp=erp;this.owner=owner;this.channel=channel;this.mode=mode;this.current=current;
        this.session=erp.sessionEpoch();
        this.revision=REVISIONS.computeIfAbsent(owner+"/"+channel+"/"+mode,k->new java.util.concurrent.atomic.AtomicLong());
    }
    long revision(){return revision.get();}
    private static String uuid(String s) throws IOException {
        if (!ChatRules.uuid(s)) throw new IOException("Invalid recording identifier.");return s;
    }
    private void check() throws IOException {
        ChatRules.check(current);
        if (session!=erp.sessionEpoch() || !owner.equals(erp.user()) || !erp.signedIn()) throw new IOException("Open your ERP account.");
        LocalSecurity.requireAccount(ctx,owner);
    }
    private File accountDir() throws IOException {
        return LocalSecurity.directory(LocalSecurity.directory(ctx.getNoBackupFilesDir(),"ptt-replay"),uuid(owner));
    }
    private File dir() throws IOException {
        check();
        if (!mode.equals("review") && !mode.equals("participant")) throw new IOException("Invalid history mode.");
        return LocalSecurity.directory(LocalSecurity.directory(accountDir(),uuid(channel)),mode);
    }
    private String scope(){return "ptt/"+channel+"/"+mode+"/"+session+"/";}
    private AtomicFile meta(File d,String name) {return new AtomicFile(new File(d,name+".enc"));}
    private SecretKey key() throws Exception {
        String alias="algt.ptt.replay."+uuid(owner);
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(alias)) return (SecretKey)store.getKey(alias,null);
        KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_DECRYPT|KeyProperties.PURPOSE_ENCRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }
    private void scopeEpisode(String episode) throws Exception {
        File d=dir(); AtomicFile f=meta(d,"scope");
        if (f.getBaseFile().isFile()) {
            try {
                JSONObject old=LocalSecurity.readJson(ctx,owner,"ptt-scope/"+channel+"/"+mode,f,false);
                if(old!=null && old.optLong("session")==session && old.optString("episode").equals(episode)) return;
            } catch(IOException invalid) { /* Old or damaged metadata cannot authorize other entries. */ }
            revision.incrementAndGet();LocalSecurity.deleteTree(d); d=dir(); f=meta(d,"scope");
        }
        LocalSecurity.writeJson(ctx,owner,"ptt-scope/"+channel+"/"+mode,f,object("session",session,"episode",episode));
    }
    void learn(String episode) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {scopeEpisode(episode);}
    }
    void clear() throws Exception {
        revision.incrementAndGet();
        synchronized(LocalSecurity.STORAGE_LOCK) {LocalSecurity.deleteTree(dir());}
    }
    void remove(String id) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {revision.incrementAndGet();LocalSecurity.deleteTree(recordDir(id));}
    }
    void clearAccount() throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {check();
            REVISIONS.forEach((name,generation)->{if(name.startsWith(owner+"/"))generation.incrementAndGet();});
            LocalSecurity.deleteTree(accountDir());
        }
    }
    private File recordDir(String id) throws IOException {return LocalSecurity.directory(dir(),uuid(id));}
    void save(JSONObject info,byte[] bytes,boolean played,long expectedRevision) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            check();if(revision.get()!=expectedRevision)throw new IOException("Recording access changed.");
            String id=uuid(info.getString("id"));
            if (!channel.equals(info.getString("channelId")) || !PttWave.hash(bytes).equals(info.getString("sha256"))) throw new IOException("Recording verification failed.");
            scopeEpisode(info.isNull("episode")?"":info.getString("episode"));
            File d=recordDir(id);AtomicFile f=meta(d,"audio"); FileOutputStream out=f.startWrite();
            try {
                EncryptedFiles.encrypt(new ByteArrayInputStream(bytes),out,key(),owner+"/"+scope()+id,PttWave.LIMIT);
                check();if(revision.get()!=expectedRevision)throw new IOException("Recording access changed.");
                f.finishWrite(out);
            } catch(Exception e) { f.failWrite(out);throw e; }
            JSONObject saved=metadata(id);
            info.put("pendingPlayed",played || saved!=null && saved.optBoolean("pendingPlayed"));
            LocalSecurity.writeJson(ctx,owner,scope()+id,meta(d,"info"),info);
        }
    }
    void heard(String id,boolean pending) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            File folder=LocalSecurity.directory(dir(),"heard");AtomicFile marker=meta(folder,uuid(id));
            if(!pending){marker.delete();return;}
            LocalSecurity.writeJson(ctx,owner,scope()+"heard/"+id,marker,object("id",id));
        }
    }
    List<String> heard() throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            File folder=LocalSecurity.directory(dir(),"heard");List<String> result=new ArrayList<>();
            File[] files=folder.listFiles();if(files==null)return result;
            for(File file:files){
                String name=file.getName();if(!name.endsWith(".enc"))continue;
                String id=name.substring(0,name.length()-4);if(!ChatRules.uuid(id))continue;
                try{JSONObject row=LocalSecurity.readJson(ctx,owner,scope()+"heard/"+id,meta(folder,id),false);
                    if(row!=null && id.equals(row.optString("id")))result.add(id);}
                catch(IOException inaccessible){check();}
            }
            return result;
        }
    }
    JSONObject metadata(String id) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            File d=recordDir(id);AtomicFile f=meta(d,"info");
            if (!f.getBaseFile().isFile()) return null;
            return LocalSecurity.readJson(ctx,owner,scope()+id,f,false);
        }
    }
    void ack(String id) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            JSONObject info=metadata(id);
            if (info!=null) LocalSecurity.writeJson(ctx,owner,scope()+id,meta(recordDir(id),"info"),info.put("pendingPlayed",false));
        }
    }
    List<JSONObject> saved() throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            List<JSONObject> rows=new ArrayList<>();File[] files=dir().listFiles();
            if(files==null)throw new IOException("Phone cache unavailable.");
            for(File file:files) if(file.isDirectory() && ChatRules.uuid(file.getName())) {
                try {JSONObject item=metadata(file.getName());if(item!=null)rows.add(item);}
                catch(IOException inaccessible) { check(); }
            }
            rows.sort((a,b)->b.optString("startedAt").compareTo(a.optString("startedAt")));return rows;
        }
    }
    byte[] read(JSONObject info) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            String id=uuid(info.getString("id"));File f=meta(recordDir(id),"audio").getBaseFile();
            if(!f.isFile())return null;
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream in=new FileInputStream(f)){
                EncryptedFiles.Info actual=EncryptedFiles.decrypt(in,out,key(),owner+"/"+scope()+id,PttWave.LIMIT);
                if(!actual.sha256.equals(info.getString("sha256")))throw new IOException("Recording verification failed.");
            }
            check();return out.toByteArray();
        }
    }
}
