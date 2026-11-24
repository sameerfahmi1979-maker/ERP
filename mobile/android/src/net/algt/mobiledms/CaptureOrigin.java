package net.algt.mobiledms;

import java.util.function.BiConsumer;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;

/** Back from capture carries identifiers only. Task details are re-read from the original admitted page. */
final class CaptureOrigin {
    private enum Kind { DOCUMENTS, QUEUE, TASK }
    private final Kind kind;
    private final MobileRoute.Scope scope;
    final String list, code;
    final int page;
    private final long id;
    private CaptureOrigin(Kind kind,MobileRoute.Scope scope,String list,int page,long id,String code){
        this.kind=kind;this.scope=scope;this.list=list;this.page=page;this.id=id;this.code=code;
    }
    static CaptureOrigin documents(MobileRoute.Scope scope){return new CaptureOrigin(Kind.DOCUMENTS,scope,"",0,0,"");}
    static CaptureOrigin queue(MobileRoute.Scope scope){return new CaptureOrigin(Kind.QUEUE,scope,"",0,0,"");}
    static CaptureOrigin task(MobileRoute.Scope scope,String list,int page,JSONObject row){
        return new CaptureOrigin(Kind.TASK,scope,list,page,row.optLong("id"),ErpApi.str(row,"sessionCode"));
    }
    CaptureOrigin memberParent(){return kind==Kind.TASK ? this : queue(scope);}
    JSONObject command(){return object("op","tasks","kind",list,"page",page);}
    JSONObject find(JSONArray rows) {
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i);
            if(id>0 && row!=null && row.optLong("id")==id && code.equals(ErpApi.str(row,"sessionCode"))) return row;
        }
        return null;
    }
    void show(JSONObject row,Consumer<JSONObject> detail,BiConsumer<String,Integer> fallback){
        if(row==null)fallback.accept(list,page);else detail.accept(row);
    }
    void returnTo(MobileRoute.Scope current,Runnable documents,Runnable queue,Consumer<CaptureOrigin> task) {
        if(!scope.matches(current))return;
        switch(kind){case TASK:task.accept(this);break;case QUEUE:queue.run();break;default:documents.run();}
    }
    interface Ordinary {void open(JSONObject live,CaptureOrigin origin)throws Exception;}
    void dispatch(DmsIntakeEntry.Route result,BiConsumer<String,CaptureOrigin> queue,Ordinary ordinary)throws Exception {
        result.show(member->queue.accept(member,this),live->ordinary.open(live,this));
    }
}
