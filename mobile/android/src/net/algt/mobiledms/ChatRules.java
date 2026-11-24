package net.algt.mobiledms;

import java.io.*;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;

/** Wire identifiers and file-transfer invariants shared by the chat views and encrypted storage. */
final class ChatRules {
    static final long FILE_LIMIT = 52_428_800;
    private static final Pattern ID = Pattern.compile("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private static final Pattern PROFILE = Pattern.compile("[1-9][0-9]{0,18}");
    static boolean uuid(String value) { return value != null && ID.matcher(value).matches(); }
    static boolean profile(String value) {
        if (value == null || !PROFILE.matcher(value).matches()) return false;
        try { return Long.parseLong(value) > 0; } catch (NumberFormatException ignored) { return false; }
    }
    static String nextId() { return UUID.randomUUID().toString(); }
    static boolean mayResume(long savedGeneration, long generation, long savedLogout, long logout, boolean manual) {
        return !manual && generation == savedGeneration && savedLogout == logout;
    }
    static void check(BooleanSupplier current) throws IOException {
        if (!current.getAsBoolean()) throw new InterruptedIOException("This chat session has closed.");
    }
    static long copy(InputStream input, OutputStream out, long limit, BooleanSupplier current) throws IOException {
        byte[] buffer = new byte[32768];
        long total = 0;
        while (true) {
            check(current);
            int n = input.read(buffer);
            if (n < 0) break;
            if (n > limit - total) throw new IOException("File exceeds the allowed size.");
            check(current);
            out.write(buffer, 0, n);
            total += n;
        }
        check(current);
        return total;
    }
    static boolean zipHeader(InputStream stream)throws IOException {
        return stream.read()=='P' && stream.read()=='K' && stream.read()==3 && stream.read()==4;
    }
    static String filename(String name) {
        if (name == null) return "attachment";
        String clean = name.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        return clean.isEmpty() || clean.equals(".") || clean.equals("..") ? "attachment" : clean.substring(0, Math.min(clean.length(), 200));
    }
}
