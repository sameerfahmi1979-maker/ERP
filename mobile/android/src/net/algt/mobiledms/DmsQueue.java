package net.algt.mobiledms;
import android.net.Uri;
import android.util.AtomicFile;
import java.io.*;
import java.util.*;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

final class DmsQueue {
    final DmsWorkspace.Ticket t;final File folder;final AtomicFile index;
    DmsQueue(DmsWorkspace.Ticket ticket)throws Exception{t=ticket;t.require();folder=LocalSecurity.directory(t.a.getNoBackupFilesDir(),t.owner);index=new AtomicFile(new File(folder,"separate-uploads.enc"));}
    JSONArray read()throws Exception{t.require();JSONObject value=LocalSecurity.readJson(t.a,t.owner,"separate-uploads",index,false);return value==null?new JSONArray():value.getJSONArray("files");}
    void save(JSONArray rows)throws Exception{t.require();LocalSecurity.writeJson(t.a,t.owner,"separate-uploads",index,object("files",rows));}
    File bytes(String op)throws IOException{DmsArchive.check(UUID.fromString(op).toString().equals(op));return new File(folder,"member-"+op+".enc");}
    static String mime(String name,byte[] h,int n)throws IOException{
        String filename=name.toLowerCase(Locale.ROOT);boolean pdf=n>=5&&h[0]==37&&h[1]==80&&h[2]==68&&h[3]==70&&h[4]==45;
        if(pdf&&filename.endsWith(".pdf"))return "application/pdf";
        if(n>=3&&(h[0]&255)==255&&(h[1]&255)==216&&(h[2]&255)==255&&filename.matches(".*\\.jpe?g"))return "image/jpeg";
        if(n>=8&&(h[0]&255)==137&&h[1]==80&&h[2]==78&&h[3]==71&&h[4]==13&&h[5]==10&&h[6]==26&&h[7]==10&&filename.endsWith(".png"))return "image/png";
        if(n>=12&&new String(h,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")&&new String(h,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")&&filename.endsWith(".webp"))return "image/webp";
        throw new IOException("Choose a PDF, JPEG, PNG or WebP whose file name and content match.");
    }
    void stage(List<Uri> uris,JSONObject context,JSONObject scope,JSONObject evidence)throws Exception{
        JSONArray all=read();DmsArchive.check(!uris.isEmpty()&&uris.size()<=10&&all.length()+uris.size()<=10&&(context!=null)!=(scope!=null));
        Set<String> hashes=new HashSet<>();for(int i=0;i<all.length();i++)hashes.add(all.getJSONObject(i).getJSONObject("request").getJSONObject("metadata").getString("sha256_hash"));
        List<File> added=new ArrayList<>();boolean ok=false;
        try{
            for(Uri u:uris){t.require();String op=UUID.randomUUID().toString(),name=t.a.dmsName(u);DmsArchive.check(name!=null&&name.length()<=200&&!name.contains("/")&&!name.contains("\\"));
                File target=bytes(op);added.add(target);String mime;EncryptedFiles.Info info;
                try(InputStream opened=t.a.getContentResolver().openInputStream(u)){
                    if(opened==null)throw new IOException("File could not be opened.");
                    BufferedInputStream in=new BufferedInputStream(opened);in.mark(20);byte[] h=new byte[12];int n=0;for(;n<h.length;n++){int b=in.read();if(b<0)break;h[n]=(byte)b;}in.reset();mime=mime(name,h,n);
                    String claimed=t.a.getContentResolver().getType(u);if(claimed!=null&&!claimed.equals("application/octet-stream")&&!mime.equals(claimed))throw new IOException("The file type differs from the selected original.");
                    InputStream checked=new FilterInputStream(in){public int read(byte[] b,int off,int len)throws IOException{t.require();int n=super.read(b,off,len);t.require();return n;}};
                    info=LocalSecurity.seal(t.a,t.owner,"member-"+op,checked,target,DmsArchive.FILE_LIMIT);
                }
                if(!hashes.add(info.sha256))throw new IOException("Two selected files have identical content. Choose each original once.");
                JSONObject req=object("version",1,"operationId",op,"authUserId",t.owner,"metadata",object("original_filename",name,"mime_type",mime,"file_size_bytes",info.size,"sha256_hash",info.sha256),"context",context);
                if(scope!=null)put(req,"scope",scope);JSONObject row=object("epoch",t.epoch,"request",req,"state","selected");if(evidence!=null)put(row,"evidence",evidence);all.put(row);
            }save(all);ok=true;
        }finally{if(!ok)for(File f:added)new AtomicFile(f).delete();}
    }
    static JSONObject member(JSONArray entries,String op)throws Exception{for(int i=0;i<entries.length();i++){JSONObject item=entries.getJSONObject(i);if(item.getJSONObject("request").getString("operationId").equals(op))return item;}throw new IOException("Selected upload is unavailable.");}
    JSONObject load(String op)throws Exception{return member(read(),op);}
    void change(String op,String key,Object value)throws Exception{JSONArray all=read();put(member(all,op),key,value);save(all);}
    void remove(String op)throws Exception{JSONArray all=read();for(int i=0;i<all.length();i++){JSONObject row=all.getJSONObject(i);if(!op.equals(str(row.getJSONObject("request"),"operationId")))continue;
        DmsArchive.check(!row.has("saveOp")&&!row.has("approval")&&Arrays.asList("selected","duplicate").contains(str(row,"state")));all.remove(i);save(all);new AtomicFile(bytes(op)).delete();return;}}
    static boolean sameValue(Object a,Object b){
        if(a instanceof JSONObject && b instanceof JSONObject){JSONObject x=(JSONObject)a,y=(JSONObject)b;if(x.length()!=y.length())return false;Iterator<String> keys=x.keys();while(keys.hasNext()){String k=keys.next();if(!y.has(k)||!sameValue(x.opt(k),y.opt(k)))return false;}return true;}
        if(a instanceof Number&&b instanceof Number)return a.toString().equals(b.toString());
        return java.util.Objects.equals(a,b);
    }
    static boolean sameOriginal(JSONObject original,JSONObject offered){
        if(original==null||offered==null||!HrRules.uuid(str(original,"operationId"))||!HrRules.uuid(str(offered,"operationId")))return false;
        JSONObject a=copy(original),b=copy(offered);a.remove("operationId");b.remove("operationId");return sameValue(a,b);
    }
    static boolean saved(long session,String operation,JSONObject r){return session>0&&HrRules.uuid(operation)&&r!=null&&r.optBoolean("completed")&&r.optLong("upload_session_id")==session&&operation.equals(str(r,"operation_id"))&&DmsRules.positive(r.optLong("documentId"))&&!str(r,"documentNo").isEmpty();}
    static boolean canFinish(JSONObject row,String owner,JSONObject live){
        try{
            if(live==null||!inspectable(row))return false;
            JSONObject intake=row.getJSONObject("receipt"),proof=row.optJSONObject("saveReceipt");
            String operation=row.getString("saveOp");
            long session=id(intake,"id"),epoch=row.getLong("saveEpoch");
            DmsReviewContext ctx=new DmsReviewContext(owner,epoch,0,row);
            if(id(live,"id")!=session||!str(intake,"code").equals(str(live,"code"))
                ||!saved(session,operation,proof)||id(live,"documentId")!=id(proof,"documentId"))return false;
            if(row.has("approval")){
                JSONObject original=DmsApprovalIntent.load(row.getJSONObject("approval"),ctx,row,epoch);
                if(!operation.equals(original.getString("operationId")))return false;
            }
            return true;
        }catch(Exception invalid){return false;}
    }
    static void finishVerified(JSONArray rows,String op,String owner,JSONObject fresh)throws Exception{
        JSONObject row=member(rows,op);
        DmsArchive.check(canFinish(row,owner,fresh));
        for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i)==row){rows.remove(i);return;}
        throw new IOException("Queue member is unavailable.");
    }
    void finishVerified(String op)throws Exception{
        JSONObject fresh=intake(load(op));
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONArray rows=read();finishVerified(rows,op,t.owner,fresh);save(rows);
            new AtomicFile(bytes(op)).delete();
        }
    }
    JSONObject freezeSave(DmsReviewContext ctx,JSONObject proposed,JSONObject legacy)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            t.require();DmsArchive.check(ctx.current(t));JSONArray all=read();JSONObject row=member(all,ctx.member);
            JSONObject atom=DmsApprovalIntent.freeze(ctx,row,proposed,legacy);
            row.put("approval",atom).put("saveOp",atom.getString("operationId")).put("saveEpoch",atom.getLong("epoch"));
            save(all);return atom;
        }
    }
    void evidenceAuthority(JSONObject row)throws Exception{
        JSONObject original=row.optJSONObject("evidence");if(original==null)return;
        JSONObject parent=original.getJSONObject("parent");long request=id(original,"id");
        for(int page=1;page<=100000;page++){
            JSONObject window=fetch(t.api,cmd("documentRequests","audience","parent","parent",parent,"page",page),t::visible);
            for(JSONObject candidate:rows(window,"rows"))if(id(candidate,"id")==request&&str(original,"kind").equals(str(candidate,"kind"))){
                requireEvidence(original,candidate);return;
            }
            if(!window.getBoolean("hasMore"))break;
        }
        throw new IOException("The original evidence request is no longer available.");
    }
    static void requireEvidence(JSONObject expected,JSONObject current)throws Exception{
        DmsArchive.check(id(expected,"id")==id(current,"id")&&str(expected,"kind").equals(str(current,"kind"))&&id(expected,"revision")==id(current,"revision")
            &&id(expected,"documentTypeId")==id(current,"documentTypeId")&&sameValue(expected.getJSONObject("parent"),current.getJSONObject("parent")));
        JSONArray actions=current.getJSONArray("actions");for(int i=0;i<actions.length();i++)if("submit_document".equals(actions.optString(i)))return;
        throw new IOException("The request no longer offers evidence submission.");
    }
    JSONObject sendSave(DmsReviewContext ctx,JSONObject proposed)throws Exception{
        JSONObject legacy=LocalDraft.read(t.a.draft.approval(ctx.session));
        JSONObject atom=freezeSave(ctx,proposed,legacy);
        JSONObject row=load(ctx.member);
        JSONObject latest=intake(row);
        DmsArchive.check(id(latest,"id")==ctx.session);
        if(!latest.optBoolean("canReview")&&latest.optLong("documentId")<=0)throw new IOException("This intake no longer offers document approval.");
        if(ctx.requiredType>0){evidenceAuthority(row);ctx.choices(t.api.list(cmd("types")));}
        t.require();
        try{
            JSONObject receipt=DmsApprovalIntent.continueOriginal(atom,ctx,row,t.api.sessionEpoch(),body->t.api.dmsOnce(body,t::visible));
            settleSave(ctx.member,ctx.session,receipt);
            if(legacy!=null)t.a.draft.approval(ctx.session).delete();
            return receipt;
        }catch(ErpApi.Rejected failure){
            if(DmsWorkspace.accessDenied(failure))throw failure;
            if(failure.response!=null&&failure.response.optBoolean("retryWithChanges")&&!failure.response.optBoolean("uncertain")&&!failure.response.optBoolean("recoveryRequired")){
                rejectedSave(ctx.member,atom.getString("operationId"));if(legacy!=null)t.a.draft.approval(ctx.session).delete();
            }
            throw failure;
        }
    }
    static boolean inspectable(JSONObject row){
        JSONObject receipt=row.optJSONObject("receipt");
        return receipt!=null&&DmsRules.positive(receipt.optLong("id"))&&str(receipt,"code").matches("[A-Za-z0-9_-]{1,64}");
    }
    interface Inspect {JSONObject read(JSONObject row)throws Exception;}
    static JSONObject inspect(JSONObject row,Inspect reader)throws Exception{
        if(!inspectable(row))return null;JSONObject live=reader.read(row),receipt=row.getJSONObject("receipt");
        DmsArchive.check(id(receipt,"id")==id(live,"id")&&str(receipt,"code").equals(str(live,"code")));return live;
    }
    static boolean archivable(JSONObject row){
        return Arrays.asList("admitting","saved").contains(str(row,"state"))||row.has("saveOp")||"unknown".equals(str(row,"startOutcome"));
    }
    void archive(String op)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONArray all=read();JSONObject row=member(all,op);DmsArchive.check(archivable(row)||"uploaded".equals(str(row,"state")));
            AtomicFile receipt=new AtomicFile(new File(folder,"member-archive-"+UUID.fromString(op)+".enc"));
            LocalSecurity.writeJson(t.a,t.owner,"archived-member:"+op,receipt,row);
            for(int i=0;i<all.length();i++)if(all.getJSONObject(i)==row){all.remove(i);break;}
            save(all);new AtomicFile(bytes(op)).delete();
        }
    }
    List<String> archives()throws Exception{
        t.require();List<String> out=new ArrayList<>();File[] files=folder.listFiles();
        if(files!=null)for(File f:files){String n=f.getName();if(n.startsWith("member-archive-")&&n.endsWith(".enc")){
            String op=n.substring(15,n.length()-4);if(HrRules.uuid(op))out.add(op);}}
        return out;
    }
    JSONObject archived(String op)throws Exception{
        t.require();DmsArchive.check(HrRules.uuid(op));
        return LocalSecurity.readJson(t.a,t.owner,"archived-member:"+op,new AtomicFile(new File(folder,"member-archive-"+op+".enc")),false);
    }
    static String startOutcome(JSONObject row){return row.optString("startOutcome",row.optBoolean("startAttempted")?"unknown":"ready");}
    static String refusedStart(Exception e){
        if(e instanceof DmsTransfer.NotSent)return "not_sent";
        if(e instanceof ErpApi.Rejected){ErpApi.Rejected r=(ErpApi.Rejected)e;if(r.beforeBusinessRequest)return "not_sent";
            if(r.response!=null&&!r.response.optBoolean("uncertain")&&(r.status==400||r.status==413))return "refused";
            if(r.response!=null&&Boolean.FALSE.equals(r.response.opt("success"))&&!r.response.optBoolean("uncertain")){
                String code=str(r.response,"code");
                if((r.status==401&&"authentication_required".equals(code))||(r.status==403&&"permission_denied".equals(code)))return "refused";
            }
            JSONObject data=r.response==null?null:r.response.optJSONObject("data");
            if(r.response!=null&&!r.response.optBoolean("uncertain")&&"provider_not_configured".equals(str(data,"status")))return "refused";
        }
        return "unknown";
    }
    void noteStart(String op,String attempt,String outcome)throws Exception{
        synchronized(LocalSecurity.STORAGE_LOCK){
            t.requireOriginIdentity();JSONObject indexValue=LocalSecurity.readJson(t.a,t.owner,"separate-uploads",index,false);
            if(indexValue==null)return;JSONArray all=indexValue.getJSONArray("files");
            for(int i=0;i<all.length();i++){JSONObject item=all.getJSONObject(i);
                if(op.equals(str(item.getJSONObject("request"),"operationId"))&&attempt.equals(str(item,"startAttempt"))){
                    item.put("startOutcome",outcome);
                    LocalSecurity.writeJson(t.a,t.owner,"separate-uploads",index,indexValue);return;
                }
            }
        }
    }
    interface Start{void run()throws Exception;}
    interface Outcome{void record(String state)throws Exception;}
    static boolean canStart(JSONObject row,JSONObject fresh,long epoch){
        return row.optLong("epoch",-1)==epoch&&"uploaded".equals(str(row,"state"))&&fresh.optBoolean("canStart")
            &&Arrays.asList("ready","not_sent","refused").contains(startOutcome(row));
    }
    static void startOnce(Start send,Outcome store)throws Exception{
        try{send.run();}
        catch(Exception failure){
            try{store.record(refusedStart(failure));}catch(Exception local){failure.addSuppressed(local);}
            throw failure;
        }
        store.record("accepted");
    }
    void start(String op)throws Exception{
        JSONArray all=read();JSONObject row=member(all,op),fresh=intake(row);
        DmsArchive.check(canStart(row,fresh,t.epoch));
        String attempt=UUID.randomUUID().toString();row.put("startAttempt",attempt).put("startOutcome","unknown");save(all);
        startOnce(()->t.api.dmsOriginal(cmd("start","sessionId",id(fresh,"id")),t::visible),outcome->noteStart(op,attempt,outcome));
    }

    void rejectedSave(String op,String operation)throws Exception{
        JSONArray all=read();JSONObject row=member(all,op);if(row.has("saveReceipt")||!operation.equals(str(row,"saveOp")))return;
        row.remove("saveOp");row.remove("saveEpoch");row.remove("approval");save(all);
    }
    void settleSave(String op,long session,JSONObject receipt)throws Exception{
        JSONArray all=read();JSONObject row=member(all,op);DmsArchive.check(id(row.getJSONObject("receipt"),"id")==session&&saved(session,str(row,"saveOp"),receipt));row.put("saveReceipt",receipt);save(all);
    }
    JSONObject transfer(String op)throws Exception{
        JSONObject row=load(op),req=row.getJSONObject("request"),meta=req.getJSONObject("metadata");DmsArchive.check(row.getLong("epoch")==t.epoch&&t.owner.equals(req.getString("authUserId")));
        String state=str(row,"state");DmsArchive.check(state.equals("selected")||state.equals("admitting"));
        if(state.equals("selected")){JSONObject match=t.api.duplicate(meta.getLong("file_size_bytes"),meta.getString("sha256_hash"));t.require();
            if(!"no_visible_match".equals(str(match,"status"))){change(op,"match",match);change(op,"state","duplicate");return load(op);}
            change(op,"state","admitting");
        }
        DmsPrivateFiles.Entry file=DmsPrivateFiles.create(t.a,t.api,"original",str(meta,"mime_type"),false,t::visible);
        try{LocalSecurity.unsealScoped(t.a,t.owner,"member-"+op,bytes(op),file.file,()->t.visible()&&file.valid());
            FileFingerprint fp=FileFingerprint.read(file.file);DmsArchive.check(fp.size==meta.getLong("file_size_bytes")&&fp.sha256.equals(meta.getString("sha256_hash")));
            JSONObject wire=row.optJSONObject("approvedRecovery");if(wire==null)wire=req;DmsArchive.check(sameOriginal(req,wire));
            JSONObject admitted;
            try{admitted=t.api.dmsOnce(cmd("admit","request",wire),t::visible);}
            catch(ErpApi.Rejected error){JSONObject offered=error.response==null?null:error.response.optJSONObject("recovery");
                if(offered!=null&&sameOriginal(req,offered)&&!str(wire,"operationId").equals(str(offered,"operationId"))){change(op,"offeredRecovery",offered);return load(op);}throw error;}

            if(admitted.optBoolean("duplicate")){change(op,"state","duplicate");return load(op);}
            long session=id(admitted,"id");String code=str(admitted,"code");DmsArchive.check(code.matches("[A-Za-z0-9_-]{1,64}"));
            JSONObject retained=row.optJSONObject("receipt");if(retained!=null)DmsArchive.check(id(retained,"id")==session&&code.equals(str(retained,"code")));
            change(op,"receipt",object("id",session,"code",code,"size",fp.size,"sha256",fp.sha256));
            if(!admitted.isNull("uploadUrl")){t.require();t.api.upload(admitted.getString("uploadUrl"),file.file,meta.getString("mime_type"),()->t.visible()&&file.valid());}
            t.api.dmsOriginal(cmd("complete","sessionId",session,"request",wire),t::visible);change(op,"state","uploaded");return load(op);
        }finally{file.remove();}
    }
    JSONObject intake(JSONObject row)throws Exception{
        JSONObject receipt=row.getJSONObject("receipt"),request=row.getJSONObject("request"),meta=request.getJSONObject("metadata");
        JSONObject r=t.api.dmsOnce(cmd("intake","code",receipt.getString("code")),t::visible);
        DmsArchive.check(id(receipt,"id")==id(r,"id")&&str(r,"code").equals(str(receipt,"code"))&&str(r,"name").equals(str(meta,"original_filename"))&&str(r,"mime").equals(str(meta,"mime_type")));
        JSONObject p=request.optJSONObject("context");if(p!=null)DmsArchive.check(str(p,"entityType").equals(str(r,"entityType"))&&id(p,"entityId")==id(r,"entityId"));
        return r;
    }
}
