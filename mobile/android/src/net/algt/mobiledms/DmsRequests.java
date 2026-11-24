package net.algt.mobiledms;
import org.json.*;
import java.util.*;
import android.widget.EditText;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

final class DmsRequests {
    final DmsWorkspace ui;final LauncherActivity a;
    DmsRequests(DmsWorkspace ui){this.ui=ui;a=ui.a;}
    void clear(){}
    void checklist(JSONObject p,int page,Runnable back){
        Runnable here=()->checklist(p,page,back);if(!ui.page("Required documents",back,here))return;
        ui.action("Requests for this folder",()->list("parent",p,1,0,""),false);
        ui.read(cmd("requiredChecklist","parent",p,"page",page),r->{
            a.subtitle("Coverage · "+str(r,"coverage")+"\nMissing · "+(r.isNull("missingCount")?"Unknown":str(r,"missingCount")));
            for(JSONObject row:rows(r,"rows")){ui.card(str(row,"label"),str(row,"state"),null);
                if(row.optBoolean("canRequest")&&"missing".equals(str(row,"state"))&&DmsRules.hash(str(row,"checklistHash")))ui.action("Request "+str(row,"label"),()->create(p,"missing",row,null,"",1,here),false);}
            ui.pages(r,page,n->checklist(p,n,back));});
    }
    static JSONObject renewalParent(JSONObject doc,JSONObject selected){
        JSONObject rights=doc.optJSONObject("actions"),p=doc.optJSONObject("renewalParent");
        if(rights==null||!rights.optBoolean("requestRenewal")||p==null||!DmsRules.positive(p.optLong("entityId"))||
            !Arrays.asList("employee","site").contains(str(p,"entityType"))||!DmsRules.hash(str(doc,"sourceHash")))return null;
        if(selected!=null&&(selected.optLong("entityId")!=p.optLong("entityId")||!str(selected,"entityType").equals(str(p,"entityType"))))return null;
        return p;
    }
    void renewalAction(JSONObject doc,JSONObject selected,Runnable back){
        JSONObject p=renewalParent(doc,selected);
        if(p!=null){
            if(a.mobile().pendingLegacyRenewal(doc.optLong("id")))
                ui.action("Check previous renewal request",()->a.mobile().previousRenewal(doc,back),false);
            else ui.action("Request renewal",()->create(p,"renewal",doc,null,"",1,back),false);
        }
    }
    static JSONObject options(JSONObject parent,String kind,JSONObject source,String search,int page){
        JSONObject b=cmd("documentRequestOptions","parent",parent,"kind",kind,"search",search,"page",page);
        if(kind.equals("renewal")){
            if(renewalParent(source,parent)==null)return null;
            put(b,"documentId",source.optLong("id"));put(b,"sourceHash",str(source,"sourceHash"));
        }
        return b;
    }
    void create(JSONObject parent,String kind,JSONObject source,JSONObject nominee,String search,int page,Runnable back){
        if(!ui.page(kind.equals("missing")?"Request missing document":"Request renewal",back,back))return;
        JSONObject b=options(parent,kind,source,search,page);
        if(b==null){a.subtitle("Renewal is unavailable for this selection.");return;}
        if(kind.equals("renewal"))a.subtitle(HrView.title(str(parent,"entityType"))+" #"+parent.optLong("entityId"));
        ui.read(b,r->{
            if(!r.optBoolean("canSubmit")&&!r.optBoolean("canManage")){a.subtitle("This account cannot submit the selected request.");return;}
            EditText filter=ui.input("Find officer",search,100);ui.action("Search officers",()->create(parent,kind,source,nominee,a.value(filter),1,back),false);
            ui.action("Continue unassigned",()->form(parent,kind,source,null,back),false);
            for(JSONObject officer:rows(r,"rows"))ui.card(str(officer,"label"),"Choose officer",()->form(parent,kind,source,officer,back));
            ui.pages(r,page,n->create(parent,kind,source,nominee,search,n,back));});
    }
    void form(JSONObject p,String kind,JSONObject src,JSONObject officer,Runnable back){
        if(!ui.page("Review document request",back,back))return;
        a.subtitle(str(src,kind.equals("renewal")?"title":"label")+"\n"+(officer==null?"Unassigned":str(officer,"label")));
        EditText due=a.mobile().dateField(a.content,"Due date",""),notes=ui.input("Notes","",2000);
        EditText priority=kind.equals("renewal")?a.mobile().optionField(a.content,"Priority","normal",object("type","select","options",new JSONArray(Arrays.asList("normal","high","urgent")))):null;
        ui.action("Submit request",()->{
            JSONObject b=cmd("documentRequestCreate","kind",kind,"parent",p,"assigneeId",officer==null?null:officer.optLong("id"),"dueDate",a.value(due).isEmpty()?null:a.value(due),"notes",a.value(notes));
            if(priority!=null){put(b,"priority",a.value(priority));put(b,"documentId",src.optLong("id"));put(b,"sourceHash",str(src,"sourceHash"));}
            else{put(b,"ruleId",src.optLong("ruleId"));put(b,"checklistHash",str(src,"checklistHash"));}
            ui.confirm("Submit this "+kind+" request?",str(src,"title")+str(src,"label"),()->ui.mutate(b,"request/"+kind+"/"+p+"/"+src.optLong(priority==null?"ruleId":"id"),r->detail(r.getJSONObject("request"),back)));
        },true);
    }
    void list(String audience,JSONObject parent,int page,long target,String kind){
        Runnable here=()->list(audience,parent,page,target,kind);
        if(!ui.page("Document requests",ui::parent,here))return;
        JSONObject b=cmd("documentRequests","audience",audience,"page",page);if(parent!=null)put(b,"parent",parent);
        ui.action("My requests",()->list("mine",null,1,target,kind),false);ui.action("Assigned to me",()->list("assigned",null,1,target,kind),false);
        ui.action("Choose folder checklist",()->ui.subject("employee","",p->checklist(p,1,here),here),false);
        ui.read(b,r->{for(JSONObject q:rows(r,"rows")){if(target>0&&(q.optLong("id")!=target||!kind.equals(str(q,"kind"))))continue;
            ui.card(str(q,"kind")+" request #"+q.optLong("id"),str(q,"status")+" · "+str(q,"assigneeLabel")+" "+str(q,"dueDate"),()->detail(q,here));}
            ui.pages(r,page,n->list(audience,parent,n,target,kind));});
    }
    void detail(JSONObject q,Runnable back){
        if(!ui.page("Request #"+q.optLong("id"),back,back))return;
        ui.line(q,"kind","status","canonicalStatus","requesterLabel","assigneeLabel","dueDate","notes","createdAt","updatedAt","sourceDocumentId","sourceVersionId","submittedDocumentId","submittedVersionId");
        JSONArray offers=q.optJSONArray("actions");if(offers==null)return;
        for(int i=0;i<offers.length();i++){String act=offers.optString(i);
            if("submit_document".equals(act)){
                ui.action("Choose existing evidence",()->evidenceList(q,"",1,back),false);
                if(a.capability("upload"))ui.action("Capture or upload request evidence",()->ui.capture.evidence(q,()->detail(q,back)),false);
            }else if(Arrays.asList("start","fulfil","reject","cancel").contains(act))ui.action(act,()->act(q,act,null,back),false);
        }
    }
    void evidenceList(JSONObject q,String search,int p,Runnable back){
        JSONObject parent=q.optJSONObject("parent");if(parent==null||q.optLong("documentTypeId")<=0){a.message("Required evidence type is unavailable.",true);return;}
        if(!ui.page("Choose matching evidence",back,back))return;EditText find=ui.input("Name or document number",search,200);
        ui.action("Find matching evidence",()->evidenceList(q,a.value(find),1,back),false);
        JSONObject b=cmd("documents","entityType",str(parent,"entityType"),"entityId",parent.optLong("entityId"),"typeId",q.optLong("documentTypeId"),"personal",false,"page",p,"validity","all","search",search);
        ui.work("Checking linked documents",t->t.api.get(b),r->{for(JSONObject candidate:rows(r,"rows"))ui.card(str(candidate,"title"),str(candidate,"number"),()->candidate(q,candidate,back));
            if(p>1)ui.action("Previous",()->evidenceList(q,search,p-1,back),false);if(p*25L<r.optLong("total"))ui.action("Next",()->evidenceList(q,search,p+1,back),false);},null);
    }
    void candidate(JSONObject request,JSONObject candidate,Runnable back){
        long id=candidate.optLong("id");ui.work("Checking exact document and current version",t->{
            JSONObject d=fetch(t.api,cmd("documentDetails","documentId",id),t::visible);
            JSONObject meta=fetch(t.api,cmd("documentMetadata","documentId",id),t::visible);
            DmsArchive.check(hash(meta.getJSONObject("source"),"sourceHash").equals(hash(d,"sourceHash"))&&id(meta,"documentTypeId")==id(request,"documentTypeId"));
            JSONObject p=request.getJSONObject("parent");
            JSONObject scoped=t.api.get(cmd("documents","entityType",str(p,"entityType"),"entityId",id(p,"entityId"),"typeId",id(request,"documentTypeId"),"personal",false,"page",1,"validity","all","search",d.getString("number")));
            boolean found=false;for(JSONObject row:rows(scoped,"rows"))if(id(row,"id")==id)found=true;
            DmsArchive.check(found&&id!=request.optLong("sourceDocumentId"));return d;
        },d->act(request,"submit_document",d,back),null);
    }
    void act(JSONObject q,String act,JSONObject evidence,Runnable back){
        if(!ui.page("Review request action",back,back))return;
        a.subtitle(act+" · "+str(q,"kind")+" #"+q.optLong("id"));if(evidence!=null)ui.line(evidence,"number","currentVersionId","sourceHash");
        EditText notes=ui.input("Notes","",2000);
        ui.action("Confirm "+act,()->{JSONObject b=cmd("documentRequestAct","requestId",q.optLong("id"),"kind",str(q,"kind"),"expectedRevision",q.optLong("revision"),"action",act,"notes",a.value(notes));
            if(evidence!=null){put(b,"documentId",evidence.optLong("id"));put(b,"versionId",evidence.optLong("currentVersionId"));}
            ui.mutate(b,"request/"+str(q,"kind")+"/"+q.optLong("id"),r->detail(r.getJSONObject("request"),back));
        },true);
    }
}
