package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.content.Intent;
import android.view.View;
import android.widget.EditText;
import org.json.*;
import java.io.*;
import java.util.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

final class DmsWorkspace {
    final LauncherActivity a;
    final DmsDocuments docs;final DmsRequests requests;final DmsCollections collections;final DmsSharing sharing;final DmsCapture capture;final DocumentPacks packs;
    volatile Ticket current;private Runnable resume;private volatile boolean hidden;
    final class Ticket{
        final LauncherActivity a=DmsWorkspace.this.a;final ErpApi api=a.api;
        final String owner=api.user();final long epoch=api.sessionEpoch(),generation=LocalSecurity.generation(a);
        volatile boolean working;
        DmsIntakeEntry.Visit intake;
        OnlineListVisit online;
        boolean owns(){return api==a.api&&DmsRules.admitted(owner,epoch,generation,api.user(),api.sessionEpoch(),LocalSecurity.generation(a),LocalSecurity.isAccount(a,owner)&&LocalSecurity.remaining(a,owner,false)!=0,0,1);}
        void requireOriginIdentity()throws IOException{
            DmsArchive.check(api==a.api&&owner.equals(api.user())&&epoch==api.sessionEpoch());
            LocalSecurity.requireAccount(a,owner,generation);
        }
        boolean mounted(){return current==this&&owns();}
        private boolean visiblePage(){return mounted()&&a.hrActive()&&!hidden;}
        boolean visible(){if(online!=null)return online.visible();return intake==null?visiblePage():intake.getAsBoolean();}
        void retireIntake(){if(intake!=null)intake.retire();}
        void require()throws IOException{DmsArchive.check(visible());}
        void requireOwner()throws IOException{DmsArchive.check(owns());}
    }
    interface Work<T>{T get(Ticket t)throws Exception;}
    interface Show<T>{void show(T value)throws Exception;}
    interface Open{void open(JSONObject row);}
    interface Failure{void show(Exception error);}
    DmsWorkspace(LauncherActivity a){this.a=a;docs=new DmsDocuments(this);requests=new DmsRequests(this);collections=new DmsCollections(this);sharing=new DmsSharing(this);capture=new DmsCapture(this);packs=new DocumentPacks(this);}
    boolean available(){return a.profile!=null&&VERSION.equals(str(a.profile,"dmsContractVersion"));}
    boolean enabled(String feature){JSONObject f=a.profile==null?null:a.profile.optJSONObject("dmsFeatures");return available()&&f!=null&&f.optBoolean(feature);}
    void leaving(){if(current!=null)current.retireIntake();current=null;resume=null;hidden=false;sharing.retireCreated();capture.endReview();}
    boolean mountReview(DmsReviewContext member){
        Ticket next=new Ticket();
        if(!next.owns()||!member.owner.equals(next.owner)||member.epoch!=next.epoch||member.generation!=next.generation||!a.hrActive())return false;
        current=next;capture.mountedReview=member;resume=()->capture.member(member.member);return true;
    }

    boolean mountOrdinaryForm(DmsIntakeEntry source, Runnable reopen) {
        Ticket visit = new Ticket();
        if (source == null || source.api != visit.api || !source.origin(visit.owner,visit.epoch,visit.generation)
                || !visit.owns() || !a.hrActive()) return false;
        visit.intake = new DmsIntakeEntry.Visit(visit::visiblePage);
        current = visit;
        resume = reopen;
        return true;
    }

    void locked(){DmsSharing.Incoming link=sharing.incoming;clear();sharing.incoming=link;}
    void signedOut(){DmsSharing.Incoming pending=sharing.incoming;boolean initial=a.api==null||a.api.user().isEmpty();clear();sharing.incoming=DmsSharing.Incoming.acrossSignIn(pending,initial);}
    void clear(){leaving();sharing.clear();capture.reset();requests.clear();packs.clear();docs.clear();DmsPrivateFiles.sweep(a,true);}
    void pause(){if(current!=null){
        current.retireIntake();hidden=true;a.closeDmsDialog();a.root.setVisibility(View.INVISIBLE);
        if(current.online!=null)current.online.hide(()->{a.content.removeAllViews();a.message("",false);});
    }}
    void onlinePage(MobileRoute.Id id,Runnable back,Runnable reopen){
        onlinePage(id,back,reopen,true);
    }
    void onlinePage(MobileRoute.Id id,Runnable back,Runnable reopen,boolean navigation){
        a.page(id,back,navigation);
        Ticket visit=new Ticket();
        visit.online=new OnlineListVisit(()->visit.mounted()&&a.onlineForeground()&&!hidden,reopen);
        current=visit;
        if(!a.onlineForeground())pause();
    }
    void foreground(){
        DmsPrivateFiles.sweep(a,false);
        if(!hidden||current==null)return;
        if(current.online!=null){current.online.resume(current::owns,()->{clear();a.resumeAccount();});return;}
        if(!current.owns()){clear();a.unlockAndOpen();return;}
        if(current.intake!=null){Runnable reopen=resume;if(reopen!=null)reopen.run();return;}
        if(capture.awaiting()){if(capture.resumeResult()){hidden=false;a.root.setVisibility(View.VISIBLE);capture.deliver();}return;}
        Runnable route=resume;hidden=false;if(route!=null)route.run();else hub();
    }
    DmsIntakeEntry intakeSource(long id,String code){
        ErpApi api=a.api;
        return new DmsIntakeEntry(api,api.user(),api.sessionEpoch(),LocalSecurity.generation(a),id,code);
    }
    void intakePage(MobileRoute.Id id,DmsIntakeEntry source,String title,Runnable back,Runnable reopen,Show<JSONObject> ordinary){
        intakePage(id,source,title,back,reopen,a.captureOrigin(),(live,origin)->ordinary.show(live));
    }

    void intakePage(MobileRoute.Id id,DmsIntakeEntry source,String title,Runnable back,Runnable reopen,
            CaptureOrigin origin,CaptureOrigin.Ordinary ordinary){
        if(source==null||source.api!=a.api||!a.hrActive()||!source.origin(a.api.user(),a.api.sessionEpoch(),LocalSecurity.generation(a))){
            a.unlockAndOpen();return;
        }
        a.page(id,back,false);
        Ticket visit=new Ticket();
        visit.intake=new DmsIntakeEntry.Visit(visit::visiblePage);current=visit;resume=reopen;a.title(title);
        work("Checking this intake",t->{
            DmsArchive.check(t.api==source.api&&source.origin(t.owner,t.epoch,t.generation));
            return source.read(code->t.api.dmsOnce(cmd("intake","code",code),t::visible),()->new DmsQueue(t).read(),t::visible);
        },route->origin.dispatch(route,(op,parent)->{
                if(available())capture.memberFrom(op,parent.memberParent());else a.message("This upload requires the document queue. Refresh ERP access.",true);
            },ordinary),null);
    }
    boolean taskPage(Runnable back,Runnable reopen){
        if(!a.hrActive() || !a.capability("tasks")){a.unlockAndOpen();return false;}
        a.page(TASK,back,true);
        Ticket visit=new Ticket();
        visit.intake=new DmsIntakeEntry.Visit(visit::visiblePage);
        current=visit;resume=reopen;
        return true;
    }

    boolean page(String title,Runnable back,Runnable reopen){ return page(DMS_PAGE,title,back,reopen); }
    boolean page(MobileRoute.Id id,String title,Runnable back,Runnable reopen){
        if(!a.hrActive()||!available()){a.unlockAndOpen();return false;}
        a.page(id,back,!id.viewer());current=new Ticket();resume=reopen==null?this::hub:reopen;a.title(title);return true;
    }
    void hub(){ a.mobile().documentsHome(); }

    void parent() {
        if (a.destination() == MobileRoute.Destination.MORE) a.mobile().settings();
        else if (a.destination() == MobileRoute.Destination.INBOX) a.mobile().inbox();
        else hub();
    }
    void action(String label,Runnable go,boolean primary){Ticket t=current;if(t!=null)a.action(label,()->{if(t.visible()&&!t.working)go.run();},primary);}
    EditText input(String label,String value,int length){return a.field(a.content,label,value,length,android.text.InputType.TYPE_CLASS_TEXT);}
    void line(JSONObject r,String... keys){for(String k:keys){String v=str(r,k);if(!v.isEmpty())a.detail(a.content,HrView.title(k),v);}}
    void card(String title,String details,Runnable open){Ticket t=current;a.card(title,details,open==null?null:()->{if(t.visible()&&!t.working)open.run();});}
    void confirm(String title,String detail,Runnable ok){Ticket t=current;a.dialogBuilder().setTitle(title).setMessage(detail).setNegativeButton("Back",null).setPositiveButton("Confirm",(d,i)->{if(t.visible()&&!t.working)ok.run();}).show();}
    <T> void work(String label,Work<T> work,Show<T> show,Failure fail){
        Ticket t=current;if(t==null||!t.visible()||t.working)return;t.working=true;a.message(label,false);
        a.hrFileTask(()->{T v=null;Exception error=null;try{t.require();v=work.get(t);t.require();}catch(Exception e){error=e;}
            T value=v;Exception problem=error;a.runOnUiThread(()->{
                if ((problem!=null || !t.visible()) && t.intake!=null && value instanceof File) {
                    File temp = (File)value;
                    if (a.getCacheDir().equals(temp.getParentFile()) && temp.getName().startsWith("dms-preview-")) temp.delete();
                }
                if((problem!=null||!t.visible())&&value instanceof DmsPrivateFiles.Entry)((DmsPrivateFiles.Entry)value).remove();
                if((problem!=null||!t.visible())&&value instanceof DmsSharing.Asset)((DmsSharing.Asset)value).entry.remove();
                if((problem!=null||!t.visible())&&value instanceof DmsVisualPdf.Page)((DmsVisualPdf.Page)value).bitmap.recycle();
                t.working=false;if(current==t&&!t.owns()){clear();a.closeDmsDialog();if(a.hrForeground())a.resumeAccount();return;}if(!t.visible())return;a.message("",false);
                try{
                    if(problem!=null&&t.online!=null&&a.at(CONNECT)){a.connectionError(problem);return;}
                    if(accessDenied(problem)){
                        clear();a.closeDmsDialog();a.page(DMS_PAGE,a::openHrParent,true);a.title("Document access unavailable");a.action("Refresh ERP access",a::reconnect,true);return;
                    }
                    if(problem!=null){if(fail!=null)fail.show(problem);else error(problem);}else show.show(value);
                }catch(Exception malformed){error(malformed);}
            });
        });
    }
    static boolean accessDenied(Exception failure){return failure instanceof ErpApi.Rejected&&(((ErpApi.Rejected)failure).status==401||((ErpApi.Rejected)failure).status==403);}
    void error(Exception e){a.message(e instanceof IOException && e.getMessage()!=null?e.getMessage():"The ERP response could not be verified.",true);}
    void read(JSONObject b,Show<JSONObject> show){work("Checking ERP records",t->fetch(t.api,b,t::visible),show,null);}
    void mutate(JSONObject b,String key,Show<JSONObject> show){mutate(b,key,show,null);}
    void mutate(JSONObject b,String key,Show<JSONObject> show,Failure fail){
        work("Submitting the reviewed change",t->{DmsOperationStore store=new DmsOperationStore(t);JSONObject original=store.freeze(b,key);return send(t,store,original);},show,fail);
    }
    JSONObject send(Ticket t,DmsOperationStore store,JSONObject b)throws Exception{
        return DmsSubmission.send(store,b,original->fetch(t.api,original,t::visible));
    }
    void pending(){
        if(!page(DMS_RECEIPTS,"Submission receipts",this::parent,this::pending))return;
        work("Opening encrypted originals",t->new DmsOperationStore(t).all(),list->{
            if(list.length()==0)a.subtitle("No retained submissions.");
            Iterator<String> keys=list.keys();while(keys.hasNext()){
                String key=keys.next();JSONObject p=list.getJSONObject(key),body=new JSONObject(p.getString("payload"));JSONObject receipt=p.optJSONObject("receipt");
                String label=receipt!=null?("failed".equals(str(receipt,"state"))?"ERP confirmed failure":"ERP receipt confirmed"):p.has("observedJob")?"Original ERP job observed":p.optBoolean("conflict")?p.optString("disposition","Source conflict"):p.optBoolean("archived")?"Archived · outcome unconfirmed":p.optBoolean("sourceConflict")?"Source conflicted · check original job":"Outcome unconfirmed";
                card(HrView.title(body.getString("op")),label,null);
                if(receipt!=null){line(receipt,"state","revision","documentId","jobId","expiresAt");action("Acknowledge receipt",()->work("Acknowledging",t->{new DmsOperationStore(t).remove(key,true);return true;},v->pending(),null),false);}
                else if(p.has("observedJob")){
                    action("Open original job #"+p.optLong("observedJob"),()->docs.tracker(body.optLong("documentId"),p.optLong("observedJob"),this::pending),false);
                    action("Acknowledge job observation",()->work("Closing observation",t->{new DmsOperationStore(t).remove(key,false);return true;},v->pending(),null),false);
                }else if(p.optBoolean("conflict")){
                    a.subtitle("Source conflict. Review the current source before creating a new change.");
                    if(body.has("documentId"))action("Open current source",()->docs.detail(body.optLong("documentId"),null,this::pending),false);
                    action("Dismiss conflicted original",()->work("Closing original",t->{new DmsOperationStore(t).remove(key,false);return true;},v->pending(),null),false);
                }else{
                    if(body.has("documentId"))action("Read current document",()->docs.detail(body.optLong("documentId"),null,this::pending),false);
                    if("processingAction".equals(str(body,"op"))){
                        action("Read processing status",()->{
                            JSONObject b=cmd("processingStatus","documentId",body.optLong("documentId"));if(body.has("jobId"))put(b,"jobId",body.optLong("jobId"));
                            work("Inspecting original job",t->{JSONObject status=fetch(t.api,b,t::visible);return new DmsOperationStore(t).observe(body,status);},matched->{
                                if(matched)pending();else docs.tracker(body.optLong("documentId"),body.optLong("jobId"),this::pending);
                            },null);
                        },false);
                    }
                    boolean completeOriginal=!"documentShareCreate".equals(str(body,"op"))||DmsRules.tokenValid(str(body,"token"));
                    if(completeOriginal&&!"processingAction".equals(str(body,"op")))action("Check original ERP receipt",()->work("Reading original receipt",t->new DmsOperationStore(t).lookup(body),confirmed->{
                        if(confirmed)pending();else a.subtitle("The ERP could not confirm this original with current access.");
                    },null),false);
                    if(!p.optBoolean("archived"))action("Archive unconfirmed receipt",()->confirm("Archive this local receipt?","The exact original stays protected against a duplicate.",()->work("Archiving receipt",t->{new DmsOperationStore(t).archive(key);return true;},v->pending(),null)),false);
                    boolean providerAction="processingAction".equals(str(body,"op"))&&!"cancel".equals(str(body,"action"));
                    if(providerAction) a.subtitle("Check the retained job. Its provider action will not be resent.");
                    else if(completeOriginal&&current.epoch==p.getLong("epoch"))action("Recover original submission",()->confirm("Recover original submission?",label,()->work("Checking original submission",t->{DmsOperationStore store=new DmsOperationStore(t);return send(t,store,body);},r->{if("documentShareCreate".equals(str(body,"op")))sharing.created(body.getString("token"),r,this::pending);else pending();},null)),false);
                    else a.subtitle(completeOriginal?"This original belongs to an earlier sign-in. Its outcome is unconfirmed.":"The complete original binding is unavailable. Its outcome is unconfirmed.");
                }
            }
        },null);
    }
    void pages(JSONObject response,int page,java.util.function.IntConsumer open){
        a.subtitle(LauncherActivity.join("Page "+page,response.isNull("totalCount")?"":response.optLong("totalCount")+" records",str(response,"asOf")));
        if(page>1)action("Previous",()->open.accept(page-1),false);
        if(response.optBoolean("hasMore")&&page<100000)action("Next",()->open.accept(page+1),false);
    }
    void selectDoc(String title,JSONObject parent,String query,int page,Open chosen,Runnable back){
        if(!page(title,back,back))return;EditText search=input("Name or document number",query,200);
        action("Search",()->selectDoc(title,parent,a.value(search),1,chosen,back),false);
        JSONObject b=cmd("documents","search",query,"page",page,"validity","all","personal",false);
        if(parent!=null){put(b,"entityType",str(parent,"entityType"));put(b,"entityId",parent.optLong("entityId"));}
        work("Finding permitted documents",t->t.api.get(b),r->{for(JSONObject d:rows(r,"rows"))card(str(d,"title"),str(d,"number"),()->chosen.open(d));
            if(page>1)action("Previous",()->selectDoc(title,parent,query,page-1,chosen,back),false);
            if(page*25L<r.optLong("total"))action("Next",()->selectDoc(title,parent,query,page+1,chosen,back),false);
        },null);
    }
    void subject(String kind,String query,Open chosen,Runnable back){
        if(!page("Choose exact "+kind,back,back))return;EditText input=input("Name or code",query,100);
        action("Find "+kind,()->subject(kind,a.value(input),chosen,back),false);
        action(kind.equals("employee")?"Find a site":"Find an employee",()->subject(kind.equals("employee")?"site":"employee","",chosen,back),false);
        work("Finding permitted records",t->t.api.call(cmd("records","entityType",kind,"search",query)),v->{JSONArray list=v instanceof JSONArray?(JSONArray)v:((JSONObject)v).getJSONArray("rows");for(int i=0;i<list.length();i++){JSONObject r=list.getJSONObject(i);long id=id(r,"id");card(str(r,"label"),str(r,"code")+" "+str(r,"companyLabel"),()->chosen.open(object("entityType",kind,"entityId",id)));}},null);
    }
}
