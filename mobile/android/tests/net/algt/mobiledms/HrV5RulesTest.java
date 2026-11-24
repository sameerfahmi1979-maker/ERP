package net.algt.mobiledms;

public class HrV5RulesTest {
    static void check(boolean condition) { if (!condition) throw new AssertionError(); }
    public static void main(String[] args) {
        check(!HrV5Rules.subject(21,22) && !HrV5Rules.subject(0,0) && HrV5Rules.subject(21,21));
        check(HrV5Rules.full("full",true) && !HrV5Rules.full("summary",true) && !HrV5Rules.full("full",false));
        check(HrV5Rules.restore("a",3,"a",3,true) && !HrV5Rules.restore("a",3,"b",3,true)
            && !HrV5Rules.restore("a",3,"a",4,true) && !HrV5Rules.restore("a",3,"a",3,false));
        check(HrV5Rules.sample(8192,4096,256)==32 && HrV5Rules.sample(100000,100000,256)==0);
        check(HrV5Rules.effect("approved").equals("Accepted for HR action")
            && !HrV5Rules.effect("pending").equals(HrV5Rules.effect("fulfilled")));
        check(HrV5Rules.receipt("serviceSubmit").equals("serviceReceipt")
            && HrV5Rules.receipt("issueAcknowledge").equals("serviceReceipt")
            && HrV5Rules.receipt("leaveSubmit").equals("receipt"));
        check(HrV5Rules.selfAction(21,21,true) && !HrV5Rules.selfAction(21,22,true) && !HrV5Rules.selfAction(21,21,false));
        check(HrV5Rules.offered(new String[]{"en","ar"},"ar") && !HrV5Rules.offered(new String[]{"en"},"bilingual"));
        String fingerprint=String.join("",java.util.Collections.nCopies(64,"a"));
        check(HrV5Rules.photoHeader(21,"21",fingerprint,fingerprint) && !HrV5Rules.photoHeader(21,"22",fingerprint,fingerprint)
            && !HrV5Rules.photoHeader(21,"21",fingerprint,"redacted") && !HrV5Rules.photoHeader(21,"21","",""));
        check(HrV5Rules.receiptEffect("serviceDecision","approve","approved") && !HrV5Rules.receiptEffect("serviceDecision","approve","fulfilled"));
        check(!HrV5Rules.receiptEffect("serviceFulfil","","approved") && HrV5Rules.receiptEffect("serviceFulfil","","fulfilled"));
        System.out.println("HrV5RulesTest passed (subject, scope, restore, image, offered choice, review and receipt boundaries)");
    }
}
