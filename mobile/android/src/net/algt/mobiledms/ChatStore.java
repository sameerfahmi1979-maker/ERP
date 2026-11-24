package net.algt.mobiledms;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.BooleanSupplier;

/** Keys are generated locally or derived from validated UUIDs; ERP titles and filenames never form paths. */
final class ChatStore {
    final Context app;
    final String owner;
    final long generation;
    final BooleanSupplier visible;
    ChatStore(Context context, String owner, BooleanSupplier visible) {
        this.app = context.getApplicationContext();
        this.owner = owner;
        this.generation = LocalSecurity.generation(app);
        this.visible = visible;
    }
    void check() throws IOException {
        LocalSecurity.requireAccount(app, owner, generation);
        LocalSecurity.requireUnlocked(app);
        ChatRules.check(visible);
    }
    private File root() throws IOException {
        if (!ChatRules.uuid(owner)) throw new IOException("Open your signed-in ERP account.");
        File base = LocalSecurity.directory(app.getNoBackupFilesDir(), "communications");
        return LocalSecurity.directory(base, owner);
    }
    private File dir(String folder) throws IOException {
        File f = root();
        for (String name : folder.split("/")) {
            if (!name.matches("[a-z0-9-]+")) throw new IOException("Invalid private folder.");
            f = LocalSecurity.directory(f, name);
        }
        return f;
    }
    private static String hash(String key) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(Locale.ROOT,"%02x", b & 255));
        return out.toString();
    }
    Set<String> conversationIds(String mode) throws IOException {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            check();
            File[] dirs=dir("cache/"+mode).listFiles();
            if(dirs==null)throw new IOException("Could not read saved conversations.");
            Set<String> result=new HashSet<>();
            for(File d:dirs)if(d.isDirectory()&&ChatRules.uuid(d.getName()))result.add(d.getName());
            return result;
        }
    }
    JSONObject get(String folder, String key) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            check();
            return LocalSecurity.readJson(app, owner, "chat:" + folder + "/" + key, new AtomicFile(new File(dir(folder), hash(key))), false);
        }
    }
    void put(String folder, String key, JSONObject json) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            check();
            LocalSecurity.writeJson(app, owner, "chat:" + folder + "/" + key, new AtomicFile(new File(dir(folder), hash(key))), json);
        }
    }
    long logoutMarker() { return app.getSharedPreferences("chat-session-fence",0).getLong(owner,0); }
    static void signOut(Context c, String owner) throws IOException {
        if (!ChatRules.uuid(owner)) return;
        synchronized (LocalSecurity.STORAGE_LOCK) {
            android.content.SharedPreferences prefs = c.getSharedPreferences("chat-session-fence",0);
            if (!prefs.edit().putLong(owner, prefs.getLong(owner,0)+1).commit()) throw new IOException("Could not protect unsent chat drafts.");
        }
    }
    JSONObject snapshot(String folder, String key) throws Exception {
        JSONObject item = get(folder,key);
        if (item == null || item.optLong("generation",-1) != generation || item.optLong("logout",-1) != logoutMarker())
            throw new IOException("Connect to the ERP to open this conversation on this phone.");
        return item.getJSONObject("data");
    }
    void snapshot(String folder, String key, JSONObject data) throws Exception {
        put(folder,key,CommunicationsApi.args("generation",generation,"logout",logoutMarker(),"data",data));
    }
    JSONObject page(String folder,String key,String revision) throws Exception {
        JSONObject header=snapshot(folder,"conversation");
        if(!revision.equals(CommunicationsApi.text(header,"changeSeq")))throw new IOException("Reconnect to refresh chat history.");
        JSONObject stored=get(folder+"/pages",key);
        if(stored==null||!revision.equals(CommunicationsApi.text(stored,"revision")))throw new IOException("Connect to refresh this saved page.");
        return stored.getJSONObject("data");
    }
    void page(String folder,String key,String revision,JSONObject data)throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            put(folder+"/pages",key,CommunicationsApi.args("revision",revision,"data",data));
            String digest=hash(key);
            org.json.JSONArray rows=data.optJSONArray("items");
            JSONObject oldest=rows==null?null:rows.optJSONObject(rows.length()-1);
            JSONObject entry=CommunicationsApi.args("key",key,"revision",revision,"oldest",CommunicationsApi.text(oldest,"seq"));
            LocalSecurity.writeJson(app,owner,"chat:index:"+folder+"/"+digest,new AtomicFile(new File(dir(folder+"/page-index"),digest)),entry);
        }
    }
    List<JSONObject> stalePages(String folder,String revision)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            check();
            File[] files=dir(folder+"/page-index").listFiles();List<JSONObject> result=new ArrayList<>();
            if(files==null)throw new IOException("Could not read the local chat index.");
            for(File file:files)if(file.getName().matches("[a-f0-9]{64}")){
                JSONObject record=LocalSecurity.readJson(app,owner,"chat:index:"+folder+"/"+file.getName(),new AtomicFile(file),false);
                if(record!=null&&!revision.equals(CommunicationsApi.text(record,"revision")))result.add(record);
            }
            return result;
        }
    }
    void clear(String folder) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) { check(); LocalSecurity.deleteTree(dir(folder)); }
    }
    void clearDeniedHistory(String folder,BooleanSupplier accountCurrent)throws IOException {
        // A response can arrive after the user leaves the inbox. Delete only under the same account fence.
        synchronized(LocalSecurity.STORAGE_LOCK){
            LocalSecurity.requireAccount(app,owner,generation);
            ChatRules.check(accountCurrent);
            LocalSecurity.deleteTree(dir(folder));
        }
    }
    boolean hasMedia(String folder, String id) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) { check(); return new File(dir(folder),hash(id)+".enc").isFile(); }
    }
    long seal(String folder, String id, InputStream in) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            check();
            InputStream guarded = new FilterInputStream(in) {
                public int read(byte[] b,int off,int len) throws IOException { ChatRules.check(visible); return super.read(b,off,len); }
            };
            File dest = new File(dir(folder),hash(id)+".enc");
            return LocalSecurity.seal(app,owner,"chat:file:"+folder+"/"+id,guarded,dest,ChatRules.FILE_LIMIT).size;
        }
    }
    private static boolean swept;
    static synchronized void sweepAfterRestart(Context app) throws IOException {
        if(swept)return;
        LocalSecurity.deleteTree(new File(app.getCacheDir(),"communications-temp"));
        swept=true;
    }
    File temp() throws IOException {
        check();
        sweepAfterRestart(app);
        return File.createTempFile("work-", ".private", LocalSecurity.directory(app.getCacheDir(), "communications-temp"));
    }
    File open(String folder,String id) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            File tmp=temp();
            try {
                LocalSecurity.unseal(app,owner,"chat:file:"+folder+"/"+id,new File(dir(folder),hash(id)+".enc"),tmp,ChatRules.FILE_LIMIT);
                check(); return tmp;
            } catch(Exception e) { tmp.delete(); throw e; }
        }
    }
    void saveDraft(JSONObject row) throws Exception {
        String id = CommunicationsApi.id(row,"id");
        put("outbox/"+id,"item",row);
    }
    java.util.List<JSONObject> drafts() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            check();
            File[] dirs = dir("outbox").listFiles();
            if (dirs == null) throw new IOException("Could not read local chat drafts.");
            List<JSONObject> result = new ArrayList<>();
            for (File d : dirs) if (ChatRules.uuid(d.getName()) && d.isDirectory()) {
                JSONObject row = get("outbox/"+d.getName(),"item");
                if (row != null) result.add(row);
            }
            result.sort(Comparator.comparingLong(o -> o.optLong("created")));
            return result;
        }
    }
    boolean pending(JSONObject draft) {
        return ChatRules.mayResume(draft.optLong("generation",-1),generation,draft.optLong("logout",-1),logoutMarker(),draft.optBoolean("manual",true));
    }
}
