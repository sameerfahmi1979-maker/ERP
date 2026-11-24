package net.algt.mobiledms;
import java.io.IOException;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

public final class DmsFix2FlowsTest {
    static final String MEMBER="00000000-0000-4000-8000-000000000001", APPROVAL="00000000-0000-4000-8000-000000000002";
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    static JSONObject preparation(int... files){
        JSONArray ids=new JSONArray();for(int f:files)ids.put(f);
        return cmd("processingAction","documentId",8,"sourceHash","source","snapshot","same","action","prepare_source","fileIds",ids);
    }
    static void selections()throws Exception {
        JSONObject old=object("lock","processing/8","payload",preparation(41,43).toString(),"sourceConflict",true);
        check(!DmsOperationStore.blocks(old,preparation(42,44),"processing/8"));
        check(DmsOperationStore.blocks(old,preparation(43,41),"processing/8"));
        check(DmsOperationStore.blocks(old,preparation(42,43),"processing/8"));
        check(DmsOperationStore.blocks(old,preparation(42,42),"processing/8"));
    }
    static JSONObject member(){
        return object("epoch",3,"request",object("operationId",MEMBER,"authUserId","alice"),"state","uploaded",
            "evidence",object("documentTypeId",17),"receipt",object("id",21,"code","U21"));
    }
    static void entries()throws Exception {
        JSONObject row=member(); JSONArray index=new JSONArray().put(row);
        JSONObject live=object("id",21,"code","U21","status","current");
        AtomicBoolean active=new AtomicBoolean(true);AtomicInteger queued=new AtomicInteger(),ordinary=new AtomicInteger(),reads=new AtomicInteger();
        AtomicReference<DmsIntakeEntry> captured=new AtomicReference<>();
        JSONObject task=object("id",999,"sessionCode","U21");
        MobileWorkspace.openTaskUpload(task,(session,code)->new DmsIntakeEntry(null,"alice",3,7,session,code),captured::set);
        DmsIntakeEntry visit=captured.get();
        DmsIntakeEntry.Reader read=code->{reads.incrementAndGet();check(code.equals("U21"));return live;};
        DmsIntakeEntry.Route route=visit.read(read,()->index,active::get);
        route.show(op->{check(op.equals(MEMBER));queued.incrementAndGet();},r->ordinary.incrementAndGet());
        put(row,"saveOp",APPROVAL);put(row,"approval",object("operationId",APPROVAL));
        MobileWorkspace.openTaskUpload(task,(session,code)->new DmsIntakeEntry(null,"alice",3,7,session,code),captured::set);
        captured.get().read(read,()->index,active::get).show(op->{check(MEMBER.equals(op));queued.incrementAndGet();},r->ordinary.incrementAndGet());
        check(queued.get()==2&&ordinary.get()==0);
        new DmsIntakeEntry(null,"alice",3,7,21,"U21").read(read,()->index,active::get).show(op->{check(MEMBER.equals(op));},r->{throw new AssertionError("ordinary review");});
        DmsIntakeEntry unrelated=new DmsIntakeEntry(null,"alice",3,7,22,"other");
        unrelated.read(code->object("id",22,"code","other"),()->index,active::get).show(op->queued.incrementAndGet(),r->ordinary.incrementAndGet());
        check(ordinary.get()==1);
        DmsFixFlowsTest.denied(()->visit.read(code->object("id",99,"code","U21"),()->index,active::get));
        DmsFixFlowsTest.denied(()->new DmsIntakeEntry(null,"bob",3,7,21,"U21").read(read,()->index,active::get));
        DmsFixFlowsTest.denied(()->visit.read(read,()->new JSONArray().put(row).put(copy(row)),active::get));
        DmsIntakeEntry exact=new DmsIntakeEntry(null,"alice",3,7,21,"U21");
        check(!exact.origin("alice",4,7)&&!exact.origin("alice",3,8)&&!exact.origin("bob",3,7));
        DmsFixFlowsTest.denied(()->exact.read(code->{active.set(false);return live;},()->new JSONArray(),active::get));
        active.set(true);DmsIntakeEntry.Visit oldPage=new DmsIntakeEntry.Visit(active::get);
        DmsIntakeEntry.Route retired=exact.read(read,JSONArray::new,oldPage);
        active.set(false);oldPage.retire();active.set(true);
        retired.show(op->{throw new AssertionError();},r->{throw new AssertionError("retired callback");});
        active.set(true);AtomicReference<String> status=new AtomicReference<>();
        exact.read(code->object("id",21,"code","U21","status","fresh"),JSONArray::new,new DmsIntakeEntry.Visit(active::get))
            .show(op->{throw new AssertionError();},r->status.set(str(r,"status")));
        check("fresh".equals(status.get())&&reads.get()>=3);
    }
    static void refusals()throws Exception{
        for(int status:new int[]{401,403}){
            ErpApi.Rejected denied=new ErpApi.Rejected("declined",status,object("success",false,"error","Denied","code",status==401?"authentication_required":"permission_denied"));
            JSONObject row=object("state","uploaded","epoch",3,"startOutcome","unknown");
            try { DmsQueue.startOnce(()->{throw denied;},s->put(row,"startOutcome",s));throw new AssertionError(); }
            catch(ErpApi.Rejected e){check(e==denied&&DmsWorkspace.accessDenied(e));}
            check(DmsQueue.canStart(row,object("canStart",true),3)&&!DmsQueue.canStart(row,object("canStart",false),3));
            check(!DmsQueue.canStart(row,object("canStart",true),4));
            put(denied.response,"uncertain",true);check("unknown".equals(DmsQueue.refusedStart(denied)));
            check("unknown".equals(DmsQueue.refusedStart(new ErpApi.Rejected("other",status,object("success",false,"code","upstream_error")))));
        }
    }
    static void finish()throws Exception{
        JSONObject row=member();row.remove("evidence");
        JSONObject body=cmd("approve","operationId",APPROVAL,"input",object("uploadSessionId",21,"documentTypeId",2,"links",new JSONArray()),"review",object("sessionId",21,"typeId",2));
        JSONObject atom=DmsApprovalIntent.freeze(new DmsReviewContext("alice",3,7,row),row,body,null);
        put(row,"approval",atom);put(row,"saveOp",APPROVAL);put(row,"saveEpoch",3);
        JSONArray index=new JSONArray().put(row);JSONObject live=object("id",21,"code","U21","documentId",77);
        DmsFixFlowsTest.denied(()->DmsQueue.finishVerified(index,MEMBER,"alice",live));
        check(index.length()==1&&row.getJSONObject("approval").getString("payload").equals(body.toString())&&DmsQueue.archivable(row));
        JSONObject proof=object("operation_id",APPROVAL,"upload_session_id",21,"completed",true,"documentId",76,"documentNo","D76");row.put("saveReceipt",proof);
        DmsFixFlowsTest.denied(()->DmsQueue.finishVerified(index,MEMBER,"alice",live));
        put(proof,"documentId",77);put(proof,"operation_id",MEMBER);
        DmsFixFlowsTest.denied(()->DmsQueue.finishVerified(index,MEMBER,"alice",live));put(proof,"operation_id",APPROVAL);
        DmsFixFlowsTest.denied(()->DmsQueue.finishVerified(index,MEMBER,"alice",put(copy(live),"code","other")));
        check(index.length()==1&&DmsQueue.canFinish(row,"alice",live));
        DmsQueue.finishVerified(index,MEMBER,"alice",live);check(index.length()==0);
    }
    public static void main(String[] args)throws Exception{selections();entries();refusals();finish();System.out.println("DmsFix2FlowsTest passed: disjoint/overlapping file selections, Tasks/central intake routes, pending original, pre-dispatch denial and fresh eligibility, mounted private reads and proven Finish.");}
}
