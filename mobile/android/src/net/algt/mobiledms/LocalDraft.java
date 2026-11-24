package net.algt.mobiledms;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.pdf.PdfDocument;
import android.media.ExifInterface;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.UUID;

final class LocalDraft {
    static final int MAX_PAGES = 10;
    final File folder;
    private final Context context;
    private final String user;
    private final long generation;
    private final File work;
    private final AtomicFile manifest;
    final ArrayList<JSONObject> pages = new ArrayList<>();
    JSONObject scope, record, frozen, lastUpload;
    HrCaptureTarget evidence;
    private JSONArray uploadFingerprints = new JSONArray();

    LocalDraft(Context context, String user) throws Exception {
        this.context = context.getApplicationContext();
        LocalSecurity.bind(context);
        this.user = LeasePolicy.account(user);
        this.generation = LocalSecurity.generation(context);
        LocalSecurity.requireAccount(context, this.user, generation);
        folder = new File(context.getNoBackupFilesDir(), this.user);
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("The phone could not open its draft folder.");
        work = new File(new File(context.getCacheDir(), "draft-work"), this.user);
        manifest = new AtomicFile(new File(folder, "draft.json"));
        reload();
    }

    void reload() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireAccount();
            JSONObject data = read(manifest);
            pages.clear(); scope = record = frozen = lastUpload = null; evidence = null;
            uploadFingerprints = new JSONArray();
            LocalSecurity.deleteTree(work);
            if (data == null) { migratePayloads(); return; }
            evidence = HrCaptureTarget.from(data.optJSONObject("hrEvidence"));
            scope = data.optJSONObject("scope");
            record = data.optJSONObject("record");
            frozen = data.optJSONObject("frozen");
            if (frozen != null && !user.equals(LeasePolicy.account(frozen.optString("authUserId"))))
                throw new IOException("The retained draft belongs to another ERP account.");
            lastUpload = data.optJSONObject("lastUpload");
            JSONArray fingerprints = data.optJSONArray("uploadFingerprints");
            if (fingerprints != null) uploadFingerprints = fingerprints;
            JSONArray entries = data.getJSONArray("pages");
            for (int i = 0; i < entries.length(); i++) pages.add(entries.getJSONObject(i));
            migratePayloads();
        }
    }

    static JSONObject read(AtomicFile file) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            Context context = LocalSecurity.context();
            String account = metadataAccount(context, file);
            return LocalSecurity.readJson(context, account, "draft-json:" + file.getBaseFile().getName(), file, true);
        }
    }

    static void write(AtomicFile file, JSONObject data) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            Context context = LocalSecurity.context();
            String account = metadataAccount(context, file);
            LocalSecurity.writeJson(context, account, "draft-json:" + file.getBaseFile().getName(), file, data);
        }
    }

    private static String metadataAccount(Context context, AtomicFile file) throws IOException {
        File base = file.getBaseFile(), parent = base.getParentFile();
        if (parent == null || !("draft.json".equals(base.getName()) || base.getName().matches("approval-[1-9][0-9]*\\.json")))
            throw new IOException("Invalid private draft metadata reference.");
        String account = LeasePolicy.account(parent.getName());
        if (!parent.getCanonicalFile().equals(new File(context.getNoBackupFilesDir(), account).getCanonicalFile()))
            throw new IOException("Invalid private draft account folder.");
        LocalSecurity.requireAccount(context, account);
        return account;
    }

    void save() throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireAccount();
            try {
                for (JSONObject page : pages) {
                    String id = pageId(page);
                    EncryptedFiles.Info info = LocalSecurity.seal(context, user, "draft-page:" + id, source(page), new File(folder, id + ".enc"), ErpApi.MAX_FILE);
                    page.put("sha256", info.sha256);
                }
                File pdf = new File(work, "document.pdf");
                if (!pages.isEmpty() && !isPdf() && pdf.isFile()) LocalSecurity.seal(context, user, "draft-pdf", pdf, new File(folder, "document.pdf.enc"), ErpApi.MAX_FILE);
            } catch (Exception error) { throw error instanceof IOException ? (IOException) error : new IOException("The draft could not be encrypted.", error); }
            write(manifest, manifestData());
        }
    }

    private JSONObject manifestData() {
        return ErpApi.object("pages",new JSONArray(pages),"hrEvidence",evidence==null?null:evidence.json(),
            "scope",scope,"record",record,"frozen",frozen,"lastUpload",lastUpload,"uploadFingerprints",uploadFingerprints);
    }

    void beginEvidence(HrCaptureTarget target,JSONObject employee) throws IOException {
        requireEditable();
        if (!pages.isEmpty()) throw new IOException("Finish or discard the current upload before filing HR evidence.");
        HrCaptureTarget previous=evidence;
        evidence=target;
        try { destination(null,employee); }
        catch(IOException error){evidence=previous;throw error;}
    }

    void leaveEvidence(HrCaptureTarget expected) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            requireAccount();
            JSONObject updated=manifestData();
            leaveEvidenceManifest(updated,expected,data->write(manifest,data));
            evidence=null;
            record=updated.optJSONObject("record");
            scope=updated.optJSONObject("scope");
        }
    }

    interface ManifestSave {void write(JSONObject manifest) throws IOException;}

    static void leaveEvidenceManifest(JSONObject snapshot,HrCaptureTarget expected,ManifestSave save) throws Exception {
        HrCaptureTarget current=HrCaptureTarget.from(snapshot.optJSONObject("hrEvidence"));
        if(expected==null || !expected.same(current) || expected.previousUpload!=current.previousUpload)
            throw new IOException("The current evidence upload changed. Reopen it before continuing.");
        snapshot.remove("hrEvidence");
        if(snapshot.getJSONArray("pages").length()==0 && snapshot.optJSONObject("frozen")==null){
            snapshot.remove("scope");
            snapshot.remove("record");
        }
        save.write(snapshot);
    }

    static boolean needsFilingLocation(JSONObject frozen,JSONObject scope,JSONObject record) {
        return frozen==null && scope==null && record==null;
    }

    void destination(JSONObject nextScope, JSONObject nextRecord) throws IOException {
        requireEditable();
        HrCaptureTarget.filing(evidence,nextScope,nextRecord);
        JSONObject oldScope = scope, oldRecord = record;
        scope = nextScope;
        record = nextRecord;
        try { save(); }
        catch (IOException error) { scope = oldScope; record = oldRecord; throw error; }
    }

    private void requireAccount() throws IOException { LocalSecurity.requireAccount(context, user, generation); }
    private static String pageId(JSONObject page) throws Exception { return LeasePolicy.account(page.getString("id")); }
    private File workFolder() throws IOException { requireAccount(); return LocalSecurity.directory(work.getParentFile(), user); }
    File source(JSONObject page) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireAccount();
            String id = pageId(page);
            File plain = new File(workFolder(), id), encrypted = new File(folder, id + ".enc");
            if (!plain.exists() && (encrypted.exists() || new File(encrypted.getPath() + ".bak").exists())) LocalSecurity.unseal(context, user, "draft-page:" + id, encrypted, plain, ErpApi.MAX_FILE);
            return plain;
        }
    }
    File uploadFile() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireAccount();
            if (pages.size() == 1 && isPdf()) return source(pages.get(0));
            File plain = new File(workFolder(), "document.pdf"), encrypted = new File(folder, "document.pdf.enc");
            if (!plain.exists() && (encrypted.exists() || new File(encrypted.getPath() + ".bak").exists())) LocalSecurity.unseal(context, user, "draft-pdf", encrypted, plain, ErpApi.MAX_FILE);
            return plain;
        }
    }
    private void deletePage(JSONObject page) throws Exception {
        String id = pageId(page);
        new AtomicFile(new File(folder, id + ".enc")).delete();
        new AtomicFile(new File(work, id)).delete();
        new AtomicFile(new File(folder, id)).delete();
    }
    private void migratePayloads() throws Exception {
        requireAccount();
        File[] files = folder.listFiles();
        if (files == null) throw new IOException("The draft folder could not be read.");
        for (File legacy : files) {
            String name = legacy.getName();
            if (name.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") || "document.pdf".equals(name)) {
                String purpose = "document.pdf".equals(name) ? "draft-pdf" : "draft-page:" + LeasePolicy.account(name);
                LocalSecurity.seal(context, user, purpose, legacy, new File(folder, name + ".enc"), ErpApi.MAX_FILE);
                if (!legacy.delete() && legacy.exists()) throw new IOException("The old unencrypted draft could not be removed.");
            } else if (name.matches("approval-[1-9][0-9]*\\.json(?:\\.bak)?")) {
                String base = name.endsWith(".bak") ? name.substring(0, name.length() - 4) : name;
                read(new AtomicFile(new File(folder, base)));
            }
        }
    }
    static void purgeTemps(Context context) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) { LocalSecurity.deleteTree(new File(context.getCacheDir(), "draft-work")); }
    }
    boolean isPdf() { return !pages.isEmpty() && "application/pdf".equals(ErpApi.str(pages.get(0), "mime")); }

    void add(InputStream input, String name, String mime) throws Exception {
        requireAccount();
        if (frozen != null || isPdf() || pages.size() >= MAX_PAGES || ("application/pdf".equals(mime) && !pages.isEmpty())) {
            throw new IOException("Use one PDF or up to ten photos per draft.");
        }
        long remaining = ErpApi.MAX_FILE;
        for (JSONObject page : pages) remaining -= source(page).length();
        if (remaining <= 0) throw new IOException("A document can be up to 50 MB.");
        JSONObject page = ErpApi.object("id", UUID.randomUUID().toString(), "name", name, "mime", mime);
        File file = source(page);
        boolean saved = false;
        try {
            try (OutputStream output = new FileOutputStream(file)) {
                if (ErpApi.copy(input, output, remaining) == 0) throw new IOException("The selected file is empty.");
            }
            FileFingerprint fingerprint = FileFingerprint.read(file);
            for (JSONObject existing : pages) {
                if (fingerprint.sha256.equals(pageHash(existing))) throw new IOException("This photo is already in the current draft.");
            }
            page.put("sha256", fingerprint.sha256);
            if (!"application/pdf".equals(mime)) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(file.getPath(), options);
                if (options.outWidth < 1 || options.outHeight < 1) throw new IOException("This photo format could not be opened.");
            }
            pages.add(page);
            try { save(); }
            catch (IOException error) { pages.remove(pages.size() - 1); throw error; }
            saved = true;
        } finally { if (!saved) { file.delete(); new AtomicFile(new File(folder, pageId(page) + ".enc")).delete(); } }
    }

    void move(int from, int to) throws IOException {
        requireEditable();
        Collections.swap(pages, from, to);
        try { save(); }
        catch (IOException error) { Collections.swap(pages, from, to); throw error; }
    }

    void replacePhoto(String targetId, InputStream input) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            requireEditable();
            int index = -1;
            long remaining = ErpApi.MAX_FILE;
            for (int i = 0; i < pages.size(); i++) {
                JSONObject page = pages.get(i);
                if (pageId(page).equals(targetId)) index = i;
                else remaining -= source(page).length();
            }
            if (index < 0 || "application/pdf".equals(ErpApi.str(pages.get(index), "mime"))) throw new IOException("The selected photo is no longer in this draft.");
            if (remaining <= 0) throw new IOException("This draft exceeds the available file size.");
            JSONObject previous = pages.get(index);
            JSONObject next = ErpApi.object("id", UUID.randomUUID().toString(), "name", "Edited scan.jpg", "mime", "image/jpeg");
            File file = source(next);
            boolean committed = false;
            try {
                try (OutputStream output = new FileOutputStream(file)) {
                    if (ErpApi.copy(input, output, remaining) == 0) throw new IOException("The edited photo is empty.");
                }
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true; BitmapFactory.decodeFile(file.getPath(), options);
                if (options.outWidth < 1 || options.outHeight < 1) throw new IOException("The edited photo could not be opened.");
                FileFingerprint fingerprint = FileFingerprint.read(file);
                for (int i = 0; i < pages.size(); i++) {
                    if (i != index && fingerprint.sha256.equals(pageHash(pages.get(i)))) throw new IOException("This photo is already in the draft.");
                }
                next.put("sha256", fingerprint.sha256);
                pages.set(index, next);
                try { save(); }
                catch (Exception error) { pages.set(index, previous); throw error; }
                committed = true;
                deletePage(previous);
            } finally { if (!committed) deletePage(next); }
        }
    }

    void remove(int index) throws Exception {
        requireEditable();
        JSONObject page = pages.remove(index);
        try { save(); }
        catch (IOException error) { pages.add(index, page); throw error; }
        deletePage(page);
    }

    private void requireEditable() throws IOException {
        requireAccount();
        if (frozen != null) throw new IOException("Resume the saved upload before editing its pages or destination.");
    }

    void clear() throws Exception { finishCapture(null,null); }

    void uploaded(JSONObject receipt, String signature) throws Exception { finishCapture(receipt,signature); }

    static void finishManifest(JSONObject snapshot,JSONObject receipt,String signature,ManifestSave save) throws Exception {
        if(receipt!=null){
            JSONObject metadata=snapshot.getJSONObject("frozen").getJSONObject("metadata");
            long size=metadata.getLong("file_size_bytes");
            String sha=metadata.getString("sha256_hash");
            JSONArray previous=snapshot.getJSONArray("uploadFingerprints");
            JSONArray next=new JSONArray().put(ErpApi.object("signature",signature,"size",size,"sha256",sha));
            for(int i=0;i<previous.length() && next.length()<100;i++){
                JSONObject entry=previous.getJSONObject(i);
                if(!signature.equals(entry.optString("signature")))next.put(entry);
            }
            snapshot.put("uploadFingerprints",next);
            snapshot.put("lastUpload",ErpApi.object("code",receipt.getString("code"),"id",receipt.getLong("id"),
                "name",metadata.getString("original_filename"),"startPending",true,"size",size,"sha256",sha));
        }
        snapshot.put("pages",new JSONArray());
        snapshot.remove("frozen");
        snapshot.remove("scope");
        if(snapshot.optJSONObject("hrEvidence")==null)snapshot.remove("record");
        save.write(snapshot);
    }

    void useExistingUpload(JSONObject upload, JSONObject match) throws Exception {
        JSONObject previous = lastUpload;
        lastUpload = ErpApi.object("code", upload.getString("code"), "id", upload.getLong("id"),
            "name", upload.getString("name"), "startPending", false,
            "size", match.getLong("size"), "sha256", match.getString("sha256"));
        try { save(); }
        catch (IOException error) { lastUpload = previous; throw error; }
    }

    void unfreeze() throws IOException {
        JSONObject previous = frozen;
        frozen = null;
        try { save(); }
        catch (IOException error) { frozen = previous; throw error; }
    }

    String sourceSignature() throws Exception {
        StringBuilder signature = new StringBuilder();
        for (JSONObject page : pages) signature.append(pageHash(page));
        return signature.toString();
    }

    JSONObject previousFingerprint(String signature) {
        for (int i = 0; i < uploadFingerprints.length(); i++) {
            JSONObject entry = uploadFingerprints.optJSONObject(i);
            if (entry != null && signature.equals(entry.optString("signature"))) return entry;
        }
        return null;
    }

    private String pageHash(JSONObject page) throws Exception {
        String recorded = ErpApi.str(page, "sha256");
        return recorded.isEmpty() ? FileFingerprint.read(source(page)).sha256 : recorded;
    }

    AtomicFile approval(long sessionId) {
        if (sessionId <= 0) throw new IllegalArgumentException("Invalid upload reference");
        return new AtomicFile(new File(folder, "approval-" + sessionId + ".json"));
    }

    void markAiAttempted() throws Exception {
        if (!lastUpload.optBoolean("startPending")) return;
        JSONObject previous = lastUpload;
        lastUpload = new JSONObject(previous.toString()).put("startPending", false);
        try { save(); }
        catch (IOException error) { lastUpload = previous; throw error; }
    }

    private void finishCapture(JSONObject receipt,String signature) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            requireAccount();
            File upload=pages.isEmpty()?null:uploadFile();
            ArrayList<JSONObject> originals=new ArrayList<>(pages);
            JSONObject snapshot=manifestData();
            finishManifest(snapshot,receipt,signature,data->write(manifest,data));
            pages.clear();
            scope=frozen=null;
            record=snapshot.optJSONObject("record");
            lastUpload=snapshot.optJSONObject("lastUpload");
            uploadFingerprints=snapshot.getJSONArray("uploadFingerprints");
            for(JSONObject page:originals)deletePage(page);
            if(upload!=null)upload.delete();
            new AtomicFile(new File(folder,"document.pdf.enc")).delete();
        }
    }

    JSONObject prepareUpload(String user, String requestedName,long epoch) throws Exception {
        requireAccount();
        if (!this.user.equals(LeasePolicy.account(user))) throw new IOException("The draft belongs to another ERP account.");
        if (frozen != null) { HrCaptureTarget.freeze(evidence,epoch,scope,record,frozen); return frozen; }
        if (pages.isEmpty() || (scope == null && record == null)) throw new IOException("Add a file and choose where to file it.");
        String name = requestedName.trim().replaceAll("[\\p{Cc}/\\\\]", "_");
        if (name.isEmpty()) throw new IOException("Enter a file name.");
        if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        File file = uploadFile();
        if (!isPdf()) makePdf(file);
        if (file.length() < 1 || file.length() > ErpApi.MAX_FILE) throw new IOException("A document can be up to 50 MB.");
        FileFingerprint fingerprint = FileFingerprint.read(file);
        JSONObject meta = ErpApi.object("original_filename", name, "mime_type", "application/pdf",
            "file_size_bytes", fingerprint.size, "sha256_hash", fingerprint.sha256);
        JSONObject context = HrCaptureTarget.filing(evidence,scope,record);
        JSONObject request = ErpApi.object("version", 1, "operationId", UUID.randomUUID().toString(), "authUserId", user, "metadata", meta, "context", context);
        if (scope != null) request.put("scope", ErpApi.object("companyId", scope.getLong("companyId"), "branchId", scope.opt("branchId")));
        HrCaptureTarget.freeze(evidence,epoch,scope,record,request);
        return request;
    }

    void retain(JSONObject request,long epoch) throws IOException {
        HrCaptureTarget.freeze(evidence,epoch,scope,record,request);
        JSONObject previous = frozen;
        frozen = request;
        try { save(); }
        catch (IOException error) { frozen = previous; throw error; }
    }

    private void makePdf(File file) throws Exception {
        PdfDocument document = new PdfDocument();
        try {
            for (int index = 0; index < pages.size(); index++) {
                Bitmap photo = readPhoto(source(pages.get(index)), 2400);
                try {
                    int width = photo.getWidth() > photo.getHeight() ? 842 : 595;
                    int height = width == 842 ? 595 : 842;
                    PdfDocument.Page page = document.startPage(new PdfDocument.PageInfo.Builder(width, height, index + 1).create());
                    fit(page.getCanvas(), photo, width, height);
                    document.finishPage(page);
                } finally { photo.recycle(); }
            }
            try (OutputStream output = new FileOutputStream(file)) { document.writeTo(output); }
        } finally { document.close(); }
    }

    private static void fit(Canvas canvas, Bitmap bitmap, int width, int height) {
        float scale = Math.min((float) (width - 16) / bitmap.getWidth(), (float) (height - 16) / bitmap.getHeight());
        int w = Math.round(bitmap.getWidth() * scale), h = Math.round(bitmap.getHeight() * scale);
        int x = (width - w) / 2, y = (height - h) / 2;
        canvas.drawBitmap(bitmap, null, new Rect(x, y, x + w, y + h), new Paint(Paint.FILTER_BITMAP_FLAG));
    }

    static Bitmap readPhoto(File file, int limit) throws IOException {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), options);
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > limit * 1.5) options.inSampleSize *= 2;
        options.inJustDecodeBounds = false;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getPath(), options);
        if (bitmap == null) throw new IOException("The photo could not be opened.");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try { orientation = new ExifInterface(file.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, orientation); }
        catch (IOException ignored) { }
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(-90); matrix.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(-90); break;
            default: return bitmap;
        }
        Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        if (rotated != bitmap) bitmap.recycle();
        return rotated;
    }
}
