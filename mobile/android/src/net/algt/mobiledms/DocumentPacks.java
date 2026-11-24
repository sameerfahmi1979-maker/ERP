package net.algt.mobiledms;
import org.json.*;
import java.util.*;
import java.io.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

final class DocumentPacks {
    final DmsWorkspace ui;final LauncherActivity a;final List<Long> selected=new ArrayList<>();
    String owner="";long epoch=-1;
    DocumentPacks(DmsWorkspace u){ui=u;a=u.a;}
    void clear(){selected.clear();owner="";epoch=-1;}
    private void session(){if(!a.api.user().equals(owner)||a.api.sessionEpoch()!=epoch){clear();owner=a.api.user();epoch=a.api.sessionEpoch();}}
    void add(JSONObject d){session();long id=d.optLong("id");if(!DmsRules.positive(id))return;if(selected.contains(id)){home();return;}if(selected.size()==25){a.message("Choose up to 25 documents.",true);return;}selected.add(id);home();}
    interface Summary {JSONObject get(long id)throws Exception;}
    static List<JSONObject> fresh(List<Long> ids,Summary read)throws Exception{
        List<JSONObject> result=new ArrayList<>();
        for(long id:ids){try{JSONObject row=read.get(id);DmsArchive.check(id(row,"id")==id);result.add(object("title",str(row,"title"),"number",str(row,"number")));}
            catch(ErpApi.Rejected failure){if(failure.status!=403&&failure.status!=404)throw failure;result.add(null);}}
        return result;
    }
    void home(){
        if(!ui.page("Submission pack",ui::hub,this::home))return;session();
        List<Long> order=new ArrayList<>(selected);
        ui.work("Checking current document visibility",t->fresh(order,id->fetch(t.api,cmd("documentDetails","documentId",id),t::visible)),summaries->{
        if(!order.equals(selected))return;
        for(int i=0;i<order.size();i++){JSONObject d=summaries.get(i);final int pos=i;ui.card((i+1)+". "+(d==null?"Document unavailable":str(d,"title")),str(d,"number"),null);
            if(i>0)ui.action("Move up",()->{Collections.swap(selected,pos,pos-1);home();},false);
            ui.action("Remove",()->{selected.remove(pos);home();},false);}
        if(selected.size()<25)ui.action("Choose document",()->ui.selectDoc("Choose pack document",null,"",1,this::add,this::home),false);
        if(!selected.isEmpty()){ui.action("Review ZIP of originals",()->review("zip"),true);ui.action("Review combined visual PDF",()->review("pdf"),false);}
        },null);
    }
    static JSONObject validateBody(JSONArray ids,String format,String hash){return cmd("documentPackValidate","documentIds",ids,"format",format,"manifestHash",hash);}
    static void manifest(JSONObject r,JSONArray ids,String format)throws Exception{
        hash(r,"manifestHash");DmsArchive.check(format.equals(str(r,"format")));List<JSONObject> docs=rows(r,"documents"),files=rows(r,"files");
        DmsArchive.check(docs.size()==ids.length()&&docs.size()>0&&docs.size()<=25&&!files.isEmpty()&&files.size()<=50);Map<Long,Long> versions=new LinkedHashMap<>();Set<Long> present=new LinkedHashSet<>(),fileIds=new HashSet<>();long total=0;
        for(int i=0;i<docs.size();i++){JSONObject d=docs.get(i);long id=id(d,"id");DmsArchive.check(ids.getLong(i)==id&&versions.put(id,id(d,"versionId"))==null);hash(d,"sourceHash");}
        long last=0;for(JSONObject f:files){long doc=id(f,"documentId"),size=id(f,"size");DmsArchive.check(versions.containsKey(doc)&&versions.get(doc)==id(f,"versionId")&&size<=DmsArchive.FILE_LIMIT&&(total+=size)<=DmsArchive.LIMIT&&fileIds.add(id(f,"id")));
            if(last!=doc)DmsArchive.check(present.add(doc));last=doc;hash(f,"sourceHash");if(!f.isNull("sha256"))hash(f,"sha256");}
        DmsArchive.check(new ArrayList<>(present).equals(new ArrayList<>(versions.keySet()))&&total==r.getLong("totalBytes"));
    }
    void review(String format){
        JSONArray ids=new JSONArray(selected);
        if(!ui.page("Review "+(format.equals("pdf")?"visual PDF":"original ZIP"),this::home,this::home))return;
        ui.read(cmd("documentPackManifest","documentIds",ids,"format",format),r->{manifest(r,ids,format);a.subtitle(r.getLong("totalBytes")+" bytes · "+r.getJSONArray("files").length()+" files");
            for(JSONObject f:rows(r,"files"))ui.card(str(f,"name"),"Version "+str(f,"versionId")+" · "+str(f,"size")+" bytes"+(f.isNull("sha256")?" · No stored checksum":""),null);
            if(format.equals("pdf")&&(!r.getJSONObject("pdf").getBoolean("supported")||rows(r,"files").stream().anyMatch(f->!DmsVisualPdf.supports(str(f,"mime"))))){a.subtitle("This selection contains files that cannot be rendered as a visual PDF.");ui.action("Review original ZIP",()->review("zip"),true);return;}
            a.subtitle(format.equals("zip")?"ZIP preserves the selected originals.":"PDF contains rendered copies of the selected pages.");
            ui.action("Create "+format.toUpperCase(Locale.ROOT),()->build(ids,format,r),true);
        });
    }
    void revalidate(DmsWorkspace.Ticket t,JSONObject b)throws Exception{JSONObject r=fetch(t.api,b,t::visible);DmsArchive.check(r.getBoolean("current")&&hash(r,"manifestHash").equals(hash(b,"manifestHash")));}
    void build(JSONArray ids,String format,JSONObject manifest){
        JSONObject check=validateBody(ids,format,str(manifest,"manifestHash"));String name="Submission pack."+format,mime=format.equals("pdf")?"application/pdf":"application/zip";
        ui.work("Checking and assembling selected originals",t->{
            List<DmsPrivateFiles.Entry> tmp=new ArrayList<>();DmsPrivateFiles.Entry result=null;boolean ok=false;
            try{
                List<DmsArchive.Member> files=new ArrayList<>();List<String> types=new ArrayList<>();
                for(JSONObject f:rows(manifest,"files")){
                    t.require();DmsPrivateFiles.Entry input=DmsPrivateFiles.create(a,t.api,"input",str(f,"mime"),false,t::visible);tmp.add(input);
                    t.api.dmsFile("?fileId="+id(f,"id")+"&disposition=attachment&expectedDocumentId="+id(f,"documentId")+"&expectedVersionId="+id(f,"versionId")+"&expectedSourceHash="+hash(f,"sourceHash"),null,input.file,()->t.visible()&&input.valid());
                    DmsSharing.verify(f,input.file);files.add(new DmsArchive.Member(input.file,str(f,"entryName"),id(f,"size"),str(f,"sha256")));types.add(str(f,"mime"));
                }
                result=DmsPrivateFiles.create(a,t.api,name,mime,false,t::visible);final DmsPrivateFiles.Entry target=result;
                if(format.equals("pdf"))DmsVisualPdf.assemble(files,types,target.file,()->t.visible()&&target.valid());else DmsArchive.zip(files,target.file,()->t.visible()&&target.valid());
                revalidate(t,check);DmsArchive.check(target.valid());
                target.admission=(api,local)->{JSONObject valid=fetch(api,check,local);DmsArchive.check(valid.getBoolean("current")&&hash(valid,"manifestHash").equals(hash(check,"manifestHash")));};
                ok=true;return target;
            }finally{for(DmsPrivateFiles.Entry e:tmp)e.remove();if(!ok&&result!=null)result.remove();}
        },target->{
            Runnable close=()->{target.remove();home();};if(!ui.page("Submission pack ready",close,close))return;
            a.subtitle(name+" · "+target.file.length()+" bytes");
            ui.action("Save pack",()->ui.capture.save(name,mime,(t,uri)->{revalidate(t,check);ui.sharing.export(t,target,uri);}),true);
            ui.action("Share pack",()->ui.work("Revalidating pack sources",t->{revalidate(t,check);DmsArchive.check(target.valid());return target;},ui.sharing::share,null),false);
            ui.action("Discard local pack",close,false);
        },null);
    }
}
