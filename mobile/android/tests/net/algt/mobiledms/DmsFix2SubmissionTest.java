package net.algt.mobiledms;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
import static net.algt.mobiledms.DmsApi.*;
import static net.algt.mobiledms.ErpApi.*;

public final class DmsFix2SubmissionTest {
    static final String UUID="00000000-0000-4000-8000-000000000003";
    static final JSONObject BODY=cmd("documentShareCreate","documentId",8,"versionId",9,"fileId",10,"token","secret-local-test","operationId",UUID);
    static final JSONObject RECEIPT=object("operationId",UUID,"source",object("documentId",8,"versionId",9,"fileId",10),"id",7,"expiresAt","2030-01-01");
    static class Disk implements DmsSubmission.Journal {
        String disk=object("owner","alice","epoch",3,"attempts",0,"lock","share/8","payload",BODY.toString()).toString();
        long epoch=3;
        JSONObject row()throws Exception{return new JSONObject(disk);}
        public long beginAttempt(JSONObject b)throws Exception{JSONObject p=row();long n=DmsSubmission.begin(p,b,"alice",epoch);disk=p.toString();return n;}
        public void refuseAttempt(JSONObject b,long n,String reason)throws Exception{JSONObject p=row();DmsSubmission.refuse(p,b,n,reason);disk=p.toString();}
        public void sourceConflict(JSONObject b)throws Exception{throw new AssertionError();}
        public void finish(JSONObject b,JSONObject receipt)throws Exception{JSONObject p=row();DmsSubmission.confirm(p,b,receipt);disk=p.toString();}
    }
    static void check(boolean b){if(!b)throw new AssertionError();}
    static void failed(Disk d,Exception e)throws Exception{
        try{DmsSubmission.send(d,BODY,b->{check(b.toString().equals(BODY.toString()));throw e;});throw new AssertionError();}
        catch(Exception ex){check(ex==e);}
    }
    public static void main(String[] args)throws Exception{
        Disk disk=new Disk();
        ByteArrayOutputStream firstBody=new ByteArrayOutputStream();
        try{
            DmsSubmission.send(disk,BODY,b->{
                byte[] bytes=b.toString().getBytes(StandardCharsets.UTF_8);
                DmsTransfer.send(()->firstBody,new ByteArrayInputStream(bytes),bytes.length,()->true);
                throw new IOException("First reply lost");
            });
            throw new AssertionError();
        }catch(IOException lost){check("First reply lost".equals(lost.getMessage()));}
        check(firstBody.toString("UTF-8").equals(BODY.toString()));
        try{
            DmsSubmission.send(disk,BODY,b->{
                byte[] bytes=b.toString().getBytes(StandardCharsets.UTF_8);
                DmsTransfer.send(()->{throw new IOException("Second open failed");},new ByteArrayInputStream(bytes),bytes.length,()->true);
                throw new AssertionError("No destination");
            });
            throw new AssertionError();
        }catch(DmsTransfer.NotSent expected){check(disk.row().getString("payload").equals(BODY.toString()));}
        failed(disk,new ErpApi.Rejected("refresh denied",401,null,true));
        failed(disk,new ErpApi.Rejected("source changed",409,object("code","source_changed")));
        check(disk.row().getString("payload").equals(BODY.toString())&&DmsOperationStore.blocks(disk.row(),BODY,"share/8"));
        disk.epoch=4;DmsFixFlowsTest.denied(()->DmsSubmission.send(disk,BODY,b->{throw new AssertionError("cross epoch");}));
        disk.epoch=3;DmsSubmission.send(disk,BODY,b->{check(b.getString("token").equals("secret-local-test")&&b.getString("operationId").equals(UUID));return RECEIPT;});
        check(!new JSONObject(disk.row().getString("payload")).has("token")&&disk.row().getJSONObject("receipt").getLong("id")==7);
        Disk initial=new Disk();failed(initial,new DmsTransfer.NotSent(null));
        check(initial.row().optBoolean("conflict")&&!DmsOperationStore.blocks(initial.row(),BODY,"share/8")&&!new JSONObject(initial.row().getString("payload")).has("token"));
        Disk old=new Disk();JSONObject legacy=old.row();legacy.remove("attempts");old.disk=legacy.toString();failed(old,new DmsTransfer.NotSent(null));
        check(old.row().getString("payload").equals(BODY.toString())&&DmsOperationStore.blocks(old.row(),BODY,"share/8"));
        System.out.println("DmsFix2SubmissionTest passed: durable first lost reply, untransmitted and refused recoveries, original UUID/token receipt, first refusal scrub and legacy uncertainty.");
    }
}
