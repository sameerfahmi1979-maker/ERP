package net.algt.mobiledms;
import org.json.*;
import java.util.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

public final class DmsIdentityTest {
    interface Run {void go()throws Exception;}
    static void fails(Run r)throws Exception{try{r.go();}catch(Exception expected){return;}throw new AssertionError("Expected refusal");}
    public static void main(String[] args)throws Exception{
        String op=UUID.randomUUID().toString(),hash=String.join("",Collections.nCopies(64,"a"));
        JSONObject original=cmd("documentCommentEdit","operationId",op,"documentId",11,"commentId",7,"commentRevision","9223372036854775806","sourceHash",hash,"text","edit");
        JSONObject receipt=object("operationId",op,"documentId",11,"commentId",7,"revision","9223372036854775807","replayed",false);
        verifyReceipt(original,receipt);
        fails(()->verifyReceipt(original,put(copy(receipt),"documentId",12)));
        fails(()->verifyReceipt(original,put(copy(receipt),"commentId",8)));
        fails(()->verifyReceipt(original,put(copy(receipt),"operationId",UUID.randomUUID().toString())));
        JSONObject missing=copy(receipt);missing.remove("documentId");fails(()->verifyReceipt(original,missing));
        JSONObject criteria=object("version",1,"entityType","employee","entityId",4,"search","passport","validity","valid","personal",false);
        DmsCollections.criteria(criteria);fails(()->DmsCollections.criteria(put(copy(criteria),"personal",true)));fails(()->DmsCollections.criteria(put(copy(criteria),"entityType","foreign")));
        JSONObject f=object("id",71,"documentId",4,"versionId",17,"size",54,"sha256",hash,"sourceHash",hash,"entryName","DMS/A.pdf","mime","application/pdf");
        JSONObject manifest=object("format","zip","manifestHash",hash,"documents",new JSONArray().put(object("id",4,"versionId",17,"sourceHash",hash)),"files",new JSONArray().put(f),"totalBytes",54);
        DocumentPacks.manifest(manifest,new JSONArray().put(4),"zip");
        fails(()->DocumentPacks.manifest(manifest,new JSONArray().put(5),"zip"));
        fails(()->DocumentPacks.manifest(put(copy(manifest),"files",new JSONArray().put(put(copy(f),"versionId",16))),new JSONArray().put(4),"zip"));
        if(DmsQueue.mime("photo.png",new byte[]{(byte)137,80,78,71,13,10,26,10},8)!="image/png")throw new AssertionError();
        fails(()->DmsQueue.mime("photo.pdf",new byte[]{(byte)137,80,78,71,13,10,26,10},8));
        if(!DmsQueue.member(new JSONArray().put(object("request",object("operationId",op))),op).has("request"))throw new AssertionError();
        fails(()->DmsQueue.member(new JSONArray().put(object("request",object("operationId",op))),UUID.randomUUID().toString()));
        JSONObject canonical=object("version",1,"authUserId","actor","operationId",op,"metadata",object("sha256_hash",hash,"file_size_bytes",54,"original_filename","A.pdf","mime_type","application/pdf"),"context",object("entityType","site","entityId",4));
        JSONObject offered=put(copy(canonical),"operationId",UUID.randomUUID().toString());
        if(!DmsQueue.sameOriginal(canonical,offered)||DmsQueue.sameOriginal(canonical,put(copy(offered),"context",object("entityType","site","entityId",5))))throw new AssertionError();
        if(DmsQueue.sameOriginal(canonical,put(copy(offered),"authUserId","different")))throw new AssertionError();
        JSONObject proof=object("completed",true,"upload_session_id",3,"operation_id",op,"documentId",49,"documentNo","D-49");
        if(!DmsQueue.saved(3,op,proof)||DmsQueue.saved(3,UUID.randomUUID().toString(),proof)||DmsQueue.saved(4,op,proof))throw new AssertionError();
        System.out.println("DmsIdentityTest OK");
    }
}
