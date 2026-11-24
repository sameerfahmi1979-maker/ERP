package net.algt.mobiledms;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Navigation references are deliberately independent of any file path, label or notification body. */
final class NotificationRules {
    static boolean uuid(String value) {
        if (value == null || value.length()!=36) return false;
        try { return UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException invalid) { return false; }
    }
    static boolean chat(String category) { return "direct".equals(category) || "groups".equals(category) || "mentions".equals(category); }
    static String ref(String account,String id,String action) {
        return UUID.nameUUIDFromBytes((account+"|"+id+"|"+action).getBytes(StandardCharsets.UTF_8)).toString();
    }
    static String safePreview(String text) {
        if(text==null)return "";
        String plain=text.replaceAll("[\\p{Cntrl}\\p{Cf}]"," ").trim();
        return plain.substring(0,Math.min(plain.length(),120));
    }
    static String safeLabel(String label) {
        if (label==null) return "";
        String plain=label.replaceAll("[\\p{Cntrl}\\p{Cf}]","").trim();
        return plain.substring(0,Math.min(plain.length(),100));
    }
}

