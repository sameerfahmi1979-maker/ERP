package net.algt.mobiledms;

import java.io.IOException;
import java.util.*;
import org.json.*;
import static net.algt.mobiledms.CommunicationsApi.*;

/** Refresh the complete authorized index before retiring cached conversations absent from the server. */
final class ChatManifest {
    static final class Result {
        final List<JSONObject> rows=new ArrayList<>();
        final List<JSONObject> all=new ArrayList<>();
        long unread;
        String signature() {
            StringBuilder revision=new StringBuilder();
            for(JSONObject c:rows)revision.append(text(c,"id")).append('/').append(text(c,"changeSeq"))
                .append('/').append(c.optInt("unreadCount")).append('/').append(c.optBoolean("muted")).append('/').append(text(c,"title")).append('|');
            return revision.toString();
        }
    }
    static Result list(ChatWorkspace.Screen s,String mode,boolean archived,boolean connected)throws Exception {
        Set<String> saved=s.store.conversationIds(mode);
        Result result=new Result();
        if(!connected){
            for(String cid:saved){
                JSONObject c;
                try{c=s.store.snapshot("cache/"+mode+"/"+cid,"conversation");}catch(IOException e){continue;}
                include(result,c,archived,mode);
            }
        }else{
            String cursor="";
            Set<String> seen=new HashSet<>();
            Set<String> accessible=new HashSet<>();
            do{
                JSONObject fields=args("limit",100);
                JSONObject page;
                if(mode.equals("participant")){
                    if(!cursor.isEmpty())fields.put("manifestCursor",cursor);
                    page=s.api.call("chat.sync",fields);
                }else{
                    fields.put("mode",mode);
                    if(!cursor.isEmpty())fields.put("cursor",cursor);
                    page=s.api.page("chat.conversations",fields);
                }
                JSONArray items=page.getJSONArray(mode.equals("participant")?"conversations":"items");
                if(items.length()>100)throw new IOException("Invalid conversation index.");
                for(int i=0;i<items.length();i++){
                    JSONObject c=items.getJSONObject(i);
                    String cid=id(c,"id");
                    if(!accessible.add(cid))continue;
                    required(c,"changeSeq");
                    s.store.snapshot("cache/"+mode+"/"+cid,"conversation",c);
                    include(result,c,archived,mode);
                }
                cursor=text(page,mode.equals("participant")?"nextManifestCursor":"nextCursor");
                if(!cursor.isEmpty()&&!seen.add(cursor))throw new IOException("Invalid ERP index cursor.");
            }while(!cursor.isEmpty());
            saved.removeAll(accessible);
            for(String cid:saved)s.store.clear("cache/"+mode+"/"+cid);
        }
        result.rows.sort((a,b)->{
            int unread=Integer.compare(b.optInt("unreadCount"),a.optInt("unreadCount"));
            return unread==0?text(a,"title").compareToIgnoreCase(text(b,"title")):unread;
        });
        return result;
    }
    static void refreshPages(ChatWorkspace.Screen s,JSONObject c,String mode)throws Exception{
        String cid=id(c,"id"),revision=required(c,"changeSeq"),folder="cache/"+mode+"/"+cid;
        List<JSONObject> stale=s.store.stalePages(folder,revision);
        Set<String> updated=new HashSet<>();
        for(JSONObject entry:stale){
            String key=required(entry,"key");
            boolean messages=key.startsWith("messages|");
            if(!messages&&!key.startsWith("media|"))continue;
            String prefix=messages?"messages|":"media|";
            String cursor=key.substring(prefix.length());
            String oldest=text(entry,"oldest");
            long bound=ChatRules.profile(oldest)?Long.parseLong(oldest):Long.MAX_VALUE;
            Set<String> seen=new HashSet<>();
            do{
                if(!seen.add(cursor))throw new IOException("Invalid history cursor.");
                JSONObject page;
                String pageKey=prefix+cursor;
                if(updated.contains(pageKey))page=s.store.page(folder,pageKey,revision);
                else{
                    JSONObject fields=args("conversationId",cid,"mode",mode,"limit",messages?12:40);
                    if(!cursor.isEmpty())fields.put("cursor",cursor);
                    page=s.api.page(messages?"chat.messages":"chat.media",fields);
                    JSONArray items=page.getJSONArray("items");
                    for(int i=0;i<items.length();i++)if(!cid.equals(id(items.getJSONObject(i),"conversationId")))
                        throw new IOException("Unexpected conversation in cached history.");
                    s.store.page(folder,pageKey,revision,page);
                    updated.add(pageKey);
                }
                JSONArray rows=page.getJSONArray("items");
                if(!messages||rows.length()==0)break;
                long currentOldest=Long.parseLong(required(rows.getJSONObject(rows.length()-1),"seq"));
                if(currentOldest<=bound)break;
                cursor=text(page,"nextCursor");
            }while(!cursor.isEmpty());
        }
    }
    private static void include(Result result,JSONObject c,boolean archived,String mode){
        result.all.add(c);
        result.unread=Math.min(Integer.MAX_VALUE,result.unread+Math.max(0,c.optInt("unreadCount")));
        if(mode.equals("review")||c.optBoolean("archived")==archived)result.rows.add(c);
    }
}
