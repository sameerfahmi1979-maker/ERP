package net.algt.mobiledms;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;

/** The server operation and original payload are durable before any request is sent. */
final class HrOperationStore {
    private static final String OPERATIONS = "hr-operations.json";
    private final Context context;
    private final String account;
    private final long generation;

    HrOperationStore(Context context, String account) throws IOException {
        this.context = context.getApplicationContext();
        this.account = LeasePolicy.account(account);
        generation = LocalSecurity.generation(context);
        LocalSecurity.requireAccount(context, this.account, generation);
    }

    static final class Pending {
        final String operation, command, label, lockKey, reference, decision, renewalHandoff;
        final long employeeId, targetId, originEpoch, receiptId;
        private final String payload;
        private final JSONObject receipt;

        Pending(JSONObject value) throws Exception {
            operation = value.getString("operation");
            renewalHandoff=str(value,"renewalHandoff");
            label = value.getString("label");
            originEpoch = value.getLong("epoch");
            payload = value.getString("payload");
            JSONObject body = body();
            command = body.getString("op");
            boolean nested = command.equals("rosterSave");
            JSONObject request = nested ? body.getJSONObject("request") : body;
            employeeId = request.getLong("employeeId");
            // Derive old and new leave keys from the immutable request rather than its saved metadata.
            lockKey = "leaveSubmit".equals(command)
                ? HrRules.leaveIntent(employeeId, request.getLong("leaveTypeId"), request.getString("startDate"), request.getString("endDate"))
                : value.getString("lockKey");
            targetId = nested || "serviceDecision".equals(command) || "serviceFulfil".equals(command) || "leaveCancel".equals(command) || "decision".equals(command) || "rosterApprove".equals(command)
                ? request.optLong("id") : 0;
            decision = str(request, "decision");
            reference = "leaveSubmit".equals(command)
                ? "Leave type #" + request.getLong("leaveTypeId") + " · " + request.getString("startDate") + " to " + request.getString("endDate")
                : reference(command, str(request, "kind"), request.optLong("id"));
            if (employeeId <= 0 || targetId < 0 || originEpoch < 0 || !HrRules.uuid(operation)
                    || lockKey.isEmpty() || !operation.equals(str(request, nested ? "operation" : "operationId"))) {
                throw new IOException("The original HR request could not be read.");
            }
            receipt = value.optJSONObject("receipt");
            receiptId = receipt == null ? 0 : receipt.optLong("id");
            if (receipt != null && !matches(receipt)) throw new IOException("The stored receipt does not match this HR request.");
        }

        JSONObject body() throws Exception { return new JSONObject(payload); }

        boolean matchesRenewal(JSONObject saved) throws Exception {
            JSONObject source=saved.optJSONObject("record"), original=body();
            return "renewalSubmit".equals(command) && HrRules.uuid(renewalHandoff) && renewalHandoff.equals(str(saved,"handoffId"))
                && saved.optLong("employeeId")==employeeId && str(saved,"kind").equals(str(original,"kind")) && source!=null
                && source.optLong("id")==original.optLong("id") && str(source,"revision").equals(str(original,"revision"));
        }

        JSONObject metadata() throws Exception {
            JSONObject data=object("operation", operation, "label", label, "lockKey", lockKey, "epoch", originEpoch, "payload", payload, "receipt", receipt);
            if(!renewalHandoff.isEmpty())data.put("renewalHandoff",renewalHandoff);
            return data;
        }

        String effect() { return str(receipt,"effect"); }

        boolean matches(JSONObject candidate) {
            if ("serviceReceipt".equals(HrV5Rules.receipt(command))) {
                try {return HrServiceReceipt.matches(body(),candidate,receipt);}
                catch(Exception malformed){return false;}
            }
            return candidate != null && (receiptId == 0 || candidate.optLong("id") == receiptId)
                && HrRules.confirmed(operation, str(candidate, "operationId"), employeeId, targetId,
                candidate.optLong("employeeId"), candidate.optLong("id"), str(candidate, "revision"), candidate.opt("replayed") instanceof Boolean);
        }

        private static String reference(String command, String kind, long sourceId) {
            if (sourceId <= 0) return "";
            switch (command) {
                case "decision":
                    String type = "leave".equals(kind) ? "Leave request" : "approval".equals(kind) ? "HR approval" : "HR proposal";
                    return type + " #" + sourceId;
                case "serviceDecision":case "serviceFulfil":return "HR service request #"+sourceId;
                case "leaveCancel": return "Leave request #" + sourceId;
                case "timeCorrection": return "Attendance record #" + sourceId;
                case "renewalSubmit": return "Renewal record #" + sourceId;
                default: return "Timesheet record #" + sourceId;
            }
        }
    }

    Pending freeze(JSONObject body, String operation, long epoch, String label, String lockKey,String renewalHandoff) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            List<Pending> entries = pending();
            Pending original = new Pending(object("operation", operation, "label", label, "lockKey", lockKey, "epoch", epoch, "payload", body.toString(),"renewalHandoff",renewalHandoff));
            for (Pending entry : entries) {
                if (HrRules.sameSubmission(entry.lockKey, original.lockKey))
                    throw new IOException("Check the saved HR submission or receipt for this item before submitting again.");
            }
            if (entries.size() >= 32) throw new IOException("Check pending HR submissions before sending another request.");
            entries.add(original);
            write(entries);
            return original;
        }
    }

    List<Pending> pending() throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            JSONObject saved = read(OPERATIONS);
            List<Pending> entries = new ArrayList<>();
            if (saved == null) return entries;
            JSONArray rows = saved.getJSONArray("entries");
            for (int i = 0; i < rows.length(); i++) entries.add(new Pending(rows.getJSONObject(i)));
            return entries;
        }
    }

    Pending confirm(String operation, JSONObject receipt) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            List<Pending> entries = pending();
            for (int i = 0; i < entries.size(); i++) {
                Pending current = entries.get(i);
                if (!current.operation.equals(operation)) continue;
                if (!current.matches(receipt)) throw new IOException("The ERP receipt did not confirm this original submission.");
                if (current.receiptId > 0) return current;
                JSONObject saved = current.metadata();
                saved.put("receipt", receipt);
                Pending confirmed = new Pending(saved);
                entries.set(i, confirmed);
                write(entries);
                return confirmed;
            }
            throw new IOException("The saved HR submission is no longer available.");
        }
    }

    void acknowledge(String operation, long receiptId) throws Exception {
        remove(operation, receiptId, true);
    }

    void discardRejected(String operation) throws Exception {
        remove(operation, 0, false);
    }

    private void remove(String operation, long receiptId, boolean acknowledgement) throws Exception {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            List<Pending> entries = pending();
            for (int i = 0; i < entries.size(); i++) {
                Pending entry = entries.get(i);
                if (!entry.operation.equals(operation)) continue;
                if (acknowledgement ? !HrRules.canAcknowledge(entry.receiptId, receiptId) : entry.receiptId > 0)
                    throw new IOException("The saved confirmation changed. Open the current receipt.");
                entries.remove(i);
                write(entries);
                return;
            }
        }
    }

    interface EvidenceFiles {
        JSONObject read(String name) throws Exception;
        void write(String name,JSONObject value) throws Exception;
    }

    HrCaptureTarget.Requests evidenceSlot(long epoch,boolean service) {
        return evidenceSlot(epoch,service,new EvidenceFiles(){
            public JSONObject read(String name) throws Exception {return HrOperationStore.this.read(name);}
            public void write(String name,JSONObject value) throws Exception {
                LocalSecurity.requireAccount(context,account,generation);
                if(value==null){file(name).delete();return;}
                save(name,value);
                if(!service)clearRenewalFiles(file(name).getBaseFile().getParentFile(),name);
            }
        });
    }

    static HrCaptureTarget.Requests evidenceSlot(long epoch,boolean service,EvidenceFiles files) {
        String name=service?"hr-service-upload-"+epoch+".json":renewalName(epoch);
        return new HrCaptureTarget.Requests(){
            public JSONObject read() throws Exception {
                synchronized(LocalSecurity.STORAGE_LOCK){
                    JSONObject value=files.read(name);
                    if(service || value==null)return value;
                    return value.optLong("epoch",-1)==epoch?value.optJSONObject("draft"):null;
                }
            }
            public void write(JSONObject form) throws Exception {
                synchronized(LocalSecurity.STORAGE_LOCK){
                    if(form==null){
                        if(read()!=null)files.write(name,null);
                    }else files.write(name,service?form:object("epoch",epoch,"draft",form));
                }
            }
        };
    }

    // Older standalone forms did not always have an ID. Assign theirs only on explicit HR recovery.
    JSONObject restoreEvidence(long epoch,boolean service,HrCaptureTarget expected) throws Exception {
        synchronized(LocalSecurity.STORAGE_LOCK){
            HrCaptureTarget.Requests slot=evidenceSlot(epoch,service);
            JSONObject form=HrCaptureTarget.restore(slot,epoch,service,expected);
            if(expected==null && !form.has("handoffId")){
                form.put("handoffId",java.util.UUID.randomUUID().toString());
                slot.write(form);
            }
            return form;
        }
    }

    static boolean hasServiceDraft(Context c,String user,long epoch){
        return epoch>=0 && exists(c,user,"hr-service-upload-"+epoch+".json");
    }

    static boolean hasOperations(Context context, String user) { return exists(context, user, OPERATIONS); }

    static boolean hasRenewal(Context context, String user, long epoch) {
        return epoch >= 0 && exists(context, user, renewalName(epoch));
    }

    private static boolean exists(Context context, String user, String name) {
        try {
            File file = new File(new File(context.getNoBackupFilesDir(), LeasePolicy.account(user)), name);
            return file.isFile() || new File(file.getPath() + ".bak").isFile();
        } catch (IOException error) { return false; }
    }

    static void clear(Context context, String user) throws IOException {
        synchronized (LocalSecurity.STORAGE_LOCK) {
            File folder = new File(context.getNoBackupFilesDir(), LeasePolicy.account(user));
            new AtomicFile(new File(folder, OPERATIONS)).delete();
            clearRenewalFiles(folder, "");
            File[] drafts=folder.listFiles((dir,name)->name.matches("hr-service-upload-[0-9]+\\.json(?:\\.(?:bak|new))?"));
            if(drafts!=null)for(File draft:drafts)draft.delete();
        }
    }

    private static String renewalName(long epoch) { return "hr-renewal-" + epoch + ".json"; }

    private static void clearRenewalFiles(File folder, String keep) {
        File[] files = folder.listFiles((path, name) -> name.matches("hr-renewal-[0-9]+\\.json(?:\\.(?:bak|new))?"));
        if (files == null) return;
        for (File each : files) {
            String fileName = each.getName(), base = fileName.endsWith(".json") ? fileName : fileName.substring(0, fileName.length() - 4);
            if (!keep.equals(base)) new AtomicFile(new File(folder, base)).delete();
        }
    }

    private void write(List<Pending> entries) throws Exception {
        if (entries.isEmpty()) {
            LocalSecurity.requireAccount(context, account, generation);
            file(OPERATIONS).delete();
            return;
        }
        JSONArray rows = new JSONArray();
        for (Pending entry : entries) rows.put(entry.metadata());
        save(OPERATIONS, object("entries", rows));
    }

    private JSONObject read(String name) throws Exception {
        LocalSecurity.requireAccount(context, account, generation);
        return LocalSecurity.readJson(context, account, "hr:" + name, file(name), false);
    }

    private void save(String name, JSONObject data) throws Exception {
        LocalSecurity.requireAccount(context, account, generation);
        LocalSecurity.directory(context.getNoBackupFilesDir(), account);
        LocalSecurity.writeJson(context, account, "hr:" + name, file(name), data);
    }

    private AtomicFile file(String name) {
        return new AtomicFile(new File(new File(context.getNoBackupFilesDir(), account), name));
    }
}
