package net.algt.mobiledms;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.util.UUID;
import static net.algt.mobiledms.ErpApi.*;

final class DmsOperationStore implements DmsSubmission.Journal {
    final DmsWorkspace.Ticket ticket;final AtomicFile file;
    DmsOperationStore(DmsWorkspace.Ticket t){ticket=t;file=new AtomicFile(new File(new File(t.a.getNoBackupFilesDir(),t.owner),"dms-originals.enc"));}
    private File retained(){return new File(file.getBaseFile().getParentFile(),"dms-retained");}
    private AtomicFile shard(String id)throws Exception{
        DmsArchive.check(UUID.fromString(id).toString().equals(id));
        return new AtomicFile(new File(retained(),id+".enc"));
    }
    JSONObject all()throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            ticket.requireOwner();JSONObject r=LocalSecurity.readJson(ticket.a,ticket.owner,"dms-originals",file,false);
            if(r==null)r=new JSONObject();
            File dir=retained();
            String[] names=dir.list();
            if(names==null&&dir.exists())throw new IOException("Retained receipts could not be opened.");
            if(names!=null)for(String name:names){
                if(!name.endsWith(".enc")&&!name.endsWith(".enc.bak"))continue;
                String id=name.substring(0,name.indexOf(".enc"));
                if(!r.has(id)){
                    JSONObject entry=LocalSecurity.readJson(ticket.a,ticket.owner,"dms-retained/"+id,shard(id),false);
                    DmsArchive.check(entry!=null&&entry.optBoolean("archived")&&id.equals(new JSONObject(entry.getString("payload")).getString("operationId")));
                    r.put(id,entry);
                }
            }
            boolean migrated=false;
            for(java.util.Iterator<String> it=r.keys();it.hasNext();){JSONObject entry=r.getJSONObject(it.next());
                if(entry.optBoolean("conflict")&&"Original source or snapshot conflicted".equals(str(entry,"disposition"))){
                    entry.remove("conflict");entry.remove("disposition");entry.put("archived",true);migrated=true;
                }else if(entry.optBoolean("conflict")&&new JSONObject(entry.getString("payload")).has("token")){
                    noEffect(entry,str(entry,"disposition"));migrated=true;
                }}
            if(migrated)save(r,null);return r;
        }
    }
    // Copy an archived original to its own authenticated file before removing it from the active journal.
    private void save(JSONObject all,String changed)throws Exception{
        ticket.requireOwner();JSONObject active=new JSONObject();
        for(java.util.Iterator<String> it=all.keys();it.hasNext();){
            String id=it.next();JSONObject entry=all.getJSONObject(id);
            if(!entry.optBoolean("archived")){active.put(id,entry);continue;}
            AtomicFile target=shard(id);
            if(id.equals(changed)||!target.getBaseFile().exists()){
                LocalSecurity.directory(retained().getParentFile(),retained().getName());
                LocalSecurity.writeJson(ticket.a,ticket.owner,"dms-retained/"+id,target,entry);
            }
        }
        LocalSecurity.writeJson(ticket.a,ticket.owner,"dms-originals",file,active);
    }
    static int activeCount(JSONObject all,long epoch)throws Exception{
        int active=0;
        for(java.util.Iterator<String> it=all.keys();it.hasNext();){
            JSONObject previous=all.getJSONObject(it.next());
            if(previous.optLong("epoch")!=epoch&&!previous.has("receipt")&&!previous.optBoolean("conflict"))previous.put("archived",true);
            if(!previous.optBoolean("archived"))active++;
        }
        return active;
    }
    JSONObject freeze(JSONObject body,String lock)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            ticket.require();JSONObject all=all();
            for(java.util.Iterator<String> it=all.keys();it.hasNext();){JSONObject p=all.getJSONObject(it.next());if(blocks(p,body,lock))throw new IOException("Check the retained original submission before trying this action again.");}
            if(activeCount(all,ticket.epoch)>=64)throw new IOException("Acknowledge or archive retained submissions before continuing.");
            String id=UUID.randomUUID().toString();body=DmsApi.copy(body);body.put("operationId",id);
            all.put(id,object("owner",ticket.owner,"epoch",ticket.epoch,"lock",lock,"attempts",0,"payload",body.toString()));save(all,id);return body;
        }
    }
    static boolean blocks(JSONObject previous,JSONObject next,String lock)throws Exception{
        if(!lock.equals(previous.getString("lock"))||previous.has("receipt")||previous.optBoolean("conflict")||previous.has("observedJob"))return false;
        JSONObject original=new JSONObject(previous.getString("payload"));
        String op=str(original,"op");
        if("documentCommentAdd".equals(op)&&op.equals(str(next,"op")))
            return str(original,"text").trim().equals(str(next,"text").trim());
        if("documentSavedFilterSave".equals(op)&&op.equals(str(next,"op"))&&!original.has("id")&&!next.has("id")){
            JSONObject a=original.optJSONObject("criteria"),b=next.optJSONObject("criteria");
            if(a==null||b==null)return true;
            if(!str(original,"name").trim().equals(str(next,"name").trim()))return false;
            for(String field:new String[]{"version","search","personal","entityType","entityId","typeId","validity"})
                if(!str(a,field).equals(str(b,field)))return false;
        }
        if(!"processingAction".equals(str(original,"op"))||!"processingAction".equals(str(next,"op")))return true;
        if(original.optLong("documentId")!=next.optLong("documentId"))return false;
        String oldAction=str(original,"action"),newAction=str(next,"action");
        if(!oldAction.equals(newAction))return false;
        if("prepare_source".equals(newAction)){
            if(!str(original,"sourceHash").equals(str(next,"sourceHash"))||!str(original,"snapshot").equals(str(next,"snapshot")))return false;
            java.util.Set<Long> frozen=selectedFiles(original),requested=selectedFiles(next);
            return frozen==null||requested==null||!java.util.Collections.disjoint(frozen,requested);
        }
        return original.optLong("jobId")==next.optLong("jobId")&&str(original,"step").equals(str(next,"step"))&&str(original,"sourceHash").equals(str(next,"sourceHash"));
    }
    private static java.util.Set<Long> selectedFiles(JSONObject body){
        JSONArray files=body.optJSONArray("fileIds");
        if(files==null||files.length()==0||files.length()>10)return null;
        java.util.Set<Long> ids=new java.util.HashSet<>();
        for(int i=0;i<files.length();i++){
            Object value=files.opt(i);if(!(value instanceof Number))return null;
            Number n=(Number)value;long id=n.longValue();
            if(!DmsRules.positive(id)||n.doubleValue()!=id||!ids.add(id))return null;
        }
        return ids;
    }
    public long beginAttempt(JSONObject original)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            ticket.require();
            JSONObject current=all(),entry=current.getJSONObject(original.getString("operationId"));
            long attempt=DmsSubmission.begin(entry,original,ticket.owner,ticket.epoch);
            save(current,original.getString("operationId"));return attempt;
        }
    }
    static boolean preparationObserved(JSONObject original,JSONObject status){
        return "prepare_source".equals(str(original,"action"))&&str(original,"operationId").equals(str(status,"requestId"))
            &&DmsRules.positive(status.optLong("jobId"))&&original.optLong("documentId")==status.optLong("documentId")
            &&str(original,"sourceHash").equals(str(status,"sourceHash"))&&!"unavailable".equals(str(status,"stage"));
    }
    boolean observe(JSONObject original,JSONObject status)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            if(!preparationObserved(original,status))return false;
            JSONObject all=all(),p=all.getJSONObject(original.getString("operationId"));
            DmsArchive.check(p.getString("payload").equals(original.toString()));
            p.put("observedJob",status.getLong("jobId"));save(all,original.getString("operationId"));return true;
        }
    }
    public void sourceConflict(JSONObject body)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONObject current=all(),entry=current.getJSONObject(body.getString("operationId"));
            DmsArchive.check(entry.getString("payload").equals(body.toString()));
            entry.put("sourceConflict",true);save(current,body.getString("operationId"));
        }
    }
    void archive(String operation)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONObject all=all(),p=all.getJSONObject(operation);DmsArchive.check(!p.has("receipt")&&!p.optBoolean("conflict"));
            p.put("archived",true);save(all,operation);
        }
    }
    static void noEffect(JSONObject p,String disposition)throws Exception{
        JSONObject scrubbed=new JSONObject(p.getString("payload"));scrubbed.remove("token");
        p.put("payload",scrubbed.toString()).put("conflict",true).put("disposition",disposition);
    }
    public void finish(JSONObject body,JSONObject receipt)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONObject all=all(),p=all.getJSONObject(body.getString("operationId"));
            DmsSubmission.confirm(p,body,receipt);save(all,body.getString("operationId"));
        }
    }
    public void refuseAttempt(JSONObject original,long attempt,String disposition)throws Exception{
        if(attempt!=1)return;
        synchronized(LocalSecurity.STORAGE_LOCK){
            ticket.requireOriginIdentity();
            JSONObject existing=LocalSecurity.readJson(ticket.a,ticket.owner,"dms-originals",file,false);
            if(existing==null)return;
            JSONObject p=existing.optJSONObject(original.getString("operationId"));if(p==null||p.has("receipt"))return;
            DmsArchive.check(p.getLong("epoch")==ticket.epoch&&ticket.owner.equals(str(p,"owner"))&&p.getString("payload").equals(original.toString()));
            DmsSubmission.refuse(p,original,attempt,disposition);
            LocalSecurity.writeJson(ticket.a,ticket.owner,"dms-originals",file,existing);
        }
    }
    boolean lookup(JSONObject body)throws Exception{
        JSONObject proof=DmsSubmission.lookup(body,query->DmsApi.fetch(ticket.api,query,ticket::visible));
        if(proof==null)return false;
        synchronized(LocalSecurity.STORAGE_LOCK){
            ticket.require();String id=body.getString("operationId");
            JSONObject all=all(),entry=all.getJSONObject(id);
            DmsArchive.check(ticket.owner.equals(str(entry,"owner"))&&entry.getString("payload").equals(body.toString()));
            JSONObject scrubbed=DmsApi.copy(body);scrubbed.remove("token");
            entry.put("receipt",proof).put("payload",scrubbed.toString());save(all,id);
        }
        return true;
    }
    void remove(String id,boolean confirmed)throws Exception{synchronized(LocalSecurity.STORAGE_LOCK){JSONObject all=all();if(all.has(id)&&all.getJSONObject(id).has("receipt")==confirmed){all.remove(id);save(all,null);shard(id).delete();}}}
}
