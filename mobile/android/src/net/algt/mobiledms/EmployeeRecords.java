package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.widget.EditText;
import android.widget.LinearLayout;
import java.util.ArrayList;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.LauncherActivity.*;

final class EmployeeRecords extends HrView {
    static final String[] FILTERS={"company","branch","department","designation","site","status"};
    static class Filters {
        String search="";
        final JSONObject values = new JSONObject(), labels = new JSONObject();
        Object id(String kind) { return values.opt(kind); }
        void select(String kind, JSONObject choice) {
            if (choice==null) { values.remove(kind); labels.remove(kind); }
            else {
                String raw=str(choice,"value");
                set(values,kind,kind.equals("status") ? raw : Long.valueOf(raw));
                set(labels,kind,str(choice,"label"));
            }
            if ("company".equals(kind)) {values.remove("branch"); labels.remove("branch");}
        }
    }
    EmployeeRecords(HrWorkspace h){super(h);}

    void filters(Filters f, String[] allowed, Runnable redraw) {
        a.action("Filter results", () -> {
            String[] labels=new String[allowed.length];
            for(int i=0;i<labels.length;i++) labels[i]=title(allowed[i])+" · "+first(str(f.labels,allowed[i]),"All permitted");
            h.pick("Filter by",labels,i -> {
                String kind=allowed[i];
                h.page(title(kind),redraw);
                a.action("All permitted",()->{f.select(kind,null);redraw.run();},false);
                a.action("Choose "+kind,()->choices("Choose "+kind,object("op","directoryChoices","kind",kind,
                    "companyId",f.id("company"),"branchId",f.id("branch"),"search","","after",0),redraw,
                    row->{f.select(kind,row);redraw.run();}),true);
            });
        },false);
    }

    // Only applied search/filter choices and paging belong to a read visit. View/editor objects never enter it.
    private final class DirectoryBack implements Runnable {
        final JSONObject route;
        DirectoryBack(JSONObject route){this.route=copy(route);}
        public void run(){if(h.can("directory"))openDirectory(route);else h.home();}
    }
    static Filters appliedFilters(JSONObject route){
        Filters f=new Filters();
        f.search=str(route,"search");
        for(String k:FILTERS){
            String key=k.equals("status")?k:k+"Id";
            if(!route.isNull(key)){set(f.values,k,route.opt(key));set(f.labels,k,k.equals("status")?str(route,key):"#"+str(route,key));}
        }
        return f;
    }
    private void openDirectory(JSONObject route){directory(appliedFilters(route),route.optInt("page",1));
    }
    static JSONObject directoryQuery(Filters f,int page){
        JSONObject cmd=object("op","directory","page",page,"search",f.search);
        for (String k:FILTERS) set(cmd,k.equals("status")?k:k+"Id",f.id(k));
        return cmd;
    }
    void directory(Filters f,int page) {
        h.page(HR_DIRECTORY, "Employees",h::home);
        JSONObject cmd=directoryQuery(f,page),restore=copy(cmd);h.route(restore);
        EditText search=a.field(a.content,"Search by employee name or code",f.search,100,1);
        a.action("Search employees",()->{f.search=a.value(search); directory(f,1);},true);
        filters(f,FILTERS,()->directory(f,1));
        h.subjectRead(cmd,result->{
            JSONArray rows=result.getJSONArray("rows");
            if(rows.length()==0) a.subtitle("No employees match these filters.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);
                long id=row.getLong("employeeId"); String name=str(row,"name");
                LinearLayout panel=identity(name, id, row, str(row,"designation"), 48);
                a.detail(panel,"Employment status",status(str(row,"status")));
                button(panel,"Open "+name,()->record(id,"Overview",new DirectoryBack(restore)));
                call(panel,"Call "+name,str(row,"phone"));
            }
            h.pagination(page,result,n->directory(f,n));
        });
    }

    private LinearLayout identity(String name,long employee,JSONObject row,String designation,int size) {
        LinearLayout panel = a.column();
        panel.setPadding(a.dp(12),a.dp(12),a.dp(12),a.dp(12));
        panel.setBackground(a.ui.surface(a.getColor(R.color.erp_panel),a.getColor(R.color.erp_border),false));
        a.add(a.content,panel,8);
        LinearLayout identity = a.row(panel);
        identity.setGravity(android.view.Gravity.CENTER_VERTICAL);
        h.files.avatar(identity,employee,0,name,row.optJSONObject("photo"),size);
        LinearLayout labels = a.column();
        LinearLayout.LayoutParams space = new LinearLayout.LayoutParams(0,-2,1);
        space.setMarginStart(a.dp(12)); identity.addView(labels,space);
        a.add(labels,a.text(name,18,a.getColor(R.color.erp_text),true),0);
        String role = join(str(row,"employeeCode"),designation);
        String location = join(str(row,"company"),str(row,"branch"));
        if (!role.isEmpty()) a.add(labels,a.text(role,14,a.getColor(R.color.erp_text_secondary),false),4);
        if (!location.isEmpty()) a.add(labels,a.text(location,14,a.getColor(R.color.erp_text_secondary),false),4);
        return panel;
    }

    boolean restore(JSONObject route) {
        if ("directory".equals(str(route,"op")) && h.can("directory")) {
            openDirectory(route); return true;
        }
        if("employeeHistory".equals(str(route,"op")) && h.can("employeeRecord")){
            long e=route.optLong("employeeId");history(e,str(route,"domain"),str(route,"kind"),route.optLong("index"),()->record(e,"Overview",h::home));return true;
        }
        if (!"employeeRecord".equals(str(route,"op"))) return false;
        if (!h.can("employeeRecord")) {h.home();return true;}
        JSONObject parent=route.optJSONObject("directoryParent");
        record(route.optLong("employeeId"),str(route,"section"),parent==null?h::home:new DirectoryBack(parent));return true;
    }

    static JSONObject recordVisit(long employee,String section,JSONObject directory){
        JSONObject visit=object("op","employeeRecord","employeeId",employee,"section",section);
        if(directory!=null)set(visit,"directoryParent",copy(directory));return visit;
    }
    void record(long employee,String section,Runnable back) {
        h.page(HR_RECORD, employee==h.ownEmployee?"My profile":"Employee record",back);
        h.route(recordVisit(employee,section,back instanceof DirectoryBack?((DirectoryBack)back).route:null));
        h.subjectRead(object("op","employeeRecord","employeeId",employee),r->{
            JSONObject sections=r.getJSONObject("sections"),caps=r.getJSONObject("capabilities");
            JSONArray job=sections.getJSONArray("employment");
            String name=r.getString("name");
            LinearLayout panel=identity(name, employee, r, field(job,"designation"), 64);
            a.detail(panel,"Employment status",first(status(field(job,"employee_status")),"Unavailable"));
            boolean own=employee==h.ownEmployee && r.optBoolean("own");
            ArrayList<String> options=new ArrayList<>();
            options.add("Overview"); options.add("Employment and contact");
            String[][] domains={{"work","Work and readiness"},{"ppeAssets","PPE and assets"},{"dependents","Dependents"},
                {"onboarding","Onboarding"},{"pro","PRO processes"},{"accommodation","Accommodation"},{"offboarding","Offboarding and clearance"},
                {"issuedDocuments","Issued documents"}};
            for(String[] domain:domains) if(caps.optBoolean(domain[0])) options.add(domain[1]);
            if(caps.optBoolean("renewals")||caps.optBoolean("linkedDocuments"))options.add("Documents and compliance");
            if(caps.optBoolean("attendance")||caps.optBoolean("leave")||caps.optBoolean("teamCalendar"))options.add("Time and leave");
            if(own && caps.optBoolean("services"))options.add("Service requests");
            String[] labels=options.toArray(new String[0]);
            String current=options.contains(section)?section:"Overview";
            a.action("Section · "+current,()->h.pick("Employee record sections",labels,i->record(employee,labels[i],back)),false);
            Runnable again=()->record(employee,current,back);
            if ("Overview".equals(current)) {
                h.showFields("Personal details",sections.getJSONArray("personal"));
                JSONArray medical=sections.optJSONArray("medical");
                if(medical!=null) h.showFields("Medical details",medical);
                else a.subtitle("Medical details are restricted.");
                contacts(sections,"contacts","Contact",name,employee,again);
            } else if ("Employment and contact".equals(current)){
                h.showFields("Employment",job);
                contacts(sections,"contacts","Contact",name,employee,again);
                contacts(sections,"emergency","Emergency contact",name,0,null);
                if(own && caps.optBoolean("profileCorrection"))a.action("Request a contact correction",()->h.contactForm(r),false);
            } else if ("Time and leave".equals(current)) {
                if(own && caps.optBoolean("leave"))a.action("Leave balances and requests",()->h.leaveHome(employee),false);
                if(own && caps.optBoolean("attendance"))a.action("Attendance and shifts",()->h.attendanceHome(employee),false);
                if(caps.optBoolean("teamCalendar"))a.action("Employee leave calendar",()->h.work.team(true,new Filters(),today(),today(),employee,1),false);
                if(!own && caps.optBoolean("leave")){
                    historyAction(employee,"leaveBalances","",again);historyAction(employee,"leaveRequests","",again);
                }
                if(!own && caps.optBoolean("attendance"))for(String k:new String[]{"attendance","punch","shift","overtime"})historyAction(employee,"time",k,again);
            } else if("Documents and compliance".equals(current)) {
                if(caps.optBoolean("linkedDocuments"))a.action("Linked employee documents",()->a.dms.docs.employeeFolder(employee,1,again),true);
                if(own&&caps.optBoolean("renewals"))a.action("Renewals and replacement evidence",()->h.renewalsHome(employee),false);
                else{
                    if(caps.optBoolean("renewalCompliance"))for(String k:new String[]{"identity-document","access-card","training-certificate"})historyAction(employee,"renewals",k,again);
                    if(caps.optBoolean("renewalMedical"))historyAction(employee,"renewals","medical-insurance",again);
                }
            }
            else if("Service requests".equals(current)) h.services.ownHome(employee);
            else h.work.section(current,employee,own,again);
        });
    }

    private void historyAction(long employee,String op,String kind,Runnable back){
        String name=title(kind.isEmpty()?op:kind);
        a.action(name,()->history(employee,op,kind,op.equals("leaveBalances")?0:1,back),false);
    }
    void history(long e,String op,String kind,long index,Runnable back){
        boolean cursor=op.equals("leaveBalances");
        h.page(title(kind.isEmpty()?op:kind),back);
        JSONObject command=object("op",op,"employeeId",e,cursor?"after":"page",index);
        if(!kind.isEmpty())set(command,"kind",kind);
        h.route(object("op","employeeHistory","employeeId",e,"domain",op,"kind",kind,"index",index));
        HrWorkspace.Screen screen=h.new Screen();
        h.load("Reading employee records",()->{
            // Legacy list envelopes have no subject echo. Pair the exact request with a fresh selected-person authority check.
            JSONObject rows=screen.api.hrGet(command);
            screen.requireCurrentSession();
            JSONObject opening=screen.api.hrGet(object("op","employeeRecord","employeeId",e));
            String cap=op.equals("time")?"attendance":op.equals("renewals")?(kind.equals("medical-insurance")?"renewalMedical":"renewalCompliance"):"leave";
            if(!HrV5Rules.subject(e,opening.optLong("employeeId")) || !opening.getJSONObject("capabilities").optBoolean(cap))
                throw new ErpApi.Rejected("Record access changed.",403,null);
            return rows;
        },r->{
            JSONArray rows=r.getJSONArray("rows");
            if(rows.length()==0)a.subtitle("No records are available for this selection.");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);LinearLayout panel=a.card(str(row,"label"),str(row,"status"),null);
                details(panel,row,"date","detail","startDate","endDate","expiryDate");
                if(cursor && row.optBoolean("known"))details(panel,row,"entitled","earned","used","reserved","available");
                else if(cursor)a.detail(panel,"Balance",first(str(row,"reviewReason"),"Unavailable for this period"));
            }
            if(index>(cursor?0:1))a.action(cursor?"First balances":"Previous page",()->history(e,op,kind,cursor?0:index-1,back),false);
            if(r.optBoolean("more") && rows.length()>0)a.action("More records",()->history(e,op,kind,cursor?rows.optJSONObject(rows.length()-1).optLong("id"):index+1,back),false);
        });
    }

    private static String field(JSONArray fields,String key) {
        for(int i=0;i<fields.length();i++){JSONObject f=fields.optJSONObject(i);if(key.equals(str(f,"key")))return str(f,"value");}
        return "";
    }

    private void contacts(JSONObject sections,String key,String heading,String name,long employee,Runnable back) throws Exception {
        JSONArray rows=sections.getJSONArray(key);
        LinearLayout card=a.card(heading,"",null);
        if(rows.length()==0) a.detail(card,heading,"Unavailable with current access");
        for(int i=0;i<rows.length();i++){
            JSONObject f=rows.getJSONObject(i);
            String value=str(f,"value"),label=str(f,"label");
            a.detail(card,label,first(value,"No value recorded"));
            if(f.optBoolean("dialable"))call(card,"Call "+name+" · "+label,value);
        }
        if (employee > 0) a.communications.addEmployeeMessage(card, employee, back);
    }
}
