package net.algt.mobiledms;

import java.io.IOException;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;

/** Identifies one HR form in the account-bound HR store and capture manifest. */
final class HrCaptureTarget {
    final long employee, epoch, previousUpload;
    final boolean service;
    final String handoff;
    private final String source;

    private HrCaptureTarget(long employee,long epoch,boolean service,long previousUpload,String handoff,String source) throws IOException {
        if (!HrRules.uuid(handoff) || employee<=0 || epoch<0 || previousUpload<0)
            throw new IOException("The evidence handoff is unavailable.");
        this.employee=employee;
        this.epoch=epoch;
        this.service=service;
        this.previousUpload=previousUpload;
        this.handoff=handoff;
        this.source=source;
    }

    JSONObject json(){
        return object("handoff",handoff,"source",source,"employee",employee,"epoch",epoch,"service",service,"previousUpload",previousUpload);
    }

    static HrCaptureTarget from(JSONObject saved) throws Exception {
        return saved==null ? null : new HrCaptureTarget(saved.getLong("employee"),saved.getLong("epoch"),
            saved.getBoolean("service"),saved.getLong("previousUpload"),saved.getString("handoff"),saved.optString("source",""));
    }

    static HrCaptureTarget forForm(long epoch, boolean service, JSONObject form, long previousUpload) throws IOException {
        String kind=ErpApi.str(form,"kind");
        JSONObject record=form.optJSONObject(service?"source":"record");
        if(kind.isEmpty() || (!service && record==null) || (record!=null && (record.optLong("id")<=0 || ErpApi.str(record,"revision").isEmpty())))
            throw new IOException("The original HR request source is unavailable.");
        JSONObject options=form.optJSONObject("options"), letter=form.optJSONObject("letter");
        String source=new org.json.JSONArray().put(kind).put(ErpApi.str(record,"kind"))
            .put(record==null?0:record.optLong("id")).put(ErpApi.str(record,"revision"))
            .put(form.optLong("caseId")).put(ErpApi.str(options,"employeeRevision"))
            .put(letter==null?0:letter.optLong("id")).put(ErpApi.str(letter,"code")).toString();
        return new HrCaptureTarget(form.optLong("employeeId"),epoch,service,previousUpload,ErpApi.str(form,"handoffId"),source);
    }

    boolean same(HrCaptureTarget other){
        return other!=null && employee==other.employee && epoch==other.epoch && service==other.service
            && handoff.equals(other.handoff) && source.equals(other.source);
    }

    boolean matches(long currentEpoch,boolean category,JSONObject form) {
        if(form==null || source.isEmpty() || epoch!=currentEpoch || service!=category)return false;
        try{return same(forForm(currentEpoch,category,form,previousUpload));}
        catch(IOException invalid){return false;}
    }

    interface Requests {
        JSONObject read() throws Exception;
        void write(JSONObject form) throws Exception;
    }
    interface CaptureSave {void install(HrCaptureTarget target) throws Exception;}

    static HrCaptureTarget admit(long epoch,boolean service,JSONObject form,HrCaptureTarget current,boolean occupied,
            long previousUpload,Requests requests,CaptureSave capture) throws Exception {
        HrCaptureTarget wanted=forForm(epoch,service,form,previousUpload);
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONObject original=requests.read();
            if(current!=null){
                if(current.same(wanted) && current.matches(epoch,service,original))return current;
                throw new IOException("Return to the original HR evidence upload or leave it before starting another request.");
            }
            if(occupied)throw new IOException("Finish or discard the current upload before adding request evidence.");
            if(original!=null && !wanted.matches(epoch,service,original))
                throw new IOException("Continue the saved HR request before starting evidence for another request.");
            // If the second atomic save fails, the original form can still be opened or retried from HR.
            requests.write(form);
            capture.install(wanted);
            return wanted;
        }
    }

    static JSONObject restore(Requests requests,long epoch,boolean service,HrCaptureTarget expected) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            JSONObject saved=requests.read();
            if(saved==null || (expected!=null && !expected.matches(epoch,service,saved)))
                throw new IOException("The original HR evidence request is unavailable. Open the current request from HR.");
            return saved;
        }
    }

    static boolean consume(Requests requests,long epoch,boolean service,HrCaptureTarget expected,
            java.util.function.BooleanSupplier visible) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            if(expected==null || !expected.matches(epoch,service,requests.read()) || !visible.getAsBoolean())return false;
            requests.write(null);
            return true;
        }
    }

    static JSONObject filing(HrCaptureTarget target,JSONObject scope,JSONObject record) throws IOException {
        if (target!=null && (scope!=null || record==null || !"employee".equals(record.optString("entityType"))
                || record.optLong("id")!=target.employee))
            throw new IOException("Leave this HR evidence upload before changing the filing destination.");
        if(record==null)return null;
        try { return object("entityType",record.getString("entityType"),"entityId",record.getLong("id")); }
        catch(org.json.JSONException invalid) { throw new IOException("The selected filing record is unavailable.",invalid); }
    }
    static void freeze(HrCaptureTarget target,long epoch,JSONObject scope,JSONObject record,JSONObject request) throws IOException {
        if (target==null) return;
        filing(target,scope,record);
        JSONObject parent=request.optJSONObject("context");
        if (epoch!=target.epoch || parent==null || !request.isNull("scope") || !"employee".equals(parent.optString("entityType"))
                || parent.optLong("entityId")!=target.employee)
            throw new IOException("The evidence upload no longer matches the originating employee or sign-in.");
    }
}
