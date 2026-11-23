package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.widget.EditText;
import android.widget.LinearLayout;
import java.io.IOException;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.LauncherActivity.*;

final class HrServices extends HrView {
    HrServices(HrWorkspace h){super(h);}
    static String name(String kind){
        switch(kind){
            case "letter":return "Request an HR letter";case "overtime":return "Request overtime";case "shift-change":return "Request a shift change";
            case "issue-return":return "Request an item return";case "issue-replacement":return "Request a replacement";
            case "dependent-change":return "Request a dependent change";case "accommodation-issue":return "Report an accommodation issue or change";
            case "pro-follow-up":return "Request PRO follow-up";case "task-evidence":return "Submit onboarding evidence";
            case "clearance-evidence":return "Submit clearance evidence";default:return title(kind);
        }
    }
    void ownHome(long e){
        if(!h.canOwn("services"))return;
        a.card("My services","Letters, time requests and request history",()->ownMenu(e));
    }
    private void ownMenu(long e){h.page("My services",h::home);
        for(String k:new String[]{"letter","overtime","shift-change"})startAction(e,k,null,0,"My services",()->ownMenu(e));
        a.action("My service history",()->requests("own",e,"all",0,()->ownMenu(e)),false);
    }
    void staffHome(Runnable parent){
        if(h.can("serviceReview"))a.card("Service review and fulfilment","Open eligible requests, decisions and officer actions",()->requests("review",0,"all",0,parent));
        if(h.can("serviceReview") || h.can("requestsTeam"))a.card("Team services","Permitted team requests",()->requests("team",0,"all",0,parent));
    }
    void startAction(long e,String kind,JSONObject source,long caseId,String label,Runnable back){
        if(HrV5Rules.selfAction(e,h.ownEmployee,h.can("services")))a.action(name(kind),()->new HrServiceForm(h,e,kind,source,caseId,label,back).open(),false);
    }
    void startButton(LinearLayout panel,long e,String kind,JSONObject source,long caseId,String label,Runnable back){
        if(HrV5Rules.selfAction(e,h.ownEmployee,h.can("services")))button(panel,name(kind),()->new HrServiceForm(h,e,kind,source,caseId,label,back).open());
    }
    void acknowledgeButton(long e,JSONObject source,String item,Runnable back){
        if(!h.can("services") || e!=h.ownEmployee)return;
        a.action("Acknowledge receipt",()->h.confirm("I confirm I received the item shown.",item,"Confirm receipt",()->h.submit("Item receipt acknowledgment",
            "ack:"+e+":"+str(source,"kind")+":"+source.optLong("id")+":"+str(source,"revision"),
            object("op","issueAcknowledge","employeeId",e,"source",source,"confirmed",true,"statementVersion","receipt-v1"),back)),false);
    }

    void requests(String scope,long employee,String status,long after,Runnable back){
        h.page(HR_REQUEST_LIST, scope.equals("own")?"My service requests":scope.equals("review")?"Service review and fulfilment":"Team services",back);
        String[] statuses={"all","pending","approved","rejected","fulfilled","recorded"};
        String[] names={"All statuses","Pending review","Accepted for HR action","Rejected","Fulfilled","Acknowledged"};
        a.action("Filter · "+HrV5Rules.effect(status),()->h.pick("Request status",names,i->requests(scope,employee,statuses[i],0,back)),false);
        JSONObject cmd=object("op","serviceRequests","scope",scope,"employeeId",employee>0?employee:null,"status",status,"after",after);h.route(cmd);
        Runnable refresh=()->requests(scope,employee,status,after,back);
        h.subjectRead(cmd,r->{
            JSONArray rows=r.getJSONArray("rows");if(rows.length()==0)a.subtitle("No permitted requests match.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);
                boolean full=row.optBoolean("canRead");
                String name=full?str(row,"title"):"Employee service";
                LinearLayout panel=a.card(name,join(str(row,"employeeLabel"),state(row)),null);
                details(panel,row,"createdAt");
                button(panel,full?"Open request":"View permitted summary",()->opening(row.optLong("employeeId"),row.optLong("id"),str(row,"revision"),refresh));
            }
            if(r.optBoolean("more") && r.optLong("nextAfterId")>after)a.action("More requests",()->requests(scope,employee,status,r.optLong("nextAfterId"),back),false);
        });
    }
    static String state(JSONObject row){
        if("fulfilled".equals(str(row,"fulfilment")))return "Fulfilled";
        if("pending".equals(str(row,"fulfilment")))return "Fulfilment pending";
        if("not-required".equals(str(row,"review")))return "Receipt acknowledged";
        return HrV5Rules.effect(str(row,"review"));
    }
    static JSONObject opened(String op,long e,long id,String revision){return object("op",op,"employeeId",e,"id",id,"revision",revision);}
    void opening(long e,long id,String revision,Runnable back){
        h.page(HR_REQUEST, "Service request",back);
        JSONObject cmd=opened("serviceOpening",e,id,revision);h.route(cmd);
        h.subjectRead(cmd,r->{
            if(!HrRules.exactRecord(e,id,revision,r.optLong("employeeId"),r.optLong("id"),str(r,"revision")))throw new ErpApi.Rejected("Request changed.",409,null);
            boolean full=HrV5Rules.full(str(r,"visibility"),r.optBoolean("canRead"));
            LinearLayout panel=a.card(full?str(r,"title"):"Employee service",join(str(r,"employeeLabel"),state(r)),null);
            if(!full){a.subtitle("Only the request summary is available with current access.");return;}
            details(panel,r,"createdAt","decidedAt","decisionReason","fulfilledAt");
            showProposal(r.getJSONObject("proposal"));
            if(r.getJSONArray("fields").length()>0)h.showFields("Officer reference",r.getJSONArray("fields"));
            Runnable refresh=()->opening(e,id,revision,back);
            if(r.optBoolean("canDecide") && e!=h.ownEmployee){
                EditText reason=a.field(a.content,"Decision reason (required for rejection)","",500,1);
                for(String decision:new String[]{"approve","reject"})a.action(decision.equals("approve")?"Accept for HR action":"Reject request",()->{
                    String text=a.value(reason);if(decision.equals("reject") && text.isEmpty()){reason.setError("Enter a reason");return;}
                    JSONObject body=opened("serviceDecision",e,id,revision);set(body,"decision",decision);set(body,"reason",text);
                    h.confirm(decision.equals("approve")?"Accept for HR action?":"Reject this request?",join(str(r,"title"),text),"Confirm",
                        ()->h.submit("Service decision","decision:"+id,body,back));
                },false);
            }
            if(r.optBoolean("canFulfil") && e!=h.ownEmployee)a.action("Officer fulfilment",()->new HrFulfilment(h,r,back).open(),true);
            if(r.optJSONObject("result")!=null)details(a.card("Verified outcome","",null),r.getJSONObject("result"),"at","actorLabel");
        });
    }

    private void showProposal(JSONObject p){
        LinearLayout panel=a.card("Submitted particulars","",null);
        String kind=str(p,"kind");
        switch(kind){
            case "letter":
                a.detail(panel,"Letter",title(str(p,"outputCode").replaceFirst("^HR_","")));
                details(panel,p,"language","recipient","purpose","recipientAr","purposeAr","validUntil","neededBy");break;
            case "task-evidence":case "clearance-evidence":details(panel,p,"note");break;
            case "issue-replacement":case "issue-return":details(panel,p,"reason","requestedDate");break;
            case "dependent-change":{
                JSONObject c=p.optJSONObject("changes");
                if(c!=null){
                    details(panel,c,"nameEn","nameAr","dateOfBirth","passportNumber","passportExpiry","emiratesIdNumber","emiratesIdExpiry",
                        "visaNumber","visaExpiry","sponsoredBy","active");
                    reference(panel,c,"relationshipId","Relationship");reference(panel,c,"nationalityId","Nationality");
                }break;
            }
            case "pro-follow-up":details(panel,p,"message");break;
            case "accommodation-issue":details(panel,p,"category","description");break;
            case "shift-change":reference(panel,p,"shiftId","Requested shift");details(panel,p,"from","to","reason");break;
            case "overtime":details(panel,p,"date","hours","reason");break;
            case "issue-acknowledgement":a.detail(panel,"Receipt statement","I confirm I received the item shown.");break;
        }
        JSONObject source=p.optJSONObject("source");
        if(source!=null)a.detail(panel,"Original record",title(str(source,"kind"))+" #"+source.optLong("id")+" · revision "+str(source,"revision"));
        reference(panel,p,"caseId","Offboarding case");
        evidence(panel,p.optJSONObject("evidence"));
    }

    private void reference(LinearLayout panel,JSONObject p,String key,String label){
        if(p.optLong(key)>0)a.detail(panel,label,label+" #"+p.optLong(key));
    }

    boolean restore(JSONObject cmd){
        switch(str(cmd,"op")){
            case "serviceRequests":requests(str(cmd,"scope"),cmd.optLong("employeeId"),str(cmd,"status"),cmd.optLong("after"),h::contextHome);return true;
            case "serviceOpening":opening(cmd.optLong("employeeId"),cmd.optLong("id"),str(cmd,"revision"),h::contextHome);return true;
            default:return false;
        }
    }

    void upload(HrServiceForm form){
        HrWorkspace.Screen screen=h.new Screen();
        if(!screen.visible())return;
        JSONObject saved=form.handoff();
        h.load("Preparing request evidence",()->{
            validateHandoff(screen,saved);
            return true;
        },ok->a.startHrUpload(saved,true));
    }

    void returnUpload(){
        if(!a.returnActiveEvidence(true))returnUpload(null);
    }

    void returnUpload(HrCaptureTarget expected){
        h.page(HR_EVIDENCE_RETURN, "Service request evidence",h::home);
        HrWorkspace.Screen screen=h.new Screen();
        h.load("Checking employee, evidence and source",()->{
            JSONObject saved=screen.store().restoreEvidence(screen.epoch,true,expected);
            return object("saved",saved,"options",validateHandoff(screen,saved));
        },result->{
            JSONObject saved=result.getJSONObject("saved");
            HrCaptureTarget restored=HrCaptureTarget.forForm(screen.epoch,true,saved,0);
            HrCaptureTarget.Requests slot=screen.store().evidenceSlot(screen.epoch,true);
            HrCaptureTarget.restore(slot,screen.epoch,true,restored);
            long e=saved.getLong("employeeId");h.ownEmployee=e;
            HrServiceForm form=new HrServiceForm(h,e,str(saved,"kind"),saved.optJSONObject("source"),saved.optLong("caseId"),str(saved,"context"),h::home);
            HrRecovery.restoreHandoff(screen::visible,()->{
                form.restoreValues(saved,result.getJSONObject("options"));
                HrWorkspace.Screen rendered=h.new Screen();
                return rendered::visible;
            },owner->HrCaptureTarget.consume(slot,screen.epoch,true,restored,owner));
        });
    }
    private static JSONObject validateHandoff(HrWorkspace.Screen screen,JSONObject saved)throws Exception{
        long e=saved.getLong("employeeId");
        JSONObject home=screen.api.hrGet(object("op","home"));String k=str(saved,"kind");
        if(!home.optBoolean("own") || !HrV5Rules.subject(e,home.optLong("employeeId")))throw new ErpApi.Rejected("Employee link changed.",403,null);

        JSONObject letter=saved.optJSONObject("letter");
        if(letter!=null){
            JSONObject catalog=screen.api.hrGet(object("op","serviceChoices","employeeId",e,"kind","letter","after",letter.getLong("id")-1,"search",""));
            JSONObject current=catalog.getJSONArray("rows").optJSONObject(0);
            if(catalog.optLong("employeeId")!=e || current==null || !str(letter,"code").equals(str(current,"code")) || current.optLong("id")!=letter.optLong("id"))
                throw new ErpApi.Rejected("Letter selection changed.",409,null);
            set(saved,"letter",current);
        }
        JSONObject source=saved.optJSONObject("source");
        if(!currentSource(screen,e,source,saved.optLong("caseId")))throw new ErpApi.Rejected("Evidence source changed.",409,null);
        JSONObject result=screen.api.hrGet(object("op","serviceEvidence","employeeId",e,"kind",k,"source",source,"after",0,"search",""));
        if(!HrV5Rules.subject(e,result.optLong("employeeId")))throw new ErpApi.Rejected("Evidence scope changed.",409,null);
        JSONObject opts=screen.api.hrGet(object("op","serviceOptions","employeeId",e,"kind",k));
        if(!HrV5Rules.subject(e,opts.optLong("employeeId")) || !k.equals(str(opts,"kind")) || !opts.optBoolean("canSubmit") || !opts.optBoolean("evidenceAllowed")
            || opts.optBoolean("requiresSource") && source==null
            || !str(opts,"employeeRevision").equals(str(saved.getJSONObject("options"),"employeeRevision")))throw new ErpApi.Rejected("Service source changed.",409,null);
        screen.requireCurrentSession();
        return opts;
    }
    static boolean currentEvidence(HrWorkspace.Screen screen,long employee,JSONObject proposal)throws Exception{
        JSONObject evidence=proposal.optJSONObject("evidence");
        if(evidence==null)return true;
        long id=evidence.getLong("documentId");
        JSONObject result=screen.api.hrGet(object("op","serviceEvidence","employeeId",employee,"kind",str(proposal,"kind"),
            "source",proposal.optJSONObject("source"),"search","","after",id-1));
        JSONObject row=result.getJSONArray("rows").optJSONObject(0);
        return HrV5Rules.subject(employee,result.optLong("employeeId")) && row!=null && row.optLong("id")==id
            && row.optLong("versionId")==evidence.optLong("documentVersionId");
    }

    static boolean currentSource(HrWorkspace.Screen screen,long e,JSONObject source,long caseId)throws Exception{
        if(source==null)return true;
        String kind=str(source,"kind");long id=source.optLong("id");JSONObject cmd;
        switch(kind){
            case "ppe":case "asset":case "accommodation":cmd=object("op","operationDetail","employeeId",e,"kind",kind.equals("asset")?"assets":kind,"id",id);break;
            case "onboarding-task":case "pro-process":case "dependent":
                cmd=object("op",kind.equals("dependent")?"dependent":kind.equals("pro-process")?"proProcess":"onboardingTask","employeeId",e,"id",id);break;
            case "clearance":case "shift-assignment":{
                boolean clearance=kind.equals("clearance");
                long after=0;
                for(int page=1;page<=100000;page++){
                    screen.requireCurrentSession();
                    JSONObject r=screen.api.hrGet(clearance?object("op","clearance","employeeId",e,"caseId",caseId,"page",page):
                        object("op","serviceChoices","employeeId",e,"kind",kind,"search","","after",after));
                    if(r.optLong("employeeId")!=e)return false;
                    JSONArray rows=r.getJSONArray("rows");
                    for(int i=0;i<rows.length();i++){
                        JSONObject row=rows.getJSONObject(i);JSONObject value=clearance?row:row.optJSONObject("source");
                        if(value!=null && value.optLong("id")==id)return (!clearance || row.optLong("caseId")==caseId) && str(value,"revision").equals(str(source,"revision"));
                    }
                    if(!r.optBoolean("more"))return false;
                    if(!clearance && r.optLong("nextAfterId")<=after)return false;
                    after=r.optLong("nextAfterId");
                }
                return false;
            }
            default:return false;
        }
        JSONObject r=screen.api.hrGet(cmd);JSONObject detail=r.optJSONObject("row");
        JSONObject returned=(detail==null?r:detail).optJSONObject("source");
        return r.optLong("employeeId")==e && returned!=null && kind.equals(str(returned,"kind")) && returned.optLong("id")==id && str(returned,"revision").equals(str(source,"revision"));
    }
}
