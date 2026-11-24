package net.algt.mobiledms;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.json.*;
import static net.algt.mobiledms.ErpApi.object;

/** Exercises production request/state logic using a synthetic authenticated transport. */
public final class CommunicationBudgetWorkspaceTest {
    static int assertions;
    static void check(boolean ok,String label){assertions++;if(!ok)throw new AssertionError(label);}
    interface Job {void run()throws Exception;}
    static void denied(Job job,String label)throws Exception {
        try{job.run();throw new AssertionError(label);}catch(IOException expected){assertions++;}
    }
    static JSONObject status(boolean owner,boolean monitor,JSONObject approval){
        return object("scope","communications","ownerBound",true,"canMonitor",monitor,"canApprove",owner,
            "approval",approval==null?JSONObject.NULL:approval,"paused",object(),
            "heldReasons",new JSONArray().put("provider_evidence_required"),"disabledFeatures",new JSONArray().put("chat"));
    }
    static final class Server implements CommunicationBudgetWorkspace.Transport {
        JSONObject response=status(true,true,null);
        final List<JSONObject> requests=new ArrayList<>();
        int fail;
        Runnable after=()->{};
        public JSONObject call(String op,JSONObject args)throws Exception{
            requests.add(object("op",op,"args",new JSONObject(args.toString())));
            if(fail-->0)throw new IOException("Connection interrupted");
            after.run();return op.equals("budget.status")?response:object("ok",true,"id",args.optString("clientMutationId"));
        }
    }
    static CommunicationBudgetWorkspace.Control control(Server server,AtomicBoolean live,AtomicLong now){
        return new CommunicationBudgetWorkspace.Control(server,live::get,now::get);
    }
    static void approval()throws Exception{
        Server server=new Server();AtomicBoolean live=new AtomicBoolean(true);
        AtomicLong now=new AtomicLong(Instant.parse("2026-11-24T10:00:00Z").toEpochMilli());
        CommunicationBudgetWorkspace.Control c=control(server,live,now);
        denied(c::approve,"No approval before current server status");
        c.load();check(c.canApprove(),"Bound owner can confirm");
        check(server.requests.get(0).getJSONObject("args").length()==1,"Status has only fixed scope");
        server.fail=1;denied(c::approve,"Interrupted approval remains unconfirmed");
        JSONObject first=server.requests.get(1).getJSONObject("args");
        c.approve();JSONObject retry=server.requests.get(2).getJSONObject("args");
        check(first.toString().equals(retry.toString()),"Retry uses exact original UUID and payload");
        check("communications".equals(first.getString("scope"))&&"USD".equals(first.getString("currency")),"Fixed scope and currency");
        check("5000000".equals(first.getString("maxMicros")),"USD5 total ceiling");
        check("2026-11-30T19:59:00Z".equals(first.getString("endsAt")),"Exact approved Dubai deadline");
        UUID.fromString(first.getString("clientMutationId"));
        check(first.length()==6&&first.getJSONArray("features").length()==9,"Only budget fields and nine reviewed features");
        check(!c.canApprove(),"Confirmed approval cannot be repeated as a new grant");
        denied(c::approve,"Confirmed grant is not renewed");
        String id=first.getString("clientMutationId");
        server.response=status(true,true,object("id",id,"maxMicros","5000000","spentMicros","1000000","reservedMicros","500000","currency","USD","endsAt",first.getString("endsAt")));
        c.load();check(!c.canApprove(),"Current active grant disables another approval");
        check("USD 3.500000".equals(CommunicationBudgetWorkspace.remaining(server.response.getJSONObject("approval"))),"Remaining subtracts settled and reserved exactly");
    }
    static void access()throws Exception{
        AtomicBoolean live=new AtomicBoolean(true);AtomicLong now=new AtomicLong(Instant.parse("2026-11-24T10:00:00Z").toEpochMilli());
        Server server=new Server();CommunicationBudgetWorkspace.Control c=control(server,live,now);
        server.response=status(false,true,null);c.load();check(c.canMonitor()&&!c.canApprove(),"Monitor can read and pause but cannot approve");
        denied(c::approve,"Monitor approval blocked before transport");
        int count=server.requests.size();c.pause("chat");
        JSONObject pause=server.requests.get(count);
        check("budget.pause".equals(pause.getString("op"))&&"communications".equals(pause.getJSONObject("args").getString("scope")),"Pause uses authenticated fixed scope");
        check(pause.getJSONObject("args").length()==4,"Pause has no authority or account fields");
        denied(()->c.pause("unknown"),"Unknown feature rejected");
        server.response=status(false,false,null);c.load();check(!c.canMonitor(),"Denied user cannot view financial detail");
        denied(()->c.pause("chat"),"Denied user cannot pause");
        server.response=status(true,true,null).put("ownerBound",false);c.load();denied(c::approve,"Unbound owner denied");
        server.response=status(true,true,null).put("scope","other");denied(c::load,"Wrong scope rejected");
        server.response=status(true,true,null);c.load();
        server.response=status(true,true,null).put("canApprove","true");denied(c::load,"String authority is not a boolean grant");
        check(!c.canApprove(),"Failed refresh invalidates previous authority");
        server.response=status(true,true,null).put("approval","malformed");denied(c::load,"Malformed active approval is not empty authority");
        server.response=status(true,true,null);c.load();now.set(Instant.parse("2026-11-30T19:59:00Z").toEpochMilli());
        check(!c.canApprove(),"Exact pilot expiry blocks approval");denied(c::approve,"Expired pilot is not renewed");
    }
    static void fencing()throws Exception{
        Server server=new Server();AtomicBoolean live=new AtomicBoolean(true);AtomicLong now=new AtomicLong(0);
        CommunicationBudgetWorkspace.Control c=control(server,live,now);c.load();live.set(false);
        int count=server.requests.size();denied(c::approve,"Changed login denied");check(count==server.requests.size(),"Stale visit sends no approval");
        live.set(true);server.after=()->live.set(false);denied(c::load,"Late response cannot replace status");
        check(!c.canMonitor(),"Hidden/stale session cannot expose cached detail");
    }
    static void remount()throws Exception{
        Server server=new Server();AtomicBoolean live=new AtomicBoolean(true);AtomicLong now=new AtomicLong(0);
        CommunicationBudgetWorkspace.Control first=control(server,live,now);first.load();server.fail=1;denied(first::approve,"Uncertain approval");
        JSONObject original=server.requests.get(1).getJSONObject("args");live.set(false);
        AtomicBoolean nextLive=new AtomicBoolean(true);
        CommunicationBudgetWorkspace.Control next=new CommunicationBudgetWorkspace.Control(server,nextLive::get,now::get,first);
        check(!next.canApprove(),"Remount requires fresh status");next.load();next.approve();
        check(original.toString().equals(server.requests.get(3).getJSONObject("args").toString()),"Remount keeps the exact uncertain original");
        denied(first::approve,"Old visit cannot send after remount");
    }
    static void feedback(){
        String auth=CommunicationBudgetWorkspace.failureMessage("budget.approve",new ErpApi.Rejected(403));
        check(auth.contains("sameer@algt.net")&&auth.contains("5 minutes")&&auth.contains("password")&&auth.contains("MFA"),"Rejected recent authentication has actionable owner sign-in guidance");
        check(!CommunicationBudgetWorkspace.failureMessage("budget.pause",new ErpApi.Rejected(403)).contains("5 minutes"),"Monitor pause denial does not imply owner authentication");
        check("USD 0.000001".equals(CommunicationBudgetWorkspace.money("1")),"Exact microdollar display");
        check("Unavailable".equals(CommunicationBudgetWorkspace.money("-1")),"Invalid amount is never zero");
        check("Unavailable".equals(CommunicationBudgetWorkspace.remaining(object("maxMicros","5","spentMicros","6","reservedMicros","0"))),"Overspend is never shown as available balance");
        check(CommunicationBudgetWorkspace.PILOT_CONFIRMATION.contains("USD 5")&&CommunicationBudgetWorkspace.PILOT_CONFIRMATION.contains("30 November 2026 at 23:59 Dubai")&&CommunicationBudgetWorkspace.PILOT_CONFIRMATION.contains("No automatic renewal"),"Confirmation spells out cap, deadline and no renewal");
    }
    static void await(BooleanSupplier condition,String label)throws Exception{
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(!condition.getAsBoolean()&&System.nanoTime()<deadline)Thread.sleep(5);
        check(condition.getAsBoolean(),label);
    }
    static boolean contains(List<String> rows,String text){for(String row:rows)if(row.contains(text))return true;return false;}
    static void nativeEntry()throws Exception{
        LauncherActivity a=new LauncherActivity();AtomicBoolean approved=new AtomicBoolean();
        a.api.handler=command->{
            if("budget.approve".equals(command.getString("op"))){approved.set(true);return object("ok",true,"id",command.getJSONObject("args").getString("clientMutationId"));}
            return status(true,true,approved.get()?object("id","fixture","maxMicros","5000000","spentMicros","0","reservedMicros","0","endsAt",CommunicationBudgetWorkspace.PILOT_END):null);
        };
        CommunicationBudgetWorkspace workspace=new CommunicationBudgetWorkspace(a);
        try{
            workspace.home(()->{});await(()->a.actions.containsKey("Review USD 5 pilot approval"),"Native owner entry renders confirmation action");
            check(contains(a.cards,"provider and operating evidence")&&contains(a.cards,"Feature gates off"),"Native screen shows operating and feature holds");
            check(a.api.requests.size()==1&&"budget.status".equals(a.api.requests.get(0).getString("op")),"Opening is read only");
            a.actions.get("Review USD 5 pilot approval").run();
            check(a.dialog.message.equals(CommunicationBudgetWorkspace.PILOT_CONFIRMATION)&&"Approve USD 5 total".equals(a.dialog.label),"Native dialog contains exact pilot policy");
            check(a.api.requests.size()==1,"Review alone does not approve");
            a.dialog.positive.accept(null,1);await(()->approved.get(),"Explicit native confirmation invokes owner API");
            await(()->contains(a.cards,"Current usage"),"Confirmed approval refreshes current usage");
            check(!a.actions.containsKey("Review USD 5 pilot approval"),"Active grant has no renewal action");
            JSONObject body=a.api.requests.get(1);check("budget.approve".equals(body.getString("op"))&&"5000000".equals(body.getJSONObject("args").getString("maxMicros")),"Native entry sends authenticated fixed approval command");
        }finally{workspace.close();}
        LauncherActivity monitor=new LauncherActivity();monitor.api.handler=command->status(false,true,null);
        CommunicationBudgetWorkspace monitors=new CommunicationBudgetWorkspace(monitor);
        try{
            monitors.home(()->{});await(()->monitor.actions.containsKey("Pause Messages"),"Monitor sees pause controls");
            check(!monitor.actions.containsKey("Review USD 5 pilot approval"),"Monitor never sees owner confirm action");
        }finally{monitors.close();}
        LauncherActivity guest=new LauncherActivity();guest.api.handler=command->status(false,false,null);
        CommunicationBudgetWorkspace guests=new CommunicationBudgetWorkspace(guest);
        try{
            guests.home(()->{});await(()->contains(guest.cards,"Access required"),"Unassigned user sees access explanation");
            check(!contains(guest.cards,"Current usage")&&!guest.actions.containsKey("Pause Messages"),"Unassigned user sees no financial detail or pause control");
        }finally{guests.close();}
    }
    static void staleDialog()throws Exception{
        LauncherActivity a=new LauncherActivity();a.api.handler=command->status(true,true,null);
        CommunicationBudgetWorkspace workspace=new CommunicationBudgetWorkspace(a);
        try{
            workspace.home(()->{});await(()->a.actions.containsKey("Review USD 5 pilot approval"),"Owner screen ready for stale-dialog check");
            a.actions.get("Review USD 5 pilot approval").run();LauncherActivity.DialogBuilder old=a.dialog;
            a.page(MobileRoute.Id.CHAT_PAGE,()->{},true);old.positive.accept(null,1);
            check(a.api.requests.size()==1,"Leaving the native visit invalidates an open confirmation dialog");
        }finally{workspace.close();}
    }
    static void shellIntegration()throws Exception{
        LauncherActivity a=new LauncherActivity();AtomicBoolean eligible=new AtomicBoolean(true);
        a.api.handler=command->{
            if("communications.profile".equals(command.getString("op")))return object("profileId","1","chat",object("eligible",false),"ptt",object("eligible",false),"budget",object("eligible",eligible.get()));
            return status(true,true,null);
        };
        CommunicationBudgetWorkspace budget=new CommunicationBudgetWorkspace(a);
        try{
            a.communications.mountBudget(budget);
            android.widget.LinearLayout rows=new android.widget.LinearLayout();
            android.widget.Button messages=new android.widget.Button(),ptt=new android.widget.Button(),button=new android.widget.Button();
            a.communications.bindRows(rows,messages,ptt,button);
            check(rows.visibility==android.view.View.GONE&&button.visibility==android.view.View.GONE,"Unverified budget entry starts hidden");
            AtomicBoolean refreshed=new AtomicBoolean();a.communications.refreshAccess(()->refreshed.set(true));
            await(refreshed::get,"Own authenticated profile verified");
            check(a.communications.available()&&rows.visibility==android.view.View.VISIBLE&&button.visibility==android.view.View.VISIBLE,"Budget-only profile can enter the shell while chat and PTT are off");
            check(messages.visibility==android.view.View.GONE&&ptt.visibility==android.view.View.GONE,"Budget visibility does not enable chat/PTT entries");
            a.communications.mountNotifications(new MobileCommunications.Notifications(){public void home(Runnable back){}public void openEvent(String id,Runnable back){}});
            android.view.View notificationButton=new android.view.View();a.communications.bindNotificationButton(notificationButton);
            check(notificationButton.visibility==android.view.View.GONE,"Budget-only shell preserves existing service notification visibility");
            Runnable stale=a.communications.budgetEntry(()->{});a.visit++;int count=a.api.requests.size();stale.run();
            check(a.api.requests.size()==count,"Budget shell action is tied to the original view");
            a.communications.budgetEntry(()->{}).run();await(()->a.actions.containsKey("Review USD 5 pilot approval"),"Current native shell button opens owner workspace");
            Runnable oldLogin=a.communications.budgetEntry(()->{});count=a.api.requests.size();a.api.epoch++;oldLogin.run();
            check(a.api.requests.size()==count&&!a.communications.available(),"Sign-in epoch change invalidates budget entry and verified eligibility");
            a.communications.invalidateAccess();check(!a.communications.available(),"Revoked verified profile removes shell availability");
            eligible.set(false);refreshed.set(false);a.communications.refreshAccess(()->refreshed.set(true));await(refreshed::get,"Revoked budget eligibility refreshed");
            count=a.api.requests.size();a.communications.budgetEntry(()->{}).run();check(a.api.requests.size()==count,"Ineligible account cannot open budget workspace");
        }finally{a.communications.close();}
        int count=a.api.requests.size();budget.home(()->{});check(a.api.requests.size()==count,"Shell destruction closes retained budget workspace");
    }
    public static void main(String[] args)throws Exception{
        approval();access();fencing();remount();feedback();nativeEntry();staleDialog();shellIntegration();System.out.println("CommunicationBudgetWorkspaceTest passed: "+assertions+" assertions");
    }
}
