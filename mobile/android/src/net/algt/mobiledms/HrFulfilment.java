package net.algt.mobiledms;

import android.widget.EditText;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;

final class HrFulfilment extends HrView {
    final long employee,id;
    final String revision,kind;
    final JSONObject request,proposal,source;
    final Runnable back;
    JSONObject letterSource,template;
    HrFulfilment(HrWorkspace h,JSONObject r,Runnable back){
        super(h);request=r;this.back=back;employee=r.optLong("employeeId");id=r.optLong("id");revision=str(r,"revision");
        proposal=r.optJSONObject("proposal");source=proposal==null?null:proposal.optJSONObject("source");kind=str(r,"kind");
    }
    JSONObject command(String op){return HrServices.opened(op,employee,id,revision);}
    void open(){
        h.page("Officer fulfilment",back);
        if(proposal==null || employee==h.ownEmployee || !request.optBoolean("canFulfil") || !HrV5Rules.full(str(request,"visibility"),request.optBoolean("canRead")))return;
        h.subjectRead(command("serviceAttempt"),r->{
            if(r.optLong("id")!=id || !revision.equals(str(r,"revision")))throw new ErpApi.Rejected("Request changed.",409,null);
            JSONObject attempt=r.optJSONObject("attempt");
            if(attempt!=null){
                String operation=str(attempt,"operationId");
                a.subtitle("An original officer action is already recorded. Check its receipt before taking further action.");
                a.action("Check original attempt and receipt",()->original(operation,attempt.optJSONObject("command")),true);return;
            }
            draw();
        });
    }
    private void original(String operation,JSONObject attemptedCommand){
        h.page("Original officer action",back);
        HrWorkspace.Screen screen=h.new Screen();
        h.load("Finding original submission",()->{
            for(HrOperationStore.Pending pending:screen.store().pending())
                if(operation.equals(pending.operation) && employee==pending.employeeId && pending.command.equals("serviceFulfil"))return true;
            return false;
        },saved->{
            if(saved){h.reviewSaved(operation,back);return;}
            h.subjectRead(object("op","serviceReceipt","operationId",operation),r->{
                JSONObject frozen=command("serviceFulfil");
                set(frozen,"operationId",operation);set(frozen,"command",attemptedCommand);
                if(!HrServiceReceipt.matches(frozen,r,null))throw new ErpApi.Rejected("Original receipt could not be verified.",409,null);
                a.subtitle(HrV5Rules.effect(str(r,"effect")));
            });
            a.subtitle("Retry from the original signed-in device if the ERP cannot confirm this receipt.");
        });
    }
    private void choose(String type,String label,Select select){
        JSONObject cmd=command("serviceActionChoices");set(cmd,"kind",type);set(cmd,"search","");set(cmd,"after",0);
        choices(label,cmd,this::open,row->{if(type.equals(str(row,"kind")))select.row(row);});
    }
    private void draw(){
        h.page("Officer fulfilment",back);a.subtitle(str(request,"title"));
        switch(kind){
            case "letter":
                a.action("Source · "+LauncherActivity.first(str(letterSource,"label"),"Choose if required"),()->choose("letter-source","Approved letter source",r->{letterSource=r;open();}),false);
                a.action("Template · "+LauncherActivity.first(str(template,"label"),"Governed default"),()->choose("letter-template","Governed template",r->{template=r;open();}),false);
                a.action("Issue approved letter",()->send("Issue the approved letter",object("kind","issue-letter","outputCode",str(proposal,"outputCode"),
                    "language",str(proposal,"language"),"sourceId",letterSource==null?null:letterSource.opt("sourceId"),
                    "sourceReviewId",letterSource==null?null:letterSource.opt("sourceReviewId"),"templateId",template==null?null:template.opt("templateId"))),true);
                a.action("Link or recover an existing original",()->choose("issuance","Eligible official originals",r->{
                    if(r.isNull("checksum"))send("Recover "+str(r,"label"),object("kind","recover-letter","issuanceId",r.optLong("issuanceId")));
                    else send("Link "+str(r,"label"),object("kind","link-issued-letter","issuanceId",r.optLong("issuanceId"),"checksum",str(r,"checksum")));
                }),false);break;
            case "issue-return":{
                EditText date=h.dateField("Actual return date",""),condition=a.field(a.content,"Condition on return (optional)","",500,1);
                a.action("Record actual return",()->{
                    String day=a.value(date);if(!HrRules.dateRange(day,day)){date.setError("Choose the actual return date");return;}
                    String text=a.value(condition);send("Record actual return on "+day,object("kind","record-return","source",source,"returnedDate",day,"condition",text.isEmpty()?null:text));
                },true);break;
            }
            case "dependent-change":case "issue-replacement":case "accommodation-issue":
                a.action("Select verified ERP action",()->choose("canonical-proof","Eligible completed ERP actions",r->{
                    JSONObject canonical=r.optJSONObject("canonical");if(canonical==null)return;
                    JSONObject cmd;
                    if(kind.equals("dependent-change"))cmd=object("kind","save-dependent","source",source,"canonicalOperationId",canonical.opt("operationId"));
                    else if(kind.equals("issue-replacement"))cmd=object("kind","record-replacement","source",source,"newSource",r.opt("source"),"canonicalOperationId",canonical.opt("operationId"));
                    else cmd=object("kind","resolve-accommodation","canonical",canonical);
                    send("Verify "+str(r,"label"),cmd);
                }),true);break;
            case "overtime":direct("Create pending overtime record",object("kind","create-overtime"));break;
            case "shift-change":direct("Record approved shift change",object("kind","change-shift","source",source));break;
            case "pro-follow-up":direct("Record PRO follow-up",object("kind","record-pro-follow-up","source",source));break;
            case "task-evidence":direct("File evidence and complete task",object("kind","complete-task","source",source));break;
            case "clearance-evidence":direct("File evidence and record clearance",object("kind","record-clearance","source",source,"caseId",proposal.optLong("caseId")));break;
        }
    }
    private void direct(String label,JSONObject cmd){a.action(label,()->send(label,cmd),true);}
    private void send(String label,JSONObject cmd){
        JSONObject body=command("serviceFulfil");set(body,"command",cmd);
        h.confirm(label+"?",str(request,"title"),"Confirm",()->h.submit(label,"fulfil:"+id,body,back));
    }
}
