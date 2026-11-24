package net.algt.mobiledms;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;
import org.json.*;
import static net.algt.mobiledms.ErpApi.object;

/** Native presentation of the existing owner-authenticated ERP budget operator. */
final class CommunicationBudgetWorkspace {
    static final String PILOT_END="2026-11-30T19:59:00Z";
    static final long PILOT_END_MILLIS=Instant.parse(PILOT_END).toEpochMilli();
    private static final String[] FEATURES={"chat","realtime","media_upload","media_download","export","push","ptt_live","ptt_replay","sos"};
    static final String PILOT_CONFIRMATION="Approve a maximum USD 5 total additional communications usage, ending "
        +"30 November 2026 at 23:59 Dubai time. This is a ceiling, not an immediate charge. "
        +"No automatic renewal, new service, subscription, plan upgrade or additional amount. "
        +"Retained history, attachments and recordings stay within an allocated, measured portion of the existing ERP/Supabase plan. "
        +"The server stops new activity when the amount, period or allocated capacity is exhausted or required evidence is stale. "
        +"Approval does not enable features or establish that every feature fits this envelope.";
    private final LauncherActivity a;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile Screen active;
    private volatile boolean closed;
    // Retain an uncertain original only in this workspace and its exact authenticated sign-in.
    private Control retained;
    private ErpApi retainedApi;
    private String retainedOwner;
    private long retainedEpoch,retainedGeneration;

    CommunicationBudgetWorkspace(LauncherActivity activity){a=activity;}

    interface Transport {JSONObject call(String operation,JSONObject fields)throws Exception;}
    interface Job<T> {T run()throws Exception;}

    /** Client checks improve presentation only. Every command is authorized again by ERP/SQL. */
    static final class Control {
        private final Transport transport;
        private final BooleanSupplier live;
        private final LongSupplier now;
        private volatile JSONObject status;
        private final Decisions decisions;
        private static final class Decisions {
            volatile boolean confirmed;
            JSONObject approvalRequest;
            final Map<String,JSONObject> pauseRequests=new HashMap<>();
        }
        Control(Transport transport,BooleanSupplier live,LongSupplier now){this(transport,live,now,null);}
        Control(Transport transport,BooleanSupplier live,LongSupplier now,Control previous){
            this.transport=transport;this.live=live;this.now=now;decisions=previous==null?new Decisions():previous.decisions;
        }
        private void current()throws IOException {if(!live.getAsBoolean())throw new IOException("Return to this screen after signing in again.");}
        private JSONObject call(String op,JSONObject fields)throws Exception{
            current();JSONObject result=transport.call(op,fields);current();
            if(result==null)throw new IOException("The ERP response is unavailable.");return result;
        }
        JSONObject load()throws Exception{
            status=null;
            JSONObject response=call("budget.status",object("scope","communications"));
            if(!"communications".equals(response.optString("scope")) || !(response.opt("canMonitor") instanceof Boolean)
                || !(response.opt("canApprove") instanceof Boolean)
                || response.optBoolean("canMonitor")&&(!response.has("approval")
                    || !response.isNull("approval")&&response.optJSONObject("approval")==null))
                throw new IOException("The ERP returned an invalid budget status. Refresh before continuing.");
            status=response;return response;
        }
        boolean canMonitor(){return live.getAsBoolean()&&status!=null&&Boolean.TRUE.equals(status.opt("canMonitor"));}
        boolean canApprove(){
            return canMonitor()&&Boolean.TRUE.equals(status.opt("canApprove"))&&Boolean.TRUE.equals(status.opt("ownerBound"))
                &&status.has("approval")&&status.isNull("approval")&&!decisions.confirmed&&now.getAsLong()<PILOT_END_MILLIS;
        }
        JSONObject approve()throws Exception{
            current();if(!canApprove())throw new IOException("Refresh the owner's current budget status before confirming the pilot.");
            if(decisions.approvalRequest==null){
                JSONArray features=new JSONArray();for(String feature:FEATURES)features.put(feature);
                decisions.approvalRequest=object("scope","communications","clientMutationId",UUID.randomUUID().toString(),
                    "currency","USD","maxMicros","5000000","endsAt",PILOT_END,"features",features);
            }
            JSONObject result=call("budget.approve",new JSONObject(decisions.approvalRequest.toString()));
            if(!Boolean.TRUE.equals(result.opt("ok")) || !decisions.approvalRequest.optString("clientMutationId").equals(result.optString("id")))
                throw new IOException("The ERP has not confirmed the original approval. Refresh status before retrying.");
            decisions.confirmed=true;return result;
        }
        JSONObject pause(String feature)throws Exception{
            current();if(!canMonitor()||!Arrays.asList(FEATURES).contains(feature))throw new IOException("Current budget-monitor access is required.");
            JSONObject fields=decisions.pauseRequests.get(feature);
            if(fields==null){fields=object("scope","communications","clientMutationId",UUID.randomUUID().toString(),
                "feature",feature,"reason","Manually paused from the native communications budget screen.");decisions.pauseRequests.put(feature,fields);}
            JSONObject result=call("budget.pause",new JSONObject(fields.toString()));
            if(!Boolean.TRUE.equals(result.opt("ok")))throw new IOException("The ERP has not confirmed this pause. Refresh status before retrying.");
            return result;
        }
    }

    private final class Screen {
        final ErpApi erp=a.api;
        final String owner=erp.user();
        final long epoch=erp.sessionEpoch(),generation=LocalSecurity.generation(a);
        final BooleanSupplier shell=a.communicationsViewTicket();
        final Control control;
        boolean working;
        Screen(){
            Control previous=retainedApi==erp&&owner.equals(retainedOwner)&&retainedEpoch==epoch&&retainedGeneration==generation?retained:null;
            control=new Control((op,fields)->{
                Object result=erp.communicationsCall(object("op",op,"args",fields),this::current);
                if(!(result instanceof JSONObject))throw new IOException("The ERP response is unavailable.");return (JSONObject)result;
            },this::current,System::currentTimeMillis,previous);
            retained=control;retainedApi=erp;retainedOwner=owner;retainedEpoch=epoch;retainedGeneration=generation;
        }
        boolean current(){return !closed&&active==this&&a.api==erp&&erp.signedIn()&&owner.equals(erp.user())
            &&epoch==erp.sessionEpoch()&&generation==LocalSecurity.generation(a)&&LocalSecurity.unlocked(a)&&shell.getAsBoolean();}
    }

    /** Integration entry: mount from More using this account's signed-in ERP session. */
    void home(Runnable back){
        if(closed||a.api==null||!a.api.signedIn())return;
        a.page(MobileRoute.Id.MORE_HOME,back,true);a.title("Communications budget");
        Screen s=new Screen();active=s;
        a.subtitle("Owner approval and current operating holds");
        a.action("Refresh status",()->{if(s.current()&&!s.working)home(back);},false);
        run(s,"budget.status",s.control::load,status->render(s,status,back),()->home(back));
    }
    private <T> void run(Screen s,String op,Job<T> job,Consumer<T> success,Runnable retry){
        if(!s.current()||s.working)return;s.working=true;
        worker.execute(()->{
            try{if(!s.current())return;T result=job.run();a.runOnUiThread(()->{if(s.current()){s.working=false;success.accept(result);}});}
            catch(Exception failure){a.runOnUiThread(()->{
                if(!s.current())return;s.working=false;a.message(failureMessage(op,failure),true);
                a.action("Retry original request",()->{if(s.current()&&!s.working)retry.run();},false);
                if(ownerAuthenticationRejected(op,failure))a.action("Sign out to authenticate again",()->{if(s.current())a.logout();},false);
            });}
        });
    }
    private void render(Screen s,JSONObject status,Runnable back){
        if(!s.current())return;
        if(!s.control.canMonitor()){
            a.card("Access required","Only the bound owner and designated budget monitors can view communications spending.",null);return;
        }
        JSONObject approval=status.optJSONObject("approval");
        if(approval==null)a.card("No active approval","New paid communications activity remains held until the owner records an authenticated approval and operating evidence is ready.",null);
        else{
            a.card("Current approval",money(approval.optString("maxMicros"))+" ceiling · Ends "+dubai(approval.optString("endsAt")),null);
            a.card("Current usage","Settled: "+money(approval.optString("spentMicros"))+"\nReserved: "+money(approval.optString("reservedMicros"))
                +"\nUncommitted balance: "+remaining(approval),null);
        }
        a.section("Current holds");
        JSONArray held=status.optJSONArray("heldReasons"),disabled=status.optJSONArray("disabledFeatures");
        JSONObject paused=status.optJSONObject("paused");boolean any=false;
        if(held!=null)for(int i=0;i<held.length();i++){a.card("Operating hold",reason(held.optString(i)),null);any=true;}
        if(disabled!=null&&disabled.length()>0){a.card("Feature gates off",featureList(disabled),null);any=true;}
        if(paused!=null)for(String feature:FEATURES)if(paused.has(feature)){a.card(label(feature)+" paused",reason(paused.optString(feature)),null);any=true;}
        if(!any)a.subtitle("No additional holds were reported. ERP rechecks every new operation.");
        a.section("Pilot approval");
        a.subtitle(PILOT_CONFIRMATION);
        if(s.control.canApprove()){
            a.subtitle("Sign in as sameer@algt.net with your password or MFA, then confirm within 5 minutes. ERP verifies the bound owner and recent authentication.");
            a.action("Review USD 5 pilot approval",()->confirmApproval(s,back),true);
        }else if(Boolean.TRUE.equals(status.opt("canApprove"))){
            a.subtitle(System.currentTimeMillis()>=PILOT_END_MILLIS?"This pilot period has ended. A new period requires separate owner approval.":
                "An approval is already recorded or owner binding needs review. Refresh status before any further decision.");
        }else a.subtitle("Only the bound spending owner can approve this pilot. Monitor access does not permit approval.");
        a.section("Pause new activity");
        a.subtitle("A pause stops new work for that feature. Existing history is retained. This screen does not resume paused features.");
        for(String feature:FEATURES)if(paused==null||!paused.has(feature))a.action("Pause "+label(feature),()->{
            if(!s.current()||s.working)return;
            a.dialogBuilder().setTitle("Pause "+label(feature)+"?").setMessage("Stop new activity for this feature. Existing history remains retained. Resuming requires a separate operating review.")
                .setNegativeButton("Cancel",null).setPositiveButton("Pause new activity",(d,w)->{
                    if(s.current())run(s,"budget.pause",()->s.control.pause(feature),r->{home(back);a.message(label(feature)+" pause confirmed by ERP.",false);},
                        ()->run(s,"budget.pause",()->s.control.pause(feature),r->home(back),()->home(back)));
                }).show();
        },false);
    }
    private void confirmApproval(Screen s,Runnable back){
        if(!s.current()||s.working||!s.control.canApprove())return;
        a.dialogBuilder().setTitle("Approve USD 5 pilot?").setMessage(PILOT_CONFIRMATION)
            .setNegativeButton("Cancel",null).setPositiveButton("Approve USD 5 total",(d,w)->{
                if(s.current()&&s.control.canApprove())approve(s,back);
            }).show();
    }
    private void approve(Screen s,Runnable back){
        run(s,"budget.approve",s.control::approve,r->{home(back);a.message("ERP confirmed the USD 5 pilot approval. Operating holds are checked separately.",false);},()->approve(s,back));
    }
    void close(){closed=true;active=null;retained=null;worker.shutdownNow();}

    static boolean ownerAuthenticationRejected(String op,Exception failure){
        return "budget.approve".equals(op)&&failure instanceof ErpApi.Rejected
            &&(((ErpApi.Rejected)failure).status==401||((ErpApi.Rejected)failure).status==403);
    }
    static String failureMessage(String op,Exception failure){
        if(ownerAuthenticationRejected(op,failure))return "ERP could not verify recent owner authentication or current owner access. "
            +"Sign out, sign in again as sameer@algt.net using your password or MFA, return here, and confirm within 5 minutes.";
        if(failure instanceof ErpApi.Rejected&&(((ErpApi.Rejected)failure).status==401||((ErpApi.Rejected)failure).status==403))
            return "ERP denied current access. Sign in again and refresh status; budget-monitor access must still be assigned.";
        return "ERP could not confirm this request. Refresh status before retrying. Approval retries use the original request; no extra amount or renewal is requested.";
    }
    private static BigInteger amount(String value){return value!=null&&value.matches("[0-9]{1,30}")?new BigInteger(value):null;}
    static String money(String micros){BigInteger n=amount(micros);return n==null?"Unavailable":"USD "+new BigDecimal(n,6).toPlainString();}
    static String remaining(JSONObject approval){
        BigInteger cap=amount(approval.optString("maxMicros")),spent=amount(approval.optString("spentMicros")),reserved=amount(approval.optString("reservedMicros"));
        if(cap==null||spent==null||reserved==null)return "Unavailable";
        BigInteger rest=cap.subtract(spent).subtract(reserved);return rest.signum()<0?"Unavailable":money(rest.toString());
    }
    private static String dubai(String iso){
        try{return DateTimeFormatter.ofPattern("d MMM uuuu, HH:mm 'Dubai'",Locale.ENGLISH).withZone(ZoneId.of("Asia/Dubai")).format(Instant.parse(iso));}
        catch(Exception malformed){return "Unavailable";}
    }
    private static String reason(String code){
        if("provider_evidence_required".equals(code))return "Current provider and operating evidence is required.";
        if("communications_controlled".equals(code))return "Communications budget access is controlled.";
        if(code==null||code.isEmpty())return "ERP reports an operating hold.";
        return code.replace('_',' ');
    }
    private static String featureList(JSONArray values){
        List<String> names=new ArrayList<>();for(int i=0;i<values.length();i++)if(Arrays.asList(FEATURES).contains(values.optString(i)))names.add(label(values.optString(i)));
        return names.isEmpty()?"ERP reports disabled features.":String.join(", ",names);
    }
    private static String label(String feature){
        switch(feature){
            case "chat":return "Messages";case "realtime":return "Live updates";case "media_upload":return "Media uploads";
            case "media_download":return "Media downloads";case "export":return "Exports";case "push":return "Push notifications";
            case "ptt_live":return "Walkie-Talkie live";case "ptt_replay":return "Walkie-Talkie replay";case "sos":return "SOS";
            default:return "Communications";
        }
    }
}
