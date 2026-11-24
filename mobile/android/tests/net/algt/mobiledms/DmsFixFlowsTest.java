package net.algt.mobiledms;
import java.io.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

public final class DmsFixFlowsTest {
    interface Attempt{void run()throws Exception;}
    static void must(boolean test){if(!test)throw new AssertionError();}
    static void denied(Attempt step)throws Exception{try{step.run();}catch(Exception expected){return;}throw new AssertionError("Expected refusal");}
    public static void main(String[] args)throws Exception{
        AtomicBoolean allowed=new AtomicBoolean(true),source=new AtomicBoolean(true);ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try{DmsTransfer.send(()->{allowed.set(false);return bytes;},new ByteArrayInputStream(new byte[]{1,2}),2,allowed::get);throw new AssertionError();}
        catch(DmsTransfer.NotSent expected){} must(bytes.size()==0);
        allowed.set(true);DmsTransfer.Source check=()->{if(!source.get())throw new IOException();};
        denied(()->DmsTransfer.deliver(allowed::get,check,()->{source.set(false);return bytes;},new ByteArrayInputStream(new byte[]{7}),1));must(bytes.size()==0);
        source.set(true);DmsTransfer.Open opened=new DmsTransfer.Open(allowed::get,check);opened.open();source.set(false);denied(opened::firstRead);
        String uuid=UUID.randomUUID().toString(),member=UUID.randomUUID().toString();
        JSONObject parent=object("entityType","employee","entityId",55);
        JSONObject row=object("request",object("operationId",member,"authUserId","actor","context",parent),"receipt",object("id",97,"code","S97"),"evidence",object("documentTypeId",3,"parent",parent));
        JSONObject input=object("uploadSessionId",97,"documentTypeId",3,"links",new JSONArray().put(object("entityType","employee","entityId",55,"isPrimary",true)));
        JSONObject approve=cmd("approve","operationId",uuid,"input",input,"review",object("sessionId",97,"typeId",3));
        DmsReviewContext context=new DmsReviewContext("actor",8,4,row);
        JSONObject atom=DmsApprovalIntent.freeze(context,row,approve,null);
        must(uuid.equals(str(new JSONObject(atom.getString("payload")),"operationId")));
        AtomicInteger writes=new AtomicInteger();
        DmsApprovalIntent.continueOriginal(atom,context,row,8,body->{writes.incrementAndGet();return body;});
        denied(()->DmsApprovalIntent.continueOriginal(atom,context,row,9,body->{writes.incrementAndGet();return body;}));
        denied(()->DmsApprovalIntent.freeze(context,row,put(copy(approve),"input",put(copy(input),"documentTypeId",6)),null));
        denied(()->DmsApprovalIntent.freeze(context,row,put(copy(approve),"input",put(copy(input),"links",new JSONArray())),null));
        denied(()->DmsApprovalIntent.freeze(context,row,null,approve));must(writes.get()==1);
        IntakeReview review=new IntakeReview(object("id",97,"entityType","employee","entityId",55,"name","x"),new JSONArray().put(object("id",3,"label","Passport")),context);
        AtomicReference<DmsReviewContext> returned=new AtomicReference<>();
        DmsReviewContext.Detour detour=review.member.detour(returned::set);
        detour.returnToReview();must(returned.get()==context);returned.set(null);
        detour.openMatch(back->back.run());must(returned.get()==context);
        JSONObject conflict=object("payload",cmd("documentShareCreate","operationId",uuid,"token","secret").toString());
        DmsOperationStore.noEffect(conflict,"conflict");must(!new JSONObject(conflict.getString("payload")).has("token"));
        JSONObject status=object("documentId",12,"jobId",6,"requestId",uuid,"sourceHash","hash","stage","waiting");
        JSONObject original=cmd("processingAction","documentId",12,"sourceHash","hash","operationId",uuid,"action","prepare_source");
        must(DmsOperationStore.preparationObserved(original,status));must(!DmsOperationStore.preparationObserved(original,put(copy(status),"requestId",member)));
        must(DmsCapture.scopeCursor(object("companyId",25,"branchId",null)).getLong("branchId")==0);
        List<String> group=Arrays.asList("1","2","3");List<String> used=new ArrayList<>();
        DmsIncomingImages.consume(group,true,true,x->used.addAll(x),x->{throw new AssertionError();});must(used.equals(group));used.clear();
        DmsIncomingImages.consume(group,false,false,x->{throw new AssertionError();},x->used.addAll(x));must(used.equals(group));denied(()->DmsIncomingImages.consume(group,false,true,x->{},x->{}));
        System.out.println("DmsFixFlowsTest passed: blocked output, delayed source, typed review detour, atomic approval epoch/source, operation outcome, original modes and cursor.");
    }
}
