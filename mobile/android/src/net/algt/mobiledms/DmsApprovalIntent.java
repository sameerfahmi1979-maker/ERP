package net.algt.mobiledms;
import org.json.*;
import java.io.IOException;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

final class DmsApprovalIntent {
    interface Submit {JSONObject send(JSONObject original)throws Exception;}
    static JSONObject freeze(DmsReviewContext ctx,JSONObject row,JSONObject proposed,JSONObject legacy)throws Exception{
        ctx.checkRow(row);
        JSONObject frozen=row.optJSONObject("approval");
        if(frozen!=null){
            JSONObject prior=load(frozen,ctx,row,ctx.epoch);
            if(proposed!=null)DmsArchive.check(DmsQueue.sameValue(prior,proposed));
            return frozen;
        }
        JSONObject original=proposed;
        if(legacy!=null||row.has("saveOp")){
            if(legacy==null||!row.has("saveOp")||row.optLong("saveEpoch",-1)!=ctx.epoch||!str(row,"saveOp").equals(str(legacy,"operationId")))
                throw new IOException("The prior approval is unconfirmed. Its original sign-in cannot be established.");
            if(proposed!=null)DmsArchive.check(DmsQueue.sameValue(proposed,legacy));
            original=legacy;
        }
        if(original==null)throw new IOException("The original approval input is unavailable.");
        ctx.checkInput(original);
        return object("owner",ctx.owner,"epoch",ctx.epoch,"member",ctx.member,"session",ctx.session,
            "operationId",original.getString("operationId"),"payload",original.toString());
    }
    static JSONObject load(JSONObject atom,DmsReviewContext ctx,JSONObject row,long currentEpoch)throws Exception{
        ctx.checkRow(row);DmsArchive.check(currentEpoch==ctx.epoch&&currentEpoch==atom.getLong("epoch")&&ctx.owner.equals(str(atom,"owner"))
            &&ctx.member.equals(str(atom,"member"))&&atom.getLong("session")==ctx.session);
        JSONObject original=new JSONObject(atom.getString("payload"));
        DmsArchive.check(original.getString("operationId").equals(atom.getString("operationId")));
        ctx.checkInput(original);return original;
    }
    static JSONObject continueOriginal(JSONObject atom,DmsReviewContext ctx,JSONObject row,long epoch,Submit transmit)throws Exception{
        return transmit.send(load(atom,ctx,row,epoch));
    }
}
