package net.algt.mobiledms;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;

public final class MobileReturnFlowsTest {
    private static void check(boolean ok) { if (!ok) throw new AssertionError(); }
    interface Attempt { void run() throws Exception; }
    private static void denied(Attempt action) throws Exception {
        try { action.run(); throw new AssertionError("expected denial"); } catch (IOException expected) {}
    }
    static JSONObject employee(long id) { return object("entityType","employee","id",id); }
    static void evidence() throws Exception {
        JSONObject form=object("handoffId",UUID.randomUUID().toString(),"employeeId",12,"kind","letter");
        HrCaptureTarget hr = HrCaptureTarget.from(HrCaptureTarget.forForm(3,true,form,54).json());
        JSONObject site=object("entityType","site","id",12), company=object("companyId",3);
        check(HrCaptureTarget.filing(hr,null,employee(12)).getLong("entityId")==12);
        denied(()->HrCaptureTarget.filing(hr,null,employee(14)));
        denied(()->HrCaptureTarget.filing(hr,null,site));
        denied(()->HrCaptureTarget.filing(hr,company,null));
        JSONObject valid=object("context",object("entityType","employee","entityId",12));
        HrCaptureTarget.freeze(hr,3,null,employee(12),valid);
        denied(()->HrCaptureTarget.freeze(hr,4,null,employee(12),valid));
        denied(()->HrCaptureTarget.freeze(hr,3,null,employee(14),valid));
        denied(()->HrCaptureTarget.freeze(hr,3,null,employee(12),object("context",object("entityType","site","entityId",12))));
        check(HrCaptureTarget.filing(null,null,site).getString("entityType").equals("site"));
        check(HrCaptureTarget.filing(null,company,null)==null);
        check(!hr.matches(3,true,null) && hr.matches(3,true,form) && !hr.matches(4,true,form));
    }
    static void reviews() throws Exception {
        Object api=new Object();
        MobileRoute.Scope scope=new MobileRoute.Scope(api,"alice",3,4);
        String op=UUID.randomUUID().toString();
        JSONObject live=object("id",17,"code","U17","name","old");
        DmsReviewContext member=new DmsReviewContext("alice",3,4,object("request",object("authUserId","alice","operationId",op),"receipt",live));
        DmsIntakeEntry source=new DmsIntakeEntry(null,"alice",3,4,17,"U17");
        for(boolean queued:new boolean[]{false,true}) {
            IntakeReview review=new IntakeReview(live,new JSONArray(),queued?member:null,queued?null:source);
            ReviewReturn back=new ReviewReturn(review,scope,8);
            AtomicReference<ReviewReturn> opened=new AtomicReference<>();
            ReviewReturn.verifiedDuplicate(back,7,(id,parent)->{check(queued && id==7);opened.set(parent);},
                parent->{check(!queued);opened.set(parent);});
            check(opened.get()==back);
            StringBuilder result=new StringBuilder();
            for(long generation:new long[]{8,9}){
                result.setLength(0);
                opened.get().resume(scope,generation,true,r->{check(r==review);result.append("paint");},
                    code->{check(code.equals(op));result.append("read member");},
                    intake->{check(intake==source);result.append("read intake");},()->result.append("blocked"));
                check(result.toString().equals(generation==8?"paint":queued?"read member":"read intake"));
            }
        }
        MobileRoute nav=new MobileRoute(); final int[] calls={0};
        MobileRoute.Visit preview=nav.enter(MobileRoute.Id.LEGACY_PREVIEW,scope,()->calls[0]++);
        MobileRoute.PreviewReturn pending=new MobileRoute.PreviewReturn();
        int[] denied={0};Runnable rejected=()->denied[0]++;
        pending.deleted(preview);
        check(!pending.consume(nav,scope,false,true,false,rejected) && !pending.consume(nav,scope,true,true,true,rejected));
        check(pending.consume(nav,scope,true,true,false,rejected) && calls[0]==1);
        check(!pending.consume(nav,scope,true,true,false,rejected));
        pending.deleted(preview);check(!pending.consume(nav,scope,true,false,false,rejected));
        check(!pending.consume(nav,scope,true,true,false,rejected));
        pending.deleted(preview);
        check(!pending.consume(nav,new MobileRoute.Scope(api,"bob",3,4),true,true,false,rejected) && calls[0]==1);
        check(denied[0]==2);
    }
    static void tasks() throws Exception {
        MobileRoute.Scope scope=new MobileRoute.Scope(new Object(),"alice",3,4);
        JSONObject row=object("id",19,"sessionCode","S19","title","old");
        String member=UUID.randomUUID().toString();
        JSONObject live=object("id",19,"code","S19"), receipt=object("receipt",live,"request",object("authUserId","alice","operationId",member));
        CaptureOrigin task=CaptureOrigin.task(scope,"uploads",4,row);
        DmsIntakeEntry intake=new DmsIntakeEntry(null,"alice",3,4,0,"S19");
        for(boolean queued:new boolean[]{true,false}) {
            AtomicReference<CaptureOrigin> parent=new AtomicReference<>();
            task.dispatch(intake.read(c->live,()->queued?new JSONArray().put(receipt):new JSONArray(),()->true),
                (op,origin)->{check(queued && op.equals(member));parent.set(origin);},
                (data,origin)->{check(!queued && data==live);parent.set(origin);});
            check(parent.get()==task);
            DmsIntakeEntry.Visit oldView=new DmsIntakeEntry.Visit(()->true);
            DmsIntakeEntry.Route delayed=intake.read(c->live,()->queued?new JSONArray().put(receipt):new JSONArray(),oldView);
            oldView.retire();
            task.dispatch(delayed,(op,origin)->{throw new AssertionError("retired queue detail");},
                (data,origin)->{throw new AssertionError("retired ordinary detail");});
            JSONObject fresh=object("id",19,"sessionCode","S19","title","new");
            JSONObject command=task.command();check(command.getInt("page")==4 && command.getString("kind").equals("uploads"));
            check(task.find(new JSONArray().put(fresh))==fresh);
            check(task.find(new JSONArray().put(object("id",19,"sessionCode","new")))==null);
            for (boolean missing:new boolean[]{false,true}) {
                StringBuilder result=new StringBuilder();
                parent.get().returnTo(scope,()->result.append("documents"),()->result.append("queue"),origin->{
                    JSONObject found=origin.find(missing?new JSONArray():new JSONArray().put(fresh));
                    origin.show(found,detail->result.append(detail.optString("title")),(kind,page)->result.append(kind).append(page));
                });
                check(result.toString().equals(missing?"uploads4":"new"));
            }
        }
        StringBuilder direct=new StringBuilder();
        CaptureOrigin.queue(scope).returnTo(scope,()->direct.append("documents"),()->direct.append("queue"),unused->{throw new AssertionError();});
        check(direct.toString().equals("queue"));
    }
    static void offline() throws Exception {
        JSONObject filter=object("entityId",12,"entityType","employee","search","permit","validity","valid","typeId",2);
        OfflineOrigin origin=OfflineOrigin.list(filter,"Employee A","Permit",4,()->{});
        filter.put("search","different");
        StringBuilder result=new StringBuilder();
        OfflineOrigin.Host host=new OfflineOrigin.Host(){
            public void documents(){result.append("documents");} public void more(){result.append("more");}
            public void reconnect(){result.append("reconnect");}
            public void list(JSONObject criteria,String entity,String type,int page,Runnable back){
                check(criteria.optLong("entityId")==12 && type.equals("Permit") && page==4);
                result.append(criteria.optString("search"));
            }
        };
        origin.back(host);check(result.toString().equals("permit"));
        OfflineOrigin.Library root=OfflineOrigin.root().search("visa");
        AtomicReference<OfflineOrigin.Library> restored=new AtomicReference<>();
        root.settingsBack(restored::set).run();
        OfflineOrigin.Library returned=restored.get();
        result.setLength(0);check(returned.query.equals("visa"));returned.origin.back(host);check(result.toString().equals("reconnect"));
        check(!MobileWorkspace.documentNotifications(true,false) && !MobileWorkspace.documentNotifications(false,true)
            && MobileWorkspace.documentNotifications(true,true));
    }
    public static void main(String[] args)throws Exception{
        evidence();reviews();tasks();offline();
        System.out.println("MobileReturnFlowsTest passed: HR filing/freeze, both duplicate paths, deferred preview, ordinary/queue task origins, library/settings and notification permission.");
    }
}
