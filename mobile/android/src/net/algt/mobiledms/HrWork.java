package net.algt.mobiledms;

import android.widget.EditText;
import android.widget.LinearLayout;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.LauncherActivity.*;

final class HrWork extends HrView {
    HrWork(HrWorkspace h){super(h);}
    void teamHome(){
        if(h.can("teamReadiness")) a.card("Team readiness","Assignments and recorded operational readiness",()->team(false,new EmployeeRecords.Filters(),today(),today(),0,1));
        if(h.can("teamCalendar")) a.card("Team leave calendar","Leave overlapping a selected period",()->team(true,new EmployeeRecords.Filters(),today(),today(),0,1));
    }
    void personalHome(long employee) {
        if(h.canOwn("work"))a.card("My work","Dated assignments and readiness",()->work(employee,today(),h::home));
        if(h.canOwn("ppeAssets")||h.canOwn("onboarding")||h.canOwn("pro")||h.canOwn("dependents")||h.canOwn("accommodation")||h.canOwn("offboarding"))
            a.card("My employment records","Equipment, family records and employment processes",()->ownRecords(employee));
        if(h.canOwn("issuedDocuments"))a.card("My issued documents","Approved originals and current status",()->list(employee,"issuedDocuments","",0,1,h::home));
    }
    private void ownRecords(long employee){
        h.page("My employment records",h::home);
        Runnable back=()->ownRecords(employee);
        if(h.canOwn("ppeAssets"))section("PPE and assets",employee,true,back);
        if(h.canOwn("onboarding"))section("Onboarding",employee,true,back);
        if(h.canOwn("pro"))section("PRO processes",employee,true,back);
        if(h.canOwn("dependents"))section("Dependents",employee,true,back);
        if(h.canOwn("accommodation"))section("Accommodation",employee,true,back);
        if(h.canOwn("offboarding"))section("Offboarding and clearance",employee,true,back);
    }
    void section(String section,long employee,boolean own,Runnable back) {
        switch(section) {
            case "Work and readiness":
                a.action("Work by date",()->work(employee,today(),back),true);
                for(String k:new String[]{"assignments","requirements","readiness","blocks"})domain(employee,"operationRecords",k,0,back);
                break;
            case "PPE and assets":
                domain(employee,"operationRecords","ppe",0,back);domain(employee,"operationRecords","assets",0,back);break;
            case "Accommodation":domain(employee,"operationRecords","accommodation",0,back);break;
            case "Issued documents":domain(employee,"issuedDocuments","",0,back);break;
            case "PRO processes":domain(employee,"proProcesses","",0,back);break;
            case "Dependents":domain(employee,"dependents","",0,back);break;
            case "Offboarding and clearance":domain(employee,"offboarding","",0,back);break;
            case "Onboarding":domain(employee,"onboarding","",0,back);break;
        }
    }
    private void domain(long e,String op,String k,long caseId,Runnable back){
        a.action(label(op,k),()->list(e,op,k,caseId,1,back),false);
    }
    private String label(String op,String k){
        if("ppe".equals(k))return "PPE";
        if(!k.isEmpty())return title(k);
        switch(op){case "proProcesses":case "proProcess":return "PRO processes";case "offboarding":return "Offboarding cases";
            case "clearance":return "Clearance checklist";case "clearanceHistory":return "Clearance history";
            case "onboarding":case "onboardingTask":return "Onboarding tasks";default:return title(op);}
    }

    void team(boolean calendar,EmployeeRecords.Filters f,String from,String to,long employee,int page) {
        String name=calendar?"Team leave calendar":"Team readiness";h.page(name,h::home);
        EditText start=h.dateField(calendar?"From date":"Work date",from),end=calendar?h.dateField("Through date",to):null;
        EditText search=a.field(a.content,"Employee name or code",f.search,100,1);
        Runnable apply=()->{
            String min=a.value(start),max=calendar?a.value(end):min;
            if(!HrRules.dateRange(min,max) || (calendar && java.time.LocalDate.parse(max).toEpochDay()-java.time.LocalDate.parse(min).toEpochDay()>92)){
                a.message("Choose a valid interval of up to 93 days.",true);return;
            }
            f.search=a.value(search);team(calendar,f,min,max,employee,1);
        };
        a.action("Apply dates and search",apply,true);
        h.people.filters(f,calendar?new String[]{"company","branch"}:new String[]{"company","branch","site"},apply);
        JSONObject cmd=object("op",calendar?"teamCalendar":"teamReadiness","companyId",f.id("company"),"branchId",f.id("branch"),"page",page,"search",f.search);
        if(calendar){set(cmd,"from",from);set(cmd,"to",to);set(cmd,"employeeId",employee>0?employee:null);}
        else{set(cmd,"date",from);set(cmd,"siteId",f.id("site"));}
        JSONObject descriptor=copy(cmd);set(descriptor,"search","");h.route(descriptor);
        h.subjectRead(cmd,r->{
            JSONArray rows=r.getJSONArray("rows");
            if(rows.length()==0)a.subtitle(calendar?"No permitted leave overlaps this period.":"No readiness records match.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);
                long id=row.optLong("employeeId");
                LinearLayout panel=a.card(first(str(row,"employeeLabel"),str(row,"name")),calendar?str(row,"label"):str(row,"employeeCode"),null);
                if(calendar)details(panel,row,"startDate","endDate","status");
                else details(panel,row,"company","branch","site","status","checkedAt","hasOperationalBlock");
                if(calendar && employee==0) button(panel,"Calendar for this employee",()->team(true,f,from,to,id,1));
                if(h.can("employeeRecord"))button(panel,"Open employee record",()->h.people.record(id,"Overview",()->team(calendar,f,from,to,employee,page)));
            }
            h.pagination(page,r,n->team(calendar,f,from,to,employee,n));
        });
    }

    void work(long e,String date,Runnable back){
        h.page("Work and readiness",back);JSONObject cmd=object("op","work","employeeId",e,"date",date);h.route(cmd);
        EditText day=h.dateField("Work date",date);
        a.action("Show date",()->{if(HrRules.dateRange(a.value(day),a.value(day)))work(e,a.value(day),back);else day.setError("Choose a date");},false);
        h.subjectRead(cmd,r->{
            for(String k:new String[]{"assignments","readiness","blocks"}){
                a.subtitle(title(k));JSONArray rows=r.getJSONArray(k);
                if(rows.length()==0)a.subtitle("No recorded "+k+" for this date.");
                for(int i=0;i<rows.length();i++)operation(e,k,rows.getJSONObject(i),()->work(e,date,back));
                if(r.getJSONObject("more").optBoolean(k))domain(e,"operationRecords",k,0,()->work(e,date,back));
            }
            domain(e,"operationRecords","requirements",0,()->work(e,date,back));
        });
    }
    void wallet(long e,int page,long selected,Runnable back){list(e,"issuedDocuments","",0,page,back,selected);}
    void list(long e,String op,String k,long caseId,int page,Runnable back) {list(e,op,k,caseId,page,back,0);}
    private void list(long e,String op,String k,long caseId,int page,Runnable back,long selected) {
        h.page(label(op,k),back);
        JSONObject cmd=object("op",op,"employeeId",e,"page",page);
        if(!k.isEmpty())set(cmd,"kind",k); if(caseId>0)set(cmd,"caseId",caseId);
        JSONObject route=copy(cmd);if(selected>0)set(route,"issuanceId",selected);h.route(route);
        Runnable refresh=()->list(e,op,k,caseId,page,back);
        h.subjectRead(cmd,r->{
            JSONArray rows=r.getJSONArray("rows");
            if(rows.length()==0)a.subtitle("No records are available for this selection.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);long id=row.getLong("id");
                if(op.equals("operationRecords")){operation(e,k,row,refresh);continue;}
                LinearLayout panel=a.card(first(str(row,"title"),first(str(row,"name"),first(title(str(row,"type")),label(op,k)))),str(row,"status"),null);
                switch(op){
                    case "issuedDocuments":
                        details(panel,row,"serialNo","issuedAt","expiresAt","fileName");
                        h.files.walletActions(panel,e,row,page,()->wallet(e,page,id,back));
                        if(id==selected)panel.post(()->panel.requestRectangleOnScreen(new android.graphics.Rect(0,0,panel.getWidth(),Math.min(panel.getHeight(),a.dp(160))),false));
                        break;
                    case "proProcesses":details(panel,row,"priority","requestDate","targetDate","assignedTo");button(panel,"Process progress",()->detail(e,"proProcess","",id,refresh));break;
                    case "dependents":
                        h.files.avatar(panel,e,id,str(row,"name"),row.optJSONObject("photo"),48);
                        details(panel,row,"relationship","dateOfBirth","active","passportExpiry","emiratesIdExpiry","visaExpiry");
                        button(panel,"Dependent record",()->detail(e,"dependent","",id,refresh));break;
                    case "onboarding":details(panel,row,"category","dueDate","required","evidenceRequired","assignedTo");button(panel,"Task requirements",()->detail(e,"onboardingTask","",id,refresh));break;
                    case "offboarding":details(panel,row,"noticeDate","lastWorkingDate","clearanceCompleted","settlementStatus");
                        button(panel,"Open clearance checklist",()->list(e,"clearance","",id,1,refresh));break;
                    case "clearance":
                        if(row.optLong("caseId")!=caseId)break;
                        details(panel,row,"area","status");evidence(panel,row.optJSONObject("evidence"));
                        button(panel,"Clearance history",()->history(e,caseId,id,0,refresh));
                        if(e==h.ownEmployee) h.services.startButton(panel,e,"clearance-evidence",
                            object("kind","clearance","id",id,"revision",str(row,"revision")),caseId,str(row,"title"),refresh);break;
                }
            }
            if(e==h.ownEmployee && op.equals("dependents"))h.services.startAction(e,"dependent-change",null,0,"New dependent",refresh);
            if(e==h.ownEmployee && k.equals("accommodation"))h.services.startAction(e,"accommodation-issue",null,0,"Accommodation request",refresh);
            h.pagination(page,r,n->list(e,op,k,caseId,n,back));
        });
    }

    private void operation(long e,String k,JSONObject row,Runnable back){
        long id=row.optLong("id");
        LinearLayout panel=a.card(str(row,"title"),status(str(row,"status")),null);
        details(panel,row,"startDate","endDate","checkedAt");button(panel,"Open details",()->detail(e,"operationDetail",k,id,back));
    }
    void detail(long e,String op,String k,long id,Runnable back){
        h.page(label(op,k),back);
        JSONObject cmd=object("op",op,"employeeId",e,"id",id);if(!k.isEmpty())set(cmd,"kind",k);h.route(cmd);
        Runnable refresh=()->detail(e,op,k,id,back);
        h.subjectRead(cmd,r->{
            JSONObject row=op.equals("operationDetail")?r.getJSONObject("row"):r;
            JSONObject source=row.optJSONObject("source");
            if ((row.has("id")&&row.optLong("id")!=id) || (source!=null && source.optLong("id")!=id))throw new ErpApi.Rejected("Record changed.",409,null);
            String name=first(str(row,"title"),first(str(row,"name"),label(op,k)));
            LinearLayout panel=a.card(name,status(str(row,"status")),null);
            details(panel,row,"requestDate","targetDate","submittedDate","completedDate","assignedTo","startDate","endDate","checkedAt","completionCriteria");
            if(op.equals("onboardingTask") && !row.isNull("prerequisiteTaskId"))button(panel,"Open prerequisite task",()->detail(e,op,"",row.optLong("prerequisiteTaskId"),refresh));
            if(op.equals("dependent"))h.files.avatar(panel,e,id,name,r.optJSONObject("photo"),80);
            h.showFields("Record details",r.getJSONArray("fields"));
            evidence(panel,r.optJSONObject("evidence"));
            if(op.equals("dependent")){
                if(r.optJSONArray("medical")==null)a.subtitle("Insurance information is restricted.");
                else h.showFields("Insurance",r.getJSONArray("medical"));
            }
            if(e!=h.ownEmployee || source==null)return;
            if(k.equals("assets")||k.equals("ppe")){
                if(!"issued".equals(str(row,"status")))return;
                h.services.acknowledgeButton(e,source,name,refresh);
                h.services.startAction(e,"issue-return",source,0,name,refresh);
                h.services.startAction(e,"issue-replacement",source,0,name,refresh);
            }else if(op.equals("dependent"))h.services.startAction(e,"dependent-change",source,0,name,refresh);
            else if(op.equals("onboardingTask") && r.optBoolean("canSubmitEvidence"))h.services.startAction(e,"task-evidence",source,0,name,refresh);
            else if(op.equals("proProcess"))h.services.startAction(e,"pro-follow-up",source,0,name,refresh);
            else if(k.equals("accommodation"))h.services.startAction(e,"accommodation-issue",source,0,name,refresh);
        });
    }

    private void history(long e,long caseId,long id,long after,Runnable back){
        h.page("Clearance history",back);
        JSONObject cmd=object("op","clearanceHistory","employeeId",e,"caseId",caseId,"id",id,"after",after);h.route(cmd);
        h.subjectRead(cmd,r->{
            JSONArray rows=r.getJSONArray("rows");if(rows.length()==0)a.subtitle("No clearance events recorded.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);LinearLayout panel=a.card(title(str(row,"action")),"",null);
                details(panel,row,"actorLabel","at","status");evidence(panel,row.optJSONObject("evidence"));
            }
            if(r.optBoolean("more") && r.optLong("nextAfterId")>after)a.action("More history",()->history(e,caseId,id,r.optLong("nextAfterId"),back),false);
        });
    }
    boolean restore(JSONObject cmd){
        String op=str(cmd,"op"),k=str(cmd,"kind");long e=cmd.optLong("employeeId"),id=cmd.optLong("id"),c=cmd.optLong("caseId");int p=cmd.optInt("page",1);
        Runnable back=e>0?()->h.people.record(e,"Overview",h::home):h::home;
        switch(op){
            case "teamReadiness":case "teamCalendar":
                if(!h.can(op))return false;
                EmployeeRecords.Filters f=new EmployeeRecords.Filters();
                for(String n:new String[]{"company","branch","site"})if(!cmd.isNull(n+"Id")){set(f.values,n,cmd.opt(n+"Id"));set(f.labels,n,"Selected");}
                boolean calendar=op.equals("teamCalendar");team(calendar,f,str(cmd,calendar?"from":"date"),str(cmd,calendar?"to":"date"),e,p);break;
            case "work":work(e,str(cmd,"date"),back);break;
            case "issuedPreview":h.files.restorePreview(cmd,back);break;
            case "issuedDocuments":h.files.reopenWallet(()->wallet(e,p,cmd.optLong("issuanceId"),back));break;
            case "operationRecords":case "proProcesses":case "dependents":case "onboarding":case "offboarding":case "clearance":
                list(e,op,k,c,p,back);break;
            case "operationDetail":case "proProcess":case "dependent":case "onboardingTask":detail(e,op,k,id,back);break;
            case "clearanceHistory":history(e,c,id,cmd.optLong("after"),back);break;
            default:return false;
        }
        return true;
    }
}
