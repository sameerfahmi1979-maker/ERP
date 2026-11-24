package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;
import android.widget.EditText;
import android.widget.LinearLayout;
import org.json.*;
import java.util.*;
import java.io.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

final class DmsDocuments {
    final DmsWorkspace ui;final LauncherActivity a;
    DmsDocuments(DmsWorkspace ui){this.ui=ui;a=ui.a;}
    final Map<Long,String> conflictedEdits=new HashMap<>();
    void clear(){conflictedEdits.clear();}
    void detail(long id,JSONObject parent,Runnable back){
        Runnable here=()->detail(id,parent,back);
        if(!ui.page(DOCUMENT,"Document",back,here))return;
        JSONObject request=cmd("documentDetails","documentId",id);if(parent!=null)put(request,"renewalParent",parent);
        ui.read(request,d->{
            a.card(str(d,"title"),LauncherActivity.join(str(d,"number"),str(d,"type"),LauncherActivity.status(str(d,"status"))),null);
            ui.line(d,"issue","expiry","description");
            JSONObject lifecycle = d.getJSONObject("lifecycle");
            a.section("Filing status");
            ui.line(lifecycle,"stage","next","owner","section","blocker");
            JSONObject rights=d.getJSONObject("actions");long current=id(d,"currentVersionId");
            a.section("Originals");
            if(rights.optBoolean("preview"))ui.action("Preview original",()->files(d,current,1,false,here),true);
            ui.action("Versions and files",()->versionFiles(d,1,here),false);
            ui.action("Original file and offline options",()->a.legacyDocument(id,here),false);
            a.section("Document record");
            ui.action("Registered fields",()->metadata(d,here),false);ui.action("Tags",()->tags(d,false,"",1,here),false);
            ui.action("Discussion",()->comments(d,1,here),false);ui.action("History",()->history(id,"all",1,here),false);
            if(ui.enabled("processing"))ui.action("Processing",()->tracker(id,0,here),false);
            if(rights.optBoolean("compare"))ui.action("Compare versions",()->compareChoice(new ArrayList<>(),id,here),false);
            if(rights.optBoolean("ask"))ui.action("Ask a question",()->question(d,here),false);
            else a.subtitle("Document questions are unavailable for this source, account or ERP configuration.");
            ui.requests.renewalAction(d,parent,here);
            if(rights.optBoolean("share") || ui.enabled("links") || ui.enabled("collections") || ui.enabled("packs")) a.section("Organise and share");
            if(rights.optBoolean("share"))ui.action("Share ERP link",()->files(d,current,1,true,here),false);
            if(ui.enabled("links"))ui.action("Manage ERP links",()->ui.sharing.list(id,1,here),false);
            if(ui.enabled("collections"))ui.action("Add to favourites",()->ui.collections.favourite(id,true,here),false);
            if(ui.enabled("packs"))ui.action("Add to submission pack",()->ui.packs.add(d),false);
        });
    }
    void employeeFolder(long employee,int page,Runnable back){
        Runnable here=()->employeeFolder(employee,page,back);
        if(!ui.page(DOCUMENT_LIST,"Employee documents",back,here))return;
        ui.work("Checking this employee's document folder",t->t.api.get(cmd("folder","employeeRecord",true,"entityType","employee","entityId",employee,"page",page)),r->{
            DmsArchive.check(id(r,"employeeId")==employee&&r.getInt("page")==page);
            for(JSONObject row:rows(r,"rows")){long doc=id(row,"id");ui.card(str(row,"title"),str(row,"number"),()->employeeDocument(employee,doc,here));}
            if(r.getJSONArray("rows").length()==0)a.subtitle("No permitted linked documents.");
            ui.pages(r,page,next->employeeFolder(employee,next,back));
        },null);
    }
    private void employeeDocument(long employee,long document,Runnable back){
        Runnable here=()->employeeDocument(employee,document,back);
        if(!ui.page(DOCUMENT,"Employee document",back,here))return;
        JSONObject parent=object("entityType","employee","entityId",employee);
        ui.read(cmd("documentDetails","documentId",document,"employeeId",employee,"renewalParent",parent),doc->{
            a.card(str(doc,"title"),str(doc,"number"),null);ui.line(doc,"type","status","issue","expiry","description");
            put(doc,"selectedEmployee",employee);
            long version=id(doc,"currentVersionId");
            ui.action("Current files",()->files(doc,version,1,false,here),true);
            ui.requests.renewalAction(doc,parent,here);
        });
    }
    static JSONObject fileRequest(JSONObject doc,long version,int page){
        JSONObject query=cmd("documentSources","documentId",doc.optLong("id"),"kind","files","versionId",version,"page",page);
        if(doc.has("selectedEmployee"))put(query,"employeeId",doc.optLong("selectedEmployee"));return query;
    }
    private void versionFiles(JSONObject doc,int page,Runnable back) {
        versions(doc.optLong("id"),page,v->files(doc,v.optLong("id"),1,false,
            ()->versionFiles(doc,v.optInt("selectionPage",1),back)),back);
    }
    static String offlineAttachmentPath(JSONObject doc, JSONObject file) throws IOException {
        if (doc.has("selectedEmployee") || !"original".equals(str(file,"role")) || !DmsVisualPdf.supports(str(file,"mime"))
                || !file.optBoolean("canPreview") || !file.optBoolean("canDownload")) return null;
        long version = id(file,"versionId");
        if (version != id(doc,"currentVersionId")) return null;
        return "?fileId=" + id(file,"id") + "&disposition=attachment&expectedDocumentId=" + id(doc,"id")
            + "&expectedVersionId=" + version + "&expectedSourceHash=" + hash(file,"sourceHash");
    }
    static boolean canPreviewOriginal(JSONObject file) {
        return file.optBoolean("canPreview") && DmsSharing.originalPreviewMime(str(file,"mime")) != null;
    }
    void versions(long doc,int page,DmsWorkspace.Open select,Runnable back){
        if(!ui.page(DOCUMENT_FILES,"Choose document version",back,()->versions(doc,page,select,back)))return;
        ui.read(cmd("documentSources","documentId",doc,"kind","versions","page",page),r->{
            for(JSONObject v:rows(r,"rows")){id(v,"id");hash(v,"sourceHash");put(v,"selectionPage",page);put(v,"selectionAsOf",str(r,"asOf"));ui.card("Version "+str(v,"number")+" · "+(v.optBoolean("isCurrent")?"Current":"Historical"),str(v,"createdAt")+" "+str(v,"label"),()->select.open(v));}
            ui.pages(r,page,n->versions(doc,n,select,back));
        });
    }
    void files(JSONObject doc,long version,int page,boolean share,Runnable back){
        if(!ui.page(DOCUMENT_FILES,share?"Choose file to share":"Document files",back,()->files(doc,version,page,share,back)))return;
        ui.read(fileRequest(doc,version,page),r->{
            for(JSONObject f:rows(r,"rows")){
                DmsArchive.check(id(f,"versionId")==version);id(f,"id");id(f,"size");hash(f,"sourceHash");
                LinearLayout card = a.card(str(f,"name"),str(f,"role")+" · "+str(f,"size")+" bytes",null);
                if(share){if(f.optBoolean("canDownload")&&f.optBoolean("canPreview"))ui.action("Choose recipient",()->ui.sharing.recipients(doc,f,"",1,()->files(doc,version,page,true,back)),false);}
                else{
                    String offlinePath = a.capability("offline") ? offlineAttachmentPath(doc,f) : null;
                    if (offlinePath != null) {
                        DmsWorkspace.Ticket ticket = ui.current;
                        card.addView(a.ui.icon(R.drawable.action_offline, "Save offline: " + str(f,"name"), () -> {
                            if (ticket.visible() && !ticket.working) {
                                a.mobile().saveOffline(doc.optLong("id"), f.optLong("id"), version, offlinePath, ticket::visible);
                            }
                        }), new LinearLayout.LayoutParams(a.dp(48), a.dp(48)));
                    }
                    Runnable here=()->files(doc,version,page,false,back);
                    if(canPreviewOriginal(f))ui.action("Preview "+str(f,"name"),()->ui.sharing.file(doc,f,page,"preview",here),true);
                    else if(f.optBoolean("canPreview"))a.subtitle(DmsSharing.previewUnavailable(f.optBoolean("canDownload"),"Save original"));
                    if(f.optBoolean("canDownload")){ui.action("Save original",()->ui.sharing.file(doc,f,page,"save",here),false);ui.action("Share original file",()->ui.sharing.file(doc,f,page,"share",here),false);}
                }
            }ui.pages(r,page,n->files(doc,version,n,share,back));
        });
    }
    void metadata(JSONObject doc,Runnable back){
        long id=doc.optLong("id");if(!ui.page("Registered fields",back,back))return;
        ui.read(cmd("documentMetadata","documentId",id),r->{
            JSONObject source=r.getJSONObject("source");DmsArchive.check(id(source,"documentId")==id&&hash(source,"sourceHash").equals(hash(doc,"sourceHash")));
            if(conflictedEdits.containsKey(id)){
                a.subtitle("Unsaved changes from the previous source");a.subtitle(conflictedEdits.get(id));
                ui.action("Discard previous unsaved changes",()->{conflictedEdits.remove(id);metadata(doc,back);},false);
            }
            ui.line(r,"snapshot","sourceSnapshot");Map<JSONObject,EditText> inputs=new LinkedHashMap<>();
            for(JSONObject f:rows(r,"fields")){
                String type=str(f,"type"),value=str(f,"value"),label=str(f,"label")+(f.optBoolean("isRequired")?" *":"");
                if(!doc.getJSONObject("actions").optBoolean("editMetadata")||!f.optBoolean("isEditable")){a.detail(a.content,label,value);continue;}
                EditText field;
                switch(type){
                    case "date":field=a.mobile().dateField(a.content,label,value);break;
                    case "boolean":case "select":case "multi_select":case "multiselect":case "dropdown":case "multi-select":field=a.mobile().optionField(a.content,label,value,type.equals("multiselect")?put(copy(f),"type","multi_select"):f);break;
                    case "text":case "textarea":case "long_text":case "string":case "number":case "integer":case "currency":case "decimal":case "datetime":case "email":case "phone":case "url":field=ui.input(label,value,16384);break;
                    default:a.detail(a.content,label,value);continue;
                }inputs.put(f,field);
            }
            if(!inputs.isEmpty())ui.action("Review changes",()->{try{
                JSONArray changes=new JSONArray();StringBuilder summary=new StringBuilder();
                for(Map.Entry<JSONObject,EditText> e:inputs.entrySet()){JSONObject f=e.getKey();String v=a.value(e.getValue());if(v.equals(str(f,"value")))continue;
                    if(v.isEmpty()&&f.optBoolean("isRequired"))throw new IOException("Complete "+str(f,"label")+".");
                    JSONObject value=object("definition_id",id(f,"id"));if(!v.isEmpty()){
                        switch(str(f,"type")){case "number":case "integer":case "currency":case "decimal":value.put("value_number",new java.math.BigDecimal(v));break;
                            case "boolean":DmsArchive.check(v.equals("true")||v.equals("false"));value.put("value_boolean",Boolean.parseBoolean(v));break;
                            case "date":value.put("value_date",java.time.LocalDate.parse(v).toString());break;
                            case "datetime":value.put("value_datetime",java.time.OffsetDateTime.parse(v).toString());break;
                            case "multi_select":case "multiselect":case "multi-select":value.put("value_json",new JSONArray(v));break;
                            default:value.put("value_text",v);}
                    }changes.put(value);summary.append(str(f,"label")).append(" · ").append(v).append("\n");
                }
                if(changes.length()==0){a.message("No changed fields.",false);return;}
                JSONObject b=cmd("documentMetadataSave","documentId",id,"sourceHash",hash(source,"sourceHash"),"snapshot",hash(r,"snapshot"),"values",changes);
                ui.confirm("Save registered changes?",summary.toString(),()->ui.mutate(b,"fields/"+id,ok->{conflictedEdits.remove(id);back.run();},failure->{ui.error(failure);conflictedEdits.put(id,summary.toString());a.subtitle("Your unsaved entries remain on this form.");ui.action("Open fresh source for review",back,false);}));
            }catch(Exception ex){ui.error(ex);}},true);
        });
    }
    void tags(JSONObject doc,boolean options,String query,int page,Runnable back){
        long id=doc.optLong("id");Runnable here=()->tags(doc,options,query,page,back);
        if(!ui.page(options?"Choose tag":"Assigned tags",back,back))return;
        JSONObject request=cmd(options?"documentTagOptions":"documentTags","documentId",id,"page",page);
        boolean manage=doc.optJSONObject("actions").optBoolean("manageTags");
        if(options){put(request,"search",query);EditText search=ui.input("Find tag",query,100);ui.action("Search",()->tags(doc,true,a.value(search),1,back),false);}
        else if(manage)ui.action("Add tag",()->tags(doc,true,"",1,here),false);
        ui.read(request,r->{for(JSONObject tag:rows(r,"rows")){long key=id(tag,"id");String label=str(tag,"name");
            ui.card(label,"",manage?()->ui.confirm(options?"Add tag?":"Remove tag?",label,()->ui.mutate(cmd("documentTagsChange","documentId",id,"sourceHash",str(doc,"sourceHash"),"add",options?new JSONArray().put(key):new JSONArray(),"remove",options?new JSONArray():new JSONArray().put(key)),"tags/"+id,ok->here.run())):null);
        }ui.pages(r,page,n->tags(doc,options,query,n,back));});
    }
    void comments(JSONObject doc,int page,Runnable back){
        long id=doc.optLong("id");Runnable here=()->comments(doc,page,back);
        if(!ui.page("Discussion",back,back))return;
        if(doc.optJSONObject("actions").optBoolean("comment"))ui.action("Add comment",()->editComment(doc,null,false,here),false);
        ui.read(cmd("documentComments","documentId",id,"page",page),r->{for(JSONObject c:rows(r,"rows")){
            DmsArchive.check(DmsRules.revision(str(c,"revision")));ui.card(str(c,"authorLabel"),str(c,"text")+"\n"+str(c,"updatedAt"),null);
            if(c.optBoolean("canEdit"))ui.action("Edit comment",()->editComment(doc,c,false,here),false);
            if(c.optBoolean("canDelete"))ui.action("Delete comment",()->editComment(doc,c,true,here),false);
        }ui.pages(r,page,n->comments(doc,n,back));});
    }
    void editComment(JSONObject doc,JSONObject c,boolean remove,Runnable back){
        if(!ui.page(remove?"Delete comment":c==null?"Add comment":"Edit comment",back,back))return;
        JSONObject b=cmd(c==null?"documentCommentAdd":remove?"documentCommentDelete":"documentCommentEdit","documentId",doc.optLong("id"),"sourceHash",str(doc,"sourceHash"));
        if(c!=null){put(b,"commentId",c.optLong("id"));put(b,"commentRevision",str(c,"revision"));}
        EditText text=remove?null:ui.input("Comment",str(c,"text"),2000);
        if(remove)a.subtitle(str(c,"text"));
        ui.action(remove?"Confirm deletion":"Save comment",()->{if(text!=null){String v=a.value(text);if(v.isEmpty()){a.message("Enter a comment.",true);return;}put(b,"text",v);}
            ui.mutate(b,"comment/"+doc.optLong("id")+"/"+(c==null?"new":c.optLong("id")),r->back.run());
        },true);
    }
    void history(long id,String filter,int page,Runnable back){
        if(!ui.page("Document history",back,back))return;ui.action(filter.equals("all")?"Downloads only":"All activity",()->history(id,filter.equals("all")?"downloads":"all",1,back),false);
        ui.read(cmd("documentHistory","documentId",id,"page",page,"filter",filter),r->{for(JSONObject e:rows(r,"rows")){ui.card(str(e,"type"),str(e,"description"),null);ui.line(e,"actorLabel","at","delivery","bytes","versionId");}ui.pages(r,page,n->history(id,filter,n,back));});
    }
    void tracker(long id,long job,Runnable back){
        Runnable here=()->tracker(id,job,back);if(!ui.page("Document processing",back,here))return;
        JSONObject b=cmd("processingStatus","documentId",id);if(job>0)put(b,"jobId",job);
        ui.action("Refresh status",here,false);ui.read(b,r->{
            ui.line(r,"stage","jobId","queueStatus","workerHealthy","createdAt","startedAt","updatedAt","errorCode","holdReason","requestId");
            for(JSONObject step:rows(r,"steps"))ui.card(str(step,"label"),str(step,"state")+" "+str(step,"message"),null);
            for(JSONObject act:rows(r,"actions")){
                String action=str(act,"action");if(!Arrays.asList("resume","cancel","retry_step").contains(action))continue;
                JSONObject next=cmd("processingAction","documentId",id,"jobId",id(r,"jobId"),"sourceHash",hash(r,"sourceHash"),"action",action);if(action.equals("retry_step"))put(next,"step",str(act,"step"));
                ui.action(action+" "+str(act,"step"),()->ui.confirm("Confirm processing action?",action+" "+str(act,"step"),()->ui.mutate(next,"processing/"+id,x->tracker(id,x.optLong("jobId"),back))),false);
            }
            JSONObject prep=r.optJSONObject("preparation");if(prep!=null&&prep.getJSONArray("files").length()>0){List<JSONObject> files=rows(prep,"files");Set<Long> selected=new LinkedHashSet<>();
                ui.action("Prepare file for questions",()->{String[] labels=new String[files.size()];for(int i=0;i<labels.length;i++)labels[i]=str(files.get(i),"name");
                    DmsWorkspace.Ticket t=ui.current;selected.clear();a.dialogBuilder().setTitle("Select 1–10 source files").setMultiChoiceItems(labels,null,(d,i,yes)->{if(yes)selected.add(files.get(i).optLong("id"));else selected.remove(files.get(i).optLong("id"));})
                        .setNegativeButton("Back",null).setPositiveButton("Prepare",(d,i)->{if(!t.visible())return;if(selected.isEmpty()||selected.size()>10){a.message("Select 1–10 files.",true);return;}
                        ui.mutate(cmd("processingAction","documentId",id,"sourceHash",str(r,"sourceHash"),"action","prepare_source","snapshot",str(prep,"snapshot"),"fileIds",new JSONArray(selected)),"processing/"+id,x->tracker(id,x.optLong("jobId"),back));
                    }).show();},false);
            }
        });
    }
    void question(JSONObject doc,Runnable back){
        long id=doc.optLong("id");if(!ui.page("Ask about this document",back,back))return;
        EditText q=ui.input("Question","",500);
        for(String mode:new String[]{"verified_text","metadata_only"})ui.action(mode.equals("verified_text")?"Ask using verified text":"Ask using registered fields only",()->{
            String text=a.value(q);if(text.length()<3){a.message("Enter at least three characters.",true);return;}
            JSONObject b=cmd("documentQuestion","documentId",id,"sourceHash",str(doc,"sourceHash"),"question",text,"contextMode",mode);
            ui.work("Checking the selected source and asking once",t->fetch(t.api,b,t::visible),r->{
                JSONObject source=r.getJSONObject("source"),g=r.getJSONObject("grounding");DmsArchive.check(id(source,"documentId")==id && id(source,"documentVersionId")==doc.getLong("currentVersionId")&&hash(source,"sourceHash").equals(str(doc,"sourceHash"))&&mode.equals(str(g,"mode")));
                String grounding=hash(g,"groundingHash");for(JSONObject c:rows(r,"citations"))DmsArchive.check(id(c,"documentId")==id&&id(c,"versionId")==id(source,"documentVersionId")&&grounding.equals(hash(c,"groundingHash"))&&hash(c,"sourceHash").equals(hash(source,"sourceHash")));
                if(!ui.page("Document answer",back,back))return;ui.line(r,"answer","confidence","sourceUsed","contentTruncated");ui.line(g,"mode","groundingHash");for(JSONObject c:rows(r,"citations"))ui.line(c,"versionId","fileId","chunkIndex","snippet");
            },e->{ui.error(e);if(e instanceof ErpApi.Rejected && "question_source_preparation_required".equals(str(((ErpApi.Rejected)e).response,"code")))ui.action("Open preparation",()->tracker(id,0,back),true);});
        },mode.equals("verified_text"));
    }
    void compareChoice(List<JSONObject> selected,long doc,Runnable back){
        Runnable here=()->compareChoice(selected,doc,back);if(!ui.page("Compare document versions",back,back))return;
        for(JSONObject s:selected)ui.card("Document "+s.optLong("documentId"),"Version "+s.optLong("versionId"),()->{selected.remove(s);here.run();});
        if(selected.size()<10){DmsWorkspace.Open choose=d->versions(d.optLong("id"),1,v->{long id=d.optLong("id"),version=v.optLong("id");for(JSONObject x:selected)if(x.optLong("documentId")==id&&x.optLong("versionId")==version){a.message("Version already selected.",true);return;}
            selected.add(object("documentId",id,"versionId",version,"sourceHash",str(v,"sourceHash"),"selectionPage",v.optLong("selectionPage"),"asOf",str(v,"selectionAsOf")));here.run();},here);
            ui.action("Choose version of this document",()->choose.open(object("id",doc)),false);ui.action("Choose another document",()->ui.selectDoc("Choose document",null,"",1,choose,here),false);}
        JSONArray pairs=new JSONArray();for(JSONObject selection:selected)pairs.put(object("documentId",selection.optLong("documentId"),"versionId",selection.optLong("versionId")));
        if(selected.size()>=2)ui.action("Compare selected versions",()->ui.work("Comparing selected versions",t->{JSONObject r=fetch(t.api,cmd("documentCompare","sources",pairs,"recordFindings",false),t::visible);
            for(JSONObject choice:selected){JSONObject window=fetch(t.api,cmd("documentSources","documentId",id(choice,"documentId"),"kind","versions","page",choice.getInt("selectionPage")),t::visible);
                boolean exact=false;for(JSONObject v:rows(window,"rows"))if(id(v,"id")==id(choice,"versionId")&&hash(v,"sourceHash").equals(hash(choice,"sourceHash")))exact=true;DmsArchive.check(exact);}
            return r;},r->{
            List<JSONObject> returned=rows(r,"sources");DmsArchive.check(returned.size()==selected.size());
            for(int i=0;i<selected.size();i++){JSONObject expected=selected.get(i),actual=returned.get(i);
                DmsArchive.check(id(actual,"documentId")==id(expected,"documentId")&&id(actual,"versionId")==id(expected,"versionId"));}
            if(!ui.page("Comparison",here,back))return;for(JSONObject choice:selected)ui.line(choice,"documentId","versionId","asOf");ui.line(r,"sourcePrecision");for(JSONObject source:rows(r,"sources"))ui.line(source,"documentNo","versionId","sourceHash","complete");
            for(JSONObject pair:rows(r,"pairs")){ui.line(pair,"identity","complete");for(JSONObject change:rows(pair,"differences")){ui.card(str(change,"key"),str(change,"status"),null);for(String side:new String[]{"left","right"}){JSONObject fact=change.optJSONObject(side);if(fact!=null)ui.line(fact,"value","unit","currency");}}
                JSONObject passages=pair.getJSONObject("passageComparison");ui.line(passages,"state","complete");for(JSONObject change:rows(passages,"changes")){a.subtitle(str(change,"source"));ui.line(change.getJSONObject("excerpt"),"versionId","fileId","text");}}
        },null),true);
    }
}
