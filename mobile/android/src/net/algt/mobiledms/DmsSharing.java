package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;
import android.content.*;
import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

final class DmsSharing {
    final DmsWorkspace ui;final LauncherActivity a;volatile Incoming incoming;private String created;
    DmsSharing(DmsWorkspace u){ui=u;a=u.a;}
    void retireCreated(){created=null;}
    void clear(){incoming=null;created=null;}
    static final class Incoming {
        final String token;
        Incoming(String uri){token=DmsRules.parseLink(uri);}
        boolean valid(){return token!=null;}
        static Incoming acrossSignIn(Incoming received,boolean initial){return initial?received:null;}
    }
    static Incoming receive(String uri,java.util.function.Consumer<Incoming> replace){
        Incoming received=new Incoming(uri);replace.accept(received);return received;
    }
    Incoming accept(Intent i){
        if(i==null||!Intent.ACTION_VIEW.equals(i.getAction()))return null;
        Incoming received=receive(i.getDataString(),value->incoming=value);
        i.setData(null);return received;
    }
    void recipients(JSONObject doc,JSONObject f,String search,int page,Runnable back){
        if(!ui.page("Choose ERP recipient",back,back))return;EditText q=ui.input("Recipient name",search,100);
        ui.action("Search recipients",()->recipients(doc,f,a.value(q),1,back),false);
        ui.read(cmd("documentShareRecipients","documentId",doc.optLong("id"),"sourceHash",str(f,"sourceHash"),"search",search,"page",page),r->{
            for(JSONObject n:rows(r,"rows"))ui.card(str(n,"label"),str(f,"name"),()->lifetime(doc,f,n,back));ui.pages(r,page,p->recipients(doc,f,search,p,back));});
    }
    void lifetime(JSONObject doc,JSONObject f,JSONObject nominee,Runnable back){
        if(!ui.page("ERP link lifetime",back,back))return;a.subtitle(str(f,"name")+" · "+str(nominee,"label"));
        for(int hours:new int[]{1,24,168})ui.action(hours+" hours",()->ui.confirm("Create recipient link?",str(nominee,"label")+" · "+hours+" hours",()->{
            String token=DmsRules.token();JSONObject b=cmd("documentShareCreate","documentId",doc.optLong("id"),"versionId",f.optLong("versionId"),"fileId",f.optLong("id"),"sourceHash",str(f,"sourceHash"),"recipientProfileId",nominee.optLong("profileId"),"lifetimeHours",hours,"token",token);
            ui.mutate(b,"share/"+doc.optLong("id")+"/"+nominee.optLong("profileId"),r->created(token,r,back));
        }),false);
    }
    void created(String token,JSONObject receipt,Runnable back){
        if(!ui.page("ERP link created",back,back))return;created=token;ui.line(receipt,"expiresAt");a.subtitle("The nominated recipient must sign in and have current document access.");
        ui.action("Copy link",()->{if(created==null)return;ClipData clip=ClipData.newPlainText("ERP document link",DmsRules.LINK+created);
            if(Build.VERSION.SDK_INT>=33){PersistableBundle extras=new PersistableBundle();extras.putBoolean("android.content.extra.IS_SENSITIVE",true);clip.getDescription().setExtras(extras);}
            a.getSystemService(android.content.ClipboardManager.class).setPrimaryClip(clip);created=null;back.run();},false);
        ui.action("Share link",()->{if(created==null)return;String link=DmsRules.LINK+created;created=null;back.run();a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,link),"Share ERP link"));},true);
    }
    void list(long doc,int page,Runnable back){
        Runnable here=()->list(doc,page,back);if(!ui.page("ERP links",back,here))return;
        ui.read(cmd("documentShares","documentId",doc,"page",page),r->{for(JSONObject s:rows(r,"rows")){ui.card(str(s,"recipientLabel"),str(s,"state"),null);ui.line(s,"expiresAt","versionId","fileId");
            if(s.optBoolean("canRevoke"))ui.action("Revoke link",()->ui.confirm("Revoke this ERP link?",str(s,"recipientLabel"),()->ui.mutate(cmd("documentShareRevoke","shareId",s.optLong("id")),"revoke/"+s.optLong("id"),ok->here.run())),false);
        }ui.pages(r,page,p->list(doc,p,back));});
    }
    void resolve(){
        Incoming selected=incoming;if(selected==null||!selected.valid())return;
        String token=selected.token;if(!DmsRules.tokenValid(token)||!ui.page(INCOMING_LINK,"Incoming ERP link",ui::hub,ui::hub))return;
        ui.read(cmd("documentShareResolve","token",token),r->{
            if(incoming!=selected)return;
            JSONObject s=r.getJSONObject("source");id(s,"fileId");id(s,"documentId");id(s,"versionId");hash(s,"sourceHash");ui.line(r,"title","number","expiresAt");ui.line(s,"versionId");
            if(r.optBoolean("canPreview"))ui.action("Preview shared original",()->shared(token,r,true),true);
            if(r.optBoolean("canDownload"))ui.action("Save shared original",()->shared(token,r,false),false);
        });
    }
    interface Validate {void run(DmsWorkspace.Ticket t)throws Exception;}
    void shared(String token,JSONObject ref,boolean preview){
        Incoming selected=incoming;if(selected==null||!token.equals(selected.token))return;
        JSONObject src=ref.optJSONObject("source");DmsPrivateFiles.Admission admission=(api,valid)->{DmsArchive.check(incoming==selected);JSONObject r=fetch(api,cmd("documentShareResolve","token",token),valid);
            JSONObject x=r.getJSONObject("source");for(String key:new String[]{"documentId","versionId","fileId","sourceHash"})DmsArchive.check(str(src,key).equals(str(x,key)));DmsArchive.check(incoming==selected&&id(r,"shareId")==id(ref,"shareId"));};
        Validate check=t->admission.verify(t.api,t::visible);
        if(!preview){ui.capture.save(str(ref,"number"),"application/octet-stream",(t,uri)->{
            DmsPrivateFiles.Entry e=DmsPrivateFiles.create(a,t.api,"shared","application/octet-stream",false,t::visible);
            e.admission=admission;
            try{t.api.dmsFile("?share=1&disposition=attachment",token,e.file,()->t.visible()&&e.valid());check.run(t);export(t,e,uri);}finally{e.remove();}});return;}
        ui.work("Opening protected shared file",t->{DmsPrivateFiles.Entry e=DmsPrivateFiles.create(a,t.api,"shared","application/octet-stream",false,t::visible);
            try{String mime=t.api.dmsFile("?share=1&disposition=inline",token,e.file,()->t.visible()&&e.valid());check.run(t);return new Asset(e,mime);}catch(Exception ex){e.remove();throw ex;}
        },asset->preview(asset,0,check,this::resolve),null);
    }
    static final class Asset {final DmsPrivateFiles.Entry entry;final String mime;Asset(DmsPrivateFiles.Entry e,String m){entry=e;mime=m;}}
    void file(JSONObject doc,JSONObject f,int page,String action,Runnable back){
        long docId=doc.optLong("id"),v=f.optLong("versionId"),file=f.optLong("id");String name=str(f,"name"),mime=str(f,"mime");
        DmsPrivateFiles.Admission source=(api,valid)->{
            JSONObject r=fetch(api,DmsDocuments.fileRequest(doc,v,page),valid);
            for(JSONObject row:rows(r,"rows"))if(id(row,"id")==file&&id(row,"versionId")==v&&hash(row,"sourceHash").equals(hash(f,"sourceHash"))&&row.getBoolean(action.equals("preview")?"canPreview":"canDownload"))return;
            throw new IOException("The selected version or its access changed.");
        };
        Validate validate=t->source.verify(t.api,t::visible);
        DmsWorkspace.Work<Asset> download=t->{validate.run(t);DmsPrivateFiles.Entry e=DmsPrivateFiles.create(a,t.api,name,mime,false,t::visible);e.admission=source;
            try{
                boolean inline=action.equals("preview");String path="?fileId="+file+"&disposition="+(inline?"inline":"attachment");
                if((!inline||doc.has("selectedEmployee"))&&v==doc.getLong("currentVersionId"))path+="&expectedDocumentId="+docId+"&expectedVersionId="+v+"&expectedSourceHash="+hash(f,"sourceHash");
                if(doc.has("selectedEmployee"))path+="&expectedEmployeeId="+id(doc,"selectedEmployee");
                t.api.dmsFile(path,null,e.file,()->t.visible()&&e.valid());verify(f,e.file);validate.run(t);return new Asset(e,mime);
            }catch(Exception ex){e.remove();throw ex;}
        };
        if(action.equals("save"))ui.capture.save(name,mime,(t,uri)->{Asset asset=download.get(t);try{export(t,asset.entry,uri);}finally{asset.entry.remove();}});
        else ui.work("Opening selected original",download,asset->{if(action.equals("preview"))preview(asset,0,validate,back);else share(asset.entry);},null);
    }
    static void verify(JSONObject f,File file)throws Exception{FileFingerprint fp=FileFingerprint.read(file);DmsArchive.check(fp.size==id(f,"size")&&(f.isNull("sha256")||fp.sha256.equals(hash(f,"sha256"))));}
    void export(DmsWorkspace.Ticket t,DmsPrivateFiles.Entry entry,Uri uri)throws Exception{
        t.require();try(InputStream in=new FileInputStream(entry.file)){
            DmsTransfer.deliver(()->t.visible()&&entry.valid(),entry::verifySource,()->a.getContentResolver().openOutputStream(uri,"wt"),in,DmsArchive.LIMIT);
        }
    }
    void share(DmsPrivateFiles.Entry e){if(!ui.current.visible()||!e.valid()||e.admission==null){e.remove();return;}e.published=true;Uri uri=e.uri();
        Intent send=new Intent(Intent.ACTION_SEND).setType(e.mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.setClipData(ClipData.newRawUri("ERP document",uri));a.startActivity(Intent.createChooser(send,"Share file"));}
    void preview(Asset asset,int index,Validate validate,Runnable back){preview(asset,index,validate,back,()->{});}
    void preview(Asset asset,int index,Validate validate,Runnable back,Runnable rendered){
        Runnable close=()->{asset.entry.remove();back.run();};if(!ui.page(DMS_PREVIEW,"Original preview",close,close))return;
        ui.work("Rendering selected page",t->DmsTransfer.render(()->{t.require();DmsArchive.check(asset.entry.valid());validate.run(t);},()->DmsVisualPdf.preview(asset.entry.file,asset.mime,index),p->p.bitmap.recycle()),p->{
            rendered.run();DocumentPreview image=new DocumentPreview(a,p.bitmap,"Document preview, page "+(index+1));a.content.addView(image,new LinearLayout.LayoutParams(-1,0,1));
            DmsWorkspace.Ticket visit = ui.current;
            a.viewerControls(image,index,p.total,n->preview(asset,n,validate,back,rendered),
                (label,work)->a.viewerButton(label,()->{if(visit.visible()&&!visit.working)work.run();}));
        },e->{asset.entry.remove();ui.error(e);});
    }
}
