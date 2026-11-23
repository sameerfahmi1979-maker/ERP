package net.algt.mobiledms;

import android.util.AtomicFile;
import java.io.IOException;
import java.util.function.BooleanSupplier;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

/** The ordinary approval's encrypted journal is authoritative across retired UI visits. */
final class DmsOrdinaryApproval {
    enum Phase { REVIEW, READY, POSSIBLE, CONFIRMED, SOURCE_CHANGED, INSPECT_ONLY }
    static final class Result {
        final Phase phase;
        final JSONObject receipt;
        Result(Phase phase,JSONObject receipt){this.phase=phase;this.receipt=receipt;}
    }
    interface Store{
        JSONObject read()throws Exception;
        void replace(JSONObject before,JSONObject after)throws Exception;
    }
    interface Post{JSONObject send(JSONObject body,DmsTransfer.BeforeWrite firstByte)throws Exception;}
    final DmsIntakeEntry source;
    private final Store store;
    DmsOrdinaryApproval(DmsIntakeEntry source,Store store){this.source=source;this.store=store;}
    static DmsOrdinaryApproval open(DmsIntakeEntry source,DmsWorkspace.Ticket ticket)throws Exception{
        ticket.require();
        DmsArchive.check(source.api==ticket.api&&source.origin(ticket.owner,ticket.epoch,ticket.generation));
        AtomicFile file=ticket.a.draft.approval(source.session);
        return new DmsOrdinaryApproval(source,new Store(){
            public JSONObject read()throws Exception{
                synchronized(LocalSecurity.STORAGE_LOCK){
                    ticket.requireOriginIdentity();return LocalDraft.read(file);
                }
            }
            public void replace(JSONObject before,JSONObject after)throws Exception{
                synchronized(LocalSecurity.STORAGE_LOCK){
                    ticket.requireOriginIdentity();
                    JSONObject current=LocalDraft.read(file);
                    DmsArchive.check(before==null?current==null:current!=null&&before.toString().equals(current.toString()));
                    if(after==null)file.delete();else LocalDraft.write(file,after);
                }
            }
        });
    }
    private void checkLive(JSONObject live)throws IOException{
        DmsArchive.check(source.session>0&&id(live,"id")==source.session&&source.code.equals(str(live,"code")));
    }
    private void checkOriginal(JSONObject body)throws Exception{
        DmsArchive.check("approve".equals(str(body,"op"))&&HrRules.uuid(str(body,"operationId"))
            &&source.session==id(body.getJSONObject("input"),"uploadSessionId")
            &&source.session==id(body.getJSONObject("review"),"sessionId"));
    }
    private JSONObject envelope(JSONObject body,String phase)throws Exception{
        checkOriginal(body);
        return object("owner",source.owner,"epoch",source.epoch,"generation",source.generation,
            "session",source.session,"code",source.code,"phase",phase,"payload",body.toString());
    }
    private Result read(JSONObject row,JSONObject live)throws Exception{
        checkLive(live);
        if(row==null)return new Result(Phase.REVIEW,null);
        if(!source.owner.equals(str(row,"owner"))||source.epoch!=row.optLong("epoch",-1))return new Result(Phase.INSPECT_ONLY,null);
        // Fix 2 kept the full ordinary input, actor and original login epoch.
        if(!row.has("phase")&&row.optJSONObject("original")!=null){
            checkOriginal(row.getJSONObject("original"));return new Result(Phase.POSSIBLE,null);
        }
        if(row.optLong("generation",-1)!=source.generation||row.optLong("session")!=source.session||!source.code.equals(str(row,"code")))
            return new Result(Phase.INSPECT_ONLY,null);
        JSONObject body=new JSONObject(row.getString("payload"));checkOriginal(body);
        String phase=row.getString("phase");
        if("ready".equals(phase))return new Result(Phase.READY,null);
        if("possible".equals(phase))return new Result(Phase.POSSIBLE,null);
        DmsArchive.check("confirmed".equals(phase));
        JSONObject receipt=row.getJSONObject("receipt");
        DmsArchive.check(DmsQueue.saved(source.session,body.getString("operationId"),receipt));
        if(receipt.getLong("documentId")!=live.optLong("documentId"))return new Result(Phase.SOURCE_CHANGED,null);
        return new Result(Phase.CONFIRMED,receipt);
    }
    Result resume(JSONObject fresh)throws Exception{return read(store.read(),fresh);}

    void submit(JSONObject proposed,JSONObject fresh,BooleanSupplier visible,Post post)throws Exception{
        DmsTransfer.local(visible);
        JSONObject prior=store.read();Phase phase=read(prior,fresh).phase;
        if(phase==Phase.CONFIRMED||phase==Phase.SOURCE_CHANGED)return;
        DmsArchive.check(phase!=Phase.INSPECT_ONLY);
        if(phase!=Phase.POSSIBLE)DmsArchive.check(fresh.optBoolean("canReview"));
        JSONObject body;
        if(prior==null){DmsArchive.check(proposed!=null);body=proposed;}
        else body=prior.has("phase")?new JSONObject(prior.getString("payload")):prior.getJSONObject("original");
        checkOriginal(body);
        if(proposed!=null)DmsArchive.check(proposed.toString().equals(body.toString()));
        boolean priorUnknown=phase==Phase.POSSIBLE;
        JSONObject original=envelope(body,priorUnknown?"possible":"ready");
        DmsTransfer.local(visible);
        if(prior==null||!prior.has("phase"))store.replace(prior,original);
        else original=prior;
        final JSONObject frozen=original;
        final JSONObject attempted=put(copy(frozen),"phase","possible");
        DmsTransfer.BeforeWrite firstByte=()->{
            try{
                DmsTransfer.local(visible);
                store.replace(frozen,attempted);
            }catch(IOException e){throw e;}catch(Exception e){throw new IOException("Could not retain the original approval before transmission.",e);}
        };
        JSONObject receipt;
        try{receipt=post.send(body,firstByte);}
        catch(DmsTransfer.NotSent unsent){
            if(!priorUnknown)restoreReady(attempted,frozen);
            return;
        }catch(ErpApi.Rejected rejected){
            if(rejected.beforeBusinessRequest){
                if(!priorUnknown)try{restoreReady(attempted,frozen);}catch(Exception local){rejected.addSuppressed(local);}
                throw rejected;
            }
            if(rejected.status==401||rejected.status==403)throw rejected;
            if(!priorUnknown&&rejected.response!=null&&rejected.response.optBoolean("retryWithChanges")
                &&!rejected.response.optBoolean("uncertain")&&!rejected.response.optBoolean("recoveryRequired")){
                store.replace(attempted,null);throw rejected;
            }
            return;
        }catch(IOException unclear){return;}
        if(!DmsQueue.saved(source.session,body.getString("operationId"),receipt))return;
        JSONObject confirmed=put(put(copy(attempted),"phase","confirmed"),"receipt",receipt);
        store.replace(attempted,confirmed);
    }
    private void restoreReady(JSONObject attempted,JSONObject ready)throws Exception{
        JSONObject current=store.read();
        if(current!=null&&current.toString().equals(attempted.toString()))store.replace(attempted,ready);
    }
}
