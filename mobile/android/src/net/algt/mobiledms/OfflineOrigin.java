package net.algt.mobiledms;

import org.json.JSONObject;

/** The offline library carries its entry point through search, preview and account settings. */
final class OfflineOrigin {
    interface Host {
        void documents(); void more(); void reconnect();
        void list(JSONObject criteria,String entity,String type,int page,Runnable back);
    }
    private enum Kind { ROOT, DOCUMENTS, MORE, LIST }
    private final Kind kind;
    private final JSONObject criteria;
    private final String entity,type;
    private final int page;
    private final Runnable parent;
    private OfflineOrigin(Kind kind,JSONObject criteria,String entity,String type,int page,Runnable parent) {
        this.kind=kind;this.criteria=criteria==null?null:HrView.copy(criteria);
        this.entity=entity;this.type=type;this.page=page;this.parent=parent;
    }
    static OfflineOrigin root(){return new OfflineOrigin(Kind.ROOT,null,"","",0,null);}
    static OfflineOrigin documents(){return new OfflineOrigin(Kind.DOCUMENTS,null,"","",0,null);}
    static OfflineOrigin more(){return new OfflineOrigin(Kind.MORE,null,"","",0,null);}
    static OfflineOrigin list(JSONObject criteria,String entity,String type,int page,Runnable parent){
        return new OfflineOrigin(Kind.LIST,criteria,entity,type,page,parent);
    }
    void back(Host host){
        switch(kind){
            case ROOT:host.reconnect();break;
            case MORE:host.more();break;
            case DOCUMENTS:host.documents();break;
            case LIST:host.list(HrView.copy(criteria),entity,type,page,parent);break;
        }
    }
    Library search(String query){return new Library(this,query);}
    static final class Library {
        final OfflineOrigin origin;
        final String query;
        private Library(OfflineOrigin origin,String query){this.origin=origin;this.query=query;}
        Runnable settingsBack(java.util.function.Consumer<Library> reopen){return () -> reopen.accept(this);}
    }
}
