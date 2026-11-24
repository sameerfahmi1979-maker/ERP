package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;
import android.app.Activity;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.provider.MediaStore;
import android.widget.EditText;
import org.json.*;
import java.io.*;
import java.util.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

final class DmsCapture {
    static final int CAMERA=2201,IMAGE=2202,MULTIPLE=2203,SAVE=2204;
    final DmsWorkspace ui;final LauncherActivity a;
    interface Result {void accept(Intent data)throws Exception;}
    interface Writer {void write(DmsWorkspace.Ticket t,Uri uri)throws Exception;}
    private Result onResult;private DmsWorkspace.Ticket origin;private int code;private Intent result;private boolean returned,ok;
    private DmsPrivateFiles.Entry camera;
    private String parentMember;
    private CaptureOrigin memberParent;
    List<Uri> incoming;DmsReviewContext mountedReview;
    DmsCapture(DmsWorkspace u){ui=u;a=u.a;}
    boolean awaiting(){return onResult!=null;}
    boolean resumeResult(){return returned;}
    void cancelExternal(){if(camera!=null){camera.remove();camera=null;}code=0;onResult=null;origin=null;returned=false;result=null;}
    void reset(){cancelExternal();incoming=null;endReview();parentMember=null;memberParent=null;}
    void endReview(){mountedReview=null;}
    boolean review(){return mountedReview!=null&&mountedReview.current(ui.current);}

    boolean launch(Intent intent,int code,Result done){
        if(awaiting()||ui.current==null||!ui.current.visible())return false;
        this.code=code;origin=ui.current;onResult=done;
        if(!a.launchDms(intent,code)){cancelExternal();return false;}return true;
    }
    void result(int code,boolean ok,Intent data){
        if(this.code!=code||origin==null||!origin.mounted()){cancelExternal();return;}
        returned=true;this.ok=ok;result=data;
        if(origin.visible())deliver();else if(a.hrActive())ui.foreground();
    }
    void deliver(){if(!returned)return;Result done=onResult;Intent data=result;boolean accept=ok&&origin!=null&&origin.visible();
        onResult=null;origin=null;returned=false;result=null;code=0;
        if(!accept){cancelExternal();return;}
        try{done.accept(data);}catch(Exception e){cancelExternal();ui.error(e);}
    }
    static boolean owned(int code){return code>=CAMERA&&code<=SAVE;}
    static List<Uri> uris(Intent data,boolean multiple,boolean shared)throws Exception{
        if(data==null)throw new IOException("No files selected.");List<Uri> list=new ArrayList<>();
        if(shared){ArrayList<Uri> supplied=data.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(supplied!=null)list.addAll(supplied);}
        ClipData clip=data.getClipData();if(list.isEmpty()&&clip!=null){if(clip.getItemCount()>10)throw new IOException("Choose up to ten files.");for(int i=0;i<clip.getItemCount();i++)list.add(clip.getItemAt(i).getUri());}
        if(list.isEmpty()&&data.getData()!=null)list.add(data.getData());DmsArchive.check(!list.isEmpty()&&list.size()<=(multiple?10:1)&&new HashSet<>(list).size()==list.size());
        for(Uri u:list)DmsArchive.check(u!=null&&"content".equals(u.getScheme())&&u.getAuthority()!=null&&!u.getAuthority().startsWith("net.algt.mobiledms."));return list;
    }
    void save(String name,String mime,Writer write){
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name);
        launch(i,SAVE,data->{Uri dest=uris(data,false,false).get(0);ui.work("Saving selected file",t->{write.write(t,dest);return true;},v->a.message("File saved.",false),null);});
    }
    void qr(){
        if(!ui.page("Scan document code",ui::hub,this::qr))return;
        EditText entry=ui.input("Document number or ALGT code","",512);
        ui.action("Look up entered code",()->lookup(a.value(entry)),true);
        ui.action("Choose QR image",()->launch(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"),IMAGE,data->{Uri uri=uris(data,false,false).get(0);decode(uri,null);}),false);
        ui.action("Photograph QR code",()->camera(false,null,null,null),false);
    }
    void lookup(String raw){String payload=DmsRules.qr(raw);if(payload==null){a.message("Enter a document number or a version 1 ALGT document code.",true);return;}
        ui.read(cmd("documentQrLookup","payload",payload),r->{JSONObject d=r.getJSONObject("document");DmsArchive.check("available".equals(str(r,"outcome")));
            long id=id(d,"id");ui.card(str(d,"title"),str(d,"number"),()->ui.docs.detail(id,null,this::qr));});}
    void camera(boolean evidence,JSONObject p,JSONObject scope,JSONObject request){
        DmsWorkspace.Ticket ticket=ui.current;
        try{
            DmsPrivateFiles.Entry shot=DmsPrivateFiles.create(a,ticket.api,"Camera image.jpg","image/jpeg",true,ticket::visible);camera=shot;shot.published=true;
            Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,shot.uri()).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);i.setClipData(ClipData.newRawUri("Camera image",shot.uri()));
            if(!launch(i,CAMERA,data->{a.revokeUriPermission(shot.uri(),Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);shot.published=false;camera=null;
                if(evidence)stageShot(shot,p,scope,request);else decode(null,shot);
            })){shot.remove();camera=null;}
        }catch(Exception e){ui.error(e);}
    }
    void decode(Uri uri,DmsPrivateFiles.Entry shot){
        ui.work("Decoding QR image on this device",t->{DmsPrivateFiles.Entry input=shot==null?DmsPrivateFiles.create(a,t.api,"qr","image/*",false,t::visible):shot;
            try{if(uri!=null){try(InputStream in=a.getContentResolver().openInputStream(uri);OutputStream out=DmsArchive.bounded(DmsArchive.existing(input.file),DmsArchive.FILE_LIMIT,()->t.visible()&&input.valid())){
                    if(in==null)throw new IOException("Image unavailable.");ErpApi.copy(in,out,DmsArchive.FILE_LIMIT);}}
                DmsArchive.check(input.valid()&&input.file.length()>0&&input.file.length()<=DmsArchive.FILE_LIMIT);BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(input.file.getPath(),o);
                DmsArchive.check(o.outWidth>0&&o.outHeight>0&&(long)o.outWidth*o.outHeight<=16000000L);o.inJustDecodeBounds=false;o.inSampleSize=CaptureJobRules.sampleSize(o.outWidth,o.outHeight,4096,3000000);
                Bitmap b=BitmapFactory.decodeFile(input.file.getPath(),o);if(b==null)throw new IOException("Image could not be decoded.");
                try{int w=b.getWidth(),h=b.getHeight();DmsArchive.check((long)w*h<=3000000&&input.valid());int[] pixels=new int[w*h];b.getPixels(pixels,0,w,0,0,w,h);return QrDecoder.decode(pixels,w,h);}finally{b.recycle();}
            }finally{input.remove();}
        },payload->{if(payload==null)a.message("No supported ALGT code found. Choose another image or enter a document number.",true);else lookup(payload);},null);
    }
    void evidence(JSONObject q,Runnable back){
        if(q.optLong("documentTypeId")<=0){a.message("The request has no admitted document type.",true);return;}
        pickMode(q.optJSONObject("parent"),null,q,back);
    }
    void queue(){
        parentMember=null; memberParent=null;
        endReview();if(!ui.page(QUEUE,"Separate document uploads",ui::parent,this::queue))return;
        a.subtitle("Each original has its own duplicate check, intake, review and save.");
        if(incoming!=null)ui.action("Choose how to file shared originals",this::incomingModes,true);
        ui.action("Archived unconfirmed originals",this::archives,false);
        ui.action("Choose filing location",()->scope("",null),false);
        ui.action("Choose employee or site folder",()->ui.subject("employee","",p->pickMode(p,null,null,this::queue),this::queue),false);
        ui.action("Scan pages into one PDF",()->a.openCaptureFrom(CaptureOrigin.queue(a.routeScope())),false);
        ui.work("Opening encrypted upload queue",t->new DmsQueue(t).read(),rows->{for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i),b=r.getJSONObject("request");String op=b.getString("operationId");
            ui.card((i+1)+". "+str(b.getJSONObject("metadata"),"original_filename"),str(r,"state"),()->member(op));}},null);
    }
    static JSONObject scopeCursor(JSONObject loc){return object("companyId",loc.optLong("companyId"),"branchId",loc.isNull("branchId")?0:loc.optLong("branchId"));}
    void scope(String search,JSONObject after){
        if(!ui.page("Choose filing location",this::queue,this::queue))return;EditText q=ui.input("Search permitted companies or branches",search,100);
        ui.action("Search locations",()->scope(a.value(q),null),false);
        ui.work("Checking filing locations",t->t.api.get(cmd("scopes","search",search,"after",after)),r->{List<JSONObject> rows=rows(r,"rows");for(JSONObject loc:rows){
            JSONObject scope=object("companyId",id(loc,"companyId"),"branchId",loc.opt("branchId"));ui.card(str(loc,"label"),"",()->pickMode(null,scope,null,this::queue));}
            if(r.optBoolean("more")&&!rows.isEmpty()){JSONObject last=rows.get(rows.size()-1);ui.action("More locations",()->scope(search,scopeCursor(last)),false);}
        },null);
    }
    void incomingModes(){
        List<Uri> group=incoming;if(group==null||!ui.page("File shared originals",this::queue,this::queue))return;
        ui.work("Checking the shared file types",t->{for(Uri uri:group){t.require();String mime=a.getContentResolver().getType(uri);if(mime==null||!mime.startsWith("image/"))return false;}return true;
        },photos->{a.subtitle(group.size()+" ordered originals");
            if(photos)ui.action("Combine these photos into one PDF",()->{
                try{DmsIncomingImages.consume(group,true,true,ordered->ui.work("Adding the shared pages",t->{
                    synchronized(UploadJobs.LOCK){
                        t.require();LocalDraft draft=a.draft;draft.reload();if(draft.frozen!=null||!draft.pages.isEmpty()||draft.record!=null||draft.scope!=null)throw new IOException("Finish the active upload before importing these pages.");
                        try{for(Uri uri:ordered){t.require();String mime=a.getContentResolver().getType(uri);DmsArchive.check(mime!=null&&mime.startsWith("image/"));
                            try(InputStream in=a.getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("The shared image is unavailable.");
                                draft.add(new FilterInputStream(in){public int read(byte[] b,int o,int n)throws IOException{t.require();int k=super.read(b,o,n);t.require();return k;}},a.dmsName(uri),mime);}}
                        }catch(Exception error){while(!draft.pages.isEmpty())draft.remove(draft.pages.size()-1);throw error;}
                    }return true;},v->{if(incoming==group)incoming=null;a.capture();},null),ignored->{});}
                catch(Exception error){ui.error(error);}
            },true);
            ui.action("Separate documents · choose company or branch",()->scope("",null),false);
            ui.action("Separate documents · choose employee or site",()->ui.subject("employee","",p->pickMode(p,null,null,this::incomingModes),this::incomingModes),false);
        },null);
    }
    void pickMode(JSONObject p,JSONObject scope,JSONObject req,Runnable back){
        if(!ui.page(req==null?"Add separate documents":"Add request evidence",back,back))return;
        if(p!=null)ui.line(p,"entityType","entityId");if(scope!=null)ui.line(scope,"companyId","branchId");if(req!=null)ui.line(req,"kind","id","documentTypeId","revision");
        if(incoming!=null&&req==null){List<Uri> group=incoming;ui.action("Use "+group.size()+" separate originals",()->{
            try{DmsIncomingImages.consume(group,false,false,ignored->{},ordered->ui.work("Securing shared originals",t->{new DmsQueue(t).stage(ordered,p,scope,null);return true;},v->{if(incoming==group)incoming=null;queue();},null));}catch(Exception error){ui.error(error);}
        },true);}
        ui.action("Choose original files",()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,req==null).putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/jpeg","image/png","image/webp"});
            launch(i,MULTIPLE,data->stage(uris(data,req==null,false),p,scope,req));},false);
        ui.action("Capture document photo",()->camera(true,p,scope,req),false);
    }
    void stageShot(DmsPrivateFiles.Entry shot,JSONObject p,JSONObject scope,JSONObject req){
        ui.work("Securing camera original",t->{try{DmsArchive.check(shot.valid());shot.published=true;new DmsQueue(t).stage(Collections.singletonList(shot.uri()),p,scope,req);return true;}finally{shot.remove();}},v->queue(),null);
    }
    void stage(List<Uri> choice,JSONObject p,JSONObject scope,JSONObject req){ui.work("Securing selected originals",t->{new DmsQueue(t).stage(choice,p,scope,req);return true;},v->queue(),null);}
    void memberFrom(String op,CaptureOrigin origin) {
        parentMember=op;
        memberParent=origin;
        member(op);
    }

    void member(String op){
        CaptureOrigin parent=op.equals(parentMember) && memberParent!=null ? memberParent : CaptureOrigin.queue(a.routeScope());
        Runnable parentBack=()->a.returnToCaptureOrigin(parent);
        endReview();Runnable here=()->memberFrom(op,parent);
        if(!ui.page(QUEUE_MEMBER,"Upload queue item",parentBack,here))return;
        ui.work("Checking original upload",t->{DmsQueue q=new DmsQueue(t);JSONObject r=q.load(op);
            if(Arrays.asList("uploaded","saved").contains(str(r,"state"))&&DmsQueue.inspectable(r)){
                try{put(r,"current",DmsQueue.inspect(r,q::intake));}
                catch(ErpApi.Rejected e){if(e.status==401||e.status==403)throw e;put(r,"inspection","Current intake unavailable.");}
                catch(IOException e){put(r,"inspection","The current intake could not be confirmed.");}
            }
            return r;},row->{
            JSONObject request=row.getJSONObject("request"),meta=request.getJSONObject("metadata");ui.line(meta,"original_filename","mime_type","file_size_bytes","sha256_hash");ui.line(row,"state");a.subtitle("Operation "+op);
            String state=str(row,"state");boolean same=ui.current.epoch==row.getLong("epoch");
            JSONObject offer=row.optJSONObject("offeredRecovery");
            if(same&&offer!=null && row.optJSONObject("approvedRecovery")==null){
                ui.action("Review retained ERP admission",()->ui.confirm("Recover matching prior admission?","Original "+op+" · ERP recovery "+str(offer,"operationId"),()->ui.work("Retaining approved recovery",t->{DmsQueue q=new DmsQueue(t);JSONObject fresh=q.load(op);DmsArchive.check(DmsQueue.sameOriginal(fresh.getJSONObject("request"),offer));q.change(op,"approvedRecovery",offer);return true;},v->here.run(),null)),false);
            }else if(same&&(state.equals("selected")||state.equals("admitting")))ui.action(state.equals("admitting")?"Recover original admission":"Check duplicates and upload",()->ui.work("Checking original admission",t->new DmsQueue(t).transfer(op),r->here.run(),null),true);
            if(row.has("saveOp")&&row.optJSONObject("saveReceipt")==null){
                a.subtitle("Original approval "+str(row,"saveOp")+" · receipt unconfirmed.");
                if(row.optLong("saveEpoch",-1)==ui.current.epoch)ui.action("Continue original approval",()->{
                    try{DmsReviewContext ctx=new DmsReviewContext(ui.current.owner,ui.current.epoch,ui.current.generation,row);
                        ui.confirm("Continue the original ERP approval?","This can finish the canonical document save.",()->approve(ctx,null));
                    }catch(Exception error){ui.error(error);}
                },false);
            }
            JSONObject r=row.optJSONObject("current");
            boolean proven=DmsQueue.canFinish(row,ui.current.owner,r);
            if(!proven&&(DmsQueue.archivable(row)||(!same&&"uploaded".equals(state))||(r!=null&&r.optLong("documentId")>0)))ui.action("Archive local unconfirmed item",()->ui.confirm("Archive this original on this phone?","Its retained identity and receipt remain available for inspection; ERP state is unchanged.",()->ui.work("Archiving original",t->{new DmsQueue(t).archive(op);return true;},v->parentBack.run(),null)),false);
            ui.line(row,"inspection");
            if("admitting".equals(state)&&DmsQueue.inspectable(row))ui.action("Inspect retained intake (read only)",()->ui.work("Reading retained ERP intake",t->{DmsQueue q=new DmsQueue(t);return DmsQueue.inspect(q.load(op),q::intake);},live->ui.line(live,"code","status","documentId"),null),false);
            if(r!=null){ui.line(r,"code","status","entityLabel","documentId","startError");ui.action("Refresh intake",here,false);
                String attempted=DmsQueue.startOutcome(row);a.subtitle("AI start · "+attempted);
                if(DmsQueue.canStart(row,r,ui.current.epoch))ui.action("Start AI for this original",()->ui.confirm("Start AI processing?",str(meta,"original_filename"),()->ui.work("Starting the selected intake once",t->{new DmsQueue(t).start(op);return true;},v->here.run(),null)),false);
                if("uploaded".equals(state)&&r.optBoolean("canReview")&&!row.has("saveOp"))ui.action("Review and save this original",()->startReview(op,row,r),true);
                if(r.optLong("documentId")>0){ui.action("Open saved document",()->ui.docs.detail(r.optLong("documentId"),request.optJSONObject("context"),here),false);
                    if(row.optJSONObject("evidence")!=null&&proven)ui.action("Review evidence for original request",()->ui.requests.candidate(row.optJSONObject("evidence"),object("id",r.optLong("documentId")),here),false);
                    if(proven)ui.action("Finish this queue item",()->ui.work("Closing saved item",t->{new DmsQueue(t).finishVerified(op);return true;},v->parentBack.run(),null),false);}
            }
            if(state.equals("duplicate")){JSONObject m=row.optJSONObject("match");if(m!=null){ui.line(m,"status","documentNo","sessionCode");if(m.optLong("documentId")>0)ui.action("Open existing document",()->ui.docs.detail(m.optLong("documentId"),request.optJSONObject("context"),here),false);}}
            if(state.equals("selected")||state.equals("duplicate"))ui.action("Remove from queue",()->ui.confirm("Remove this original?",str(meta,"original_filename"),()->ui.work("Removing encrypted original",t->{new DmsQueue(t).remove(op);return true;},v->parentBack.run(),null)),false);
        },null);
    }
    void previewReview(IntakeReview review){
        String op=review.member.member;long session=review.member.session;String mime=str(review.upload,"mime");
        DmsSharing.Validate validate=t->{DmsQueue queue=new DmsQueue(t);JSONObject item=queue.load(op),live=queue.intake(item);DmsArchive.check(id(live,"id")==session&&live.getBoolean("canPreview"));};
        ui.work("Opening this queue original",t->{validate.run(t);DmsPrivateFiles.Entry e=DmsPrivateFiles.create(a,t.api,str(review.upload,"name"),mime,false,t::visible);
            try{t.api.dmsIntakePreview(session,e.file,()->t.visible()&&e.valid());JSONObject meta=new DmsQueue(t).load(op).getJSONObject("request").getJSONObject("metadata");FileFingerprint fp=FileFingerprint.read(e.file);
                DmsArchive.check(fp.size==meta.getLong("file_size_bytes")&&fp.sha256.equals(str(meta,"sha256_hash")));validate.run(t);return new DmsSharing.Asset(e,mime);
            }catch(Exception ex){e.remove();throw ex;}
        },asset->ui.sharing.preview(asset,0,validate,a.reviewReturn(review),()->review.originalViewed=true),null);
    }
    void archives(){
        if(!ui.page("Archived original admissions",this::queue,this::archives))return;
        ui.work("Opening archived receipts",t->new DmsQueue(t).archives(),ids->{for(String op:ids)
            ui.action(op,()->ui.work("Inspecting archived original",t->{DmsQueue q=new DmsQueue(t);JSONObject row=q.archived(op);
                if(DmsQueue.inspectable(row))put(row,"current",DmsQueue.inspect(row,q::intake));return row;
            },row->{ui.line(row,"state","saveOp","startOutcome");JSONObject live=row.optJSONObject("current");if(live!=null)ui.line(live,"code","status","documentId");else a.subtitle("No confirmed ERP receipt for this original.");},null),false);
        },null);
    }
    void approve(DmsReviewContext ctx,JSONObject proposed){
        if(!ctx.current(ui.current)){a.message("Reopen this original in its signed-in account.",true);return;}
        ui.work("Continuing this exact document approval",t->new DmsQueue(t).sendSave(ctx,proposed),receipt->member(ctx.member),error->{
            ui.error(error);ui.action("Inspect original approval",()->member(ctx.member),false);
        });
    }
    void startReview(String op,JSONObject row,JSONObject intake){
        ui.work("Opening individual review",t->{DmsQueue q=new DmsQueue(t);JSONObject live=q.load(op),fresh=q.intake(live);
            DmsReviewContext ctx=new DmsReviewContext(t.owner,t.epoch,t.generation,live);
            DmsArchive.check(fresh.optBoolean("canReview")&&id(fresh,"id")==id(intake,"id"));
            if(ctx.requiredType>0)q.evidenceAuthority(live);
            JSONObject legacy=LocalDraft.read(a.draft.approval(ctx.session));
            if(legacy!=null && !live.has("approval")){
                if(live.has("saveOp")&&live.optLong("saveEpoch",-1)==ctx.epoch){q.freezeSave(ctx,null,legacy);return null;}
                throw new IOException("This prior approval has no provable original sign-in. Inspect its intake or archive the item.");
            }
            return new IntakeReview(fresh,ctx.choices(t.api.list(cmd("types"))),ctx);
        },review->{if(review==null)member(op);else a.reviewDms(review);},null);
    }


}
