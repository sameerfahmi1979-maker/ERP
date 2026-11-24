package net.algt.mobiledms;

/** Decisions shared between UI lifecycle callbacks, asynchronous completion, and original-operation recovery. */
final class HrRecovery {
    enum Lookup { REDACTED, CHECK_TARGET, CHECK_TERMINAL }
    static Lookup lookup(long origin,long current,long receiptId,int status) {
        if(origin<0 || origin!=current || receiptId>0)return Lookup.REDACTED;
        if(status==503)return Lookup.CHECK_TARGET;
        return status==422?Lookup.CHECK_TERMINAL:Lookup.REDACTED;
    }
    static boolean neutralize(boolean hierarchy,boolean sameApi,boolean sameLocalOwner,boolean signedIn,long origin,long current){
        return hierarchy && sameApi && sameLocalOwner && (origin==current || !signedIn && current<0);
    }
    static String recipientProblem(String code,String value){
        return code.equals("HR_EMPLOYMENT_CONFIRMATION") && value.length()>180 ? "Recipient in Arabic must be 180 characters or fewer." : "";
    }
    interface FormRestore { java.util.function.BooleanSupplier render() throws Exception; }
    interface Consume {void run(java.util.function.BooleanSupplier owner) throws Exception;}
    static void restoreHandoff(java.util.function.BooleanSupplier origin,FormRestore restore,Consume consume)throws Exception{
        if(!origin.getAsBoolean())return;
        java.util.function.BooleanSupplier renderedOwner=restore.render();
        if(renderedOwner.getAsBoolean())consume.run(renderedOwner);
    }

    static boolean consumeHandoff(String saved,String restored,boolean visible){
        return visible && !saved.isEmpty() && saved.equals(restored);
    }
    static void resumeRead(org.json.JSONObject saved,boolean sameLogin,java.util.function.Consumer<org.json.JSONObject> reopen,Runnable home){
        if(saved==null||!sameLogin){home.run();return;}
        reopen.accept(saved);
    }
    static void deliverVisit(org.json.JSONObject saved,java.util.function.Consumer<org.json.JSONObject> read,
            java.util.function.Consumer<String> review,Runnable receipts){
        switch(saved.optString("op")){
            case "savedOperation":review.accept(saved.optString("operationId"));break;
            case "hrReceipts":receipts.run();break;
            default:read.accept(saved);
        }
    }
    enum Export { DROP, DENY, RESUME }
    static Export exportCompletion(boolean current,boolean success,boolean privateDenial){
        if(!current)return Export.DROP;
        return !success && privateDenial?Export.DENY:Export.RESUME;
    }
    /** Every deliberate export owns its slot from admission through chooser or feedback. */
    static final class ExportActions {
        private volatile Object current;
        Object begin(){Object token=new Object();current=token;return token;}
        boolean owns(Object token){return token!=null && token==current;}
        void clear(){current=null;}
        Dispatch dispatch(Object token,Share share,long prepared,boolean sourceCurrent,boolean foreground){
            return share.finish(prepared,owns(token) && sourceCurrent,foreground);
        }
        Export completion(Object token,boolean sourceCurrent,boolean success,boolean denial){
            return exportCompletion(owns(token) && sourceCurrent,success,denial);
        }
    }

    /** Own the actual staged copy until its export is replaced. A late worker can discard only its own file. */
    static final class ExportFiles {
        // Scoped descriptors are process-wide; the active export can move to a new activity.
        private static ExportFiles activeOwner;
        private volatile Object selected;
        private final InactivityLease lease=new InactivityLease();
        private final java.util.function.LongSupplier clock;
        private Runnable discard;
        ExportFiles(java.util.function.LongSupplier clock){this.clock=clock;}
        synchronized long remaining(Object action){return owns(action)?lease.remaining(0,clock.getAsLong()):0;}
        synchronized void interacted(){if(selected!=null)lease.interact(0,clock.getAsLong());}
        void select(Object action){
            Runnable replacedOwner=null;
            Runnable replacedFile;
            synchronized(ExportFiles.class){
                if(action!=null){
                    if(activeOwner!=null&&activeOwner!=this)replacedOwner=activeOwner.replace(null);
                    activeOwner=this;
                }else if(activeOwner==this){
                    activeOwner=null;
                }
                replacedFile=replace(action);
            }
            // File removal also reaches the process-wide provider. Release owner locks first.
            if(replacedOwner!=null)replacedOwner.run();
            if(replacedFile!=null)replacedFile.run();
        }
        private synchronized Runnable replace(Object action){
            selected=action;
            lease.confirmed(action!=null,0,clock.getAsLong());
            Runnable obsolete=discard;
            discard=null;
            return obsolete;
        }
        boolean owns(Object action){return action!=null&&selected==action;}
        void attach(Object action,Runnable remove)throws java.io.IOException{
            Runnable obsolete;
            boolean admitted;
            synchronized(this){
                admitted=owns(action);
                obsolete=admitted?discard:remove;
                if(admitted)discard=remove;
            }
            if(obsolete!=null)obsolete.run();
            if(!admitted)throw new java.io.IOException("Issued export was replaced.");
        }
    }

    enum Dispatch { WAIT, REFETCH, SHOW, DROP }
    static final class Share {
        private long pauseEpoch;
        synchronized long start(){return pauseEpoch;}
        synchronized void pause(){pauseEpoch++;}
        synchronized Dispatch finish(long prepared,boolean current,boolean foreground){
            if(!current)return Dispatch.DROP;
            if(!foreground)return Dispatch.WAIT;
            return prepared==pauseEpoch?Dispatch.SHOW:Dispatch.REFETCH;
        }
    }
}
