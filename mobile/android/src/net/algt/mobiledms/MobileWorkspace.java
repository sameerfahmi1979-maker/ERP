package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.os.Build;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.time.LocalDate;
import java.util.ArrayList;
import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;
import static net.algt.mobiledms.LauncherActivity.join;
import static net.algt.mobiledms.LauncherActivity.status;

/** The employee/staff workspace uses the same authorized ERP operations. */
final class MobileWorkspace implements OfflineOrigin.Host {
    private final LauncherActivity a;
    private boolean personal;
    private String entityType = "", entityLabel = "", validity = "all";
    private long entityId, typeId;
    private String typeLabel = "All types";

    MobileWorkspace(LauncherActivity activity) { a = activity; }

    void home() { home(true); }

    void home(boolean loadChecklist) {
        if (a.capability("personal") && !a.capability("records") && entityId == 0) personal = true;
        a.dms.onlinePage(HOME_PAGE,null,a::reconnect);
        a.title("Home");
        String name = str(a.profile, "name");
        if (!name.isEmpty()) a.subtitle(name);
        if (a.profile != null && a.profile.optInt("apiVersion", 1) < 2)
            a.subtitle("The ERP mobile service is being updated. Existing upload and document actions remain available.");
        a.section("Quick actions");
        if (a.capability("upload")) a.action("Scan or upload a document", () -> a.openCaptureFrom(null), true);
        if (a.capability("personal")) a.card("My documents", "Files linked to your employee record", () -> browse(true));
        else if (a.capability("view")) a.card("Find documents", "Search by name, number or document type", () -> browse(false));
        if (a.capability("hr") && a.profile.optBoolean("hrDirectoryAvailable"))
            a.card("Employees", "Find an employee by name or code", a::employeeDirectory);
        else if (a.capability("hr")) a.card("HR services", "Open your permitted employee and team services", a::openHr);
        if (offers(MobileRoute.Destination.INBOX)) a.card("Inbox", "Open your work and requests", this::inbox);
        communicationEntries(() -> home(false));
        if (loadChecklist && a.capability("personal")) {
            JSONObject employee = a.profile.optJSONObject("employee");
            if (employee != null) a.run("Checking your document checklist",
                () -> a.api.get(object("op", "folder", "entityType", "employee", "entityId", employee.optLong("id"), "page", 1)),
                result -> {
                    showSummary(result.optJSONObject("summary"));
                    showMissing(result.optJSONArray("missing"), "employee", employee.optLong("id"), str(employee, "label"));
                });
        }
    }

    boolean offers(MobileRoute.Destination destination) {
        if (a.profile == null) return false;
        switch (destination) {
            case HOME: case MORE: return true;
            case DOCUMENTS: return a.capability("view") || a.capability("upload") || a.capability("records")
                || a.capability("personal") || a.capability("review");
            case HR: return a.capability("hr");
            case INBOX: return a.capability("tasks") || a.capability("hr") && a.profile.optBoolean("hrInboxAvailable");
            default: return false;
        }
    }

    void destination(MobileRoute.Destination item) {
        switch (item) {
            case HOME: home(); break;
            case DOCUMENTS: documentsHome(); break;
            case HR: a.openHr(); break;
            case INBOX: inbox(); break;
            case MORE: settings(); break;
        }
    }

    void browse(boolean own) { resetFilters(); personal = own; documents(1); }

    void documentsHome() {
        if (!offers(MobileRoute.Destination.DOCUMENTS)) { home(); return; }
        a.page(DOCUMENTS_HOME, this::home, true);
        a.title("Documents");
        if (a.capability("upload")) {
            a.section("Capture and upload");
            a.action("Scan or upload a document", () -> a.openCaptureFrom(null), true);
            if (a.dms.available()) a.card("Separate document uploads", "Keep each selected original as its own document", a.dms.capture::queue);
        }
        if (a.capability("view") || a.capability("records") || a.capability("personal")) {
            a.section("Find documents");
            if (a.capability("view")) a.action("Search documents", () -> browse(false), false);
            if (a.capability("personal")) a.action("My documents", () -> browse(true), false);
            if (a.capability("records")) a.action("Employee and site folders", () -> records("employee", "", false), false);
            if (a.capability("view") && a.dms.enabled("naturalSearch")) a.action("Search in plain language", () -> a.dms.collections.natural("", null, 1), false);
            if (a.capability("view") && a.dms.enabled("qr")) a.action("Scan document code", a.dms.capture::qr, false);
        }
        if (a.dms.enabled("requests") || a.capability("renewals")) {
            a.section("Requests and renewals");
            if (a.dms.enabled("requests")) a.action("Document requests and checklists", () -> a.dms.requests.list("mine", null, 1, 0, ""), false);
            if (a.capability("renewals")) a.action("Renewal tasks", () -> tasks("renewals", 1), false);
        }
        a.section("Library");
        if (a.capability("view") && a.dms.enabled("collections")) {
            a.action("Favourites", () -> a.dms.collections.favourites(1), false);
            a.action("Saved searches", () -> a.dms.collections.filters(1), false);
        }
        a.action("Saved offline documents", () -> offline(OfflineOrigin.documents().search("")), false);
        if (a.dms.available()) {
            a.section("Packs and sharing");
            if (a.capability("view") && a.dms.enabled("packs")) a.action("Submission packs", a.dms.packs::home, false);
            if(a.dms.sharing.incoming!=null){
                if(a.dms.sharing.incoming.valid())a.action("Open incoming ERP link",a.dms.sharing::resolve,true);
                else a.subtitle("This ERP link is invalid or unavailable.");
            }
            a.action("Submission receipts", a.dms::pending, false);
        }
    }

    void inbox() {
        if (!offers(MobileRoute.Destination.INBOX)) { home(); return; }
        a.page(INBOX_HOME, this::home, true);
        a.title("Inbox");
        documentWork();
        if (a.capability("hr") && a.profile.optBoolean("hrInboxAvailable")) {
            a.section("HR work");
            a.card("Requests and approvals", "Open your permitted queues and request history", a::hrInbox);
        }
    }

    static boolean documentNotifications(boolean contract,boolean allowed) { return contract && allowed; }

    void documentWork() {
        if (!a.capability("tasks")) return;
        a.section("Document work");
        a.action("Tasks and upload history", () -> tasks("uploads", 1), false);
        if (a.dms.enabled("requests")) a.action("Assigned document requests", () -> a.dms.requests.list("assigned", null, 1, 0, ""), false);
        if (documentNotifications(a.dms.available(),a.capability("notifications"))) a.action("Document notifications", () -> a.dms.collections.notifications(false, 1), false);
    }

    JSONObject currentParent(){
        if(entityId>0)return object("entityType",entityType,"entityId",entityId);
        JSONObject e=personal&&a.profile!=null?a.profile.optJSONObject("employee"):null;
        return e!=null&&e.optLong("id")>0?object("entityType","employee","entityId",e.optLong("id")):null;
    }
    JSONObject criteria(){
        JSONObject c=object("version",1,"search",a.query,"personal",personal,"validity",validity);
        if(entityId>0){DmsApi.put(c,"entityType",entityType);DmsApi.put(c,"entityId",entityId);}if(typeId>0)DmsApi.put(c,"typeId",typeId);return c;
    }
    void applyCriteria(JSONObject c,Runnable back){
        long entity=c.optLong("entityId"),type=c.optLong("typeId");
        list(c,entity>0?str(c,"entityType")+" #"+entity:"",type>0?"Type #"+type:"All types",1,back);
    }
    public void list(JSONObject c,String entity,String type,int page,Runnable back){
        resetFilters();a.query=str(c,"search");personal=c.optBoolean("personal");validity=str(c,"validity");entityType=str(c,"entityType");entityId=c.optLong("entityId");typeId=c.optLong("typeId");
        entityLabel=entity;typeLabel=type;documents(page,back);
    }
    void resetFilters() {
        personal = false; entityType = entityLabel = ""; entityId = typeId = 0;
        typeLabel = "All types"; validity = "all"; a.query = "";
    }

    void documents(int page) { documents(page,this::documentsHome); }

    void documents(int page, Runnable parent) {
        a.dms.onlinePage(DOCUMENT_LIST,parent,()->{
            if(entityId>0)entityLabel=HrView.title(entityType)+" #"+entityId;
            if(typeId>0)typeLabel="Type #"+typeId;
            documents(page,parent);
        });
        a.title(personal ? "My documents" : "Documents");
        EditText search = a.field(a.content, "Name, document number or keyword", a.query, 200, InputType.TYPE_CLASS_TEXT);
        search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        Runnable find = () -> { a.query = a.value(search); documents(1,parent); };
        search.setOnEditorActionListener((v, action, event) -> {
            if (action != android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH || a.busy) return false;
            find.run(); return true;
        });
        a.action("Search", find, true);
        LinearLayout filters = a.row(a.content);
        a.inline(filters, typeLabel, () -> { a.query = a.value(search); chooseType(parent); }, false);
        a.inline(filters, "Status · " + status(validity), () -> a.dialogBuilder()
            .setTitle("Document validity").setItems(new String[]{"All", "Valid", "Expired", "Expiring within 30 days"}, (d, which) -> {
                a.query = a.value(search); validity = new String[]{"all", "valid", "expired", "expiring"}[which]; documents(1,parent);
            }).show(), false);
        a.action("Saved offline", () -> {
            JSONObject source=criteria(); DmsApi.put(source,"search",a.value(search));
            offline(OfflineOrigin.list(source,entityLabel,typeLabel,page,parent).search(""));
        }, false);
        if(a.dms.available()){
            
            if(a.dms.enabled("collections"))a.action("Save this search",()->{a.query=a.value(search);a.dms.collections.save(null,criteria(),()->documents(page,parent));},false);
            JSONObject p=currentParent();if(p!=null)a.action("Required documents and requests",()->a.dms.requests.checklist(p,1,()->documents(page,parent)),false);
        }
        if (entityId > 0) a.action("Record checklist", () -> folderSummary(page,parent), false);
        JSONObject request = object("op", "documents", "search", a.query, "page", page, "personal", personal, "validity", validity);
        try {
            if (typeId > 0) request.put("typeId", typeId);
            if (entityId > 0) request.put("entityType", entityType).put("entityId", entityId);
        } catch (Exception error) { a.message("Search could not be prepared.", true); return; }
        a.run("Finding documents", () -> a.api.get(request), result -> {
            if(entityId>0)a.title(entityLabel);
            JSONArray rows = result.getJSONArray("rows");
            if (!result.isNull("total")) a.subtitle(result.getLong("total") + " matching documents");
            if (rows.length() == 0) a.subtitle("Try a shorter name, document number, or a different filter.");
            JSONArray suggestions = result.optJSONArray("suggestions");
            if (suggestions != null && suggestions.length() > 0) {
                a.subtitle("Possible name matches");
                for (int i = 0; i < suggestions.length(); i++) {
                    JSONObject suggestion = suggestions.getJSONObject(i);
                    a.card(str(suggestion, "label"), str(suggestion, "code"), () -> {
                        resetFilters(); entityType = str(suggestion, "entityType"); entityId = suggestion.optLong("id");
                        entityLabel = str(suggestion, "label"); documents(1,parent);
                    });
                }
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject doc = rows.getJSONObject(i);
                a.card(first(str(doc, "title"), str(doc, "number")),
                    join(str(doc, "number"), str(doc, "type"), status(str(doc, "status")), expiry(str(doc, "expiry"))),
                    () -> {if(a.dms.enabled("details"))a.dms.docs.detail(doc.optLong("id"),currentParent(),()->documents(page,parent));else a.document(doc.optLong("id"),()->documents(page,parent));});
            }
            LinearLayout paging = a.row(a.content);
            if (page > 1) a.inline(paging, "Previous", () -> documents(page - 1,parent), false);
            if (page * 25L < result.optLong("total")) a.inline(paging, "Next", () -> documents(page + 1,parent), false);
        });
    }

    private void chooseType(Runnable parent) {
        a.run("Loading document types", () -> a.api.list(object("op", "types")), types -> {
            String[] labels = new String[types.length() + 1]; labels[0] = "All types";
            for (int i = 0; i < types.length(); i++) labels[i + 1] = str(types.getJSONObject(i), "label");
            a.dialogBuilder().setTitle("Document type").setItems(labels, (d, which) -> {
                typeId = which == 0 ? 0 : types.optJSONObject(which - 1).optLong("id");
                typeLabel = labels[which]; documents(1,parent);
            }).show();
        });
    }

    void chooseRecord() {
        a.dialogBuilder().setTitle("File this document under")
            .setItems(new String[]{"Employee", "Work site"}, (d, which) -> records(which == 0 ? "employee" : "site", "", true)).show();
    }

    private void records(String kind, String query, boolean filing) {
        a.dms.onlinePage(DMS_PAGE,filing ? a::capture : this::documentsHome,()->records(kind,query,filing));
        a.title("employee".equals(kind) ? "Employees" : "Work sites");
        EditText search = a.field(a.content, "Search name or code", query, 100, InputType.TYPE_CLASS_TEXT);
        a.action("Search records", () -> records(kind, a.value(search), filing), true);
        a.action("employee".equals(kind) ? "Find work sites" : "Find employees", () -> records("employee".equals(kind) ? "site" : "employee", "", filing), false);
        a.run("Loading permitted records", () -> a.api.call(object("op", "records", "entityType", kind, "search", query)), value -> {
            JSONArray rows = value instanceof JSONArray ? (JSONArray)value : ((JSONObject)value).getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No matching records in your permitted scope.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject record = rows.getJSONObject(i);
                a.card(str(record, "label"), join(str(record, "code"), str(record, "description"), str(record, "companyLabel")), () -> {
                    if (filing) selectRecord(record, kind);
                    else {
                        resetFilters(); entityId = record.optLong("id"); entityType = kind;
                        entityLabel = str(record, "label"); documents(1,() -> records(kind,query,false));
                    }
                });
            }
            if (rows.length() >= 30) a.subtitle("Refine the name or employee code to narrow this list.");
        });
    }

    private void selectRecord(JSONObject record, String kind) {
        if(a.draft.evidence!=null && (!"employee".equals(kind) || record.optLong("id")!=a.draft.evidence.employee)){
            a.ordinaryCapture(()->selectRecord(record,kind));
            return;
        }
        a.run("Saving linked record", () -> {
            synchronized (UploadJobs.LOCK) {
                a.draft.reload();
                a.draft.destination(null, object("entityType", kind, "id", record.getLong("id"), "label", record.getString("label")));
            }
            return null;
        }, ignored -> a.capture());
    }

    void selectMyRecord() {
        JSONObject employee = a.profile == null ? null : a.profile.optJSONObject("employee");
        if (employee != null) selectRecord(employee, "employee");
    }

    private void folderSummary(int page,Runnable parent) {
        a.dms.onlinePage(DMS_PAGE,()->documents(page,parent),()->{
            entityLabel=HrView.title(entityType)+" #"+entityId;folderSummary(page,parent);
        });
        a.title("Record checklist");
        a.run("Checking linked documents", () -> a.api.get(object("op", "folder", "entityType", entityType, "entityId", entityId, "page", 1)), result -> {
            a.title(entityLabel);
            showSummary(result.optJSONObject("summary"));
            showMissing(result.optJSONArray("missing"), entityType, entityId, entityLabel);
            if (a.capability("upload")) a.action("Upload for this record", () -> selectRecord(object("id", entityId, "label", entityLabel), entityType), true);
        });
    }

    private void showSummary(JSONObject summary) {
        if (summary == null) { a.subtitle("The complete document checklist is unavailable."); return; }
        LinearLayout panel = a.card("Document checklist", "Visible documents in your ERP scope", null);
        a.detail(panel, "Documents", count(summary, "totalDocuments"));
        a.detail(panel, "Expired", count(summary, "expiredDocuments"));
        a.detail(panel, "Expiring soon", count(summary, "expiringSoonDocuments"));
        a.detail(panel, "Missing required", count(summary, "missingRequiredDocuments"));
        a.detail(panel, "Open findings", count(summary, "openComplianceFindings"));
    }

    private void showMissing(JSONArray missing, String kind, long id, String label) throws Exception {
        if (missing == null || missing.length() == 0) return;
        a.subtitle("Required documents to provide");
        for (int i = 0; i < missing.length(); i++) {
            JSONObject requirement = missing.getJSONObject(i);
            String name = first(str(requirement, "label"), str(requirement, "typeCode"));
            a.card(name, "Missing required document", a.capability("upload") ? () -> {
                if (a.draft == null) { a.reconnect(); return; }
                if (!a.draft.pages.isEmpty() || a.draft.frozen != null) {
                    a.message("Finish or discard your current upload draft before starting this document.", true);
                    return;
                }
                a.draftName = name + ".pdf";
                selectRecord(object("id", id, "label", label), kind);
            } : null);
        }
    }

    void tasks(String kind, int page) {
        ArrayList<String> allowedCodes = new ArrayList<>(), allowedLabels = new ArrayList<>();
        if (a.capability("upload") || a.capability("view") || a.capability("review")) { allowedCodes.add("uploads"); allowedLabels.add("Upload history"); }
        if (a.capability("view")) { allowedCodes.add("expiring"); allowedLabels.add("Expiring documents"); }
        if (a.capability("renewals")) { allowedCodes.add("renewals"); allowedLabels.add("Renewals"); }
        if (a.capability("approvals")) { allowedCodes.add("approvals"); allowedLabels.add("Approvals"); }
        if (a.capability("notifications")) { allowedCodes.add("notifications"); allowedLabels.add("Notifications"); }
        if (allowedCodes.isEmpty()) { a.message("No document task permissions are assigned to your account.", true); return; }
        if (!allowedCodes.contains(kind)) { tasks(allowedCodes.get(0), 1); return; }
        a.dms.onlinePage(TASK_LIST,this::inbox,()->tasks(kind,page));
        a.title("Tasks and uploads");
        String[] codes = allowedCodes.toArray(new String[0]), labels = allowedLabels.toArray(new String[0]);
        a.action("Show · " + labels[index(codes, kind)], () -> a.dialogBuilder().setTitle("Task list")
            .setItems(labels, (d, which) -> tasks(codes[which], 1)).show(), false);
        a.action("Refresh", () -> tasks(kind, page), false);
        a.run("Loading " + labels[index(codes, kind)].toLowerCase(java.util.Locale.ROOT),
            () -> a.api.get(object("op", "tasks", "kind", kind, "page", page)), result -> {
                JSONArray rows = result.getJSONArray("rows");
                if (rows.length() == 0) a.subtitle("No items in this task list.");
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.getJSONObject(i);
                    a.card(str(row, "title"), join(status(str(row, "status")), str(row, "description"), expiry(str(row, "expiry"))),
                        () -> reopenTask(CaptureOrigin.task(a.routeScope(),kind,page,row)));
                }
                LinearLayout paging = a.row(a.content);
                if (page > 1) a.inline(paging, "Previous", () -> tasks(kind, page - 1), false);
                if (result.optBoolean("more")) a.inline(paging, "Next", () -> tasks(kind, page + 1), false);
            });
    }

    void reopenTask(CaptureOrigin origin) {
        Runnable list=()->tasks(origin.list,origin.page);
        if(!a.dms.taskPage(list,()->reopenTask(origin)))return;
        a.dms.work("Checking the current task",t->t.api.get(origin.command()),result->
            origin.show(origin.find(result.getJSONArray("rows")),row->taskDetails(origin,row),this::tasks),null);
    }

    private void taskDetails(CaptureOrigin origin, JSONObject row) {
        String kind=origin.list;
        int page=origin.page;
        Runnable parent=()->reopenTask(origin);
        a.title(str(row, "title")); a.subtitle(status(str(row, "status"))); a.subtitle(str(row, "description"));
        long documentId = row.optLong("documentId");
        if (documentId > 0) a.action("View document", () -> a.document(documentId, parent), true);
        if (!str(row, "sessionCode").isEmpty()) a.action("Open upload and AI review", () -> openTaskUpload(row,a.dms::intakeSource,source->openTaskIntake(source,origin)), true);
        if ("approvals".equals(kind) && row.optBoolean("canAct")) {
            a.action("Approve", () -> approval(documentId, row.optLong("approvalId"), true), true);
            a.action("Return with reason", () -> approval(documentId, row.optLong("approvalId"), false), false);
        }
        if ("renewals".equals(kind) && row.optBoolean("canAct")) {
            a.action("Choose replacement document", () -> chooseReplacement(row.optLong("id"), documentId, "", parent), false);
        }
        if ("renewals".equals(kind) && documentId > 0) {
            String marker = a.api.user() + ":renewal:" + documentId;
            android.content.SharedPreferences pending = a.getSharedPreferences("pending-renewals", android.content.Context.MODE_PRIVATE);
            if (pending.getBoolean(marker, false)) a.action("Confirm this is the request I sent", () -> a.dialogBuilder()
                .setTitle("Confirm the ERP request outcome")
                .setMessage("The phone saved an unconfirmed renewal request. Confirm that this is its ERP record before clearing that pending status.")
                .setNegativeButton("Keep checking", null).setPositiveButton("Outcome checked", (d,w) -> {
                    if (pending.edit().remove(marker).commit()) a.message("Request outcome recorded on this phone.", false);
                    else a.message("The phone could not record this confirmation.", true);
                }).show(), false);
        }
        
    }

    interface IntakeSource { DmsIntakeEntry get(long session,String code); }
    static void openTaskUpload(JSONObject task,IntakeSource scoped,java.util.function.Consumer<DmsIntakeEntry> open){
        open.accept(scoped.get(0,str(task,"sessionCode")));
    }
    private void openTaskIntake(DmsIntakeEntry source,CaptureOrigin origin) {
        Runnable back=()->reopenTask(origin);
        a.dms.intakePage(INTAKE,source,"Open upload",back,()->openTaskIntake(source,origin),origin,(upload,parent)->{
            if(a.draft.evidence!=null){a.ordinaryCapture(()->openTaskIntake(source,origin));return;}
            a.dms.work("Opening upload",t->{
                synchronized(UploadJobs.LOCK){
                    t.require();a.draft.reload();
                    a.draft.lastUpload=object("id",upload.getLong("id"),"code",upload.getString("code"),"name",upload.getString("name"),"startPending",false);
                    a.draft.save();
                }
                return true;
            },v->a.openCaptureFrom(parent),null);
        });
    }

    private void approval(long documentId, long approvalId, boolean approve) {
        if (approvalId <= 0) { a.message("Refresh this task before approving its current step.", true); return; }
        LinearLayout form = dialogForm();
        EditText comment = a.field(form, approve ? "Comment (optional)" : "Reason, at least 5 characters", "", Integer.MAX_VALUE,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        DmsWorkspace.Ticket owner=a.dms.current;
        AlertDialog dialog=a.dialogBuilder().setTitle(approve ? "Approve document?" : "Return document for correction").setView(form)
            .setNegativeButton("Cancel",null).setPositiveButton(approve?"Approve":"Return",null).create();
        dialog.setOnShowListener(shown->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(owner==null || !owner.visible() || a.busy) return;
            String note=a.value(comment);
            if(!approve && note.length()<5){comment.setError("Enter at least 5 characters.");comment.requestFocus();return;}
            dialog.dismiss();
            a.run("Updating approval",()->a.api.call(object("op","approvalAction","documentId",documentId,
                "approvalId",approvalId,"decision",approve?"approve":"reject","comment",note)),ignored->tasks("approvals",1));
        }));
        a.showTrackedDialog(dialog);
    }

    private LinearLayout dialogForm() {
        LinearLayout form = a.column();
        form.setPadding(a.dp(16),0,a.dp(16),0);
        return form;
    }

    void documentActions(JSONObject document, LinearLayout panel, Runnable parent) {
        if(a.dms.enabled("requests")){
            JSONObject source=document.optJSONObject("renewalSource");
            if(source!=null)a.dms.requests.renewalAction(source,null,()->a.legacyDocument(document.optLong("id"),parent));
        }else if (a.capability("renewalsManage")) a.action("Request renewal", () -> requestRenewal(document,parent), false);
    }

    boolean pendingLegacyRenewal(long doc){
        return a.getSharedPreferences("pending-renewals",android.content.Context.MODE_PRIVATE)
            .getBoolean(a.api.user()+":renewal:"+doc,false);
    }
    void previousRenewal(JSONObject doc,Runnable back){
        if(pendingLegacyRenewal(doc.optLong("id")))requestRenewal(doc,back);else back.run();
    }
    private void requestRenewal(JSONObject doc,Runnable parent) {
        String marker = a.api.user() + ":renewal:" + doc.optLong("id");
        android.content.SharedPreferences pending = a.getSharedPreferences("pending-renewals", android.content.Context.MODE_PRIVATE);
        if (pending.getBoolean(marker, false)) {
            a.page(DMS_PAGE, () -> a.document(doc.optLong("id"), parent), true);
            a.title("Check the previous renewal request");
            a.subtitle("A request for this document was sent. Check its ERP renewal status before creating another request.");
            a.action("Open renewal requests", () -> tasks("renewals", 1), true);
            a.action("I checked ERP and found no request", () -> a.dialogBuilder()
                .setTitle("Allow a new renewal request?")
                .setMessage("Confirm that you checked the latest ERP renewal list for this document and the earlier request was not created. The app will verify your connection before clearing its pending status.")
                .setNegativeButton("Keep checking", null).setPositiveButton("Verify and clear", (d,w) -> a.run("Verifying ERP access", () -> {
                    JSONObject current = a.api.get(object("op", "profile"));
                    JSONObject permissions = current.optJSONObject("capabilities");
                    if (!a.api.user().equals(str(current, "userId")) || permissions == null || !permissions.optBoolean("renewalsManage"))
                        throw new java.io.IOException("Current renewal permission could not be verified.");
                    if (!pending.edit().remove(marker).commit()) throw new java.io.IOException("The phone could not clear this pending status.");
                    return null;
                }, ignored -> {if(a.dms.enabled("requests"))parent.run();else requestRenewal(doc,parent);})).show(), false);
            return;
        }
        LinearLayout form = dialogForm();
        EditText notes = a.field(form, "Reason or renewal instructions", "", Integer.MAX_VALUE,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        a.dialogBuilder().setTitle("Request renewal").setMessage(str(doc, "title")).setView(form)
            .setNegativeButton("Cancel", null).setPositiveButton("Request", (d,w) -> a.run("Requesting renewal",
                () -> {
                    if (!pending.edit().putBoolean(marker, true).commit()) throw new java.io.IOException("The phone could not retain this request safely.");
                    try {
                        Object receipt = a.api.call(object("op", "renewalRequest", "documentId", doc.optLong("id"), "priority", "normal", "notes", a.value(notes)));
                        pending.edit().remove(marker).commit();
                        return receipt;
                    } catch (ErpApi.Rejected rejected) {
                        if (rejected.status >= 400 && rejected.status < 500) pending.edit().remove(marker).commit();
                        throw rejected;
                    }
                },
                ignored -> tasks("renewals", 1))).show();
    }

    private void chooseReplacement(long requestId, long oldId, String query, Runnable parent) {
        a.dms.onlinePage(TASK,parent,()->chooseReplacement(requestId,oldId,query,parent)); a.title("Choose renewed document");
        EditText search = a.field(a.content, "Search replacement", query, 200, InputType.TYPE_CLASS_TEXT);
        a.action("Search", () -> chooseReplacement(requestId, oldId, a.value(search), parent), true);
        if (query.trim().isEmpty()) { a.subtitle("Search for the replacement already saved in DMS."); return; }
        a.run("Finding replacements", () -> a.api.get(object("op", "documents", "search", query, "page", 1)), result -> {
            JSONArray rows = result.getJSONArray("rows");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject doc = rows.getJSONObject(i);
                if (doc.optLong("id") == oldId) continue;
                a.card(str(doc, "title"), join(str(doc, "number"), expiry(str(doc, "expiry"))), () -> a.dialogBuilder()
                    .setTitle("Complete renewal with this document?").setMessage(join(str(doc, "title"), str(doc, "number")))
                    .setNegativeButton("Cancel", null).setPositiveButton("Complete renewal", (d,w) -> a.run("Completing renewal",
                        () -> a.api.call(object("op", "renewalComplete", "requestId", requestId, "replacementDocumentId", doc.optLong("id"), "notes", "Completed in ALGT ERP System")),
                        ignored -> tasks("renewals", 1))).show());
            }
            a.subtitle("Only the first matching page is shown. Refine your search to locate the exact replacement.");
        });
    }

    void saveOffline(JSONObject document, JSONObject file) {
        ErpApi api=a.api; String owner=api.user(); long generation=LocalSecurity.generation(a);
        a.dialogBuilder().setTitle("Save offline for")
            .setItems(new String[]{"1 day", "15 days", "30 days", "Permanent"}, (d, which) -> {
                int days = new int[]{1, 15, 30, 0}[which]; long fileId = file.optLong("id");
                a.run("Saving encrypted offline copy", () -> {
                    LocalSecurity.requireAccount(a,owner,generation);
                    OfflineDocuments storage=new OfflineDocuments(a,owner);
                    long epoch=api.hrSessionEpoch(), started=android.os.SystemClock.elapsedRealtime();
                    JSONObject permit = api.get(object("op", "offlinePermit", "documentId", document.optLong("id"), "fileId", fileId, "days", days,"leaseVersion",2));
                    if(permit.optLong("documentId")!=document.optLong("id") || permit.optLong("fileId")!=fileId)
                        throw new java.io.IOException("The ERP returned a different original.");
                    File original = File.createTempFile("offline-download-", ".tmp", a.getCacheDir());
                    try {
                        api.original(fileId, original);
                        if(epoch<0 || api.hrSessionEpoch()!=epoch) throw new java.io.IOException("Your ERP session changed.");
                        storage.save(permit, original,days,started);
                    } finally { original.delete(); }
                    return null;
                }, ignored -> { a.message("Saved offline. Open Documents → Saved offline documents.", false); });
            }).show();
    }

    public void documents(){ documentsHome(); }
    public void more(){ settings(); }
    public void reconnect(){ a.reconnect(); }
    void offlineRoot(){ offline(OfflineOrigin.root().search("")); }

    void offline(OfflineOrigin.Library library) {
        offline(library,0);
    }
    void openOfflineReminder(String accountUUID, String fileId){
        if(a.api==null || !accountUUID.equals(LocalSecurity.currentAccount(a)) || !LocalSecurity.unlocked(a)
                || fileId==null || !fileId.matches("[1-9][0-9]{0,18}"))return;
        try { offline(OfflineOrigin.documents().search(""),Long.parseLong(fileId)); }
        catch(NumberFormatException invalid){ a.message("Invalid saved document.",true); }
    }
    private void offline(OfflineOrigin.Library library,long selectedFileId) {
        String query=library.query;
        ErpApi libraryApi=a.api; String owner=libraryApi.user(); long generation=LocalSecurity.generation(a);
        a.page(OFFLINE, ()->library.origin.back(this), a.profile!=null); a.title("Saved offline");
        if(a.profile==null)a.action("Account and storage",()->settings(library),false);
        a.subtitle("Copies are encrypted for this ERP account. Connect to refresh access and document versions.");
        if(selectedFileId==0){
            EditText search = a.field(a.content, "Search downloaded names or numbers", query, 200, InputType.TYPE_CLASS_TEXT);
            a.action("Search offline", () -> offline(library.origin.search(a.value(search))), true);
        } else a.action("All saved documents",()->offline(library),false);
        a.run("Opening offline library", () -> {
            LocalSecurity.requireAccount(a,owner,generation);
            OfflineDocuments storage=new OfflineDocuments(a,owner);
            if(online()) {
                try { if(libraryApi.signedIn()) storage.reconcile(libraryApi,selectedFileId); else storage.lockSession(); }
                catch(java.net.SocketTimeoutException | java.net.UnknownHostException | java.net.ConnectException temporary) { /* Check the stored grant below. */ }
            }
            showDueReminders(storage,owner,generation);
            if(selectedFileId==0) return storage.list(query);
            JSONArray one=new JSONArray(); JSONObject item=storage.item(selectedFileId);
            if(item!=null)one.put(item);
            return one;
        }, rows -> {
            LocalSecurity.requireAccount(a,owner,generation);
            if (rows.length() == 0) a.subtitle(selectedFileId==0?"Open a permitted document while connected and choose Save offline.":"This saved document is unavailable.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.getJSONObject(i);
                long fileId = item.optLong("fileId");
                long days=item.optLong("days");
                String retention=days==0 ? "Permanent" : days + (days==1?" day":" days") + " · until "
                    + android.text.format.DateFormat.format("dd MMM yyyy HH:mm",item.optLong("expiresAt"));
                if(item.has("remainingMillis")){
                    long minutes=(item.optLong("remainingMillis")+59_999)/60_000;
                    retention+=" · "+(minutes<60?minutes+" min":(minutes+59)/60+" h")+" left";
                }
                LinearLayout card = a.card(first(str(item, "title"), str(item, "name")),
                    join(str(item, "documentNo"), expiry(str(item, "expiry")), str(item, "offlineStatus"), retention),
                    item.optBoolean("available") ? () -> openOffline(fileId, item, library) : null);
                LinearLayout actions = a.row(card);
                if(item.has("documentId")) a.inline(actions, "Refresh copy", () -> {
                    a.document(item.optLong("documentId"), () -> offline(library));
                }, false);
                a.inline(actions, "Remove", () -> a.dialogBuilder().setTitle("Remove offline copy?")
                    .setNegativeButton("Cancel", null).setPositiveButton("Remove", (d,w) -> a.run("Removing offline copy", () -> {
                        LocalSecurity.requireAccount(a,owner,generation);
                        new OfflineDocuments(a,owner).remove(fileId); return null;
                    }, ignored -> offline(library))).show(), false);
            }
        });
    }

    private void openOffline(long fileId, JSONObject item, OfflineOrigin.Library library) {
        ErpApi api=a.api; String owner=str(item,"authUserId"); long generation=LocalSecurity.generation(a);
        OfflinePreview ticket=new OfflinePreview(owner,generation,fileId,library);
        a.previewFile(str(item, "name"), str(item, "mime"), () -> offline(library), target -> {
            LocalSecurity.requireAccount(a,owner,generation);
            OfflineDocuments storage = new OfflineDocuments(a, owner);
            if (online()) {
                if(!api.signedIn()){ storage.lockSession(); throw new java.io.IOException("Sign in to verify this saved document."); }
                try {
                    storage.reconcile(api,fileId);
                } catch (java.net.SocketTimeoutException | java.net.UnknownHostException | java.net.ConnectException disconnected) {
                    // A network failure cannot clear a stored lock or extend a deadline.
                }
            }
            storage.open(fileId,item,target);
            JSONObject refreshed=storage.item(fileId);
            if(refreshed==null || !refreshed.optBoolean("available")) throw new java.io.IOException("This saved copy is locked.");
            ticket.file=target;
            if(refreshed.has("remainingMillis")) ticket.deadline=android.os.SystemClock.elapsedRealtime()+refreshed.getLong("remainingMillis");
            activeOfflinePreview=ticket;
        }, () -> {
            if(ticket.closed || !owner.equals(LocalSecurity.currentAccount(a)) || generation!=LocalSecurity.generation(a) || !LocalSecurity.unlocked(a)
                    || (ticket.deadline!=null && android.os.SystemClock.elapsedRealtime()>=ticket.deadline))
                throw new IllegalStateException("This offline preview belongs to a closed ERP account.");
            schedulePreviewExpiry(ticket);
        });
    }
    private static final class OfflinePreview {
        final String owner;
        final long generation, fileId;
        final OfflineOrigin.Library origin;
        volatile File file;
        volatile Long deadline;
        volatile boolean closed;
        OfflinePreview(String owner,long generation,long fileId,OfflineOrigin.Library origin){
            this.owner=owner; this.generation=generation; this.fileId=fileId; this.origin=origin;
        }
    }
    private volatile OfflinePreview activeOfflinePreview;
    private final OfflineConnectionMonitor connectionMonitor=new OfflineConnectionMonitor();
    private final android.os.Handler offlineHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable expirePreview=()->closePreview(activeOfflinePreview);

    private void schedulePreviewExpiry(OfflinePreview ticket){
        offlineHandler.removeCallbacks(expirePreview);
        if(ticket!=null && ticket.deadline!=null && ticket.file!=null && ticket.file.exists())
            offlineHandler.postDelayed(expirePreview,Math.max(0,ticket.deadline-android.os.SystemClock.elapsedRealtime()));
    }
    private void closePreview(OfflinePreview ticket){
        if(ticket==null || activeOfflinePreview!=ticket) return;
        ticket.closed=true;
        if(ticket.file!=null && ticket.file.exists() && a.at(LEGACY_PREVIEW)) {
            if(ticket.owner.equals(LocalSecurity.currentAccount(a)) && ticket.generation==LocalSecurity.generation(a) && LocalSecurity.unlocked(a))
                offline(ticket.origin);
            else a.resumeAccount();
        }
    }
    void startOfflineConnectivityMonitor(java.util.concurrent.Executor executor){
        schedulePreviewExpiry(activeOfflinePreview);
        connectionMonitor.start(a,()->a.runOnUiThread(()->{
            if(a.isFinishing() || a.isDestroyed() || a.api==null || a.api.user().isEmpty()) return;
            ErpApi active=a.api;
            try { executor.execute(()->onReauthenticated(active)); }
            catch(java.util.concurrent.RejectedExecutionException stopping){ /* Activity shutdown. */ }
        }));
    }
    void stopOfflineConnectivityMonitor(){
        connectionMonitor.stop();
        offlineHandler.removeCallbacks(expirePreview);
    }
    void onReauthenticated(ErpApi authenticatedApi) {
        OfflinePreview ticket=activeOfflinePreview;
        try {
            OfflineDocuments storage=new OfflineDocuments(a,authenticatedApi.user());
            try {
                if(authenticatedApi.signedIn()) {
                    storage.reconcile(authenticatedApi,0);
                    showDueReminders(storage,authenticatedApi.user(),LocalSecurity.generation(a));
                }
                else storage.lockSession();
            } finally {
                if(ticket!=null && ticket.owner.equals(authenticatedApi.user()) && ticket.generation==LocalSecurity.generation(a)){
                    JSONObject saved=storage.item(ticket.fileId);
                    if(saved==null || !saved.optBoolean("available")) {
                        ticket.closed=true;
                        a.runOnUiThread(()->closePreview(ticket));
                    }
                }
            }
        }
        catch(Exception unavailable) {
            // Foreground library entry retries and reports errors. Background failure must never clear a lock.
            android.util.Log.i("OfflineDocuments","Background verification did not finish.");
        }
    }
    private void showDueReminders(OfflineDocuments storage,String owner,long generation)throws Exception{
        if(!a.onlineForeground() || !LocalSecurity.unlocked(a))return;
        JSONArray due=storage.dueReminders();
        if(due.length()>0) a.runOnUiThread(()->{
            if(!a.onlineForeground() || !LocalSecurity.unlocked(a) || !owner.equals(LocalSecurity.currentAccount(a))
                    || generation!=LocalSecurity.generation(a))return;
            for(int i=0;i<due.length();i++){
                JSONObject row=due.optJSONObject(i);
                NotificationWorkspace.offlineReminder(a,owner,Long.toString(row.optLong("fileId")),row.optBoolean("expired"),
                    Long.toString(row.optLong("grant")));
            }
        });
    }

    void settings() { settings(null); }
    private void settings(OfflineOrigin.Library library) {
        if (!LocalSecurity.unlocked(a)) { a.unlockAndOpen(); return; }
        a.page(MORE_HOME, library!=null ? library.settingsBack(this::offline) : a.profile==null ? this::offlineRoot : this::home, a.profile != null); a.title("More");
        if (a.profile != null) communicationEntries(() -> settings(library));
        a.section("Account and security");
        a.subtitle(str(a.profile, "name"));
        a.subtitle("The optional app lock requires your device credential after 10 minutes of inactivity. Your ERP sign-in expires separately.");
        a.action(LocalSecurity.enabled(a) ? "Turn off app lock" : "Turn on device-credential app lock", () -> {
            try {
                boolean enabled = !LocalSecurity.enabled(a);
                LocalSecurity.setEnabled(a, enabled);
                if (enabled) {
                    a.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    a.unlockAndOpen();
                } else {
                    a.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    settings(library);
                }
            }
            catch (Exception error) { a.message(first(error.getMessage(), "Set up an Android device lock first."), true); }
        }, false);
        a.section("Notifications and connection");
        if (a.capability("tasks")) a.action("Enable task notifications", () -> {
            if (Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                a.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 15);
            } else {
                a.scheduleTaskChecks(true);
            }
        }, false);
        a.action("Check ERP connection", a::reconnect, false);
        a.section("Storage and receipts");
        if (a.hasHrReceipts()) a.action("HR receipts and pending submissions", a::hrReceipts, false);
        if (a.dms.available()) a.action("Document submission receipts", a.dms::pending, false);
        a.action("Saved offline documents", () -> offline(library!=null?library:OfflineOrigin.more().search("")), false);
        a.action("Remove all offline documents", () -> a.dialogBuilder().setTitle("Remove all downloaded copies?")
            .setNegativeButton("Cancel", null).setPositiveButton("Remove", (d,w) -> a.run("Clearing offline library", () -> {
                new OfflineDocuments(a, a.api.user()).clear(); return null;
            }, ignored -> settings(library))).show(), false);
        a.section("Help and version");
        try {
            a.subtitle(a.getString(R.string.app_name) + " · Version " + a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName);
        } catch (android.content.pm.PackageManager.NameNotFoundException unavailable) { a.subtitle(a.getString(R.string.app_name)); }
        a.subtitle("Contact your ERP administrator for account access or the current signed app.");
        a.action("Check for an app update", () -> PlayUpdates.check(a), false);
        a.action("Sign out", a::logout, false);
        a.run("Checking storage use", () -> new OfflineDocuments(a, a.api.user()).bytes(), bytes -> a.subtitle("Offline storage · " + android.text.format.Formatter.formatFileSize(a, bytes)));
    }

    private void communicationEntries(Runnable back) {
        LinearLayout entries = a.column();
        a.add(a.content, entries, 16);
        android.widget.TextView title = a.text("Communications", 19, a.getColor(R.color.erp_text), true);
        if (Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        a.add(entries, title, 0);
        android.widget.Button messages = a.button("Messages", () -> a.communications.openMessages(back), false);
        messages.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_messages, 0, 0, 0);
        messages.setCompoundDrawablePadding(a.dp(8));
        a.add(entries, messages, 8);
        android.widget.Button walkieTalkie = a.button("Walkie-Talkie", () -> a.communications.openPtt(back), false);
        walkieTalkie.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_walkie_talkie, 0, 0, 0);
        walkieTalkie.setCompoundDrawablePadding(a.dp(8));
        a.add(entries, walkieTalkie, 8);
        android.widget.Button budget = a.button("Communications budget", a.communications.budgetEntry(this::settings), false);
        a.add(entries, budget, 8);
        a.communications.bindRows(entries, messages, walkieTalkie, budget);
    }

    EditText dateField(LinearLayout parent, String label, String value) {
        EditText input = a.field(parent, label, value, 10, InputType.TYPE_CLASS_DATETIME);
        input.setFocusable(false);
        input.setOnClickListener(v -> {
            LocalDate date;
            try { date = LocalDate.parse(input.getText()); } catch (Exception ignored) { date = LocalDate.now(); }
            DatePickerDialog picker = new DatePickerDialog(a, (view, year, month, day) -> input.setText(LocalDate.of(year, month + 1, day).toString()),
                date.getYear(), date.getMonthValue() - 1, date.getDayOfMonth());
            picker.setButton(android.content.DialogInterface.BUTTON_NEUTRAL, "Clear date", (d,w) -> input.setText(""));
            a.showTrackedDialog(picker);
        });
        return input;
    }

    EditText optionField(LinearLayout parent, String label, String value, JSONObject definition) {
        EditText input = a.field(parent, label, value, 16384, InputType.TYPE_CLASS_TEXT);
        input.setFocusable(false);
        input.setOnClickListener(v -> {
            String kind = str(definition, "type");
            if ("boolean".equals(kind)) {
                a.dialogBuilder().setTitle(label).setItems(new String[]{"Not provided", "Yes", "No"},
                    (d, which) -> input.setText(new String[]{"", "true", "false"}[which])).show();
                return;
            }
            Object raw = definition.opt("options");
            if (raw instanceof JSONObject) {
                JSONObject configured = (JSONObject)raw;
                raw = configured.has("values") ? configured.opt("values") : configured.opt("options");
            }
            JSONArray options = raw instanceof JSONArray ? (JSONArray)raw : new JSONArray();
            ArrayList<String> choices = new ArrayList<>();
            for (int i = 0; i < options.length(); i++) {
                Object item = options.opt(i);
                if (item instanceof String) choices.add((String)item);
                else if (item instanceof JSONObject) choices.add(str((JSONObject)item, "value"));
            }
            if (choices.isEmpty()) { a.message("This field's configured choices are unavailable. Refresh ERP document rules.", true); return; }
            String[] labels = choices.toArray(new String[0]);
            AlertDialog.Builder picker = a.dialogBuilder().setTitle(label).setNeutralButton("Clear", (d,w) -> input.setText(""));
            if ("multi_select".equals(kind)) {
                boolean[] selected = new boolean[labels.length];
                try {
                    JSONArray previous = new JSONArray(input.getText().toString());
                    for (int i = 0; i < labels.length; i++) for (int j = 0; j < previous.length(); j++) if (labels[i].equals(previous.optString(j))) selected[i] = true;
                } catch (Exception ignored) { }
                picker.setMultiChoiceItems(labels, selected, (d, which, checked) -> selected[which] = checked)
                    .setPositiveButton("Use selected", (d,w) -> {
                        JSONArray result = new JSONArray();
                        for (int i = 0; i < selected.length; i++) if (selected[i]) result.put(labels[i]);
                        input.setText(result.length() == 0 ? "" : result.toString());
                    });
            } else picker.setItems(labels, (d, which) -> input.setText(labels[which]));
            picker.show();
        });
        return input;
    }

    void similarDocuments(IntakeReview review, Runnable back) {
        JSONObject fields = review.extracted;
        String identifier = "";
        for (String key : new String[]{"passport_number", "emirates_id_number", "document_number", "id_number"}) {
            if (!str(fields, key).isEmpty()) { identifier = str(fields, key); break; }
        }
        String query = identifier.isEmpty() ? review.title : identifier;
        DmsReviewContext.Detour detour=review.member==null?null:review.member.detour(original->{if(original==review.member)back.run();});
        Runnable returnReview=detour==null?back:detour::returnToReview;
        if(!a.queuePage(MATCHES,returnReview,review))return;
        a.title("Possible saved matches");
        a.subtitle("Compare the person, document number and validity dates. A renewed document can have the same identity number.");
        a.run("Checking accessible saved documents", () -> a.api.get(object("op", "documents", "search", query, "typeId", review.typeId, "page", 1)), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No matching saved documents were found in your permitted scope.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject document = rows.getJSONObject(i);
                a.card(str(document, "title"), join(str(document, "number"), expiry(str(document, "expiry"))),
                    () -> {if(detour==null)a.document(document.optLong("id"),back);
                        else detour.openMatch(restore->a.dms.docs.detail(document.optLong("id"),null,restore));});
            }
            a.action("Return to review", returnReview, false);
        });
    }

    private static String first(String value, String fallback) { return value == null || value.isEmpty() ? fallback : value; }
    private static String count(JSONObject value, String key) { return value.isNull(key) || !value.has(key) ? "" : String.valueOf(value.optLong(key)); }
    private static int index(String[] values, String value) { for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return i; return 0; }
    private static String expiry(String value) { return value.isEmpty() ? "" : "Expiry " + value; }
    private boolean online() {
        android.net.ConnectivityManager manager = (android.net.ConnectivityManager)a.getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        android.net.NetworkCapabilities network = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return network != null && network.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}
