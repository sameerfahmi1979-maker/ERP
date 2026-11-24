package net.algt.mobiledms;

import java.io.*;
import java.util.concurrent.atomic.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

public final class DmsOrdinaryApprovalTest{
    static final String OP="00000000-0000-4000-8000-000000000007";
    static final DmsIntakeEntry SOURCE=new DmsIntakeEntry(null,"alice",7,3,41,"code41");
    static final JSONObject BODY=cmd("approve","operationId",OP,"input",object("uploadSessionId",41,"documentTypeId",15,"title","Reviewed"),
        "review",object("sessionId",41,"typeId",15,"confirmed",true));
    static final JSONObject RECEIPT=object("completed",true,"upload_session_id",41,"operation_id",OP,"documentId",54,"documentNo","D54");
    static final class Disk implements DmsOrdinaryApproval.Store{
        String bytes;int writes;
        public JSONObject read()throws Exception{return bytes==null?null:new JSONObject(bytes);}
        public void replace(JSONObject before,JSONObject after)throws Exception{
            check((before==null&&bytes==null)||(before!=null&&before.toString().equals(bytes)));
            bytes=after==null?null:after.toString();writes++;
        }
    }
    static JSONObject live(long doc){return object("id",41,"code","code41","canReview",doc==0,"documentId",doc);}
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    static DmsIntakeEntry.Route preflight(DmsIntakeEntry.Visit visit,long doc)throws Exception{
        return SOURCE.read(c->live(doc),JSONArray::new,visit);
    }
    public static void main(String[] args)throws Exception{
        AtomicBoolean foreground=new AtomicBoolean(true);
        AtomicInteger posts=new AtomicInteger(),rendered=new AtomicInteger();
        DmsIntakeEntry.Visit visit=new DmsIntakeEntry.Visit(foreground::get);
        Disk disk=new Disk();DmsOrdinaryApproval flow=new DmsOrdinaryApproval(SOURCE,disk);
        // The scoped reader can finish a slow intake request after onPause retires its visit.
        try{
            SOURCE.read(c->{visit.retire();foreground.set(false);return live(0);},JSONArray::new,visit)
                .show(op->{throw new AssertionError();},r->flow.submit(BODY,r,visit,(body,before)->{posts.incrementAndGet();throw new AssertionError();}));
            throw new AssertionError("Retired intake result escaped");
        }catch(IOException retired){}
        foreground.set(true);
        DmsIntakeEntry.Visit beforeDelivery=new DmsIntakeEntry.Visit(foreground::get);
        DmsIntakeEntry.Route pre=preflight(beforeDelivery,0);beforeDelivery.retire();foreground.set(false);
        pre.show(op->{throw new AssertionError();},r->flow.submit(BODY,r,visit,(body,before)->{posts.incrementAndGet();throw new AssertionError();}));
        foreground.set(true);
        DmsIntakeEntry.Visit next=new DmsIntakeEntry.Visit(foreground::get);
        preflight(next,0).show(op->{throw new AssertionError();},r->check(flow.resume(r).phase==DmsOrdinaryApproval.Phase.REVIEW));
        check(posts.get()==0&&disk.bytes==null&&disk.writes==0);

        DmsIntakeEntry.Route sending=preflight(next,0);
        sending.show(op->{throw new AssertionError();},r->flow.submit(BODY,r,next,(body,before)->{
            check(flow.resume(r).phase==DmsOrdinaryApproval.Phase.READY);
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
            DmsTransfer.send(ByteArrayOutputStream::new,new ByteArrayInputStream(bytes),bytes.length,next,before);
            check(flow.resume(r).phase==DmsOrdinaryApproval.Phase.POSSIBLE);posts.incrementAndGet();return RECEIPT;
        }));
        check(disk.read().getJSONObject("receipt").getString("operation_id").equals(OP));
        next.retire();foreground.set(false);
        sending.show(op->{throw new AssertionError();},r->rendered.incrementAndGet());
        check(rendered.get()==0);
        foreground.set(true);DmsIntakeEntry.Visit resumed=new DmsIntakeEntry.Visit(foreground::get);
        preflight(resumed,54).show(op->{throw new AssertionError();},r->{
            DmsOrdinaryApproval.Result result=new DmsOrdinaryApproval(SOURCE,disk).resume(r);
            check(result.phase==DmsOrdinaryApproval.Phase.CONFIRMED&&result.receipt.getLong("documentId")==54);rendered.incrementAndGet();
        });
        check(rendered.get()==1&&posts.get()==1);
        check(flow.resume(live(99)).phase==DmsOrdinaryApproval.Phase.SOURCE_CHANGED);
        Disk lost=new Disk();DmsOrdinaryApproval unknown=new DmsOrdinaryApproval(SOURCE,lost);
        unknown.submit(BODY,live(0),resumed,(body,before)->{before.begin();posts.incrementAndGet();throw new IOException("Reply lost");});
        check(unknown.resume(live(54)).phase==DmsOrdinaryApproval.Phase.POSSIBLE&&posts.get()==2);
        unknown.submit(null,live(54),resumed,(body,before)->{throw new DmsTransfer.NotSent(null);});
        check(unknown.resume(live(54)).phase==DmsOrdinaryApproval.Phase.POSSIBLE);
        DmsOrdinaryApproval freshLogin=new DmsOrdinaryApproval(new DmsIntakeEntry(null,"alice",8,4,41,"code41"),lost);
        check(freshLogin.resume(live(54)).phase==DmsOrdinaryApproval.Phase.INSPECT_ONLY);
        try{freshLogin.submit(null,live(54),resumed,(body,before)->{throw new AssertionError("cross-login send");});throw new AssertionError();}catch(IOException expected){}
        Disk unsent=new Disk();DmsOrdinaryApproval ready=new DmsOrdinaryApproval(SOURCE,unsent);
        ready.submit(BODY,live(0),resumed,(body,before)->{throw new DmsTransfer.NotSent(null);});
        check(ready.resume(live(0)).phase==DmsOrdinaryApproval.Phase.READY&&unsent.read().getString("payload").equals(BODY.toString()));
        Disk wrong=new Disk();DmsOrdinaryApproval unproven=new DmsOrdinaryApproval(SOURCE,wrong);
        unproven.submit(BODY,live(0),resumed,(body,before)->{before.begin();return put(copy(RECEIPT),"operation_id","another-operation");});
        check(unproven.resume(live(54)).phase==DmsOrdinaryApproval.Phase.POSSIBLE&&!wrong.read().has("receipt"));
        Disk delayed=new Disk();DmsOrdinaryApproval settling=new DmsOrdinaryApproval(SOURCE,delayed);
        DmsIntakeEntry.Visit last=new DmsIntakeEntry.Visit(foreground::get);
        settling.submit(BODY,live(0),last,(body,before)->{before.begin();last.retire();foreground.set(false);return RECEIPT;});
        check(delayed.read().getJSONObject("receipt").getString("operation_id").equals(OP));
        foreground.set(true);
        check(settling.resume(live(54)).phase==DmsOrdinaryApproval.Phase.CONFIRMED);
        System.out.println("DmsOrdinaryApprovalTest passed: retired preflight zero POST, durable verified receipt before suppressed UI, fresh confirmation without resend, changed document, lost reply, unsent retry, old login inspection and ready original.");
    }
}
