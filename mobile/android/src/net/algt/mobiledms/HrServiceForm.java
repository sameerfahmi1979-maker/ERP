package net.algt.mobiledms;

import android.text.InputType;
import android.widget.EditText;
import org.json.*;
import java.util.ArrayList;
import java.util.Iterator;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.LauncherActivity.*;

final class HrServiceForm extends HrView {
    final long employee,caseId;
    final String kind,context;
    final Runnable back;
    String handoffId=java.util.UUID.randomUUID().toString();
    final JSONObject draft=new JSONObject(), labels=new JSONObject(), changes=new JSONObject();
    JSONObject source,letter,evidence;
    JSONObject options;
    private EditText arabicRecipient;
    HrServiceForm(HrWorkspace h,long e,String kind,JSONObject source,long caseId,String label,Runnable back) {
        super(h);employee=e;this.kind=kind;this.source=source;this.caseId=caseId;context=label;this.back=back;
    }

    void open(){
        h.page(HrServices.name(kind),back);
        if(!HrV5Rules.selfAction(employee,h.ownEmployee,true)){a.subtitle("A linked employee is required.");return;}
        h.subjectRead(object("op","serviceOptions","employeeId",employee,"kind",kind),r->{
            if(!kind.equals(str(r,"kind")) || !r.optBoolean("canSubmit") || (r.optBoolean("requiresSource") && source==null)){
                a.subtitle("This request is unavailable for the selected record.");return;
            }
            options=r;draw();
        });
    }

    private void draw(){
        h.page(HrServices.name(kind),back);a.subtitle(context);
        arabicRecipient=null;
        switch(kind){
            case "letter":
                select("Letter type","letter","outputCode",row->{letter=row;set(draft,"outputCode",str(row,"code"));
                    draft.remove("language");labels.remove("language");draft.remove("recipientAr");draft.remove("purposeAr");draft.remove("validUntil");});
                if(letter==null)return;
                JSONArray languages=letter.optJSONArray("languages");String[] codes=new String[languages.length()];
                for(int i=0;i<codes.length;i++)codes[i]=languages.optString(i);
                if(!HrV5Rules.offered(codes,str(draft,"language"))){draft.remove("language");labels.remove("language");}
                enumField("Language","language",codes);
                String code=str(letter,"code");boolean bilingual=!"en".equals(str(draft,"language")) && !str(draft,"language").isEmpty();
                boolean employment=code.equals("HR_EMPLOYMENT_CONFIRMATION"),noc=code.equals("HR_NOC"),salary=code.equals("HR_SALARY_CERT_WITH_AMOUNT"),
                    printed=salary||noc||code.equals("HR_EMBASSY_LETTER");
                input(draft,"recipient","Recipient",employment?180:salary?120:200,false);
                input(draft,"purpose","Purpose",noc?200:500,false);
                if(bilingual && (employment||printed))input(draft,"recipientAr","Recipient in Arabic",employment?180:200,false);
                if(bilingual && printed)input(draft,"purposeAr","Purpose in Arabic",500,false);
                if(noc)day(draft,"validUntil","Letter valid through");
                day(draft,"neededBy","Needed by (optional)");break;
            case "issue-replacement":case "issue-return":
                if(kind.equals("issue-return"))day(draft,"requestedDate","Requested return date");
                input(draft,"reason","Reason",2000,false);break;
            case "task-evidence":case "clearance-evidence":input(draft,"note","Evidence note (optional)",2000,false);break;
            case "dependent-change":
                input(changes,"nameEn","Name in English",160,false);input(changes,"nameAr","Name in Arabic",160,false);
                select("Relationship","relationship","relationshipId",r->set(changes,"relationshipId",r.optLong("id")));
                select("Nationality","nationality","nationalityId",r->set(changes,"nationalityId",r.optLong("id")));
                day(changes,"dateOfBirth","Date of birth");
                for(String key:new String[]{"passport","emiratesId","visa"}){
                    String label=key.equals("emiratesId")?"Emirates ID":title(key);
                    input(changes,key+"Number",label+" number",100,false);day(changes,key+"Expiry",label+" expiry");
                }
                a.action("Sponsor · "+first(str(changes,"sponsoredBy"),"Choose if changing"),()->h.pick("Sponsor",new String[]{"Employee","Company"},
                    i->{set(changes,"sponsoredBy",i==0?"employee":"company");draw();}),false);
                a.action("Dependent status · "+(changes.has("active")?(changes.optBoolean("active")?"Active":"Inactive"):"Choose if changing"),
                    ()->h.pick("Dependent status",new String[]{"Active","Inactive"},i->{set(changes,"active",i==0);draw();}),false);
                if(source!=null)a.action("Clear a recorded optional field",()->{
                    String[] optional={"dateOfBirth","nationalityId","passportNumber","passportExpiry","emiratesIdNumber","emiratesIdExpiry","visaNumber","visaExpiry"};
                    String[] names={"Date of birth","Nationality","Passport number","Passport expiry","Emirates ID number","Emirates ID expiry","Visa number","Visa expiry"};
                    h.pick("Clear recorded field",names,i->{set(changes,optional[i],null);set(labels,optional[i],"Clear recorded "+names[i].toLowerCase(java.util.Locale.ROOT));draw();});
                },false);break;
            case "accommodation-issue":
                enumField("Category","category",new String[]{"maintenance","room","transport","safety","other"});input(draft,"description","Describe the issue or change requested",2000,false);break;
            case "overtime":day(draft,"date","Work date");input(draft,"hours","Requested hours",5,true);input(draft,"reason","Reason",500,false);break;
            case "shift-change":
                select("Existing assignment (optional)","shift-assignment","assignment",r->source=r.optJSONObject("source"));
                if(source!=null)a.action("Request a new assignment",()->{source=null;labels.remove("assignment");draw();},false);
                select("Requested shift","shift","shiftId",r->set(draft,"shiftId",r.optLong("id")));
                day(draft,"from","From");day(draft,"to","Through (optional)");input(draft,"reason","Reason",2000,false);break;
            case "pro-follow-up":input(draft,"message","Follow-up request",2000,false);break;
        }
        if(!kind.equals("shift-change") && options.optBoolean("evidenceAllowed")){
            a.action("Evidence · "+first(str(labels,"evidence"),"Choose document"),()->choices("Evidence for this request",
                object("op","serviceEvidence","employeeId",employee,"source",source,"kind",kind,"search","","after",0),this::draw,r->{
                    evidence=object("documentId",r.optLong("id"),"documentVersionId",r.optLong("versionId"));set(labels,"evidence",str(r,"label"));draw();
                }),false);
            if(evidence!=null)a.action("Remove evidence",()->{evidence=null;labels.remove("evidence");draw();},false);
            if(a.capability("upload") && !kind.equals("dependent-change"))a.action("Upload evidence for this request",()->h.services.upload(this),false);
        }
        a.action("Review request",this::review,true);
    }

    private void select(String label,String type,String key,Select accept){
        a.action(label+" · "+first(str(labels,key),"Choose"),()->choices(label,object("op","serviceChoices","employeeId",employee,"kind",type,
            "search","","after",0),this::draw,row->{accept.row(row);set(labels,key,str(row,"label"));draw();}),false);
    }
    private void enumField(String label,String key,String[] values){
        String[] names=new String[values.length];
        for(int i=0;i<names.length;i++)names[i]=values[i].equals("en")?"English":values[i].equals("ar")?"Arabic":title(values[i]);
        a.action(label+" · "+first(str(labels,key),"Choose"),()->h.pick(label,names,i->{
            set(draft,key,values[i]);set(labels,key,names[i]);if(key.equals("language")&&values[i].equals("en")){draft.remove("recipientAr");draft.remove("purposeAr");}
            draw();
        }),false);
    }
    private void input(JSONObject values,String key,String label,int max,boolean number){
        EditText field=a.field(a.content,label,str(values,key),max,number?InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL:InputType.TYPE_CLASS_TEXT);
        if(key.equals("recipientAr") && max==180){
            arabicRecipient=field;
            android.text.InputFilter limit=(text,start,end,dest,first,last)->{
                if(dest.length()-(last-first)+end-start>max){
                    field.setError("Recipient in Arabic must be 180 characters or fewer.");
                    return dest.subSequence(first,last);
                }
                field.setError(null);return null;
            };
            field.setFilters(new android.text.InputFilter[]{limit});
            String invalid=HrRecovery.recipientProblem("HR_EMPLOYMENT_CONFIRMATION",str(values,key));
            if(!invalid.isEmpty())field.setError(invalid);
        }
        h.bind(field,v->{labels.remove(key);if(v.trim().isEmpty())values.remove(key);else set(values,key,v.trim());});
    }
    private void day(JSONObject values,String key,String label){
        EditText field=h.dateField(label,str(values,key));h.bind(field,v->{labels.remove(key);if(v.isEmpty())values.remove(key);else set(values,key,v);});
    }
    private String missing(JSONObject p,String...keys){
        for(String key:keys)if(p.isNull(key)||str(p,key).isEmpty())return "Enter or select "+title(key).toLowerCase(java.util.Locale.ROOT)+".";
        return "";
    }
    private void review(){
        if(arabicRecipient!=null && arabicRecipient.getError()!=null){arabicRecipient.requestFocus();return;}
        JSONObject p=copy(draft);set(p,"kind",kind);
        String problem="";
        if(!kind.equals("shift-change"))set(p,"evidence",evidence);
        switch(kind){
            case "letter":
                problem=missing(p,"outputCode","recipient","purpose","language");
                String code=str(p,"outputCode");
                if(problem.isEmpty())problem=HrRecovery.recipientProblem(code,str(p,"recipientAr"));
                if(problem.isEmpty()&&code.equals("HR_NOC"))problem=missing(p,"validUntil");
                if(problem.isEmpty()&&!"en".equals(str(p,"language"))){
                    if(code.equals("HR_EMPLOYMENT_CONFIRMATION"))problem=missing(p,"recipientAr");
                    else if(code.equals("HR_NOC")||code.equals("HR_SALARY_CERT_WITH_AMOUNT")||code.equals("HR_EMBASSY_LETTER"))problem=missing(p,"recipientAr","purposeAr");
                }
                if(!p.has("neededBy"))set(p,"neededBy",null);break;
            case "overtime":
                problem=missing(p,"date","reason","hours");
                try{java.math.BigDecimal hours=new java.math.BigDecimal(str(p,"hours"));
                    if(hours.signum()<=0||hours.compareTo(new java.math.BigDecimal(24))>0||hours.scale()>2)throw new NumberFormatException();
                    set(p,"hours",hours.doubleValue());
                }catch(NumberFormatException ex){problem="Enter hours greater than zero and up to 24, using at most two decimal places.";}break;
            case "shift-change":
                problem=missing(p,"shiftId","from","reason");
                if(!p.has("to"))set(p,"to",null);
                else if(!HrRules.dateRange(str(p,"from"),str(p,"to")))problem="Choose an end date on or after the start.";
                break;
            case "task-evidence":case "clearance-evidence":
                problem=missing(p,"evidence");if(!p.has("note"))set(p,"note","");
                if(kind.equals("clearance-evidence"))set(p,"caseId",caseId);break;
            case "dependent-change":
                if(changes.length()==0)problem="Enter at least one change.";
                if(source==null)problem=missing(changes,"nameEn","relationshipId");
                if(str(changes,"dateOfBirth").compareTo(today())>0)problem="Date of birth cannot be in the future.";
                set(p,"changes",changes);break;
            case "issue-return":problem=missing(p,"requestedDate","reason");break;
            case "issue-replacement":problem=missing(p,"reason");break;
            case "accommodation-issue":problem=missing(p,"description","category");break;
            case "pro-follow-up":problem=missing(p,"message");break;
        }
        if(!problem.isEmpty()){a.message(problem,true);return;}
        if(!kind.equals("letter")&&!kind.equals("overtime"))set(p,"source",source);
        if(kind.equals("letter")||kind.equals("dependent-change")||kind.equals("accommodation-issue")||kind.equals("shift-change")||kind.equals("overtime"))
            set(p,"employeeRevision",str(options,"employeeRevision"));
        StringBuilder summary=new StringBuilder(context);
        for(JSONObject values:new JSONObject[]{draft,changes,labels}){
            Iterator<String> keys=values.keys();
            while(keys.hasNext()){
                String key=keys.next();
                if(values!=labels && (key.endsWith("Id")||labels.has(key)))continue;
                summary.append("\n").append(title(key)).append(" · ").append(str(values,key));
            }
        }
        h.confirm("Submit "+HrServices.name(kind)+"?",summary.toString(),"Submit",()->h.submit(HrServices.name(kind),
            "service:"+employee+":"+kind+":"+(source==null?0:source.optLong("id")),object("op","serviceSubmit","employeeId",employee,"proposal",p),back));
    }
    JSONObject handoff(){return object("handoffId",handoffId,"kind",kind,"employeeId",employee,"source",source,"caseId",caseId,"context",context,
        "options",options,"draft",draft,"changes",changes,"labels",labels,"letter",letter);}
    void restoreValues(JSONObject saved,JSONObject currentOptions) throws Exception{
        handoffId=saved.getString("handoffId");
        JSONObject[] targets={draft,changes,labels};String[] keys={"draft","changes","labels"};
        for(int i=0;i<keys.length;i++){JSONObject from=saved.getJSONObject(keys[i]);Iterator<String> it=from.keys();
            while(it.hasNext()){String k=it.next();set(targets[i],k,from.get(k));}}
        labels.remove("evidence");letter=saved.optJSONObject("letter");options=currentOptions;draw();
    }
}
