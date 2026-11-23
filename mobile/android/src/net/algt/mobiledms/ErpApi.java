package net.algt.mobiledms;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

final class ErpApi {
    /** A refresh rotates tokens within an epoch; login/logout creates a different session incarnation. */
    static final class SessionFence {
        private long epoch;
        private String owner;
        private boolean stale;
        SessionFence(long epoch, String owner) { establish(epoch, owner); }
        boolean observe(long nextEpoch, String nextOwner, boolean hasSession) {
            if (stale) return false;
            boolean sameOfflineOwner = !hasSession && !owner.isEmpty() && owner.equals(nextOwner);
            if (nextEpoch < 0 || nextEpoch < epoch || (epoch != nextEpoch && !sameOfflineOwner)
                    || (!nextOwner.isEmpty() && !owner.isEmpty() && !owner.equals(nextOwner))) {
                stale = true; return false;
            }
            epoch = nextEpoch;
            if (!nextOwner.isEmpty()) owner = nextOwner;
            return true;
        }
        String owner() { return stale ? "" : owner; }
        boolean current(long epoch) { return !stale && this.epoch == epoch; }
        boolean mayClear(long epoch, String cached, String persisted) {
            return current(epoch) && (cached == null ? persisted == null : cached.equals(persisted));
        }
        void establish(long epoch, String owner) { this.epoch = epoch; this.owner = owner; stale = epoch < 0; }
        static long next(long epoch) throws IOException {
            if (epoch < 0 || epoch == Long.MAX_VALUE) throw new IOException("The saved ERP session cannot be safely replaced. Clear this app's data before signing in.");
            return epoch + 1;
        }
    }
    private static final String ENDPOINT = "https://erp.algt.net/api/mobile/dms/v1";
    private static final String HR_ENDPOINT = "https://erp.algt.net/api/mobile/hr/v1";
    private static final String COMMUNICATIONS_ENDPOINT = "https://erp.algt.net/api/mobile/communications/v1";
    private static final String STORAGE = "mmiefuieduzdiiwnqpie.supabase.co";
    static final long MAX_FILE = 52_428_800;
    private static final String KEY = "algt-mobile-dms-session";
    private final SharedPreferences preferences;
    private final SessionFence fence;
    private JSONObject session;
    private String serialized;
    private String offlineUser = "";

    private static final class SessionSnapshot {
        final long epoch;
        final String stored, owner;
        SessionSnapshot(Map<String, ?> values) {
            Object epochValue = values.get("epoch"), storedValue = values.get("session"), ownerValue = values.get("offline-user");
            epoch = epochValue == null ? 0 : epochValue instanceof Long ? (Long) epochValue : -1;
            stored = storedValue instanceof String ? (String) storedValue : null;
            String candidate = ownerValue instanceof String ? (String) ownerValue : "";
            String canonical = "";
            try { if (!candidate.isEmpty()) canonical = account(candidate); } catch (Exception ignored) { }
            owner = canonical;
        }
    }

    private static String account(String value) throws IOException {
        try {
            String canonical = UUID.fromString(value).toString();
            if (!canonical.equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return canonical;
        } catch (RuntimeException error) { throw new IOException("The ERP session account is invalid.", error); }
    }
    private SessionSnapshot snapshot() { return new SessionSnapshot(preferences.getAll()); }

    ErpApi(Context context) {
        preferences = context.getSharedPreferences("erp-session", Context.MODE_PRIVATE);
        synchronized (UploadJobs.LOCK) {
            SessionSnapshot saved = snapshot();
            fence = new SessionFence(saved.epoch, saved.owner);
            offlineUser = saved.owner;
            try { reload(); } catch (Exception ignored) { session = null; serialized = null; }
        }
    }

    static JSONObject object(Object... values) {
        JSONObject json = new JSONObject();
        try {
            for (int i = 0; i < values.length; i += 2) json.put((String) values[i], values[i + 1] == null ? JSONObject.NULL : values[i + 1]);
        } catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
        return json;
    }

    static String str(JSONObject data, String key) {
        return data == null || data.isNull(key) ? "" : data.optString(key, "");
    }

    static final class Rejected extends IOException {
        final int status;
        final JSONObject response;
        final boolean beforeBusinessRequest;
        Rejected(String message,int status,JSONObject response){this(message,status,response,false);}
        Rejected(String message, int status, JSONObject response,boolean beforeBusinessRequest) {
            super(message);
            this.beforeBusinessRequest=beforeBusinessRequest;
            this.status = status;
            this.response = response;
        }
    }

    // These are used on Android's UI thread. Never wait for the network monitor here.
    String user() {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            return fence.observe(saved.epoch, saved.owner, saved.stored != null) ? fence.owner() : "";
        }
    }
    boolean signedIn() {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            return fence.observe(saved.epoch, saved.owner, saved.stored != null) && saved.stored != null && session != null;
        }
    }

    long hrSessionEpoch() {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            return fence.observe(saved.epoch, saved.owner, saved.stored != null)
                && saved.stored != null && session != null ? saved.epoch : -1;
        }
    }

    /** Reload a rotated token, but never silently adopt a newer login incarnation. Caller holds LOCK. */
    private void reload() throws Exception {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            if (!fence.observe(saved.epoch, saved.owner, saved.stored != null)) {
                session = null; serialized = null; offlineUser = "";
                throw new Rejected("Your ERP session changed. Open the current signed-in account again.", 401, null);
            }
            offlineUser = fence.owner();
            if (saved.stored == null) { session = null; serialized = null; return; }
            if (saved.stored.equals(serialized) && session != null) return;
            serialized = saved.stored;
            try {
                byte[] bytes = Base64.decode(saved.stored, Base64.NO_WRAP);
                if (bytes.length < 28) throw new IOException("The saved ERP session is incomplete.");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, bytes, 0, 12));
                JSONObject current = new JSONObject(new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8));
                String owner = account(current.getString("userId"));
                if (current.getString("accessToken").isEmpty() || current.getString("refreshToken").isEmpty() || current.getLong("expiresAt") <= 0)
                    throw new IOException("The saved ERP session is incomplete.");
                if (!fence.observe(saved.epoch, owner, true)) throw new IOException("The saved ERP session belongs to another account.");
                session = current; offlineUser = owner; fence.establish(saved.epoch, owner);
            } catch (Exception error) { clear(false); throw error; }
        }
    }

    void login(String email, String password) throws Exception {
        synchronized (UploadJobs.LOCK) {
            // Explicit credentials are the only operation allowed to establish a different account.
            long expectedEpoch = snapshot().epoch;
            remember((JSONObject) post(object("op", "login", "email", email, "password", password), null), true, expectedEpoch);
        }
    }

    void logout() throws Exception {
        synchronized (UploadJobs.LOCK) {
            try { reload(); if (session != null) call(object("op", "logout")); }
            finally { clear(true); }
        }
    }

    private void clear(boolean explicitLogout) throws IOException {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            // A stale failure/logout must not erase tokens created or rotated by another instance.
            if (!fence.mayClear(saved.epoch, serialized, saved.stored)) {
                session = null; serialized = null; offlineUser = ""; return;
            }
            String owner = explicitLogout ? "" : !offlineUser.isEmpty() ? offlineUser : fence.owner();
            long nextEpoch = SessionFence.next(saved.epoch);
            SharedPreferences.Editor edit = preferences.edit().remove("session").putLong("epoch", nextEpoch);
            if (owner.isEmpty()) edit.remove("offline-user"); else edit.putString("offline-user", owner);
            boolean committed = edit.commit();
            session = null; serialized = null; offlineUser = owner; fence.establish(nextEpoch, owner);
            if (!committed) throw new IOException("The phone could not clear its saved ERP session.");
        }
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private void remember(JSONObject next, boolean newLogin, long expectedEpoch) throws Exception {
        synchronized (fence) {
            SessionSnapshot saved = snapshot();
            if (saved.epoch != expectedEpoch || (!newLogin && !fence.current(expectedEpoch)))
                throw new Rejected("Your ERP session changed. Sign in again.", 401, null);
            String owner = account(next.getString("userId"));
            if (next.getString("accessToken").isEmpty() || next.getString("refreshToken").isEmpty() || next.getLong("expiresAt") <= 0)
                throw new IOException("The ERP returned an incomplete session.");
            if (!newLogin && !fence.owner().equals(owner)) {
                clear(false); throw new IOException("Your ERP account changed. Sign in again.");
            }
            long nextEpoch = newLogin ? SessionFence.next(expectedEpoch) : expectedEpoch;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            ByteArrayOutputStream encrypted = new ByteArrayOutputStream();
            encrypted.write(cipher.getIV());
            encrypted.write(cipher.doFinal(next.toString().getBytes(StandardCharsets.UTF_8)));
            String stored = Base64.encodeToString(encrypted.toByteArray(), Base64.NO_WRAP);
            if (!preferences.edit().putString("session", stored).putString("offline-user", owner).putLong("epoch", nextEpoch).commit())
                throw new IOException("The phone could not save the ERP session.");
            session = next; serialized = stored; offlineUser = owner; fence.establish(nextEpoch, owner);
        }
    }

    private void refresh() throws Exception {
        reload();
        if (session == null) throw new Rejected("Sign in with your ERP account.", 401, null);
        long expectedEpoch = snapshot().epoch;
        try {
            remember((JSONObject) post(object("op", "refresh", "refreshToken", session.getString("refreshToken")), null), false, expectedEpoch);
        } catch (Rejected error) {
            if (error.status == 401 || error.status == 403) clear(false);
            throw error;
        }
    }

    private String access() throws Exception {
        reload();
        if (session == null || session.optLong("expiresAt") < System.currentTimeMillis() / 1000 + 30) refresh();
        return session.getString("accessToken");
    }

    Object call(JSONObject command) throws Exception {
        return call(command, ENDPOINT);
    }

    Object hrCall(JSONObject command) throws Exception { return call(command, HR_ENDPOINT); }
    JSONObject hrGet(JSONObject command) throws Exception { return (JSONObject) hrCall(command); }
    JSONArray hrList(JSONObject command) throws Exception { return (JSONArray) hrCall(command); }

    Object communicationsCall(JSONObject command) throws Exception {
        final String owner = user();
        final long epoch = sessionEpoch();
        return communicationsCall(command, () -> !owner.isEmpty() && owner.equals(user()) && epoch == sessionEpoch());
    }

    Object communicationsCall(JSONObject command, java.util.function.BooleanSupplier current) throws Exception {
        String token;
        synchronized (UploadJobs.LOCK) {
            DmsArchive.check(current.getAsBoolean());
            token = access();
        }
        DmsArchive.check(current.getAsBoolean());
        Object result = post(new URL(COMMUNICATIONS_ENDPOINT), command, token, false, current);
        DmsArchive.check(current.getAsBoolean());
        return result;
    }

    /** A fixed-origin transport. Callers must fence stream reads/writes and close the connection. */
    HttpsURLConnection communicationsConnection(String path, String method, java.util.function.BooleanSupplier current) throws Exception {
        if (!CommunicationPath.valid(path, method)) throw new IOException("Invalid communication file selection.");
        String token;
        synchronized (UploadJobs.LOCK) {
            DmsArchive.check(current.getAsBoolean());
            token = access();
        }
        DmsArchive.check(current.getAsBoolean());
        return connect(new URL(COMMUNICATIONS_ENDPOINT + path), method, token);
    }

    private Object call(JSONObject command, String endpoint) throws Exception {
        synchronized (UploadJobs.LOCK) {
            String token = access();
            URL destination = new URL(endpoint);
            try { return post(destination, command, token, false); }
            catch (Rejected error) {
                if (error.status != 401) throw error;
                refresh();
                return post(destination, command, session.getString("accessToken"), false);
            }
        }
    }

    long sessionEpoch(){return hrSessionEpoch();}

    JSONObject dmsOnce(JSONObject request, java.util.function.BooleanSupplier current) throws Exception {
        Object result=dmsOriginal(request,current);
        if(!(result instanceof JSONObject))throw new IOException("Invalid document response.");
        return (JSONObject)result;
    }

    Object dmsOriginal(JSONObject request, java.util.function.BooleanSupplier current) throws Exception {
        return dmsOriginal(request,current,()->DmsArchive.check(current.getAsBoolean()),null);
    }
    JSONObject ordinaryApproval(JSONObject request,java.util.function.BooleanSupplier visible,
            DmsTransfer.Source owner,DmsTransfer.BeforeWrite before)throws Exception{
        DmsArchive.check("approve".equals(str(request,"op"))&&before!=null);
        Object result=dmsOriginal(request,visible,owner,before);
        if(!(result instanceof JSONObject))throw new IOException("Invalid document approval response.");
        return (JSONObject)result;
    }
    private Object dmsOriginal(JSONObject request,java.util.function.BooleanSupplier current,
            DmsTransfer.Source mayReceive,DmsTransfer.BeforeWrite before)throws Exception{
        String token;
        synchronized(UploadJobs.LOCK){
            if(!current.getAsBoolean())throw new DmsTransfer.NotSent(null);
            try{token=access();}catch(Rejected rejected){throw new Rejected(rejected.getMessage(),rejected.status,rejected.response,true);}catch(Exception failure){throw new DmsTransfer.NotSent(failure);}
        }
        if(!current.getAsBoolean())throw new DmsTransfer.NotSent(null);
        Object result=post(new URL(ENDPOINT),request,token,false,current,before);
        mayReceive.verify();
        return result;
    }

    String dmsFile(String path,String share,File target,java.util.function.BooleanSupplier current)throws Exception {
        if(!path.matches("\\?share=1&disposition=(inline|attachment)") && !path.matches("\\?fileId=[1-9][0-9]{0,15}&disposition=(inline|attachment)(&expectedDocumentId=[1-9][0-9]{0,15}&expectedVersionId=[1-9][0-9]{0,15}&expectedSourceHash=[a-f0-9]{64})?"))
            throw new IOException("Invalid original file selection.");
        if(path.startsWith("?share")!=DmsRules.tokenValid(share))throw new IOException("Invalid file link.");
        String token; synchronized(UploadJobs.LOCK){DmsArchive.check(current.getAsBoolean());token=access();}
        DmsArchive.check(current.getAsBoolean());
        HttpsURLConnection c=connect(new URL(ENDPOINT+path),"GET",token);
        boolean ok=false;
        try{
            if(share!=null)c.setRequestProperty("X-ALGT-DMS-Share",share);
            int status=c.getResponseCode();
            if(status!=200)throw new Rejected("This original is unavailable for the current source and account.",status,null);
            DmsArchive.check(current.getAsBoolean());
            try(InputStream in=c.getInputStream();OutputStream out=DmsArchive.bounded(DmsArchive.existing(target),MAX_FILE,current)){
                DmsArchive.check(copy(in,out,MAX_FILE)>0 && current.getAsBoolean());
            }ok=true;String mime=c.getContentType();return mime==null?"application/octet-stream":mime.split(";",2)[0];
        }finally{c.disconnect();if(!ok)target.delete();}
    }

    JSONObject get(JSONObject command) throws Exception { return (JSONObject) call(command); }
    JSONArray list(JSONObject command) throws Exception { return (JSONArray) call(command); }

    private static HttpsURLConnection connect(URL url, String method, String token) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(90000);
        connection.setUseCaches(false);
        connection.setRequestMethod(method);
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        return connection;
    }

    JSONObject duplicate(long size, String sha256) throws Exception {
        synchronized (UploadJobs.LOCK) {
            URL url = new URL("https://" + STORAGE + "/rest/v1/rpc/ai_mod04_duplicate_advisory");
            JSONObject body = object("p_sha256", sha256, "p_size", size);
            Object result;
            try { result = post(url, body, access(), true); }
            catch (Rejected error) {
                if (error.status != 401) throw error;
                refresh();
                result = post(url, body, session.getString("accessToken"), true);
            }
            if (result instanceof JSONObject && Boolean.FALSE.equals(((JSONObject) result).opt("authoritative"))) {
                JSONObject match = (JSONObject) result;
                switch (str(match, "status")) {
                    case "no_visible_match": return match;
                    case "existing_document":
                        if (match.optLong("documentId") > 0 && !str(match, "documentNo").isEmpty()) return match;
                        break;
                    case "retained_upload":
                        if (str(match, "sessionCode").matches("[A-Za-z0-9_-]{1,64}")) return match;
                        break;
                    default: break;
                }
            }
            throw new IOException("The ERP could not confirm the duplicate check. Retry the upload.");
        }
    }

    private Object post(JSONObject command, String token) throws Exception {
        return post(new URL(ENDPOINT), command, token, false);
    }

    private Object post(URL url, JSONObject command, String token, boolean duplicateCheck) throws Exception {
        return post(url,command,token,duplicateCheck,()->true);
    }
    private Object post(URL url, JSONObject command, String token, boolean duplicateCheck,java.util.function.BooleanSupplier allowed) throws Exception {
        return post(url,command,token,duplicateCheck,allowed,null);
    }
    private Object post(URL url, JSONObject command,String token,boolean duplicateCheck,java.util.function.BooleanSupplier allowed,DmsTransfer.BeforeWrite before)throws Exception{
        if(!allowed.getAsBoolean())throw new DmsTransfer.NotSent(null);
        HttpsURLConnection connection;
        try{connection=connect(url,"POST",token);}catch(IOException failure){throw new DmsTransfer.NotSent(failure);}
        if (duplicateCheck) connection.setRequestProperty("apikey", PublicErpConfig.KEY);
        try {
            byte[] bytes = command.toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setFixedLengthStreamingMode(bytes.length);
            DmsTransfer.send(connection::getOutputStream,new ByteArrayInputStream(bytes),bytes.length,allowed,before);
            int status = connection.getResponseCode();
            InputStream response = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            JSONObject result = null;
            if (response != null) try (InputStream input = response) {
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                copy(input, body, 2 * 1024 * 1024);
                try { result = new JSONObject(body.toString("UTF-8")); }
                catch (org.json.JSONException ignored) { }
            }
            if (status >= 200 && status < 300 && result != null) {
                if (duplicateCheck) return result;
                if (result.optBoolean("success")) return result.opt("data");
            }
            if (duplicateCheck) throw new Rejected("The ERP could not check for duplicates. Retry the upload.", status, null);
            String error = str(result, "error");
            if (result != null && result.optJSONObject("error") != null)
                error = str(result.optJSONObject("error"), "message");
            if (error.isEmpty()) error = status == 404 ? "The mobile service is unavailable on the ERP server." : "The ERP request could not be confirmed. Try again.";
            throw new Rejected(error, status, result);
        } finally { connection.disconnect(); }
    }

    private static URL storageUrl(String raw, String prefix) throws IOException {
        URL url = new URL(raw);
        if (!"https".equals(url.getProtocol()) || !STORAGE.equals(url.getHost()) || url.getUserInfo() != null
            || (url.getPort() != -1 && url.getPort() != 443) || !url.getPath().startsWith(prefix)) {
            throw new IOException("The ERP returned an unexpected file address.");
        }
        return url;
    }

    void upload(String url, File file, String mime) throws IOException {upload(url,file,mime,()->true);}
    void upload(String url, File file, String mime,java.util.function.BooleanSupplier allowed) throws IOException {
        synchronized (UploadJobs.LOCK) {
            try {
                reload();
                if (session == null) throw new Rejected("Sign in with your ERP account to resume this upload.", 401, null);
            } catch (Exception error) { throw error instanceof IOException ? (IOException) error : new IOException("The saved ERP session could not be checked.", error); }
            if(!allowed.getAsBoolean())throw new DmsTransfer.NotSent(null);
            HttpsURLConnection connection = connect(storageUrl(url, "/storage/v1/object/upload/sign/dms-temp/"), "PUT", null);
            try {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", mime);
                connection.setRequestProperty("x-upsert", "false");
                connection.setFixedLengthStreamingMode(file.length());
                try (InputStream input = new FileInputStream(file)) {
                    DmsTransfer.send(connection::getOutputStream,input,MAX_FILE,allowed);
                }
                if (connection.getResponseCode() / 100 != 2) throw new IOException("File transfer could not be confirmed. Retry the same upload.");
            } finally { connection.disconnect(); }
        }
    }

    void original(long fileId, File target) throws Exception { documentFile(fileId, false, target); }

    void preview(long fileId, File target) throws Exception { documentFile(fileId, true, target); }

    private void documentFile(long fileId, boolean preview, File target) throws Exception {
        synchronized (UploadJobs.LOCK) {
            URL url = new URL(ENDPOINT + "?fileId=" + fileId + "&disposition=" + (preview ? "inline" : "attachment"));
            String denied = preview ? "Your ERP account cannot preview this document." : "Your ERP account cannot download or share this document.";
            try { fetch(url, access(), target, denied); }
            catch (Rejected error) {
                if (error.status != 401) throw error;
                refresh();
                fetch(url, session.getString("accessToken"), target, denied);
            }
        }
    }

    private HttpsURLConnection hrBinary(String path, String owner, long epoch, long employee) throws Exception {
        return hrBinary(path,owner,epoch,employee,"GET");
    }
    private HttpsURLConnection hrBinary(String path, String owner, long epoch, long employee,String method) throws Exception {
        String token;
        synchronized (UploadJobs.LOCK) {
            if (!owner.equals(user()) || epoch != hrSessionEpoch()) throw new Rejected("Sign-in changed.",401,null);
            token = access();
            if (!owner.equals(user()) || epoch != hrSessionEpoch()) throw new Rejected("Sign-in changed.",401,null);
        }
        HttpsURLConnection c=connect(new URL(HR_ENDPOINT+path),method,token);
        try {
            int status=c.getResponseCode();
            if(status!=200) throw new Rejected("The selected original is unavailable.",status,null);
            if(!Long.toString(employee).equals(c.getHeaderField("X-HR-Employee-Id")))
                throw new Rejected("Employee record changed.",409,null);
            return c;
        } catch(Exception e) {c.disconnect();throw e;}
    }

    byte[] hrPhoto(String owner,long epoch,long employee,long dependent,JSONObject source) throws Exception {
        String fingerprint=source.getString("fingerprint");
        long document=source.getLong("documentId"),version=source.getLong("versionId"),file=source.getLong("fileId");
        if(employee<=0 || dependent<0 || document<=0 || version<=0 || file<=0 || !fingerprint.matches("[0-9a-f]{64}"))
            throw new IOException("Employee photo source unavailable.");
        String path="/photo?employeeId="+employee+"&documentId="+document+"&versionId="+version+"&fileId="+file
            +"&fingerprint="+fingerprint+"&mode=preview"+(dependent>0?"&dependentId="+dependent:"");
        HttpsURLConnection c=hrBinary(path,owner,epoch,employee);
        try {
            if(!HrV5Rules.photoHeader(employee,c.getHeaderField("X-HR-Employee-Id"),fingerprint,c.getHeaderField("X-HR-Photo-Fingerprint")) || c.getContentType()==null || !c.getContentType().startsWith("image/"))
                throw new Rejected("Photo selection changed.",409,null);
            try (InputStream in=c.getInputStream(); java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()) {
                copy(in,out,8*1024*1024);return out.toByteArray();
            }
        } finally {c.disconnect();}
    }

    void verifyIssued(String owner,long epoch,long employee,long issuance,String checksum,long size)throws Exception{
        HttpsURLConnection c=hrBinary("/issued-file?employeeId="+employee+"&issuanceId="+issuance+"&checksum="+checksum+"&mode=download",owner,epoch,employee,"HEAD");
        try{
            if(!Long.toString(issuance).equals(c.getHeaderField("X-HR-Issuance-Id")) ||
               !checksum.equals(c.getHeaderField("X-HR-Issued-Checksum")) || !Long.toString(size).equals(c.getHeaderField("X-HR-Issued-Bytes")))
                throw new Rejected("Issued original changed.",409,null);
        }finally{c.disconnect();}
    }
    void hrIssued(String owner,long epoch,long employee,long issuance,String checksum,long size,boolean preview,File file,java.util.function.BooleanSupplier allowed) throws Exception {
        if(employee<=0 || issuance<=0 || !checksum.matches("[0-9a-f]{64}") || size<=0 || size>MAX_FILE)
            throw new IOException("Issued original unavailable.");
        String path="/issued-file?employeeId="+employee+"&issuanceId="+issuance+"&checksum="+checksum+"&mode="+(preview?"preview":"download");
        HttpsURLConnection c=hrBinary(path,owner,epoch,employee);
        try {
            if(!"application/pdf".equalsIgnoreCase(c.getContentType())) throw new IOException("A PDF original is required.");
            try (InputStream in=c.getInputStream();OutputStream out=DmsArchive.bounded(DmsArchive.existing(file),size,allowed)) {
                if(copy(in,out,size)!=size||!allowed.getAsBoolean())throw new IOException("Issued PDF length changed.");
            }
            if(!checksum.equals(FileFingerprint.read(file).sha256))throw new Rejected("Issued PDF changed.",409,null);
        } finally {c.disconnect();}
    }

    void dmsIntakePreview(long sessionId,File target,java.util.function.BooleanSupplier admitted)throws Exception{
        JSONObject signed=dmsOnce(object("op","intakeFile","sessionId",sessionId),admitted);
        HttpsURLConnection c=connect(storageUrl(signed.getString("url"),"/storage/v1/object/sign/dms-temp/"),"GET",null);
        try{int status=c.getResponseCode();if(status!=200)throw new Rejected("The selected intake file is unavailable.",status,null);
            DmsArchive.check(admitted.getAsBoolean());try(InputStream input=c.getInputStream();OutputStream output=DmsArchive.bounded(DmsArchive.existing(target),MAX_FILE,admitted)){DmsArchive.check(copy(input,output,MAX_FILE)>0&&admitted.getAsBoolean());}
        }finally{c.disconnect();}
    }
    void previewUpload(long sessionId, File target) throws Exception {
        synchronized (UploadJobs.LOCK) {
            JSONObject signed = get(object("op", "intakeFile", "sessionId", sessionId));
            URL url = storageUrl(signed.getString("url"), "/storage/v1/object/sign/dms-temp/");
            fetch(url, null, target, "The preview link expired or the upload is unavailable. Open it again.");
        }
    }

    private static void fetch(URL url, String token, File target, String denied) throws IOException {
        HttpsURLConnection connection = connect(url, "GET", token);
        boolean success = false;
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new Rejected(status == 403 || status == 401 ? denied : "The original file is unavailable. Try again.", status, null);
            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(target)) {
                if (copy(input, output, MAX_FILE) == 0) throw new IOException("The original file is empty.");
            }
            success = true;
        } finally {
            connection.disconnect();
            if (!success) target.delete();
        }
    }

    static long copy(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] buffer = new byte[32 * 1024];
        long size = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
            size += count;
            if (size > limit) throw new IOException("A document can be up to 50 MB.");
            output.write(buffer, 0, count);
        }
        return size;
    }
}
