package net.algt.mobiledms;

import org.json.*;
import java.util.Arrays;
import static net.algt.mobiledms.ErpApi.str;

/** Each explicit transmission is journalled before its body can leave the handset. */
final class DmsSubmission {
    interface Journal {
        long beginAttempt(JSONObject body)throws Exception;
        void refuseAttempt(JSONObject body,long attempt,String reason)throws Exception;
        void sourceConflict(JSONObject body)throws Exception;
        void finish(JSONObject body,JSONObject receipt)throws Exception;
    }
    interface Transmit {JSONObject send(JSONObject original)throws Exception;}

    static long begin(JSONObject entry,JSONObject body,String owner,long epoch)throws Exception{
        DmsArchive.check(owner.equals(str(entry,"owner"))&&entry.getLong("epoch")==epoch
            &&entry.getString("payload").equals(body.toString())&&!entry.has("receipt")&&!entry.optBoolean("conflict"));
        // An older frozen original may already have been sent before the app was upgraded.
        long prior=entry.has("attempts")?entry.getLong("attempts"):1;
        DmsArchive.check(prior>=0&&prior<Long.MAX_VALUE);
        entry.put("attempts",prior+1);
        return prior+1;
    }
    static void refuse(JSONObject entry,JSONObject body,long attempt,String reason)throws Exception{
        if(attempt!=1||entry.optLong("attempts")!=1||entry.has("receipt"))return;
        DmsArchive.check(entry.getString("payload").equals(body.toString()));
        DmsOperationStore.noEffect(entry,reason);
    }
    static void confirm(JSONObject entry,JSONObject body,JSONObject receipt)throws Exception{
        DmsArchive.check(entry.getString("payload").equals(body.toString()));
        DmsApi.verifyReceipt(body,receipt);
        if(receipt.optBoolean("uncertain")||"reconciliation_required".equals(str(receipt,"state")))return;
        JSONObject safe=DmsApi.copy(body);safe.remove("token");
        entry.put("payload",safe.toString()).put("receipt",receipt);
    }
    static JSONObject lookup(JSONObject original,Transmit reader)throws Exception{
        DmsArchive.check(!"processingAction".equals(str(original,"op")));
        JSONObject response=reader.send(DmsApi.cmd("documentReceiptLookup","original",DmsApi.copy(original)));
        DmsArchive.check(original.getString("operationId").equals(response.getString("operationId")) &&
            original.getString("op").equals(response.getString("command")));
        String state=response.getString("state");
        DmsArchive.check("confirmed".equals(state)||"unconfirmed".equals(state));
        return "confirmed".equals(state)?ErpApi.object("operationId",original.getString("operationId"),"state","confirmed"):null;
    }
    static JSONObject send(Journal journal,JSONObject body,Transmit transport)throws Exception{
        long attempt=journal.beginAttempt(body);
        JSONObject receipt;
        try{receipt=transport.send(body);}
        catch(DmsTransfer.NotSent failure){
            journal.refuseAttempt(body,attempt,"Body was not sent");throw failure;
        }catch(ErpApi.Rejected failure){
            if(failure.beforeBusinessRequest)journal.refuseAttempt(body,attempt,"Business request body was not sent");
            else if(failure.response!=null&&!failure.response.optBoolean("uncertain")){
                if(Arrays.asList(400,413,422).contains(failure.status))journal.refuseAttempt(body,attempt,"Request rejected before admission");
                else if(failure.status==409&&"source_changed".equals(str(failure.response,"code"))){
                    if("processingAction".equals(str(body,"op")))journal.sourceConflict(body);
                    else if(failure.response.optBoolean("noEffect"))journal.refuseAttempt(body,attempt,"ERP confirmed a conflict before admission");
                }
            }
            throw failure;
        }
        journal.finish(body,receipt);
        return receipt;
    }
}
