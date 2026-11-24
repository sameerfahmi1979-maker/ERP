package net.algt.mobiledms;
import java.io.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

public final class DmsFixRecoveryTest{
    public static void main(String[] args)throws Exception{
        String op=UUID.randomUUID().toString();
        JSONObject body=cmd("processingAction","documentId",61,"operationId",op,"sourceHash","old","snapshot","s","action","prepare_source");
        JSONObject pending=object("lock","processing/61","payload",body.toString(),"epoch",2,"owner","a");
        check(DmsOperationStore.blocks(pending,body,"processing/61"));
        JSONObject current=put(copy(body),"snapshot","changed");check(!DmsOperationStore.blocks(pending,current,"processing/61"));
        JSONObject conflict=copy(pending);DmsOperationStore.noEffect(conflict,"Source conflict");
        check(!DmsOperationStore.blocks(conflict,body,"processing/61"));
        JSONObject retry=cmd("processingAction","operationId",op,"documentId",61,"sourceHash","src","action","retry_step","step","ai_summary","jobId",40);
        put(pending,"payload",retry.toString());put(pending,"archived",true);
        check(DmsOperationStore.blocks(pending,retry,"processing/61"));
        check(!DmsOperationStore.blocks(pending,put(copy(retry),"action","cancel"),"processing/61"));
        check(!DmsOperationStore.blocks(pending,put(copy(retry),"jobId",41),"processing/61"));
        check(!DmsOperationStore.preparationObserved(retry,object("jobId",40,"documentId",61,"requestId",op,"stage","ready","sourceHash","src")));
        JSONObject known=object("state","admitting","request",object("operationId",op),"receipt",object("id",97,"code","known97"));
        AtomicInteger reads=new AtomicInteger();
        JSONObject observed=DmsQueue.inspect(known,row->{reads.incrementAndGet();return object("id",97,"code","known97","status","uploaded");});
        check(observed.getLong("id")==97&&reads.get()==1&&DmsQueue.archivable(known));
        JSONObject unknown=copy(known);unknown.remove("receipt");
        check(DmsQueue.inspect(unknown,row->{throw new AssertionError("No session code");})==null&&DmsQueue.archivable(unknown));
        DmsFixFlowsTest.denied(()->DmsQueue.inspect(known,row->object("id",98,"code","known97")));
        JSONObject parent=object("entityId",34,"entityType","site");
        JSONObject req=object("id",5,"kind","missing","revision",8,"documentTypeId",7,"parent",parent,"actions",new JSONArray().put("submit_document"));
        DmsQueue.requireEvidence(req,req);
        DmsFixFlowsTest.denied(()->DmsQueue.requireEvidence(req,put(copy(req),"documentTypeId",9)));
        DmsFixFlowsTest.denied(()->DmsQueue.requireEvidence(req,put(copy(req),"actions",new JSONArray())));
        DmsFixFlowsTest.denied(()->DmsQueue.requireEvidence(req,put(copy(req),"revision",9)));
        for(int status:new int[]{401,403})check(DmsWorkspace.accessDenied(new ErpApi.Rejected("denied",status,null)));
        check(!DmsWorkspace.accessDenied(new IOException("unknown")));
        check("not_sent".equals(DmsQueue.refusedStart(new DmsTransfer.NotSent(null))));
        check("refused".equals(DmsQueue.refusedStart(new ErpApi.Rejected("disabled",200,object("success",false,"data",object("status","provider_not_configured"))))));
        check("unknown".equals(DmsQueue.refusedStart(new IOException("ack lost"))));
        check("unknown".equals(DmsQueue.refusedStart(new ErpApi.Rejected("maybe",503,object("uncertain",true)))));
        check("unknown".equals(DmsQueue.startOutcome(object("startAttempted",true))));
        AtomicBoolean still=new AtomicBoolean(true);ByteArrayOutputStream partial=new ByteArrayOutputStream();
        try{DmsTransfer.send(()->new FilterOutputStream(partial){public void write(byte[] data,int off,int n)throws IOException{out.write(data,off,n);still.set(false);}},new ByteArrayInputStream(new byte[48000]),48000,still::get);throw new AssertionError();}
        catch(DmsTransfer.NotSent wrong){throw new AssertionError(wrong);}catch(IOException maybe){check(partial.size()==32768);}
        List<Long> ids=Arrays.asList(4L,5L);List<JSONObject> initial=DocumentPacks.fresh(ids,id->object("id",id,"title","old label","number","D"+id));
        List<JSONObject> resumed=DocumentPacks.fresh(ids,id->{if(id==4)throw new ErpApi.Rejected("denied",403,null);return object("id",id,"number","D5","title","updated");});
        check("old label".equals(str(initial.get(0),"title"))&&resumed.get(0)==null&&"updated".equals(str(resumed.get(1),"title")));
        AtomicBoolean visible=new AtomicBoolean(true),discarded=new AtomicBoolean(false);
        DmsFixFlowsTest.denied(()->DmsTransfer.render(()->{if(!visible.get())throw new IOException("revoked");},()->{visible.set(false);return "private rendered page";},v->discarded.set(true)));check(discarded.get());
        JSONObject company=object("companyId",25,"branchId",null);List<JSONObject> page=new ArrayList<>();
        for(int i=1;i<=24;i++)page.add(object("companyId",i,"branchId",i));page.add(company);
        JSONObject cursor=DmsCapture.scopeCursor(page.get(24));check(cursor.getLong("companyId")==25&&cursor.getInt("branchId")==0&&company.isNull("branchId"));
        System.out.println("DmsFixRecoveryTest passed: original jobs, cancel and archive, intake-only proof, evidence revocation, no-send/refused/unknown, partial-send uncertainty, redacted pack resume, discarded render and scope cursor.");
    }
    static void check(boolean ok){if(!ok)throw new AssertionError();}
}
