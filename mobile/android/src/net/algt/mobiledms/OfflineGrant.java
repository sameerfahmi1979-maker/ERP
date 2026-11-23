package net.algt.mobiledms;

import java.io.IOException;
import org.json.JSONObject;
import org.json.JSONException;

/** Rules shared by foreground preview, reconnect reconciliation and the encrypted index. */
final class OfflineGrant {
    static final long DAY = 86_400_000L;
    enum Denial { LOCK, REMOVE, RETRY }

    static int days(JSONObject record) throws IOException {
        long issued = number(record, "authorizedAt");
        if (issued < 1_000_000_000_000L) throw invalid();
        if (!record.has("leaseVersion")) {
            if (record.has("retention") || record.has("days")) throw invalid();
            long span = number(record, "expiresAt") - issued;
            for (int days : new int[]{1,3,7}) if (span == days * DAY) return days;
            throw invalid();
        }
        if (number(record, "leaseVersion") != 2) throw invalid();
        long days = number(record, "days");
        if (days == 0 && "permanent".equals(record.opt("retention"))
                && record.has("expiresAt") && record.isNull("expiresAt")) return 0;
        if ((days == 1 || days == 15 || days == 30) && "timed".equals(record.opt("retention"))
                && number(record, "expiresAt") - issued == days * DAY) return (int) days;
        throw invalid();
    }

    static Long check(JSONObject record, String account, long generation, boolean credentialsRequired,
                      long wall, long elapsed, int boot) throws IOException {
        Long left=remaining(record,account,generation,credentialsRequired,wall,elapsed,boot);
        if(left!=null && (left<=0 || record.optBoolean("spent"))) throw new LeasePolicy.Expired();
        return left;
    }

    static Boolean reminder(JSONObject record,String owner,long generation,boolean credentialsRequired,long wall,long elapsed,int boot){
        try {
            Long left=remaining(record,owner,generation,credentialsRequired,wall,elapsed,boot);
            // A one-day grant sends its expiry notice only, avoiding a reminder immediately after saving.
            if(left==null || left>DAY || (left>0 && days(record)==1)) return null;
            return left<=0;
        } catch(IOException uncertain){ return null; }
    }
    private static Long remaining(JSONObject record,String account,long generation,boolean credentialsRequired,
                                  long wall,long elapsed,int boot)throws IOException{
        if (!LeasePolicy.account(account).equals(LeasePolicy.account(record.optString("authUserId")))) throw invalid();
        int days = days(record);
        if (credentialsRequired || record.optBoolean("invalidated")
                || record.optLong("generation", record.has("leaseVersion") ? -1 : generation) != generation)
            throw new IOException("Connect and sign in to verify this saved copy.");
        if (days == 0) return null;
        long serverAnchor = record.optLong("serverAnchor",number(record,"authorizedAt"));
        long expires = number(record,"expiresAt");
        return expires - LeasePolicy.trustedTime(serverAnchor, number(record,"anchorWall"),
            number(record,"anchorElapsed"),number(record,"lastWall"),number(record,"lastElapsed"),
            (int) number(record,"boot"),wall,elapsed,boot);
    }

    static boolean sameBinding(JSONObject saved, JSONObject current) {
        if (!saved.optString("authUserId").equalsIgnoreCase(current.optString("authUserId"))) return false;
        for (String field : new String[]{"documentId","fileId","versionId","currentVersionId"}) {
            long value = saved.optLong(field,-1);
            if (value <= 0 || current.optLong(field,-1) != value) return false;
        }
        String hash = saved.optString("sha256","");
        return hash.matches("(?i)[0-9a-f]{64}") && hash.equalsIgnoreCase(current.optString("sha256",""))
            && !saved.optString("version","").isEmpty() && saved.optString("version").equals(current.optString("version"));
    }

    static void confirm(JSONObject saved, JSONObject current, String owner, long generation,
                        long wall, long requestStarted, long elapsed, int boot) throws IOException, JSONException {
        if (days(current)!=1 || current.optInt("leaseVersion")!=2 || !sameBinding(saved,current)
                || !LeasePolicy.account(owner).equals(LeasePolicy.account(current.optString("authUserId")))) throw invalid();
        if (requestStarted<0 || elapsed<requestStarted ||
                (days(saved)!=0 && number(current,"authorizedAt")<number(saved,"authorizedAt"))) throw invalid();
        saved.put("serverAnchor",number(current,"authorizedAt")).put("anchorWall",wall-(elapsed-requestStarted))
            .put("anchorElapsed",requestStarted).put("lastElapsed",elapsed).put("lastWall",wall)
            .put("boot",boot).put("generation",generation).put("invalidated",false).put("spent",false);
        try { check(saved,owner,generation,false,wall,elapsed,boot); }
        catch(LeasePolicy.Expired expired){ saved.put("spent",true); throw expired; }
        catch(IOException denied) { saved.put("invalidated",true); throw denied; }
    }

    static Denial onHttpFailure(int status) {
        if (status == 403 || status == 404) return Denial.REMOVE;
        if (status == 401 || status == 409) return Denial.LOCK;
        return Denial.RETRY;
    }
    private static long number(JSONObject record, String key) throws IOException {
        Object value = record.opt(key);
        if (!(value instanceof Long) && !(value instanceof Integer)) throw invalid();
        return ((Number)value).longValue();
    }
    private static IOException invalid() { return new IOException("Invalid offline authorization. Refresh this copy while connected."); }
}
