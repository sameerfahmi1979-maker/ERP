package net.algt.mobiledms;

/** Fixed-origin, canonical binary paths. Never accept a URL supplied by a notification or message. */
final class CommunicationPath {
    private static final String UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    static boolean valid(String path, String method) {
        if (path == null || method == null) return false;
        if ("POST".equals(method))
            return "/export".equals(path) || path.matches("/(uploads|ptt/uploads)/" + UUID);
        if (!"GET".equals(method)) return false;
        if (path.startsWith("/avatars/")) {
            String id = path.substring("/avatars/".length());
            if (!id.matches("[1-9][0-9]{0,18}")) return false;
            try { return Long.parseLong(id) > 0; } catch (NumberFormatException invalid) { return false; }
        }
        return path.matches("/(attachments|ptt/recordings)/" + UUID + "\\?mode=(participant|review)");
    }
}
