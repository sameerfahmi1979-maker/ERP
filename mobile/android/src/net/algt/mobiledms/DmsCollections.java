package net.algt.mobiledms;
import android.widget.EditText;
import org.json.*;
import java.util.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

final class DmsCollections {
    final DmsWorkspace ui;final LauncherActivity a;
    DmsCollections(DmsWorkspace u){ui=u;a=u.a;}
    void natural(String query,JSONObject parent,int page){
        Runnable here=()->natural(query,parent,page);
        if(!ui.page("Search in plain language",ui::hub,ui::hub))return;EditText text=ui.input("Question or search terms",query,500);
        if(parent!=null)ui.line(parent,"entityType","entityId");
        ui.action("Choose exact employee or site",()->ui.subject("employee","",p->natural(a.value(text),p,1),here),false);
        ui.action("Search",()->runNatural(a.value(text),parent,1),true);
    }
    void runNatural(String query,JSONObject subject,int page){
        if(query.length()<3){a.message("Enter at least three characters.",true);return;}
        Runnable back=()->natural(query,subject,page);if(!ui.page("Search results",back,back))return;
        JSONObject b=cmd("documentNaturalSearch","query",query,"page",page);if(subject!=null)put(b,"subject",subject);
        ui.read(b,r->{String outcome=str(r,"outcome");
            if("clarification_required".equals(outcome)){a.subtitle(str(r,"message"));ui.action("Choose exact employee or site",()->ui.subject("employee","",p->natural(query,p,1),back),true);return;}
            a.subtitle(r.getLong("totalCount")+" matches · "+str(r,"asOf"));
            for(JSONObject hit:rows(r,"rows")){long id=id(hit,"id");hash(hit,"sourceHash");ui.card(str(hit,"title"),str(hit,"number")+" · "+str(hit,"matchSource")+" "+str(hit,"snippet"),()->ui.docs.detail(id,subject,()->runNatural(query,subject,page)));}
            if(page>1)ui.action("Previous",()->runNatural(query,subject,page-1),false);if(r.optBoolean("hasMore"))ui.action("Next",()->runNatural(query,subject,page+1),false);
        });
    }
    void notifications(boolean unread,int page){
        Runnable here=()->notifications(unread,page);if(!ui.page("Notifications",ui::parent,here))return;
        ui.action(unread?"All notifications":"Unread only",()->notifications(!unread,1),false);
        ui.read(cmd("documentNotifications","page",page,"unreadOnly",unread),r->{
            for(JSONObject n:rows(r,"rows")){long id=id(n,"id");ui.card(str(n,"title"),str(n,"message")+" · "+str(n,"status"),null);
                JSONObject dest=n.optJSONObject("target");if(dest!=null)target(dest,here);
                for(String action:new String[]{"read","dismiss"})if(!action.equals("read")||n.isNull("readAt"))ui.action(action.equals("read")?"Mark read":"Dismiss",()->ui.read(cmd("documentNotificationAction","notificationId",id,"action",action),ok->{DmsArchive.check(id(ok,"notificationId")==id);here.run();}),false);
            }ui.pages(r,page,n->notifications(unread,n));});
    }
    void target(JSONObject t,Runnable back)throws Exception{
        switch(str(t,"kind")){
            case "document":long id=id(t,"documentId");String section=str(t,"section");if(!Arrays.asList("overview","history","approvals","review","renewals").contains(section))return;
                ui.action("Open "+section,()->{if(section.equals("history"))ui.docs.history(id,"all",1,back);else if(section.equals("overview"))ui.docs.detail(id,null,back);else notificationSection(id,section,1,back);},false);break;
            case "request":long request=id(t,"requestId");String kind=str(t,"requestKind");if(Arrays.asList("renewal","missing").contains(kind))ui.action("Open request",()->ui.requests.list("mine",null,1,request,kind),false);break;
            case "upload":String code=str(t,"sessionCode");if(code.matches("[A-Za-z0-9_-]{1,64}"))ui.action("View upload status",()->ui.work("Opening upload status",ticket->ticket.api.get(cmd("intake","code",code)),r->ui.line(r,"name","code","status","aiStatus","documentId"),null),false);break;
        }
    }
    void notificationSection(long id,String section,int page,Runnable back){
        if(!ui.page("Document "+section,back,back))return;
        ui.read(cmd("documentDetails","documentId",id),doc->{ui.line(doc,"title","number","status");ui.line(doc.getJSONObject("lifecycle"),"stage","next","owner","blocker");
            if(section.equals("review")){ui.action("Open document overview",()->ui.docs.detail(id,null,back),false);return;}
            ui.work("Checking permitted "+section,t->t.api.get(cmd("tasks","kind",section,"page",page)),r->{boolean found=false;for(JSONObject row:rows(r,"rows"))if(row.optLong("documentId")==id){found=true;ui.line(row,"title","status","description","expiry");}
                if(!found)a.subtitle("No matching task on this page.");if(page>1)ui.action("Previous",()->notificationSection(id,section,page-1,back),false);if(r.optBoolean("more"))ui.action("Next",()->notificationSection(id,section,page+1,back),false);},null);});
    }
    void favourite(long id,boolean value,Runnable done){ui.read(cmd("documentFavouriteSet","documentId",id,"value",value),r->{DmsArchive.check(id(r,"documentId")==id && r.getBoolean("value")==value);done.run();a.message(value?"Favourite added.":"Favourite removed.",false);});}
    void favourites(int page){Runnable here=()->favourites(page);if(!ui.page("Favourites",ui::hub,here))return;
        ui.read(cmd("documentFavourites","page",page),r->{for(JSONObject d:rows(r,"rows")){long id=id(d,"documentId");ui.card(str(d,"title"),str(d,"number")+" "+str(d,"savedAt"),()->ui.docs.detail(id,null,here));ui.action("Remove favourite",()->ui.confirm("Remove favourite?",str(d,"title"),()->favourite(id,false,here)),false);}ui.pages(r,page,this::favourites);});}
    static JSONObject criteria(JSONObject original)throws Exception{
        JSONObject c=copy(original);Iterator<String> keys=c.keys();while(keys.hasNext())DmsArchive.check(Arrays.asList("version","search","personal","entityType","entityId","typeId","validity").contains(keys.next()));
        DmsArchive.check(c.getInt("version")==1&&c.get("personal") instanceof Boolean&&c.getString("search").length()<=200&&Arrays.asList("all","valid","expired","expiring").contains(c.getString("validity")));
        DmsArchive.check(c.has("entityType")==c.has("entityId"));if(c.has("entityType"))DmsArchive.check(!c.getBoolean("personal")&&Arrays.asList("employee","site").contains(c.getString("entityType"))&&id(c,"entityId")>0);
        if(c.has("typeId"))id(c,"typeId");return c;
    }
    void filters(int page){Runnable here=()->filters(page);if(!ui.page("Saved searches",ui::hub,here))return;
        ui.read(cmd("documentSavedFilters","page",page),r->{for(JSONObject f:rows(r,"rows")){JSONObject c=criteria(f.getJSONObject("criteria"));
            ui.card(str(f,"name"),str(c,"search")+" · "+str(c,"validity"),()->a.mobile().applyCriteria(c,here));ui.action("Edit saved search",()->save(f,c,here),false);
            ui.action("Delete saved search",()->ui.confirm("Delete saved search?",str(f,"name"),()->ui.mutate(cmd("documentSavedFilterDelete","id",f.optLong("id"),"revision",str(f,"revision")),"filter/"+f.optLong("id"),ok->here.run())),false);
        }ui.pages(r,page,this::filters);});}
    void save(JSONObject original,JSONObject criteria,Runnable back){
        if(!ui.page(original==null?"Save this search":"Edit saved search",back,back))return;
        EditText name=ui.input("Private search label",str(original,"name"),80),query=ui.input("Search terms",str(criteria,"search"),200);
        EditText status=a.mobile().optionField(a.content,"Validity",str(criteria,"validity"),object("type","select","options",new JSONArray(Arrays.asList("all","valid","expiring","expired"))));
        ui.line(criteria,"personal","entityType","entityId","typeId");
        ui.action("Save search",()->{try{if(a.value(name).isEmpty())throw new java.io.IOException("Enter a label.");JSONObject c=copy(criteria);put(c,"validity",a.value(status));put(c,"search",a.value(query));
            JSONObject b=cmd("documentSavedFilterSave","name",a.value(name),"criteria",criteria(c));if(original!=null){put(b,"id",original.optLong("id"));put(b,"revision",str(original,"revision"));}
            ui.mutate(b,"filter/"+(original==null?"new":original.optLong("id")),ok->filters(1));
        }catch(Exception error){ui.error(error);}},true);
    }
}
