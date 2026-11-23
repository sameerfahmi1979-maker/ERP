package net.algt.mobiledms;

import java.util.concurrent.atomic.AtomicBoolean;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;

public final class HrRecoveryTest {
    private static int count;
    private static final String OP="a9fb3a0b-4167-4fcc-a848-342731456789", PROOF="febddc34-beb4-4ca5-b4d6-342731456789";
    static void check(boolean ok){if(!ok)throw new AssertionError("Check "+(count+1));count++;}
    static JSONObject source(String kind,long id,String rev){return object("kind",kind,"id",id,"revision",rev);}
    static JSONObject canonical(String kind,long id,String rev,String op,Long issuance){return object("kind",kind,"id",id,"revision",rev,"operationId",op,"issuanceId",issuance);}
    static JSONObject fulfil(JSONObject cmd){return object("op","serviceFulfil","employeeId",18,"id",77,"revision","2","operationId",OP,"command",cmd);}
    static JSONObject receipt(JSONObject c){return object("operationId",OP,"id",77,"employeeId",18,"effect","fulfilled","revision","3","replayed",false,"canonical",c);}
    static HrOperationStore.Pending entry(JSONObject body,JSONObject saved)throws Exception {
        return new HrOperationStore.Pending(object("operation",OP,"epoch",5,"label","Private label","payload",body.toString(),"lockKey","service:77","receipt",saved));
    }
    public static void main(String[] args)throws Exception{
        JSONObject original=fulfil(object("kind","record-replacement","source",source("ppe",16,"4"),"newSource",source("ppe",17,"1"),"canonicalOperationId",PROOF));
        JSONObject proof=canonical("ppe",17,"1",PROOF,null),good=receipt(proof);
        HrOperationStore.Pending unconfirmed=entry(original,null), pinned=entry(original,good);
        check(unconfirmed.matches(good) && pinned.matches(new JSONObject(good.toString()).put("replayed",true)));
        check(!unconfirmed.matches(new JSONObject(good.toString()).put("revision","2")));
        check(!unconfirmed.matches(receipt(canonical("asset",17,"1",PROOF,null))));
        check(!unconfirmed.matches(receipt(canonical("ppe",18,"1",PROOF,null))));
        check(!unconfirmed.matches(receipt(canonical("ppe",17,"1",OP,null))));
        check(!unconfirmed.matches(new JSONObject(good.toString()).put("replayed","false")));
        check(!unconfirmed.matches(new JSONObject(good.toString()).put("id","77")));
        check(!unconfirmed.matches(receipt(canonical("ppe",17,"2",PROOF,null))));
        check(!unconfirmed.matches(new JSONObject(good.toString()).put("operationId",PROOF)));
        JSONObject issue=fulfil(object("kind","issue-letter"));
        JSONObject file=receipt(canonical("issued-document",101,null,null,101L));
        check(HrServiceReceipt.matches(issue,file,null));
        check(!entry(issue,file).matches(receipt(canonical("issued-document",102,null,null,102L))));
        check(!HrServiceReceipt.matches(fulfil(object("kind","link-issued-letter","issuanceId",102)),file,null));
        JSONObject decision=object("op","serviceDecision","operationId",OP,"employeeId",18,"id",77,"revision","1","decision","approve");
        JSONObject approved=receipt(null).put("effect","approved").put("revision","2");
        check(entry(decision,null).matches(approved));
        check(!entry(decision,null).matches(new JSONObject(approved.toString()).put("canonical",proof)));
        check(!entry(decision,null).matches(new JSONObject(approved.toString()).put("revision","3")));
        JSONObject task=fulfil(object("kind","complete-task","source",source("onboarding-task",71,"9")));
        String step2="f5a9294b-f48b-5ae2-892c-867c2a53fe6a";
        check(entry(task,null).matches(receipt(canonical("onboarding-task",71,"11",step2,null))));
        check(!entry(task,null).matches(receipt(canonical("onboarding-task",71,"10",step2,null))));
        check(!entry(task,null).matches(receipt(canonical("onboarding-task",71,"11",PROOF,null))));
        JSONObject returnCmd=fulfil(object("kind","record-return","source",source("asset",9,"7")));
        check(entry(returnCmd,null).matches(receipt(canonical("asset",9,"8","86a9ee8b-d68e-5426-b957-19dd879aa990",null))));
        check("HR service request #77".equals(entry(decision,null).reference));
        check("Timesheet record #77".equals(entry(object("op","rosterApprove","operationId",OP,"employeeId",18,"id",77),null).reference));
        for(int status:new int[]{422,503}){
            check(HrRecovery.lookup(5,6,0,status)==HrRecovery.Lookup.REDACTED);
            check(HrRecovery.lookup(5,5,0,status)!=HrRecovery.Lookup.REDACTED);
        }
        check(HrRecovery.neutralize(true,true,true,false,5,-1));
        check(!HrRecovery.neutralize(false,true,true,false,5,-1));
        check(!HrRecovery.neutralize(true,true,true,true,5,6));
        check(!HrRecovery.neutralize(true,false,true,false,5,-1));
        check(HrRecovery.recipientProblem("HR_EMPLOYMENT_CONFIRMATION",repeat(180)).isEmpty());
        check(!HrRecovery.recipientProblem("HR_EMPLOYMENT_CONFIRMATION",repeat(181)).isEmpty());
        check(HrRecovery.recipientProblem("HR_NOC",repeat(181)).isEmpty());
        check(!HrRecovery.consumeHandoff("first","second",true));
        check(!HrRecovery.consumeHandoff("first","first",false));
        check(HrRecovery.consumeHandoff("first","first",true));
        AtomicBoolean stored=new AtomicBoolean(true);
        HrRecovery.Consume consume=owner->{if(owner.getAsBoolean())stored.set(false);};
        HrRecovery.restoreHandoff(()->false,()->{throw new AssertionError();},consume);check(stored.get());
        try{
            HrRecovery.restoreHandoff(()->true,()->{throw new IOException("temporary failure");},consume);
            throw new AssertionError();
        }catch(IOException expected){check(stored.get());}
        HrRecovery.restoreHandoff(()->true,()->()->false,consume);check(stored.get());
        HrRecovery.restoreHandoff(()->true,()->()->true,consume);check(!stored.get());
        check(HrRecovery.exportCompletion(true,true,false)==HrRecovery.Export.RESUME);
        check(HrRecovery.exportCompletion(true,false,false)==HrRecovery.Export.RESUME);
        check(HrRecovery.exportCompletion(true,false,true)==HrRecovery.Export.DENY);
        check(HrRecovery.exportCompletion(false,false,true)==HrRecovery.Export.DROP);
        HrRecovery.Share share=new HrRecovery.Share();
        long first=share.start();
        share.pause();
        check(share.finish(first,true,false)==HrRecovery.Dispatch.WAIT);
        check(share.finish(first,true,true)==HrRecovery.Dispatch.REFETCH);
        long fresh=share.start();
        check(share.finish(fresh,true,true)==HrRecovery.Dispatch.SHOW);
        check(share.finish(fresh,false,true)==HrRecovery.Dispatch.DROP);
        HrRecovery.ExportActions exports=new HrRecovery.ExportActions();
        Object shareA=exports.begin();
        long preparingA=share.start();
        Object saveB=exports.begin();
        share.pause();
        check(exports.dispatch(shareA,share,preparingA,true,true)==HrRecovery.Dispatch.DROP);
        check(exports.completion(shareA,true,false,true)==HrRecovery.Export.DROP);
        check(exports.owns(saveB) && exports.completion(saveB,true,true,false)==HrRecovery.Export.RESUME);
        Object nextShare=exports.begin();
        check(!exports.owns(saveB));
        check(exports.dispatch(nextShare,share,share.start(),true,true)==HrRecovery.Dispatch.SHOW);
        ExternalResultFence fence=new ExternalResultFence("owner",5);
        AtomicBoolean lease=new AtomicBoolean(true);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try{
            fence.writeTo(()->lease.get(),()->bytes,out->{out.write(1);lease.set(false);out.write(2);});
            throw new AssertionError();
        }catch(IOException expected){check(bytes.size()==1);}
        System.out.println("HR recovery and actual journal/receipt parsing: "+count+" checks passed");
    }
    private static String repeat(int count){return new String(new char[count]).replace('\0','ش');}
}
