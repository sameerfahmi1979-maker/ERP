package net.algt.mobiledms;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

final class CommunicationsApi {
    final ErpApi erp;
    final BooleanSupplier current;
    CommunicationsApi(ErpApi erp, BooleanSupplier current) { this.erp = erp; this.current = current; }

    static JSONObject args(Object... pairs) { return ErpApi.object(pairs); }
    static String text(JSONObject obj, String key) {
        return obj != null && obj.opt(key) instanceof String ? (String) obj.opt(key) : "";
    }
    static String required(JSONObject obj, String key) throws IOException {
        String value = text(obj, key);
        if (value.isEmpty()) throw new IOException("Invalid ERP response (" + key + ").");
        return value;
    }
    static String id(JSONObject obj, String key) throws IOException {
        String value = required(obj, key);
        if (!ChatRules.uuid(value)) throw new IOException("Invalid ERP chat identifier.");
        return value;
    }
    JSONObject call(String op, JSONObject fields) throws Exception {
        ChatRules.check(current);
        Object response = erp.communicationsCall(args("op", op, "args", fields), current);
        if (!(response instanceof JSONObject)) throw new IOException("The ERP returned an invalid communications response.");
        ChatRules.check(current);
        return (JSONObject)response;
    }
    JSONObject mutate(String op, JSONObject fields) throws Exception {
        if (!fields.has("clientMutationId")) fields.put("clientMutationId", ChatRules.nextId());
        return call(op, fields);
    }
    JSONObject page(String op, JSONObject fields) throws Exception {
        JSONObject page = call(op, fields);
        JSONArray rows = page.optJSONArray("items");
        if (rows == null || rows.length() > 100 || !page.isNull("nextCursor") && !(page.opt("nextCursor") instanceof String))
            throw new IOException("The ERP returned an invalid page.");
        for (int i = 0; i < rows.length(); i++) if (rows.optJSONObject(i) == null) throw new IOException("Invalid ERP record.");
        return page;
    }
    void upload(String upload, String mime, File file) throws Exception {
        if (!ChatRules.uuid(upload) || file.length() < 1 || file.length() > ChatRules.FILE_LIMIT) throw new IOException("Invalid upload.");
        HttpsURLConnection conn = erp.communicationsConnection("/uploads/" + upload, "POST", current);
        try {
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(file.length());
            conn.setRequestProperty("Content-Type", mime);
            try (InputStream in = new FileInputStream(file); OutputStream out = conn.getOutputStream()) {
                if (ChatRules.copy(in, out, file.length(), current) != file.length()) throw new IOException("The attachment changed.");
            }
            status(conn);
        } finally { conn.disconnect(); }
    }
    void download(String path, JSONObject body, File target, long max, long expected) throws Exception {
        HttpsURLConnection conn = erp.communicationsConnection(path, body == null ? "GET" : "POST", current);
        boolean done = false;
        try {
            if (body != null) {
                byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(data.length);
                conn.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = conn.getOutputStream()) { ChatRules.check(current); out.write(data); }
            }
            status(conn);
            if ("/export".equals(path) && !"application/zip".equalsIgnoreCase(String.valueOf(conn.getContentType()).split(";")[0].trim()))
                throw new IOException("The ERP did not return a ZIP export.");
            long advertised = conn.getContentLengthLong();
            if (advertised > max || expected >= 0 && advertised >= 0 && expected != advertised) throw new IOException("Unexpected download size.");
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                long n = ChatRules.copy(in, out, max, current);
                if (n < 1 || expected >= 0 && n != expected || advertised >= 0 && n != advertised) throw new IOException("Incomplete download.");
            }
            if ("/export".equals(path)) try (InputStream in = new FileInputStream(target)) {
                if (!ChatRules.zipHeader(in)) throw new IOException("The ERP returned an invalid ZIP export.");
            }
            ChatRules.check(current);
            done = true;
        } finally { conn.disconnect(); if (!done) target.delete(); }
    }
    private void status(HttpsURLConnection conn) throws Exception {
        ChatRules.check(current);
        int status = conn.getResponseCode();
        if (status < 200 || status >= 300) throw new ErpApi.Rejected("ERP file service returned HTTP " + status + ".",status,null);
        ChatRules.check(current);
    }
}
