package net.algt.mobiledms;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;

public final class HrEvidenceHandoffTest {
    private static void check(boolean ok,String detail){if(!ok)throw new AssertionError(detail);}
    interface Action {void run() throws Exception;}
    private static void denied(Action action)throws Exception{
        try{action.run();throw new AssertionError("Expected original to be protected");}catch(IOException expected){}
    }
    private static JSONObject copy(JSONObject value)throws Exception{return new JSONObject(value.toString());}
    private static JSONObject request(boolean service,long employee,long record,String revision,String id){
        JSONObject source=object("kind","ppe","id",record,"revision",revision);
        return object("handoffId",id,"employeeId",employee,"kind",service?"issue-return":"compliance",
            service?"source":"record",source,"caseId",3,"options",object("employeeRevision","e1"),"reason","original form");
    }
    private static final class Disk {
        final Path folder,manifest;
        final boolean service;
        final HrCaptureTarget.Requests requests;
        boolean failForm,failManifest;
        int formWrites,captureWrites;

        Disk(boolean service)throws Exception{
            this(service,Files.createTempDirectory("evidence-handoff"));
            saveCapture(object("pages",new JSONArray(),"uploadFingerprints",new JSONArray(),"lastUpload",object("id",19)));
        }
        Disk(boolean service,Path folder){
            this.service=service;this.folder=folder;
            manifest=folder.resolve("capture.json");
            requests=HrOperationStore.evidenceSlot(9,service,new HrOperationStore.EvidenceFiles(){
                public JSONObject read(String name)throws Exception{
                    Path path=folder.resolve(name);
                    return Files.exists(path)?json(path):null;
                }
                public void write(String name,JSONObject next)throws Exception{
                    if(failForm)throw new IOException("form storage unavailable");
                    Path path=folder.resolve(name);formWrites++;
                    if(next==null)Files.delete(path);
                    else persist(path,next);
                }
            });
        }
        static JSONObject json(Path path)throws Exception{
            return new JSONObject(new String(Files.readAllBytes(path),StandardCharsets.UTF_8));
        }
        static void persist(Path path,JSONObject data)throws IOException{
            Files.write(path,data.toString().getBytes(StandardCharsets.UTF_8));
        }
        JSONObject capture()throws Exception{return json(manifest);}
        void saveCapture(JSONObject next)throws IOException{persist(manifest,next);}
        HrCaptureTarget start(boolean service,JSONObject form)throws Exception{
            JSONObject current=capture();
            return HrCaptureTarget.admit(9,service,form,HrCaptureTarget.from(current.optJSONObject("hrEvidence")),
                current.optJSONObject("frozen")!=null || current.getJSONArray("pages").length()>0,
                current.getJSONObject("lastUpload").getLong("id"),requests,target->{
                    if(failManifest)throw new IOException("capture storage unavailable");
                    current.put("hrEvidence",target.json()).put("record",object("entityType","employee","id",target.employee));
                    captureWrites++;saveCapture(current);
                });
        }
        void exit(HrCaptureTarget target)throws Exception{
            LocalDraft.leaveEvidenceManifest(capture(),target,updated->{
                if(failManifest)throw new IOException("manifest save failed");
                saveCapture(updated);
            });
        }
    }
    static void compete(boolean service)throws Exception{
        Disk disk=new Disk(service);
        String uuid=UUID.randomUUID().toString();
        JSONObject a=request(service,41,18,"r1",uuid), b=request(service,41,35,"r2",UUID.randomUUID().toString());
        HrCaptureTarget active=disk.start(service,a);
        check(uuid.equals(active.handoff) && active.matches(9,service,disk.requests.read()),"one durable identity on both sides");
        JSONObject withPages=disk.capture();
        withPages.getJSONArray("pages").put(object("id","original-page"));disk.saveCapture(withPages);
        String formA=disk.requests.read().toString(),captureA=disk.capture().toString();
        denied(()->disk.start(service,b));
        denied(()->disk.start(service,request(service,41,18,"r1",UUID.randomUUID().toString())));
        denied(()->disk.start(service,request(service,42,18,"r1",uuid)));
        denied(()->disk.start(service,request(service,41,18,"r2",uuid)));
        check(disk.formWrites==1 && disk.captureWrites==1 && formA.equals(disk.requests.read().toString()) && captureA.equals(disk.capture().toString()),"B cannot replace either original");
        Disk resumed=new Disk(service,disk.folder);
        JSONObject stored=Disk.json(disk.folder.resolve(service?"hr-service-upload-9.json":"hr-renewal-9.json"));
        check(service?stored.getString("handoffId").equals(uuid)
            :stored.getLong("epoch")==9 && stored.getJSONObject("draft").getString("handoffId").equals(uuid),"production slot layout retained");
        HrCaptureTarget reopened=HrCaptureTarget.from(resumed.capture().getJSONObject("hrEvidence"));
        check(!reopened.matches(8,service,resumed.requests.read()) && !reopened.matches(9,!service,resumed.requests.read()),"epoch/category fenced");
        check(resumed.start(service,a).handoff.equals(uuid) && resumed.formWrites==0,"resume with pages uses original");
        resumed.exit(reopened);
        JSONObject restored=HrCaptureTarget.restore(resumed.requests,9,service,reopened);
        check(restored.getString("reason").equals("original form") && restored.getJSONObject(service?"source":"record").getLong("id")==18,"returned to A after reopening both durable records");
        resumed.requests.write(b);
        denied(()->HrCaptureTarget.restore(resumed.requests,9,service,reopened));
        check(!HrCaptureTarget.consume(resumed.requests,9,service,reopened,()->true) && resumed.requests.read().getString("handoffId").equals(b.getString("handoffId")),"late return cannot consume B");
        resumed.requests.write(a);
        check(!HrCaptureTarget.consume(resumed.requests,9,service,reopened,()->false) && resumed.requests.read()!=null,"unmounted request retained");
        check(HrCaptureTarget.consume(resumed.requests,9,service,reopened,()->true) && resumed.requests.read()==null,"exact visible A may be consumed");
    }
    static void failures(boolean service)throws Exception{
        Disk disk=new Disk(service);
        JSONObject a=request(service,41,18,"r1",UUID.randomUUID().toString());
        JSONObject other=request(service,41,19,"r2",UUID.randomUUID().toString());
        String initial=disk.capture().toString();
        disk.failForm=true;denied(()->disk.start(service,a));
        check(disk.requests.read()==null && disk.capture().toString().equals(initial),"form failure leaves capture intact");
        disk.failForm=false;disk.failManifest=true;denied(()->disk.start(service,a));
        check(disk.requests.read().getString("handoffId").equals(a.getString("handoffId")) && disk.capture().toString().equals(initial),"original form recoverable if capture save fails");
        disk.failManifest=false;denied(()->disk.start(service,other));
        HrCaptureTarget exact=HrCaptureTarget.forForm(9,service,disk.requests.read(),19);
        check(HrCaptureTarget.restore(disk.requests,9,service,exact).getString("reason").equals("original form"),"interrupted HR form still available");
        HrCaptureTarget retry=disk.start(service,disk.requests.read());
        check(retry.matches(9,service,disk.requests.read()),"interrupted capture retried with same identity");
    }
    static void exitTransitions()throws Exception{
        Disk disk=new Disk(true);
        HrCaptureTarget hr=disk.start(true,request(true,41,18,"r1",UUID.randomUUID().toString()));
        JSONObject input=disk.capture(),receipt=object("id",21,"code","U21");
        input.getJSONArray("pages").put(object("id","original-page"));
        JSONObject meta=object("file_size_bytes",99,"sha256_hash","original-sha","original_filename","replacement.pdf");
        JSONObject frozen=object("operationId",UUID.randomUUID().toString(),"metadata",meta,"context",object("entityType","employee","entityId",41));
        input.put("frozen",frozen);disk.saveCapture(input);
        LocalDraft.finishManifest(disk.capture(),receipt,"input-sha",disk::saveCapture);
        JSONObject done=disk.capture(),completed=done.getJSONObject("lastUpload"),fingerprint=done.getJSONArray("uploadFingerprints").getJSONObject(0);
        check(done.getJSONArray("pages").length()==0 && done.optJSONObject("frozen")==null && done.getJSONObject("record").getLong("id")==41,
            "completion retains employee only while evidence is active");
        check(completed.getLong("id")==21 && completed.getBoolean("startPending") && fingerprint.getString("signature").equals("input-sha"),"completion retained receipt and fingerprint");
        disk.failManifest=true;denied(()->disk.exit(hr));
        check(done.toString().equals(disk.capture().toString()),"failed exit retains original employee and binding");
        disk.failManifest=false;disk.exit(hr);
        JSONObject ordinary=disk.capture();ordinary.getJSONArray("pages").put(object("id","new-ordinary-file"));
        check(!ordinary.has("hrEvidence") && LocalDraft.needsFilingLocation(ordinary.optJSONObject("frozen"),ordinary.optJSONObject("scope"),ordinary.optJSONObject("record")),"next ordinary file enters filing-location admission");
        check(ordinary.getJSONObject("lastUpload").toString().equals(completed.toString()) && ordinary.getJSONArray("uploadFingerprints").getJSONObject(0).toString().equals(fingerprint.toString()),"receipt and fingerprints remain");
        JSONObject inProgress=copy(done);inProgress.getJSONArray("pages").put(object("id","original-page"));
        for(boolean hasFrozen:new boolean[]{false,true}){
            JSONObject original=copy(inProgress);
            if(hasFrozen)original.put("frozen",frozen);
            disk.saveCapture(original);disk.exit(hr);
            original.remove("hrEvidence");
            check(original.toString().equals(disk.capture().toString()),"in-progress parent, original pages, complete body and UUID survive exit");
        }
    }
    static void renewalReceipt()throws Exception{
        String handoff=UUID.randomUUID().toString(), operation=UUID.randomUUID().toString();
        JSONObject original=request(false,41,18,"r1",handoff);
        JSONObject body=object("op","renewalSubmit","employeeId",41,"kind","compliance","id",18,"revision","r1","operationId",operation);
        JSONObject data=object("operation",operation,"label","Renewal","lockKey","renewal:compliance:18",
            "epoch",9,"payload",body.toString(),"renewalHandoff",handoff);
        HrOperationStore.Pending receipt=new HrOperationStore.Pending(new HrOperationStore.Pending(data).metadata());
        check(receipt.matchesRenewal(original),"receipt remembers the exact renewal handoff outside the business request");
        check(!receipt.matchesRenewal(request(false,41,18,"r1",UUID.randomUUID().toString())),"different request with same record protected");
        check(!receipt.matchesRenewal(request(false,41,18,"r2",handoff)) && !receipt.matchesRenewal(request(false,42,18,"r1",handoff)),"receipt cannot consume another revision or employee");
        data.remove("renewalHandoff");
        check(!new HrOperationStore.Pending(data).matchesRenewal(original),"legacy receipt remains inspectable without claiming a form");
    }

    public static void main(String[] args)throws Exception{
        for(boolean service:new boolean[]{true,false}){compete(service);failures(service);}
        exitTransitions();renewalReceipt();
        System.out.println("HR evidence admission, durable competing service/renewal returns, storage failures and ordinary/frozen exits passed");
    }
}
