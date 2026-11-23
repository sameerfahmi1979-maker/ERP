package net.algt.mobiledms;

import java.io.IOException;
import org.json.JSONObject;

public final class OfflineRetentionTest {
    static final String A = "11111111-1111-4111-8111-111111111111";
    static final String B = "22222222-2222-4222-8222-222222222222";
    static final long NOW = 1_800_000_000_000L;
    static final long DAY = 86_400_000L;
    interface Check { void run() throws Exception; }
    static void denied(Check check) throws Exception {
        try { check.run(); } catch (IOException expected) { return; }
        throw new AssertionError("An invalid or locked grant was accepted.");
    }
    static void verify(boolean value) { if (!value) throw new AssertionError(); }
    static JSONObject grant(int days) throws Exception {
        return new JSONObject().put("leaseVersion",2).put("authUserId",A).put("days",days)
            .put("retention",days==0?"permanent":"timed").put("authorizedAt",NOW)
            .put("expiresAt",days==0?JSONObject.NULL:NOW+DAY*days)
            .put("documentId",10).put("fileId",20).put("versionId",30).put("currentVersionId",31)
            .put("version","timestamp-1").put("sha256",String.format("%064d",0).replace('0','a')).put("generation",1)
            .put("anchorWall",NOW).put("lastWall",NOW).put("anchorElapsed",1).put("lastElapsed",1).put("boot",3);
    }
    public static void main(String[] args) throws Exception {
        JSONObject permanent=grant(0);
        OfflineGrant.check(permanent,A,1,false,NOW+DAY*10000,0,77);
        denied(()->OfflineGrant.check(permanent,B,1,false,NOW,1,3));
        denied(()->OfflineGrant.check(permanent,A,3,false,NOW,1,3));
        denied(()->OfflineGrant.check(permanent,A,1,true,NOW,1,3));
        OfflineGrant.confirm(permanent,grant(1),A,3,NOW+DAY*60,900,901,4);
        OfflineGrant.check(permanent,A,3,false,NOW+DAY*700,0,29);
        JSONObject timedBeforeRestart=grant(15);
        JSONObject trusted=grant(1).put("authorizedAt",NOW+14*DAY).put("expiresAt",NOW+15*DAY);
        OfflineGrant.confirm(timedBeforeRestart,trusted,A,3,NOW,10,20,4);
        OfflineGrant.check(timedBeforeRestart,A,3,false,NOW,DAY+9,4);
        denied(()->OfflineGrant.check(timedBeforeRestart,A,3,false,NOW,DAY+10,4));
        verify(timedBeforeRestart.getLong("expiresAt")==NOW+15*DAY);
        denied(()->OfflineGrant.confirm(timedBeforeRestart,grant(1).put("authUserId",B),A,3,NOW,10,20,4));
        denied(()->OfflineGrant.confirm(timedBeforeRestart,grant(1).put("currentVersionId",22),A,3,NOW,10,20,4));
        JSONObject expired=grant(1);
        denied(()->OfflineGrant.confirm(expired,trusted,A,3,NOW,10,20,4));
        for(int days:new int[]{1,15,30}){
            JSONObject timed=grant(days);
            OfflineGrant.check(timed,A,1,false,NOW+DAY*days-1,DAY*days,3);
            denied(()->OfflineGrant.check(timed,A,1,false,NOW+DAY*days,DAY*days+1,3));
            denied(()->OfflineGrant.check(timed,A,1,false,NOW,1,4));
            denied(()->OfflineGrant.check(timed,A,1,false,NOW-1,1,3));
            denied(()->OfflineGrant.check(timed,A,1,false,NOW,DAY*days+1,3));
        }
        for(int days:new int[]{1,3,7}){
            JSONObject legacy=grant(days); legacy.remove("leaseVersion"); legacy.remove("retention"); legacy.remove("days"); legacy.remove("generation");
            OfflineGrant.check(legacy,A,1,false,NOW,1,3);
            denied(()->OfflineGrant.check(legacy,A,1,false,NOW+DAY*days,DAY*days+1,3));
        }
        denied(()->OfflineGrant.check(grant(3),A,1,false,NOW,1,3));
        denied(()->OfflineGrant.check(grant(0).put("expiresAt",NOW+DAY),A,1,false,NOW,1,3));
        JSONObject missing=grant(0); missing.remove("expiresAt");
        denied(()->OfflineGrant.check(missing,A,1,false,NOW,1,3));
        denied(()->OfflineGrant.check(grant(30).put("expiresAt",NOW+DAY*31),A,1,false,NOW,1,3));
        verify(OfflineGrant.sameBinding(permanent,grant(1)));
        for(String field:new String[]{"documentId","fileId","versionId","currentVersionId"})
            verify(!OfflineGrant.sameBinding(permanent,grant(1).put(field,99)));
        verify(!OfflineGrant.sameBinding(permanent,grant(1).put("authUserId",B)));
        verify(!OfflineGrant.sameBinding(permanent,grant(1).put("version","changed")));
        verify(!OfflineGrant.sameBinding(permanent,grant(1).put("sha256",String.format("%064d",0).replace('0','b'))));
        verify(OfflineGrant.onHttpFailure(401)==OfflineGrant.Denial.LOCK);
        verify(OfflineGrant.onHttpFailure(409)==OfflineGrant.Denial.LOCK);
        verify(OfflineGrant.onHttpFailure(403)==OfflineGrant.Denial.REMOVE);
        verify(OfflineGrant.onHttpFailure(404)==OfflineGrant.Denial.REMOVE);
        verify(OfflineGrant.onHttpFailure(503)==OfflineGrant.Denial.RETRY);
        verify(OfflineGrant.onHttpFailure(429)==OfflineGrant.Denial.RETRY);
        verify(OfflineGrant.reminder(grant(0),A,1,false,NOW,1,3)==null);
        verify(OfflineGrant.reminder(grant(15),A,1,false,NOW+13*DAY,13*DAY+1,3)==null);
        verify(Boolean.FALSE.equals(OfflineGrant.reminder(grant(15),A,1,false,NOW+14*DAY,14*DAY+1,3)));
        verify(Boolean.TRUE.equals(OfflineGrant.reminder(grant(15),A,1,false,NOW+15*DAY,15*DAY+1,3)));
        verify(OfflineGrant.reminder(grant(15),A,2,false,NOW+15*DAY,15*DAY+1,3)==null);
        verify(OfflineGrant.reminder(grant(15),A,1,false,NOW+15*DAY,15*DAY+1,4)==null);
        verify(OfflineGrant.reminder(grant(15).put("invalidated",true),A,1,false,NOW+15*DAY,15*DAY+1,3)==null);
        System.out.println("PASS OfflineRetentionTest");
    }
}
