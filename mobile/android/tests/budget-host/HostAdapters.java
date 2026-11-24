package net.algt.mobiledms;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/* Host-only adapters: no network, Android runtime, credentials or authority claims. */
final class ErpApi {
    interface Handler {Object call(JSONObject command)throws Exception;}
    Handler handler=command->{throw new AssertionError("Network prohibited");};
    final List<JSONObject> requests=new CopyOnWriteArrayList<>();
    static JSONObject object(Object... pairs) {
        JSONObject o=new JSONObject();for(int i=0;i<pairs.length;i+=2)o.put((String)pairs[i],pairs[i+1]);return o;
    }
    static String str(JSONObject o,String key){return o==null?"":o.optString(key,"");}
    static final class Rejected extends IOException {
        final int status;
        Rejected(int status){super("Denied");this.status=status;}
    }
    long epoch=1;
    String user(){return "host-account";}
    long sessionEpoch(){return epoch;}
    boolean signedIn(){return true;}
    Object communicationsCall(JSONObject command,BooleanSupplier live)throws Exception{
        if(!live.getAsBoolean())throw new IOException("Stale visit");requests.add(new JSONObject(command.toString()));
        Object result=handler.call(command);if(!live.getAsBoolean())throw new IOException("Stale result");return result;
    }
}
final class LocalSecurity {
    static long generation(LauncherActivity a){return 1;}
    static boolean unlocked(LauncherActivity a){return true;}
}
final class MobileRoute {
    enum Id {CHAT_PAGE,MORE_HOME,CONNECT}
    static final class Scope {
        final Object api;final String owner;final long epoch;
        Scope(Object api,String owner,long epoch){this.api=api;this.owner=owner;this.epoch=epoch;}
        boolean matches(Scope other){return other!=null&&api==other.api&&owner.equals(other.owner)&&epoch==other.epoch;}
    }
}
final class LauncherActivity {
    ErpApi api=new ErpApi();
    final MobileCommunications communications=new MobileCommunications(this);
    volatile long visit;
    final Map<String,Runnable> actions=new java.util.concurrent.ConcurrentHashMap<>();
    final List<String> cards=new CopyOnWriteArrayList<>(),subtitles=new CopyOnWriteArrayList<>();
    volatile DialogBuilder dialog;
    volatile String message="";
    void page(MobileRoute.Id id,Runnable back,boolean nav){visit++;actions.clear();cards.clear();subtitles.clear();}
    void title(String s){}
    void subtitle(String s){subtitles.add(s);}
    void section(String s){}
    void card(String title,String body,Runnable action){cards.add(title+" "+body);}
    void action(String label,Runnable action,boolean primary){actions.put(label,action);}
    void message(String s,boolean error){message=s;}
    void runOnUiThread(Runnable r){r.run();}
    void logout(){}
    BooleanSupplier communicationsViewTicket(){long selected=visit;return ()->selected==visit;}
    BooleanSupplier communicationsSessionTicket(){MobileRoute.Scope selected=routeScope();return ()->selected.matches(routeScope());}
    BooleanSupplier communicationsTicket(){BooleanSupplier session=communicationsSessionTicket(),view=communicationsViewTicket();return ()->session.getAsBoolean()&&view.getAsBoolean();}
    MobileRoute.Scope routeScope(){return new MobileRoute.Scope(api,api.user(),api.sessionEpoch());}
    boolean notificationReady(){return true;}
    boolean at(MobileRoute.Id id){return false;}
    android.content.Intent getIntent(){return null;}
    void setIntent(android.content.Intent intent){}
    MobileWorkspace mobile(){return new MobileWorkspace();}
    void add(android.widget.LinearLayout parent,android.view.View view,int margin){}
    android.widget.Button button(String label,Runnable action,boolean primary){return new android.widget.Button();}
    DialogBuilder dialogBuilder(){dialog=new DialogBuilder();return dialog;}
    interface DialogAction {void accept(Object dialog,int which);}
    static final class DialogBuilder {
        DialogAction positive;
        String message="",label="";
        DialogBuilder setTitle(String s){return this;}
        DialogBuilder setMessage(String s){message=s;return this;}
        DialogBuilder setPositiveButton(String s,DialogAction action){label=s;positive=action;return this;}
        DialogBuilder setNegativeButton(String s,DialogAction action){return this;}
        void show(){}
    }
}
final class MobileWorkspace {void home(){}void settings(){}}
final class ChatWorkspace {void home(Runnable back){}void openDirect(String user,Runnable back){}}
final class PttWorkspace {void home(Runnable back){}void renderActiveControls(android.widget.LinearLayout parent){}}
final class PttResumeReceiver {static final String OPEN="open";}
final class PttState {static boolean recover(boolean enabled,boolean account,boolean epoch,boolean login,String availability){return false;}}
final class PttService {
    static android.content.SharedPreferences prefs(LauncherActivity a){return new android.content.SharedPreferences();}
    static void cancelReminder(LauncherActivity a){}
}
