package net.algt.mobiledms;

import java.util.UUID;
import org.json.JSONObject;
import static net.algt.mobiledms.MobileRoute.Id.*;
import static net.algt.mobiledms.MobileRoute.Destination.*;
import static net.algt.mobiledms.ErpApi.object;

public final class MobileRouteTest {
    private final Object api = new Object();
    private final MobileRoute.Scope owner = new MobileRoute.Scope(api, "user", 5, 8);
    private final MobileRoute nav = new MobileRoute();
    private String result = "";

    private void check(boolean ok) { if (!ok) throw new AssertionError("route " + nav.current().id + " " + result); }
    private void open(MobileRoute.Id id, Runnable back) { nav.enter(id, owner, back); }
    private void back() { check(nav.back(nav.current(), owner)); }
    private void exercise() throws Exception {
        open(INBOX_HOME, null);
        open(HR_REQUEST_LIST, () -> open(INBOX_HOME, null));
        Runnable sameList = () -> { result = "team 37 page 4"; open(HR_REQUEST_LIST, () -> open(INBOX_HOME, null)); };
        open(HR_REQUEST, sameList);
        check(nav.current().destination == INBOX);
        back(); check(result.equals("team 37 page 4") && nav.current().destination == INBOX);
        back(); check(nav.current().id == INBOX_HOME);

        open(MORE_HOME, null);
        open(DMS_RECEIPTS, () -> open(MORE_HOME, null));
        open(DOCUMENT, () -> open(DMS_RECEIPTS, () -> open(MORE_HOME, null)));
        open(DMS_PREVIEW, () -> open(DOCUMENT, () -> open(DMS_RECEIPTS, () -> open(MORE_HOME, null))));
        check(nav.current().destination == MORE && nav.current().id.viewer());
        back(); back(); back(); check(nav.current().id == MORE_HOME);

        open(HR_HOME, null);
        open(HR_DIRECTORY, null);
        open(HR_RECORD, () -> { result = "directory filtered page 8"; open(HR_DIRECTORY, null); });
        MobileRoute.Visit oldPerson = nav.current();
        open(HR_RECORD, () -> result = "employee B");
        check(!nav.back(oldPerson, owner));
        for (MobileRoute.Scope changed : new MobileRoute.Scope[]{
            new MobileRoute.Scope(api,"other",5,8), new MobileRoute.Scope(api,"user",6,8),
            new MobileRoute.Scope(api,"user",5,9), new MobileRoute.Scope(new Object(),"user",5,8)})
            check(!nav.back(nav.current(), changed));
        back(); check(result.equals("employee B"));
        MobileRoute.SubjectReturn evidence = new MobileRoute.SubjectReturn(owner,42,() -> result = "original HR closure");
        evidence.resume(owner,42,() -> result = "encrypted recheck");
        check(result.equals("original HR closure"));
        evidence.resume(owner,43,() -> result = "changed subject recheck");
        check(result.equals("changed subject recheck"));
        evidence.resume(new MobileRoute.Scope(api,"user",6,8),42,() -> result = "changed session recheck");
        check(result.equals("changed session recheck"));
        check(!HrWorkspace.hasInbox(object("own",false,"employeeId",42,"capabilities",object("requests",true))));
        check(HrWorkspace.hasInbox(object("own",false,"capabilities",object("serviceReview",true))));
        open(HR_CAPTURE, () -> result = "current HR request");
        open(REVIEW, () -> open(HR_CAPTURE, () -> result = "current HR request"));
        check(nav.current().destination == HR); back(); back(); check(result.equals("current HR request"));

        JSONObject item = object("request",object("operationId",UUID.randomUUID().toString(),"authUserId","user"),
            "receipt",object("id",19,"code","I19"));
        DmsReviewContext member = new DmsReviewContext("user",5,8,item);
        open(QUEUE_MEMBER, null);
        check(nav.current().destination == DOCUMENTS);
        Runnable exit = MobileRoute.reviewExit(member, op -> result = op, () -> result = "ordinary HR evidence");
        DmsReviewContext.Detour detour = member.detour(ctx -> {
            check(ctx == member);
            open(REVIEW, exit);
        });
        open(MATCHES, detour::returnToReview);
        detour.openMatch(returnToReview -> open(DOCUMENT, returnToReview));
        back(); check(nav.current().id == REVIEW); back(); check(result.equals(member.member));
        open(SIGN_IN, null); check(nav.current().destination == null && !nav.back(oldPerson,owner));
        System.out.println("MobileRouteTest passed: Inbox HR, More receipt/preview, selected employee, scope replacement, HR evidence and typed queue detour Back.");
    }
    public static void main(String[] args) throws Exception { new MobileRouteTest().exercise(); }
}
