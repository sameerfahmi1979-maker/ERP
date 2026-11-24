package net.algt.mobiledms;

import org.json.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import static net.algt.mobiledms.ErpApi.str;
import static net.algt.mobiledms.DmsApi.id;

/** Resolves every legacy intake entry against the active encrypted queue before ordinary handling. */
final class DmsIntakeEntry {
    final ErpApi api;
    final String owner,code;
    final long epoch,generation,session;
    DmsIntakeEntry(ErpApi api,String owner,long epoch,long generation,long session,String code){
        this.api=api;this.owner=owner;this.epoch=epoch;this.generation=generation;this.session=session;this.code=code;
    }
    boolean origin(String actor,long currentEpoch,long currentGeneration){
        return !owner.isEmpty()&&owner.equals(actor)&&epoch==currentEpoch&&generation==currentGeneration;
    }
    interface Reader{JSONObject read(String code)throws Exception;}
    interface Index{JSONArray load()throws Exception;}
    /** Pausing permanently retires this visit, even when the same source is reopened. */
    static final class Visit implements BooleanSupplier{
        private final BooleanSupplier visible;
        private volatile boolean retired;
        Visit(BooleanSupplier visible){this.visible=visible;}
        void retire(){retired=true;}
        public boolean getAsBoolean(){return !retired&&visible.getAsBoolean();}
    }
    static final class Route{
        private final JSONObject fresh;
        private final String member;
        private final BooleanSupplier mounted;
        Route(JSONObject fresh,String member,BooleanSupplier mounted){this.fresh=fresh;this.member=member;this.mounted=mounted;}
        void show(Consumer<String> queued,DmsWorkspace.Show<JSONObject> ordinary)throws Exception{
            if(!mounted.getAsBoolean())return;
            if(member==null)ordinary.show(fresh);else queued.accept(member);
        }
    }
    Route read(Reader reader,Index index,BooleanSupplier mounted)throws Exception{
        DmsArchive.check(mounted.getAsBoolean()&&session>=0&&code!=null&&code.matches("[A-Za-z0-9_-]{1,64}"));
        JSONObject live=reader.read(code);
        long current=id(live,"id");
        DmsArchive.check(mounted.getAsBoolean()&&code.equals(str(live,"code"))&&(session==0||session==current));
        JSONArray rows=index.load();String member=null;
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i),receipt=row.optJSONObject("receipt");if(receipt==null)continue;
            boolean sameSession=current==receipt.optLong("id"),sameCode=code.equals(str(receipt,"code"));
            if(!sameSession&&!sameCode)continue;
            JSONObject req=row.getJSONObject("request");
            DmsArchive.check(sameSession&&sameCode&&member==null&&owner.equals(str(req,"authUserId"))&&HrRules.uuid(str(req,"operationId")));
            member=req.getString("operationId");
        }
        DmsArchive.check(mounted.getAsBoolean());
        return new Route(live,member,mounted);
    }
}
