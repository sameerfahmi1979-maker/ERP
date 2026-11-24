package net.algt.mobiledms;

public final class NotificationRulesTest {
    private static void check(boolean allowed) { if(!allowed) throw new AssertionError(); }
    public static void main(String[] args) {
        String a="0b724971-625a-41c8-bb7b-1b8931d0ad40", b="87482181-6ee3-4cca-8f10-43ec82551352";
        check(NotificationRules.uuid(a));
        check(!NotificationRules.uuid(a.toUpperCase(java.util.Locale.ROOT)) && !NotificationRules.uuid("1-1-1-1-1") && !NotificationRules.uuid("../private"));
        String r=NotificationRules.ref(a,b,"reply");
        check(NotificationRules.uuid(r) && r.equals(NotificationRules.ref(a,b,"reply")));
        check(!r.equals(NotificationRules.ref(b,a,"reply")) && !r.equals(NotificationRules.ref(a,b,"read")));
        check(NotificationRules.chat("mentions") && !NotificationRules.chat("employeeExpiry") && !NotificationRules.chat("sos"));
        check("ERP".equals(NotificationRules.safeLabel(" E\u202eR\u0001P ")));
        check(NotificationRules.safeLabel(new String(new char[130]).replace('\0','A')).length()==100);
        check(NotificationRules.safePreview(new String(new char[130]).replace('\0','A')).length()==120);
        System.out.println("Passed notification reference isolation, category and lock-screen text boundary fixtures");
    }
}
