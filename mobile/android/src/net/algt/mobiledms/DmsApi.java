package net.algt.mobiledms;
import org.json.*;
import java.io.IOException;
import java.util.*;
import java.util.function.BooleanSupplier;
import static net.algt.mobiledms.ErpApi.*;

final class DmsApi {
    static final String VERSION="mobile-dms/5.0";
    static JSONObject cmd(String op,Object... pairs){JSONObject b=object(pairs);put(b,"op",op);return b;}
    static JSONObject put(JSONObject b,String k,Object v){try{return b.put(k,v==null?JSONObject.NULL:v);}catch(JSONException e){throw new IllegalArgumentException(e);}}
    static JSONObject copy(JSONObject r){try{return new JSONObject(r.toString());}catch(Exception e){throw new IllegalArgumentException(e);}}
    static long id(JSONObject row,String key)throws IOException{Object n=row.opt(key);if(!(n instanceof Number)||!DmsRules.positive(((Number)n).longValue())||((Number)n).doubleValue()!=((Number)n).longValue())throw new IOException("Invalid ERP record identity.");return ((Number)n).longValue();}
    static String hash(JSONObject row,String key)throws IOException{String s=str(row,key);DmsArchive.check(DmsRules.hash(s));return s;}
    static List<JSONObject> rows(JSONObject data,String key)throws JSONException{JSONArray a=data.getJSONArray(key);List<JSONObject> out=new ArrayList<>();for(int i=0;i<a.length();i++)out.add(a.getJSONObject(i));return out;}
    static JSONObject fetch(ErpApi api,JSONObject b,BooleanSupplier allowed)throws Exception{
        String op=b.getString("op");DmsArchive.check(b.toString().getBytes("UTF-8").length<=262144);
        JSONObject r=api.dmsOnce(b,allowed);
        DmsArchive.check(VERSION.equals(r.opt("contractVersion")) && r.toString().getBytes("UTF-8").length<=(op.equals("documentCompare")?1572864:1048576));
        if(r.has("documentId")&&b.has("documentId"))DmsArchive.check(id(b,"documentId")==id(r,"documentId"));
        if(op.equals("documentDetails")){DmsArchive.check(id(r,"id")==id(b,"documentId"));hash(r,"sourceHash");id(r,"currentVersionId");r.getJSONObject("actions");}
        if(r.has("pageSize")){
            long p=b.getLong("page"),size=r.getLong("pageSize"),n=r.getLong("totalCount");
            DmsArchive.check((p==r.getLong("page"))&&(size==20||size==25)&&n>=0&&r.getJSONArray("rows").length()==Math.min(size,Math.max(0,n-(p-1)*size))&&r.getBoolean("hasMore")==(p*size<n));
            Set<String> seen=new HashSet<>();for(JSONObject row:rows(r,"rows")){
                String k=row.has("id")?"id":row.has("ruleId")?"ruleId":row.has("profileId")?"profileId":"documentId";DmsArchive.check(seen.add(str(row,"kind")+"/"+id(row,k)));
            }
        }
        if(b.has("operationId"))verifyReceipt(b,r);
        return r;
    }
    static void verifyReceipt(JSONObject b,JSONObject r)throws Exception{
        DmsArchive.check(b.getString("operationId").equals(r.getString("operationId")));
        String op=b.getString("op");
        for(String key:new String[]{"documentId","commentId","jobId","shareId","id"}){
            if(!b.has(key))continue;
            if(key.equals("documentId") && Arrays.asList("documentRequestCreate","documentRequestAct","documentShareCreate").contains(op))continue;
            DmsArchive.check(id(b,key)==id(r,key));
        }
        switch(b.getString("op")){
            case "documentShareCreate":JSONObject src=r.getJSONObject("source");for(String k:new String[]{"documentId","versionId","fileId"})DmsArchive.check(id(src,k)==id(b,k));id(r,"id");r.getString("expiresAt");break;
            case "documentRequestCreate":case "documentRequestAct":JSONObject q=r.getJSONObject("request");DmsArchive.check(b.getString("kind").equals(q.getString("kind")));id(q,"revision");
                if(b.has("requestId"))DmsArchive.check(id(q,"id")==id(b,"requestId"));
                if(b.has("parent")){JSONObject p=b.getJSONObject("parent"),returned=q.getJSONObject("parent");DmsArchive.check(id(p,"entityId")==id(returned,"entityId")&&p.getString("entityType").equals(returned.getString("entityType")));}break;
            case "documentCommentAdd":case "documentCommentEdit":case "documentCommentDelete":id(r,"commentId");DmsArchive.check(DmsRules.revision(r.getString("revision")));break;
            case "processingAction":id(r,"jobId");r.getString("state");break;
            case "documentMetadataSave":hash(r,"snapshot");break;
            case "documentTagsChange":r.getBoolean("changed");break;
            case "documentSavedFilterSave":id(r,"id");r.getString("revision");break;
            case "documentSavedFilterDelete":DmsArchive.check(r.getBoolean("deleted"));break;
            case "documentShareRevoke":DmsArchive.check("revoked".equals(r.getString("state")));break;
            default:throw new IOException("Unknown saved operation.");
        }
    }
}
