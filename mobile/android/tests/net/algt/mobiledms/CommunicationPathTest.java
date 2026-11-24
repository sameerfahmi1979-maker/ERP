package net.algt.mobiledms;

public final class CommunicationPathTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] ignored) {
        String id = "aabbccdd-1234-4234-8234-aabbccddeeff";
        check(CommunicationPath.valid("/uploads/" + id, "POST"));
        check(CommunicationPath.valid("/ptt/uploads/" + id, "POST"));
        check(CommunicationPath.valid("/export", "POST"));
        check(CommunicationPath.valid("/attachments/" + id + "?mode=participant", "GET"));
        check(CommunicationPath.valid("/ptt/recordings/" + id + "?mode=review", "GET"));
        check(CommunicationPath.valid("/avatars/123", "GET"));
        check(CommunicationPath.valid("/avatars/9223372036854775807", "GET"));
        check(!CommunicationPath.valid("/avatars/9223372036854775808", "GET"));
        check(!CommunicationPath.valid("/avatars/0123", "GET"));
        String[] rejected = {"https://evil.test/", "//evil.test/uploads/" + id, "/../uploads/" + id,
            "/uploads/%2e%2e", "/attachments/" + id, "/attachments/" + id + "?mode=admin",
            "/attachments/" + id + "?mode=review&token=leak", "/avatars/0", "/avatars/-1",
            "/avatars/123#fragment", "/avatars/123?destination=https://evil.test", "/avatars/123\r\nX:bad"};
        for (String path : rejected) { check(!CommunicationPath.valid(path, "GET")); check(!CommunicationPath.valid(path, "POST")); }
        check(!CommunicationPath.valid("/uploads/" + id, "GET"));
        check(!CommunicationPath.valid("/avatars/123", "DELETE"));
        check(!CommunicationPath.valid(null, "GET"));
        System.out.println("CommunicationPathTest passed");
    }
}
