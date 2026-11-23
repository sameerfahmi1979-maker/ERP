package net.algt.mobiledms;

import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.function.*;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.DmsApi.*;

public final class WholeCorrectionFlowsTest {
    static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);System.out.println("PASS "+label);}
    interface Attempt {void run()throws Exception;}
    static void refused(Attempt a)throws Exception{try{a.run();}catch(IOException expected){return;}throw new AssertionError("Action should have failed");}
    static final String HASH=String.join("",Collections.nCopies(64,"a"));
    static void issued()throws Exception{
        byte[] original=new byte[70000];new Random(17).nextBytes(original);
        AtomicLong exportClock=new AtomicLong();HrRecovery.ExportFiles staging=new HrRecovery.ExportFiles(exportClock::get);
        Object action=new Object();staging.select(action);
        File staged=File.createTempFile("issued-fixture-",".pdf");Files.write(staged.toPath(),original);
        staging.attach(action,staged::delete);
        InactivityLease lease=new InactivityLease();lease.confirmed(true,1,0);AtomicLong now=new AtomicLong();
        AtomicBoolean approved=new AtomicBoolean(true);AtomicInteger remote=new AtomicInteger();
        BooleanSupplier local=()->staging.owns(action)&&lease.remaining(1,now.get())>0;
        DmsTransfer.Source current=()->{remote.incrementAndGet();if(!approved.get())throw new IOException("Issuance revoked");};
        DmsTransfer.Open recipient=new DmsTransfer.Open(local,current,staged::delete);
        recipient.open();approved.set(false);refused(recipient::firstRead);
        check(remote.get()==2&&!staged.exists(),"C1 deferred recipient first read rechecks ERP and deletes revoked bytes");
        Files.write(staged.toPath(),original);approved.set(true);now.set(599999);
        recipient=new DmsTransfer.Open(local,current,staged::delete);recipient.open();now.set(600000);refused(recipient::firstRead);
        check(!staged.exists(),"C1 ten-minute expiry before recipient first read discards local bytes");
        lease.confirmed(true,1,600000);Files.write(staged.toPath(),original);
        recipient=new DmsTransfer.Open(local,current,staged::delete);recipient.open();recipient.firstRead();lease.reset();refused(recipient::firstRead);
        check(!staged.exists(),"C1 lock after an admitted recipient read fences the next chunk");
        lease.confirmed(true,1,600000);ByteArrayOutputStream out=new ByteArrayOutputStream();
        refused(()->DmsTransfer.deliver(local,current,()->{approved.set(false);return out;},new ByteArrayInputStream(original),original.length));
        check(out.size()==0,"C1 destination open spanning ERP withdrawal writes zero PDF bytes");
        approved.set(true);ByteArrayOutputStream partial=new ByteArrayOutputStream(){
            public void write(byte[] b,int off,int len){super.write(b,off,len);lease.reset();}
        };
        refused(()->DmsTransfer.deliver(local,current,()->partial,new ByteArrayInputStream(original),original.length));
        check(partial.size()==32768,"C1 lock during save stops copying after the already released chunk");
        lease.confirmed(true,1,600000);DmsTransfer.deliver(local,current,()->out,new ByteArrayInputStream(original),original.length);
        check(Arrays.equals(original,out.toByteArray()),"C1 current export delivers exact original bytes");
        Files.write(staged.toPath(),original);Object b=new Object();staging.select(b);
        File newer=File.createTempFile("issued-B-fixture-",".pdf");staging.attach(b,newer::delete);
        File late=File.createTempFile("issued-A-late-",".pdf");refused(()->staging.attach(action,late::delete));
        check(!staged.exists()&&!late.exists()&&newer.exists()&&staging.owns(b),"C1 new B selection deletes A; late A cannot replace or delete B");
        exportClock.set(599000);staging.interacted();exportClock.set(600000);
        check(staging.remaining(b)>0,"C1 genuine local use renews export inactivity");
        exportClock.set(1199000);
        check(staging.remaining(b)==0,"C1 chooser waits cannot renew export inactivity even with device app lock disabled");
        DmsTransfer.Open lockedOff=new DmsTransfer.Open(()->staging.remaining(b)>0,current,newer::delete);
        refused(lockedOff::firstRead);
        check(!newer.exists(),"C1 actual recipient cannot read after export inactivity when app lock is disabled");
        staging.select(null);
    }
    static class Journal implements DmsSubmission.Journal {
        JSONObject row;long epoch=1;
        Journal(JSONObject original)throws Exception{row=object("owner","A","epoch",1,"attempts",0,"lock","comment/9/new","payload",original.toString());}
        public long beginAttempt(JSONObject b)throws Exception{return DmsSubmission.begin(row,b,"A",epoch);}
        public void refuseAttempt(JSONObject b,long attempt,String reason)throws Exception{DmsSubmission.refuse(row,b,attempt,reason);}
        public void sourceConflict(JSONObject b){throw new AssertionError();}
        public void finish(JSONObject b,JSONObject receipt)throws Exception{DmsSubmission.confirm(row,b,receipt);}
    }
    static void receipts()throws Exception{
        String uuid=UUID.randomUUID().toString();JSONObject body=cmd("documentCommentAdd","documentId",9,"text","Original","sourceHash",HASH,"operationId",uuid);
        Journal journal=new Journal(body);List<String> mutations=new ArrayList<>();
        refused(()->DmsSubmission.send(journal,body,original->{mutations.add(original.getString("operationId"));throw new ErpApi.Rejected("Source changed",409,object("code","source_changed","uncertain",true,"operationId",uuid));}));
        check(!journal.row.optBoolean("conflict")&&DmsOperationStore.blocks(journal.row,body,"comment/9/new"),"I1 committed-but-withheld response retains and blocks the original UUID");
        journal.epoch=2;refused(()->DmsSubmission.send(journal,body,original->{throw new AssertionError("prior login replay");}));
        JSONObject proof=DmsSubmission.lookup(body,query->{
            check("documentReceiptLookup".equals(query.getString("op"))&&body.toString().equals(query.getJSONObject("original").toString()),"I2 across-login wire is read-only and contains the exact body and UUID");
            return object("state","confirmed","command",body.getString("op"),"operationId",uuid);
        });
        check(uuid.equals(proof.getString("operationId"))&&mutations.equals(Arrays.asList(uuid)),"I1/I2 exact original recovered without a second mutation");
        check(DmsSubmission.lookup(body,q->object("state","unconfirmed","command",body.getString("op"),"operationId",uuid))==null,"I2 no receipt leaves original uncertain");
        refused(()->DmsSubmission.lookup(body,q->{throw new ErpApi.Rejected("Access withdrawn",403,null);}));
        check(!journal.row.has("receipt")&&!journal.row.optBoolean("conflict"),"I2 denial cannot settle the journal");
        Journal pre=new Journal(body);
        refused(()->DmsSubmission.send(pre,body,o->{throw new ErpApi.Rejected("Pre-admission conflict",409,object("code","source_changed","noEffect",true));}));
        check(pre.row.optBoolean("conflict"),"I1 proven first pre-admission conflict can close without effect");
        check(!DmsOperationStore.blocks(journal.row,put(copy(body),"text","Different"),"comment/9/new"),"I2 demonstrably different comment remains available");
        JSONObject entries=new JSONObject();for(int i=0;i<64;i++)entries.put(UUID.randomUUID().toString(),copy(journal.row));
        check(DmsOperationStore.activeCount(entries,2)==0&&entries.length()==64&&DmsOperationStore.blocks(entries.getJSONObject(entries.keys().next()),body,"comment/9/new"),"I2 retaining 64 prior-login originals frees active slots and still prevents exact duplicate");
        JSONObject criteria=object("version",1,"search","alpha","validity","all","personal",false),saved=cmd("documentSavedFilterSave","name","Saved","criteria",criteria);
        JSONObject old=object("lock","filter/new","payload",saved.toString(),"archived",true);
        check(DmsOperationStore.blocks(old,saved,"filter/new")&&!DmsOperationStore.blocks(old,put(copy(saved),"criteria",put(copy(criteria),"search","beta")),"filter/new"),"I2 different saved criteria can proceed while exact saved search stays protected");
    }
    static void visits()throws Exception{
        for(String context:Arrays.asList("documents page 2","employee folder","record search","personal checklist","renewal tasks page 3")){
            AtomicBoolean owner=new AtomicBoolean(true),foreground=new AtomicBoolean(true);List<String> rows=new ArrayList<>();
            AtomicReference<String> authority=new AtomicReference<>("Old");AtomicBoolean fresh=new AtomicBoolean();
            OnlineListVisit mounted=new OnlineListVisit(()->owner.get()&&foreground.get(),()->{fresh.set(true);rows.add(authority.get());});
            if(mounted.visible())rows.add(authority.get());
            foreground.set(false);mounted.hide(rows::clear);if(mounted.visible())rows.add("Late");
            authority.set("Fresh");foreground.set(true);mounted.resume(owner::get,()->{throw new AssertionError();});
            if(mounted.visible())rows.add("Old retry");
            check(fresh.get()&&rows.equals(Arrays.asList("Fresh")),"I3 "+context+" hides drawn rows, rejects delayed results, and reopens fresh");
        }
        AtomicBoolean expired=new AtomicBoolean();new OnlineListVisit(()->true,()->{throw new AssertionError();}).resume(()->false,()->expired.set(true));
        check(expired.get(),"I3 account/login replacement cannot restore old visit");
    }
    static void employee()throws Exception{
        JSONObject parent=object("entityType","employee","entityId",33),doc=object("id",72,"currentVersionId",8,"sourceHash",HASH,"actions",object("requestRenewal",true),"renewalParent",parent);
        for(JSONObject selected:new JSONObject[]{null,parent}){
            JSONObject bound=DmsRequests.renewalParent(doc,selected),options=DmsRequests.options(bound,"renewal",doc,"",1);
            check(options.getJSONObject("parent").getLong("entityId")==33&&options.getLong("documentId")==72&&HASH.equals(options.getString("sourceHash")),"I4 document entry uses ERP-selected parent, exact document and current source");
        }
        check(DmsRequests.renewalParent(doc,object("entityType","employee","entityId",34))==null&&DmsRequests.options(parent,"renewal",put(copy(doc),"renewalParent",null),"",1)==null,"I4 mismatched sibling or withdrawn renewal cannot open its form");
        JSONObject files=DmsDocuments.fileRequest(put(copy(doc),"selectedEmployee",33),8,2);
        check(files.getLong("employeeId")==33&&files.getLong("documentId")==72&&files.getLong("versionId")==8&&files.getInt("page")==2,"I5 employee folder and file revalidation keep exact selected employee document and version");
        EmployeeRecords.Filters filters=new EmployeeRecords.Filters();filters.search="applied";
        filters.select("company",object("value","7","label","Company"));filters.select("branch",object("value","8","label","Branch"));
        JSONObject dir=EmployeeRecords.directoryQuery(filters,2),record=EmployeeRecords.recordVisit(33,"Documents and compliance",dir);
        String op=UUID.randomUUID().toString();
        JSONObject payload=object("op","serviceDecision","employeeId",66,"id",77,"revision","1","decision","approve","operationId",op);
        HrOperationStore.Pending unrelated=new HrOperationStore.Pending(object("operation",op,"label","Other receipt","epoch",1,"lockKey","service/77","payload",payload.toString()));
        AtomicReference<JSONObject> route=new AtomicReference<>();
        for(List<HrOperationStore.Pending> journal:Arrays.asList(Collections.<HrOperationStore.Pending>emptyList(),Arrays.asList(unrelated))){
            AtomicBoolean read=new AtomicBoolean();
            HrRecovery.resumeRead(record,true,selected->HrRecovery.deliverVisit(selected,r->{route.set(r);read.set(true);},
                id->{throw new AssertionError("unrelated receipt displaced the selected visit");},()->{throw new AssertionError("unrelated journal displaced directory");}),()->{throw new AssertionError();});
            JSONObject back=route.get().getJSONObject("directoryParent"),restored=EmployeeRecords.directoryQuery(EmployeeRecords.appliedFilters(back),back.getInt("page"));
            check(read.get()&&route.get().getLong("employeeId")==33&&"Documents and compliance".equals(route.get().getString("section"))&&restored.toString().equals(dir.toString())&&(journal.isEmpty()||journal.get(0).employeeId==66),"I6 selected person, section and filtered directory page survive quick return (unrelated journal "+!journal.isEmpty()+")");
        }
        AtomicReference<HrOperationStore.Pending> opened=new AtomicReference<>();
        HrRecovery.resumeRead(object("op","savedOperation","operationId",op),true,selected->HrRecovery.deliverVisit(selected,r->{throw new AssertionError();},
            id->{if(unrelated.operation.equals(id))opened.set(unrelated);},()->{throw new AssertionError();}),()->{throw new AssertionError();});
        check(opened.get()==unrelated,"I6 an interrupted original opens its exact journal record");
        AtomicBoolean denied=new AtomicBoolean();HrRecovery.resumeRead(record,false,r->{throw new AssertionError();},()->denied.set(true));
        check(denied.get(),"I6 changed login cannot restore a private employee");
    }
    static void permissionsAndLinks()throws Exception{
        JSONObject profile=object("capabilities",object("hr",false));
        HrWorkspace.applyHomeAccess(profile,object("entryAvailable",true,"capabilities",object("work",true,"directory",false,"employees",false)));
        check(profile.getJSONObject("capabilities").getBoolean("hr")&&!profile.getBoolean("hrDirectoryAvailable"),"I7 current scoped HR home admits assignments-only employee without staff search");
        HrWorkspace.applyHomeAccess(profile,object("entryAvailable",true,"capabilities",object("directory",true)));
        check(profile.getBoolean("hrDirectoryAvailable"),"I7 scoped staff receives directory entry");
        HrWorkspace.applyHomeAccess(profile,object("entryAvailable",false,"capabilities",object("directory",false)));
        check(!profile.getJSONObject("capabilities").getBoolean("hr"),"I7 empty current authority removes HR destination");
        String base="https://erp.algt.net/api/mobile/dms/shared#",a=String.join("",Collections.nCopies(43,"A")),b="B"+a.substring(1);
        AtomicReference<DmsSharing.Incoming> inbox=new AtomicReference<>();
        DmsSharing.receive(base+a,inbox::set);DmsSharing.Incoming invalid=DmsSharing.receive("https://invalid.example/",inbox::set);
        check(!invalid.valid()&&inbox.get()==invalid&&inbox.get().token==null,"M1 valid then invalid replaces token and reports invalid");
        DmsSharing.receive(base+a,inbox::set);DmsSharing.Incoming next=DmsSharing.receive(base+b,inbox::set);
        check(next==inbox.get()&&b.equals(next.token),"M1 next valid intent replaces previous valid token");
        check(DmsSharing.Incoming.acrossSignIn(next,true)==next&&DmsSharing.Incoming.acrossSignIn(next,false)==null,"M1 pending valid recipient link survives initial authentication only");
    }
    public static void main(String[] args)throws Exception{issued();receipts();visits();employee();permissionsAndLinks();}
}
