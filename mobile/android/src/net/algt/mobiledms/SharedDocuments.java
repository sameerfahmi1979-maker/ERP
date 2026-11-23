package net.algt.mobiledms;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class SharedDocuments extends ContentProvider {
    private static final String AUTHORITY = "net.algt.mobiledms.documents";
    private static final long MAX_AGE_MS = 60 * 60 * 1000L;
    private static final String[] COLUMNS = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

    private static File folder(Context context) { return new File(context.getCacheDir(), "shared-documents"); }

    static File prepare(Context context, String name) throws IOException {
        prune(context, false);
        File share = new File(folder(context), UUID.randomUUID().toString());
        if (!share.mkdirs()) throw new IOException("The phone could not prepare the attachment.");
        return new File(share, fileName(name));
    }

    static String fileName(String name) {
        String safe = name.trim().replaceAll("[\\p{Cc}/\\\\]", "_");
        if (safe.isEmpty() || ".".equals(safe) || "..".equals(safe)) return "Document";
        if (safe.codePointCount(0, safe.length()) <= 60) return safe;
        return safe.substring(0, safe.offsetByCodePoints(0, 38)) + "_" + safe.substring(safe.offsetByCodePoints(safe.length(), -21));
    }

    static Uri uri(File file) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY)
            .appendPath(file.getParentFile().getName()).appendPath(file.getName()).build();
    }

    static void remove(File file) {
        file.delete();
        file.getParentFile().delete();
    }

    static void prune(Context context, boolean all) {
        File[] shares = folder(context).listFiles();
        if (shares == null) return;
        long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
        for (File share : shares) {
            if (!all && share.lastModified() >= cutoff) continue;
            File[] files = share.listFiles();
            if (files != null) for (File file : files) file.delete();
            share.delete();
        }
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        List<String> parts = uri.getPathSegments();
        if (!AUTHORITY.equals(uri.getAuthority()) || parts.size() != 2) throw new FileNotFoundException();
        String id = parts.get(0), name = parts.get(1);
        try {
            if (!UUID.fromString(id).toString().equals(id) || !fileName(name).equals(name)) throw new FileNotFoundException();
        } catch (IllegalArgumentException error) { throw new FileNotFoundException(); }
        File parent = new File(folder(getContext()), id);
        File file = new File(parent, name);
        if (!file.isFile() || System.currentTimeMillis() - file.lastModified() >= MAX_AGE_MS) throw new FileNotFoundException();
        return file;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) {
        try {
            String name = resolve(uri).getName();
            int dot = name.lastIndexOf('.');
            String mime = dot < 0 ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
            return mime == null ? "application/octet-stream" : mime;
        } catch (FileNotFoundException error) { return null; }
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File file = resolve(uri);
            String[] columns = projection == null ? COLUMNS : projection;
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = file.getName();
                if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            }
            cursor.addRow(values);
            return cursor;
        } catch (FileNotFoundException error) { return null; }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
