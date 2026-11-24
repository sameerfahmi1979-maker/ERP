package net.algt.mobiledms;

import org.json.*;
import java.io.IOException;
import java.util.function.Consumer;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

/** Immutable identity travels with a queued review through every nested page and Back closure. */
final class DmsReviewContext {
    final String owner,member,sessionCode,parentKind;
    final long epoch,generation,session,parentId,requiredType;
    final JSONObject receipt;
    DmsReviewContext(String actor,long epoch,long generation,JSONObject row)throws Exception{
        JSONObject req=row.getJSONObject("request");
        owner=actor;this.epoch=epoch;this.generation=generation;
        member=req.getString("operationId");
        receipt=copy(row.getJSONObject("receipt"));session=id(receipt,"id");sessionCode=receipt.getString("code");
        JSONObject parent=req.optJSONObject("context");parentKind=str(parent,"entityType");parentId=parent==null?0:id(parent,"entityId");
        JSONObject evidence=row.optJSONObject("evidence");requiredType=evidence==null?0:id(evidence,"documentTypeId");
        DmsArchive.check(actor.equals(str(req,"authUserId"))&&HrRules.uuid(member)&&epoch>=0&&generation>=0);
        if(evidence!=null)DmsArchive.check(parent!=null&&DmsQueue.sameValue(parent,evidence.getJSONObject("parent")));
    }
    boolean current(DmsWorkspace.Ticket t){return t!=null&&owner.equals(t.owner)&&epoch==t.epoch&&generation==t.generation&&t.visible();}
    void checkRow(JSONObject r)throws Exception{
        JSONObject req=r.getJSONObject("request"),rc=r.getJSONObject("receipt");
        DmsArchive.check(member.equals(str(req,"operationId"))&&owner.equals(str(req,"authUserId"))&&id(rc,"id")==session&&sessionCode.equals(str(rc,"code")));
        JSONObject evidence=r.optJSONObject("evidence"),parent=req.optJSONObject("context");
        DmsArchive.check(requiredType==(evidence==null?0:id(evidence,"documentTypeId"))&&parentKind.equals(str(parent,"entityType"))&&parentId==(parent==null?0:id(parent,"entityId")));
        if(evidence!=null)DmsArchive.check(DmsQueue.sameValue(evidence.getJSONObject("parent"),parent));
    }
    JSONArray choices(JSONArray all)throws Exception{
        if(requiredType==0)return all;
        for(int i=0;i<all.length();i++)if(id(all.getJSONObject(i),"id")==requiredType)return new JSONArray().put(all.getJSONObject(i));
        throw new IOException("The required evidence type is no longer available.");
    }
    void checkInput(JSONObject b)throws Exception{
        JSONObject input=b.getJSONObject("input"),plan=b.getJSONObject("review");
        DmsArchive.check("approve".equals(str(b,"op"))&&HrRules.uuid(str(b,"operationId"))&&id(input,"uploadSessionId")==session&&id(plan,"sessionId")==session&&id(input,"documentTypeId")==id(plan,"typeId"));
        if(requiredType!=0)DmsArchive.check(id(input,"documentTypeId")==requiredType);
        JSONArray links=input.getJSONArray("links");
        if(parentId==0){DmsArchive.check(links.length()==0);return;}
        DmsArchive.check(links.length()==1);JSONObject link=links.getJSONObject(0);
        DmsArchive.check(parentId==id(link,"entityId")&&parentKind.equals(str(link,"entityType"))&&link.getBoolean("isPrimary"));
    }
    Runnable returnTo(Runnable review){return review;}
    Detour detour(Consumer<DmsReviewContext> review){return new Detour(review);}
    final class Detour{
        private final Consumer<DmsReviewContext> returnReview;
        Detour(Consumer<DmsReviewContext> next){returnReview=next;}
        void returnToReview(){returnReview.accept(DmsReviewContext.this);}
        void openMatch(Consumer<Runnable> open){open.accept(this::returnToReview);}
    }
}
