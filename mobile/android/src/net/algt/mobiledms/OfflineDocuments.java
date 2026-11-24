package net.algt.mobiledms;

import android.content.Context;
import android.app.KeyguardManager;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.Locale;
import java.util.UUID;

/** The library is populated only by a foreground download with a fresh ERP authorization. */
final class OfflineDocuments {
    private final Context context;
    private final String user;
    private final long generation;
    private final File folder;
    private final AtomicFile index;

    OfflineDocuments(Context context, String user) throws Exception {
        this.context = context.getApplicationContext(); this.user = LeasePolicy.account(user);
        this.generation = LocalSecurity.generation(context);
        LocalSecurity.requireAccount(context, this.user, generation);
        folder = LocalSecurity.directory(LocalSecurity.directory(context.getNoBackupFilesDir(), "offline"), this.user);
        index = new AtomicFile(new File(folder, "index.enc"));
    }
    private static SharedPreferences locks(Context c) { return c.getSharedPreferences("offline-credential-locks", Context.MODE_PRIVATE); }
    static void requireCredentialSignIn(Context c, String user) throws IOException {
        String account = LeasePolicy.account(user);
        if (!locks(c).edit().putBoolean(account,true).putBoolean("changed:"+account,true).commit())
            throw new IOException("The phone could not lock this account's saved documents.");
    }
    static void onCredentialSignIn(Context c, String user) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            LocalSecurity.requireAccount(c,user);
            if (!locks(c).edit().remove(LeasePolicy.account(user)).commit()) throw new IOException("The phone could not verify this sign-in.");
        }
    }
    static void onExplicitSignOut(Context c, String account) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireCredentialSignIn(c,account);
            try {
                OfflineDocuments library = new OfflineDocuments(c,account);
                JSONArray items = library.read(), keep = new JSONArray();
                for (int i=0; i<items.length(); i++) {
                    JSONObject entry = items.getJSONObject(i);
                    if (OfflineGrant.days(entry)==0) keep.put(entry.put("generation",-1));
                }
                if (keep.length()==0) LocalSecurity.deleteTree(library.folder);
                else {
                    library.write(keep);
                    java.util.HashSet<String> kept = new java.util.HashSet<>();
                    for(int i=0; i<keep.length(); i++) kept.add(library.blob(keep.getJSONObject(i)).getName());
                    File[] obsolete = library.folder.listFiles((parent,name)->name.endsWith(".enc") && !name.equals("index.enc") && !kept.contains(name));
                    if(obsolete!=null) for(File file:obsolete) new AtomicFile(file).delete();
                }
            } catch(Exception error) { throw new IOException("The phone could not finish locking its offline library.",error); }
            finally { LocalSecurity.deactivateAccount(c,account); }
        }
    }
    private void require() throws IOException {
        LocalSecurity.requireAccount(context, user, generation);
        LocalSecurity.requireUnlocked(context);
        KeyguardManager guard = (KeyguardManager)context.getSystemService(Context.KEYGUARD_SERVICE);
        if (guard==null || guard.isDeviceLocked()) throw new IOException("Unlock the phone to use saved documents.");
    }
    private int boot() {
        try { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
        catch (SecurityException unavailable) { return -1; }
    }
    private JSONArray read() throws Exception {
        JSONObject data = LocalSecurity.readJson(context, user, "offline-index", index, false);
        if (data == null) return new JSONArray();
        if (!user.equals(data.getString("authUserId"))) throw new IOException("This offline library belongs to another account.");
        return data.getJSONArray("items");
    }
    private void write(JSONArray items) throws IOException { LocalSecurity.writeJson(context, user, "offline-index", index, ErpApi.object("authUserId", user, "items", items)); }
    private File blob(JSONObject item) throws Exception {
        String name = item.getString("blob");
        if (!name.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.enc")) throw new IOException("Invalid offline storage reference.");
        return new File(folder, name);
    }
    private String purpose(JSONObject item) throws Exception { return "offline:" + item.getLong("fileId") + ":" + item.getLong("versionId") + ":" + item.getString("blob"); }
    private Long check(JSONObject item, long wall, long elapsed, int boot) throws Exception {
        if (!user.equals(item.getString("authUserId")) || item.getLong("fileId") <= 0 || item.getLong("documentId") <= 0 || item.getLong("versionId") <= 0)
            throw new IOException("Invalid offline authorization.");
        Long remaining=OfflineGrant.check(item, user, generation, needsCredentials(item), wall, elapsed, boot);
        File file = blob(item);
        if (!file.isFile() || file.length() != item.getLong("encryptedSize")) throw new IOException("The offline copy is missing or damaged. Save it again while connected.");
        item.put("lastWall", wall).put("lastElapsed", elapsed);
        return remaining;
    }
    private boolean needsCredentials(JSONObject record) {
        return locks(context).getBoolean(user,false) || (!record.has("generation") && locks(context).getBoolean("changed:"+user,false));
    }
    private JSONObject display(JSONObject entry, long wall, long elapsed, int boot) throws Exception {
        String error = "";
        Long remaining=null;
        try { remaining=check(entry, wall, elapsed, boot); }
        catch (LeasePolicy.Expired expired) { error=expired.getMessage(); entry.put("spent",true); }
        catch (IOException failure) { error = failure.getMessage(); entry.put("invalidated", true); }
        JSONObject result = error.isEmpty() ? new JSONObject(entry.toString())
            : ErpApi.object("fileId",entry.getLong("fileId"),"title","Locked offline copy","expiresAt",entry.opt("expiresAt"));
        result.put("days",OfflineGrant.days(entry));
        if(remaining!=null) result.put("remainingMillis",remaining);
        result.remove("blob"); result.remove("anchorWall"); result.remove("anchorElapsed"); result.remove("lastWall"); result.remove("lastElapsed"); result.remove("boot");
        result.put("available", error.isEmpty()).put("offlineStatus", error.isEmpty() ? "Available offline" : error);
        return result;
    }
    JSONArray list(String query) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require(); JSONArray items = read(), matches = new JSONArray();
            String term = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
            long wall = System.currentTimeMillis(), elapsed = SystemClock.elapsedRealtime(); int boot = boot();
            for (int i = 0; i < items.length(); i++) {
                JSONObject entry = items.getJSONObject(i), result = display(entry, wall, elapsed, boot);
                String text = (ErpApi.str(result, "documentNo") + " " + ErpApi.str(result, "title") + " " + ErpApi.str(result, "name")).toLowerCase(Locale.ROOT);
                if (term.isEmpty() || text.contains(term)) matches.put(result);
            }
            write(items); return matches;
        }
    }
    JSONObject item(long fileId) throws Exception {
        JSONArray all = list("");
        for (int i = 0; i < all.length(); i++) if (all.getJSONObject(i).getLong("fileId") == fileId) return all.getJSONObject(i);
        return null;
    }
    JSONArray dueReminders() throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            require();
            JSONArray due=new JSONArray(),items=read();
            if(items.length()==0 || locks(context).getBoolean(user,false)) return due;
            String cursorKey="reminderCursor:"+user;
            int start=Math.floorMod(locks(context).getInt(cursorKey,0),items.length());
            int count=Math.min(40,items.length());
            long wall=System.currentTimeMillis(),elapsed=SystemClock.elapsedRealtime();
            int boot=boot();
            for(int offset=0;offset<count;offset++){
                JSONObject entry=items.getJSONObject((start+offset)%items.length());
                Boolean expired=OfflineGrant.reminder(entry,user,generation,needsCredentials(entry),wall,elapsed,boot);
                if(expired!=null) due.put(ErpApi.object("fileId",entry.getLong("fileId"),"grant",entry.getLong("authorizedAt"),"expired",expired));
            }
            locks(context).edit().putInt(cursorKey,(start+count)%items.length()).apply();
            return due;
        }
    }
    void save(JSONObject permit, File original, int requestedDays, long requestStarted) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require();
            long wall = System.currentTimeMillis(), elapsed = SystemClock.elapsedRealtime(); int boot = boot();
            String permitUser = ErpApi.str(permit, "authUserId"); if (permitUser.isEmpty()) permitUser = ErpApi.str(permit, "userId");
            if (!user.equals(LeasePolicy.account(permitUser)) || requestedDays != OfflineGrant.days(permit)
                    || permit.optInt("leaseVersion")!=2 || !OfflineGrant.sameBinding(permit,permit)
                    || locks(context).getBoolean(user,false)) throw new IOException("The ERP returned an invalid offline authorization.");
            long fileId = permit.getLong("fileId");
            if (fileId <= 0 || permit.getLong("documentId") <= 0 || permit.getLong("versionId") <= 0 || !original.isFile() || original.length() < 1 || original.length() > ErpApi.MAX_FILE)
                throw new IOException("The offline document or its authorization is invalid.");
            JSONArray items = read(), next = new JSONArray(); JSONObject previous = null;
            for (int i = 0; i < items.length(); i++) {
                JSONObject entry = items.getJSONObject(i);
                if (entry.getLong("fileId") == fileId) previous = entry; else next.put(entry);
            }
            JSONObject entry = new JSONObject(permit.toString());
            if (requestStarted<0 || elapsed<requestStarted) throw new IOException("The phone clock could not be verified.");
            entry.put("authUserId", user).put("blob", UUID.randomUUID().toString() + ".enc").put("anchorWall", wall-(elapsed-requestStarted)).put("anchorElapsed", requestStarted)
                .put("lastWall", wall).put("lastElapsed", elapsed).put("boot", boot).put("invalidated", false).put("generation",generation);
            if(requestedDays!=0 && wall<permit.getLong("authorizedAt")) throw new IOException("Check the phone date and time before saving offline.");
            OfflineGrant.check(entry,user,generation,false,wall,elapsed,boot);
            File encrypted = blob(entry); boolean saved = false;
            try {
                EncryptedFiles.Info info = LocalSecurity.seal(context, user, purpose(entry), original, encrypted, ErpApi.MAX_FILE);
                if (info.size == 0) throw new IOException("The downloaded document is empty.");
                String expectedHash = ErpApi.str(permit, "sha256");
                if (!expectedHash.isEmpty() && (!expectedHash.matches("(?i)[0-9a-f]{64}") || !expectedHash.equalsIgnoreCase(info.sha256)))
                    throw new IOException("The downloaded document does not match the authorized version.");
                long expectedSize = permit.optLong("size", permit.optLong("sizeBytes", -1));
                if (expectedSize >= 0 && expectedSize != info.size) throw new IOException("The downloaded document has the wrong size.");
                entry.put("size", info.size).put("sha256", info.sha256).put("encryptedSize", encrypted.length());
                next.put(entry); write(next); saved = true;
            } finally { if (!saved) new AtomicFile(encrypted).delete(); }
            if (previous != null) new AtomicFile(blob(previous)).delete();
        }
    }
    /** Recheck a snapshot outside STORAGE_LOCK. A concurrent replacement/removal owns a new blob reference. */
    private static final Object VALIDATION_LOCK = new Object();
    void lockSession() throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK) {
            LocalSecurity.requireAccount(context,user,generation);
            requireCredentialSignIn(context,user);
            JSONArray items=read();
            for(int j=0;j<items.length();j++) items.getJSONObject(j).put("invalidated",true);
            write(items);
        }
    }
    void reconcile(ErpApi api, long onlyFileId) throws Exception {
        synchronized (VALIDATION_LOCK) {
            JSONArray snapshot;
            long epoch=api.hrSessionEpoch();
            synchronized(LocalSecurity.STORAGE_LOCK) {
                require();
                if (locks(context).getBoolean(user,false) || epoch<0 || !user.equals(api.user()))
                    throw new IOException("Sign in to verify saved documents.");
                snapshot=read();
            }
            for(int i=0;i<snapshot.length();i++){
                JSONObject saved=snapshot.getJSONObject(i);
                long fileId=saved.getLong("fileId");
                if(onlyFileId!=0 && onlyFileId!=fileId) continue;
                JSONObject current=null;
                OfflineGrant.Denial denial=null;
                long requestStarted=SystemClock.elapsedRealtime();
                try {
                    if(api.hrSessionEpoch()!=epoch) throw new IOException("Your ERP session changed.");
                    current=api.get(ErpApi.object("op","offlinePermit","documentId",saved.getLong("documentId"),
                        "fileId",fileId,"leaseVersion",2,"days",1));
                    if(OfflineGrant.days(current)!=1 || current.optInt("leaseVersion")!=2 || !user.equalsIgnoreCase(current.optString("authUserId"))
                            || current.optLong("fileId")!=fileId || current.optLong("documentId")!=saved.getLong("documentId")
                            || !OfflineGrant.sameBinding(current,current)) throw new IOException("Invalid ERP verification response.");
                } catch(ErpApi.Rejected error) {
                    if(error.status==401 || ((error.status==403) && !api.signedIn())) {
                        lockSession();
                        throw error;
                    }
                    denial=OfflineGrant.onHttpFailure(error.status);
                    // An unstructured 404 may be a proxy/service outage, rather than a missing ERP row.
                    if((error.status==404 || error.status==403) && (error.response==null ||
                         !(error.status==404?"unavailable":"permission_denied").equals(error.response.optString("code"))))
                        denial=OfflineGrant.Denial.LOCK;
                    if(denial==OfflineGrant.Denial.RETRY) throw error;
                }
                synchronized(LocalSecurity.STORAGE_LOCK) {
                    require();
                    if(locks(context).getBoolean(user,false)) throw new IOException("Sign in to verify saved documents.");
                    if(denial==null && (api.hrSessionEpoch()!=epoch || !user.equals(api.user())))
                        throw new IOException("Your ERP session changed.");
                    JSONArray items=read();
                    for(int j=0;j<items.length();j++){
                        JSONObject entry=items.getJSONObject(j);
                        if(!entry.getString("blob").equals(saved.getString("blob"))) continue;
                        if(denial==OfflineGrant.Denial.REMOVE || (current!=null && !OfflineGrant.sameBinding(entry,current))){
                            items.remove(j); write(items); new AtomicFile(blob(entry)).delete();
                        } else if(denial==OfflineGrant.Denial.LOCK){
                            entry.put("invalidated",true); write(items);
                        } else {
                            long wall=System.currentTimeMillis(), elapsed=SystemClock.elapsedRealtime();
                            try { OfflineGrant.confirm(entry,current,user,generation,wall,requestStarted,elapsed,boot()); }
                            catch(LeasePolicy.Expired expired){ entry.put("spent",true); }
                            catch(IOException locked){ entry.put("invalidated",true); }
                            write(items);
                        }
                        break;
                    }
                }
                if(denial!=null && onlyFileId!=0) throw new IOException("The ERP could not authorize this saved copy.");
            }
        }
    }
    void open(long fileId, JSONObject displayed, File target) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require(); JSONArray items = read(); JSONObject selected = null;
            for (int i = 0; i < items.length(); i++) if (items.getJSONObject(i).getLong("fileId") == fileId) selected = items.getJSONObject(i);
            if (selected == null) throw new IOException("This document is not saved offline.");
            if(!OfflineGrant.sameBinding(selected,displayed)) throw new IOException("Refresh the list before opening this original.");
            try { check(selected, System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot()); }
            catch (LeasePolicy.Expired expired) { selected.put("spent",true); write(items); throw expired; }
            catch (Exception error) { selected.put("invalidated", true); write(items); throw error; }
            write(items);
            try {
                EncryptedFiles.Info info = LocalSecurity.unseal(context, user, purpose(selected), blob(selected), target, ErpApi.MAX_FILE);
                if (info.size != selected.getLong("size") || !info.sha256.equals(selected.getString("sha256"))) throw new IOException("This offline copy failed its integrity check.");
                require();
            } catch (Exception error) { new AtomicFile(target).delete(); throw error; }
        }
    }
    void remove(long fileId) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require(); JSONArray items = read(), next = new JSONArray(); JSONObject removed = null;
            for (int i = 0; i < items.length(); i++) { JSONObject entry = items.getJSONObject(i); if (entry.getLong("fileId") == fileId) removed = entry; else next.put(entry); }
            write(next); if (removed != null) new AtomicFile(blob(removed)).delete();
            purgeTemps(context);
        }
    }
    void clear() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require(); LocalSecurity.deleteTree(folder); LocalSecurity.directory(folder.getParentFile(), user); purgeTemps(context);
        }
    }
    long bytes() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            require(); long size = 0; File[] files = folder.listFiles();
            if (files == null) throw new IOException("The offline library could not be read.");
            for (File file : files) if (file.isFile()) size += file.length();
            return size;
        }
    }
    static void purgeTemps(Context context) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            LocalSecurity.deleteTree(new File(context.getCacheDir(), "offline-previews"));
            File[] downloads = context.getCacheDir().listFiles((parent, name) -> name.startsWith("offline-download-"));
            if (downloads == null) throw new IOException("The private download cache could not be read.");
            for (File download : downloads) LocalSecurity.deleteTree(download);
        }
    }
}
