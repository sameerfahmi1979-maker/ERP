package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;
import static net.algt.mobiledms.HrRules.validRevision;
import static net.algt.mobiledms.LauncherActivity.first;
import static net.algt.mobiledms.LauncherActivity.join;
import static net.algt.mobiledms.LauncherActivity.status;

final class HrWorkspace {
    private static final int TEXT = InputType.TYPE_CLASS_TEXT;
    private static final int MULTILINE = TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE;
    private static final String[] RENEWAL_KINDS = {"identity-document", "medical-insurance", "access-card", "training-certificate"};
    private static final String[] RENEWAL_LABELS = {"Identity documents", "Medical insurance", "Access cards", "Training certificates"};
    private static final String[] ATTENDANCE_CODES = {"site", "office", "yard", "workshop", "remote", "on_leave", "absent", "holiday"};
    private static final String[] ATTENDANCE_LABELS = {"Site", "Office", "Yard", "Workshop", "Remote", "On leave", "Absent", "Holiday"};

    final LauncherActivity a;
    final EmployeeRecords people;
    final HrWork work;
    final HrServices services;
    final HrFiles files;
    long ownEmployee;
    private JSONObject readRoute;
    private boolean retiringForPause;
    private String transferNotice="";
    private String routeAccount = "";
    private long routeEpoch = -1;
    private Object lifetime = new Object();
    private String notice = "";
    private JSONObject personalCapability;
    private JSONObject capability = new JSONObject();
    private Dialog dialog;
    private Screen openScreen;
    private Runnable deferred;
    private Runnable freshJournalOnResume;
    private final HrRules.ViewRefresh homeRefresh = new HrRules.ViewRefresh();
    private final HrRules.PrivateView privacy = new HrRules.PrivateView(this::neutralize);

    HrWorkspace(LauncherActivity activity) {
        this(activity,android.os.SystemClock::elapsedRealtime);
    }

    HrWorkspace(LauncherActivity activity,java.util.function.LongSupplier elapsedRealtime) {
        a = activity;
        people = new EmployeeRecords(this);
        work = new HrWork(this);
        services = new HrServices(this);
        files = new HrFiles(this,elapsedRealtime);
    }

    void reset() {
        if(!retiringForPause){files.cancelShare();transferNotice="";}
        lifetime = new Object();
        readRoute = null;
        routeAccount = "";
        routeEpoch = -1;
        ownEmployee = 0;
        files.retire();
        notice = "";
        capability = new JSONObject();personalCapability=null;
        deferred = null;
        freshJournalOnResume = null;
        openScreen = null;
        homeRefresh.clear();
        dismissDialog();
    }

    void background() {
        files.pause();
        if (openScreen != null && openScreen.ownsView()) {
            JSONObject route = readRoute;
            String owner = routeAccount;
            long epoch = routeEpoch;
            retiringForPause=true;
            try{privacy.hide();}finally{retiringForPause=false;}
            readRoute = route;
            routeAccount = owner;
            routeEpoch = epoch;
        }
    }

    private void neutralize() {
        reset(); // Retire views, unsent form closures and dialogs; keep the encrypted original operation.
        a.page(HR_PAGE, this::contextHome, true);
        a.title("HR");
        a.subtitle("Refresh your current HR access to continue.");
        a.action("Refresh HR access", this::contextHome, false);
        homeRefresh.bind(a.content);
    }

    void resume() {
        if(files.resumeShare())return;
        if (homeRefresh.owns(a.content)) {
            if (!a.busy && a.hrActive()) {
                homeRefresh.clear();
                HrRecovery.resumeRead(readRoute,HrV5Rules.restore(routeAccount,routeEpoch,a.api.user(),a.api.hrSessionEpoch(),true),restore->{
                    page(HR_PAGE, "HR", this::contextHome);
                    get("Refreshing your access", object("op","home"), result -> {
                        capability = result.getJSONObject("capabilities");personalCapability=result.optJSONObject("personalCapabilities");
                        ownEmployee = result.optBoolean("own") ? result.optLong("employeeId") : 0;
                        HrRecovery.deliverVisit(restore,visit->{
                            if (!people.restore(visit) && !work.restore(visit) && !services.restore(visit) && !restoreLegacy(visit)) contextHome();
                        },id->reviewSaved(id,this::pending),this::pending);
                        showTransferNotice();
                    });
                },this::contextHome);
            }
            return;
        }
        if (openScreen != null && openScreen.view == a.content && !openScreen.sameScope()) {
            reset();
            a.reconnect();
            return;
        }
        if (freshJournalOnResume != null && openScreen != null && openScreen.view == a.content) {
            freshJournalOnResume.run();
            return;
        }
        Runnable resume = deferred;
        deferred = null;
        if (resume != null) resume.run();
    }

    boolean hasPending() {
        String account = a.api == null ? "" : a.api.user();
        return HrOperationStore.hasOperations(a, account) || hasRenewalUpload() || hasServiceUpload();
    }

    void clearAccount(String user) throws IOException {
        if (!user.isEmpty()) HrOperationStore.clear(a, user);
    }

    boolean hasServiceUpload() {
        return a.api!=null && HrOperationStore.hasServiceDraft(a,a.api.user(),a.api.hrSessionEpoch());
    }

    boolean hasRenewalUpload() {
        return a.api != null && HrOperationStore.hasRenewal(a, a.api.user(), a.api.hrSessionEpoch());
    }

    void onRenewalDocumentUploaded(JSONObject receipt) {
        if (a.hrActive() && receipt.optBoolean("completed") && receipt.optLong("documentId") > 0) {
            notice = "Choose the filed replacement from documents linked to your employee record.";
        }
    }

    void returnFromDocumentUpload() {
        if(!a.returnActiveEvidence(false))returnFromDocumentUpload(null);
    }

    void returnFromDocumentUpload(HrCaptureTarget expected) {
        page(HR_EVIDENCE_RETURN, "Renewal evidence", this::home);
        Screen screen = new Screen();
        load("Opening your renewal request", () -> {
            JSONObject saved = screen.store().restoreEvidence(screen.epoch,false,expected);
            JSONObject access = screen.api.hrGet(object("op", "home"));
            JSONObject caps = access.getJSONObject("capabilities");
            String kind = str(saved, "kind");
            boolean allowed = caps.optBoolean("renewalSubmit") && caps.optBoolean("renewalCompliance")
                && caps.optBoolean(kind.equals("medical-insurance") ? "renewalMedical" : "renewalCompliance");
            if (!HrRules.ownScope(saved.optLong("employeeId"), access.optBoolean("own"), access.optLong("employeeId"), allowed))
                throw new ErpApi.Rejected("This renewal is unavailable with your current access.", 403, null);
            JSONObject current = currentRenewalSource(screen, saved);
            JSONObject original = saved.getJSONObject("record");
            if (!HrRules.resumeRenewal(saved.optLong("employeeId"), access.optBoolean("own"), access.optLong("employeeId"), allowed,
                    original.optLong("id"), str(original, "revision"), current == null ? 0 : current.optLong("id"), str(current, "revision")))
                throw new ErpApi.Rejected("This renewal changed. Open its current record before restoring the request.", 409, null);
            put(saved, "record", current);
            return object("draft", saved, "capabilities", caps);
        }, result -> {
            JSONObject saved = result == null ? null : result.optJSONObject("draft");
            if (saved == null) { home(); return; }
            HrCaptureTarget restored=HrCaptureTarget.forForm(screen.epoch,false,saved,0);
            HrCaptureTarget.restore(screen.store().evidenceSlot(screen.epoch,false),screen.epoch,false,restored);
            capability = result.getJSONObject("capabilities");personalCapability=result.optJSONObject("personalCapabilities");
            RenewalForm form = new RenewalForm(saved);
            if (!renewalSubmitAllowed(form.kind)) {
                a.message("This renewal is unavailable with your current access.", true);
                return;
            }
            if (!can("evidence")) form.evidence = null;
            renewalForm(form);
        });
    }

    private JSONObject currentRenewalSource(Screen screen, JSONObject saved) throws Exception {
        long employee = saved.optLong("employeeId"), source = saved.getJSONObject("record").optLong("id");
        for (int page = 1; page <= 100000; page++) {
            screen.requireCurrentSession();
            JSONObject result = screen.api.hrGet(object("op", "renewals", "employeeId", employee, "kind", str(saved, "kind"), "page", page));
            JSONArray rows = result.getJSONArray("rows");
            for (int i = 0; i < rows.length(); i++) if (rows.getJSONObject(i).optLong("id") == source) return rows.getJSONObject(i);
            if (!result.optBoolean("more") || rows.length() == 0) return null;
        }
        return null;
    }

    static boolean hasInbox(JSONObject access) {
        JSONObject caps = access.optJSONObject("capabilities");
        if (caps == null) return false;
        return caps.optBoolean("approvals") || caps.optBoolean("requestsTeam") || caps.optBoolean("serviceReview")
            || access.optBoolean("own") && access.optLong("employeeId") > 0
                && (caps.optBoolean("requests") || caps.optBoolean("services"));
    }

    private void access(LauncherActivity.Success<JSONObject> ready) {
        get("Checking your HR access", object("op", "home"), access -> {
            capability = access.getJSONObject("capabilities");personalCapability=access.optJSONObject("personalCapabilities");
            ownEmployee = access.optBoolean("own") ? access.optLong("employeeId") : 0;
            a.profile.put("hrInboxAvailable", hasInbox(access));
            a.profile.put("hrDirectoryAvailable", can("directory") || can("employees"));
            ready.show(access);
        });
    }

    void contextHome() {
        if (a.destination() == MobileRoute.Destination.INBOX) a.mobile().inbox();
        else if (a.destination() == MobileRoute.Destination.MORE) a.mobile().settings();
        else home();
    }

    void openEmployees() {
        page(HR_DIRECTORY, "Employees", this::home);
        access(result -> {
            if (can("directory")) people.directory(new EmployeeRecords.Filters(), 1);
            else if (can("employees")) employees("", 1);
            else a.subtitle("Employee directory access is unavailable.");
        });
    }

    void inbox() {
        page(HR_INBOX, "HR requests and approvals", a.mobile()::inbox);
        route(object("op", "workInbox"));
        access(result -> {
            if (!hasInbox(result)) { a.subtitle("No HR request queues are available with your current access."); return; }
            if (ownEmployee > 0 && (can("requests") || can("services"))) {
                a.section("My requests");
                long employee = ownEmployee;
                if (can("requests")) a.action("My HR requests", () -> requestList("requests", "own", 0, this::inbox), false);
                if (can("services")) a.action("My service requests", () -> services.requests("own",employee,"all",0,this::inbox), false);
            }
            if (can("approvals") || can("serviceReview") || can("requestsTeam")) {
                a.section("Team and officer work");
                if (can("approvals")) a.action("HR approvals", this::approvalsHome, true);
                if (can("requestsTeam")) a.action("Team HR requests", () -> requestList("requests","team",0,this::inbox), false);
                services.staffHome(this::inbox);
            }
        });
    }

    void home() {
        page(HR_HOME, "HR", a::openHrParent);
        access(access -> {
            long employee = ownEmployee;
            if (can("directory") || can("employees") || can("teamReadiness") || can("teamCalendar")) {
                a.section("People and team");
                if (can("directory")) a.card("Employees", "Find a person by name, employee code or location", () -> people.directory(new EmployeeRecords.Filters(), 1));
                else if (can("employees")) a.card("Employees", "Search permitted employee profiles", () -> employees("", 1));
                work.teamHome();
            }
            a.section("My services");
            if (employee > 0) {
                if (can("profile")) a.card("My profile", first(str(access,"name"), "Employment and contact information"), () -> {
                    if (can("employeeRecord")) people.record(employee, "Overview", this::home); else profile(0);
                });
                services.ownHome(employee);
                work.personalHome(employee);
                if (can("leave")) a.card("Leave", "Balances, requests and new applications", () -> leaveHome(employee));
                if (can("attendance")) a.card("Attendance and shifts", "History, punches and corrections", () -> attendanceHome(employee));
                if (can("renewals")) a.card("Renewals", "Expiries and replacement evidence", () -> renewalsHome(employee));
                if (can("requests")) a.action("My HR requests", () -> requestList("requests", "own", 0, this::home), false);
            } else a.subtitle("Your ERP account has no linked employee profile.");
            if (can("roster") || can("approvals") || can("requestsTeam") || can("serviceReview")) {
                a.section("Officer tools");
                if (can("roster")) a.card("Supervisor timesheets", "Record and review actual attendance", () -> roster(new RosterFilter(), 1));
                if (hasInbox(access)) a.action("Requests and approvals in Inbox", this::inbox, false);
            }
            if (hasPending()) {
                a.section("Continue work");
                if (HrOperationStore.hasOperations(a, a.api.user())) a.action("HR receipts and pending submissions", this::pending, false);
                if (hasRenewalUpload()) a.action("Continue renewal request", this::returnFromDocumentUpload, false);
                if (hasServiceUpload()) a.action("Continue service evidence request", services::returnUpload, false);
            }
            a.action("Refresh HR access", this::home, false);
        });
    }

    private void profile(long employee) {
        profile(employee, employee == 0 ? this::home : () -> employees("", 1));
    }
    private void profile(long employee, Runnable back) {
        page(HR_RECORD, employee == 0 ? "My profile" : "Employee profile", back);
        route(object("op","profile","employeeId",employee));
        a.action("Refresh profile", () -> profile(employee,back), false);
        get("Loading profile", employee == 0 ? object("op", "profile") : object("op", "profile", "employeeId", employee), profile -> {
            if (profile.optLong("employeeId") == 0) { a.subtitle("No employee profile is linked to this account."); return; }
            showFields(first(str(profile, "name"), "Employee"), profile.getJSONArray("fields"));
            if (profile.optBoolean("own") && profile.getJSONObject("capabilities").optBoolean("profileCorrection") && validRevision(str(profile, "revision"))) {
                a.action("Request a contact correction", () -> contactForm(profile), true);
            }
        });
    }

    private void employees(String term, int page) {
        Runnable back = this::home;
        page(HR_DIRECTORY, "Employees", back);
        route(object("op","employees","page",page));
        EditText search = a.field(a.content, "Search by name or employee code", term, 100, TEXT);
        a.action("Search employees", () -> employees(a.value(search), 1), true);
        get("Finding permitted employees", object("op", "employees", "search", term, "page", page), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No permitted employees match this search.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                a.card(str(row, "label"), "", () -> profile(row.optLong("id"), () -> employees(term,page)));
            }
            pagination(page, result, number -> employees(term, number));
        });
    }

    void contactForm(JSONObject profile) {
        page("Contact correction", () -> profile(0));
        a.subtitle("Enter the new values for the fields that need correction.");
        String[] labels = {"Mobile number", "Personal email", "Emergency contact name", "Emergency contact mobile"};
        String[] keys = {"mobile_number", "personal_email", "emergency_contact_name", "emergency_contact_mobile"};
        EditText[] fields = new EditText[labels.length];
        fields[0] = a.field(a.content, labels[0], "", HrRules.contactLimit(keys[0]), InputType.TYPE_CLASS_PHONE);
        fields[1] = a.field(a.content, labels[1], "", 254, TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        fields[2] = a.field(a.content, labels[2], "", HrRules.contactLimit(keys[2]), TEXT);
        fields[3] = a.field(a.content, labels[3], "", HrRules.contactLimit(keys[3]), InputType.TYPE_CLASS_PHONE);
        long employee = profile.optLong("employeeId");
        a.action("Submit for HR review", () -> {
            JSONObject changes = new JSONObject();
            for (int i = 0; i < fields.length; i++) if (!a.value(fields[i]).isEmpty()) {
                if (!HrRules.contactValue(keys[i], a.value(fields[i]))) {
                    a.message(labels[i] + " must be at most " + HrRules.contactLimit(keys[i]) + " characters.", true); return;
                }
                put(changes, keys[i], a.value(fields[i]));
            }
            if (changes.length() == 0) { a.message("Enter at least one changed value.", true); return; }
            submit("Contact correction", "profile:" + employee, object("op", "profileCorrection", "employeeId", employee,
                "revision", str(profile, "revision"), "changes", changes), () -> profile(0));
        }, true);
    }

    void leaveHome(long employee) {
        page("Leave", this::home);
        route(object("op","leaveHome","employeeId",employee));
        a.card("Leave balances", "Track your used, reserved and available days", () -> leaveBalances(employee, 0));
        a.card("My leave requests", "Status and eligible cancellations", () -> leaveRequests(employee, 1));
        if (can("leaveSubmit")) a.action("Request leave", () -> leaveForm(new LeaveForm(employee)), true);
    }

    private void leaveBalances(long employee, long after) {
        page("Leave balances", () -> leaveHome(employee));
        route(object("op","leaveBalances","employeeId",employee,"after",after));
        a.action("Refresh balances", () -> leaveBalances(employee, after), false);
        get("Loading leave balances", object("op", "leaveBalances", "employeeId", employee, "after", after), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No leave balances were returned for your permitted periods.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                LinearLayout panel = a.card(str(row, "label"), range(str(row, "startDate"), str(row, "endDate")), null);
                if (!row.optBoolean("known")) {
                    a.detail(panel, "Balance", first(str(row, "reviewReason"), "Unavailable for this period"));
                } else {
                    a.detail(panel, "Entitled", first(str(row, "entitled"), "Unavailable"));
                    if (!row.isNull("earned")) a.detail(panel, "Earned", str(row, "earned"));
                    a.detail(panel, "Used", first(str(row, "used"), "Unavailable"));
                    a.detail(panel, "Reserved", first(str(row, "reserved"), "Unavailable"));
                    if (!row.isNull("carryForward")) a.detail(panel, "Carry-forward available", str(row, "carryForward"));
                    a.detail(panel, "Available", first(str(row, "available"), "Unavailable"));
                }
            }
            if (after > 0) a.action("First balances", () -> leaveBalances(employee, 0), false);
            if (result.optBoolean("more") && rows.length() > 0)
                a.action("More balances", () -> leaveBalances(employee, rows.optJSONObject(rows.length() - 1).optLong("id")), false);
        });
    }

    private void leaveRequests(long employee, int page) {
        page("My leave requests", () -> leaveHome(employee));
        route(object("op","leaveRequests","employeeId",employee,"page",page));
        a.action("Refresh requests", () -> leaveRequests(employee, page), false);
        get("Loading leave requests", object("op", "leaveRequests", "employeeId", employee, "page", page), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No leave requests on this page.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String detail = join(range(str(row, "startDate"), str(row, "endDate")), status(str(row, "status")));
                LinearLayout card = a.card(str(row, "label"), detail, null);
                if (row.optBoolean("canCancel") && validRevision(str(row, "revision")))
                    a.add(card, a.button("Cancel request", () -> cancelLeave(employee, row, page), false), 4);
            }
            pagination(page, result, number -> leaveRequests(employee, number));
        });
    }

    private void cancelLeave(long employee, JSONObject row, int index) {
        page("Cancel leave request", () -> leaveRequests(employee, index));
        a.subtitle(join(str(row, "label"), range(str(row, "startDate"), str(row, "endDate"))));
        EditText reason = a.field(a.content, "Reason for cancellation", "", 500, MULTILINE);
        a.action("Confirm cancellation", () -> {
            if (a.value(reason).isEmpty()) { a.message("Enter a reason for cancellation.", true); return; }
            confirm("Cancel this leave request?", "Request cancellation", () -> submit("Leave cancellation", "leave:" + row.optLong("id"),
                object("op", "leaveCancel", "employeeId", employee, "id", row.optLong("id"), "revision", str(row, "revision"),
                    "reason", a.value(reason)), () -> leaveRequests(employee, index)));
        }, true);
    }

    private static final class LeaveForm {
        final long employee;
        JSONObject type, evidence;
        String first = "", last = "", reason = "";
        LeaveForm(long employee) { this.employee = employee; }
    }

    private void leaveForm(LeaveForm form) {
        page("Request leave", () -> leaveHome(form.employee));
        a.action(form.type == null ? "Choose leave type" : "Leave type · " + str(form.type, "label"),
            () -> chooseList("Leave type", "leaveOptions", form.employee, null, 1, () -> leaveForm(form),
                chosen -> { form.type = chosen; leaveForm(form); }), false);
        bind(dateField("Start date", form.first), value -> form.first = value);
        bind(dateField("End date", form.last), value -> form.last = value);
        bind(a.field(a.content, "Reason", form.reason, 500, MULTILINE), value -> form.reason = value);
        if (form.type != null && form.type.optBoolean("requiresDocument")) {
            a.subtitle(can("leaveCertificate") ? "This leave type requires an employee certificate."
                : "This leave type requires a certificate. Certificate access is restricted for your ERP account.");
        }
        if (can("leaveCertificate"))
            evidenceControls(form.employee, "leave", form.evidence, () -> leaveForm(form), chosen -> { form.evidence = chosen; leaveForm(form); });
        a.action("Submit leave request", () -> {
            if (form.type == null) { a.message("Choose an available leave type.", true); return; }
            if (!HrRules.dateRange(form.first, form.last)) { a.message("Choose a valid start and end date in order.", true); return; }
            if (form.reason.trim().isEmpty()) { a.message("Enter a reason for your leave request.", true); return; }
            if (form.type.optBoolean("requiresDocument") && form.evidence == null) {
                a.message(can("leaveCertificate") ? "Attach the required certificate."
                    : "Ask HR to help submit this leave request with its required certificate.", true);
                return;
            }
            submit("Leave request", "", object("op", "leaveSubmit", "employeeId", form.employee,
                "leaveTypeId", form.type.optLong("id"), "startDate", form.first, "endDate", form.last, "reason", form.reason.trim(),
                "documentId", id(form.evidence), "documentVersionId", versionId(form.evidence)), () -> leaveRequests(form.employee, 1));
        }, true);
    }

    void attendanceHome(long employee) {
        page("Attendance and shifts", this::home);
        route(object("op","attendanceHome","employeeId",employee));
        a.card("Attendance history", "Daily records and correction requests", () -> time(employee, "attendance", "Attendance history", 1));
        a.card("Punch history", "Recorded punches", () -> time(employee, "punch", "Punch history", 1));
        a.card("Shifts", "Shift assignments and recorded schedule", () -> time(employee, "shift", "Shifts", 1));
        a.card("Overtime", "Overtime recorded in ERP", () -> time(employee, "overtime", "Overtime", 1));
        if (can("timeCorrection")) a.action("Report missing attendance", () -> timeCorrection(employee, null, () -> attendanceHome(employee)), false);
    }

    private void time(long employee, String kind, String label, int page) {
        page(label, () -> attendanceHome(employee));
        route(object("op","time","employeeId",employee,"kind",kind,"page",page));
        a.action("Refresh", () -> time(employee, kind, label, page), false);
        get("Loading " + label.toLowerCase(java.util.Locale.ROOT), object("op", "time", "employeeId", employee, "kind", kind, "page", page), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No records on this page.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String detail = join(str(row, "date"), status(str(row, "status")), str(row, "detail"));
                LinearLayout card = a.card(str(row, "label"), detail, null);
                if (can("timeCorrection") && kind.equals("attendance") && validRevision(str(row, "revision"))) a.add(card,
                    a.button("Request correction", () -> timeCorrection(employee, row, () -> time(employee, kind, label, page)), false), 4);
            }
            pagination(page, result, number -> time(employee, kind, label, number));
        });
    }

    private void timeCorrection(long employee, JSONObject row, Runnable back) {
        page("Attendance correction", back);
        String date = str(row, "date");
        EditText day = row == null ? dateField("Attendance date", "") : null;
        if (row != null) a.subtitle(join(date, str(row, "label"), str(row, "detail")));
        EditText reason = a.field(a.content, "Describe the actual attendance and the correction needed", "", 500, MULTILINE);
        a.action("Submit correction for review", () -> {
            String selected = day == null ? date : a.value(day);
            if (!HrRules.dateRange(selected, selected)) { a.message("Choose the attendance date.", true); return; }
            if (a.value(reason).isEmpty()) { a.message("Describe the correction needed.", true); return; }
            submit("Attendance correction", "time:" + employee + ":" + selected, object("op", "timeCorrection", "employeeId", employee,
                "date", selected, "id", id(row), "revision", row == null ? null : str(row, "revision"), "reason", a.value(reason)),
                () -> requestList("requests", "own", 0, this::home));
        }, true);
    }

    void renewalsHome(long employee) {
        page("Renewals", this::home);
        route(object("op","renewalsHome","employeeId",employee));
        for (int i = 0; i < RENEWAL_KINDS.length; i++) {
            String kind = RENEWAL_KINDS[i], label = RENEWAL_LABELS[i];
            if (renewalKindAllowed(kind)) a.action(label, () -> renewals(employee, kind, label, 1), false);
        }
        if (hasRenewalUpload()) a.action("Continue renewal request", this::returnFromDocumentUpload, false);
        if (can("requests")) a.action("View submitted HR requests", () -> requestList("requests", "own", 0, this::home), false);
    }

    private void renewals(long employee, String kind, String label, int index) {
        page(label, () -> renewalsHome(employee));
        route(object("op","renewals","employeeId",employee,"kind",kind,"page",index));
        a.action("Refresh records", () -> renewals(employee, kind, label, index), false);
        get("Loading renewal records", object("op", "renewals", "employeeId", employee, "kind", kind, "page", index), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No renewal records on this page.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject record = rows.getJSONObject(i);
                String expiry = str(record, "expiryDate");
                LinearLayout card = a.card(str(record, "label"), expiry.isEmpty() ? "Expiry unavailable" : "Expires " + expiry, null);
                if (renewalSubmitAllowed(kind) && validRevision(str(record, "revision"))) a.add(card, a.button("Request renewal",
                    () -> renewalForm(new RenewalForm(employee, kind, record)), false), 4);
            }
            pagination(index, result, page -> renewals(employee, kind, label, page));
        });
    }

    private static final class RenewalForm {
        final long employee;
        final String kind;
        final JSONObject record;
        JSONObject evidence;
        String reason = "";
        String handoffId=UUID.randomUUID().toString();
        RenewalForm(long employee, String kind, JSONObject record) { this.employee = employee; this.kind = kind; this.record = record; }
        RenewalForm(JSONObject saved) throws Exception {
            this(saved.getLong("employeeId"), saved.getString("kind"), saved.getJSONObject("record"));
            reason = str(saved, "reason");
            handoffId=saved.getString("handoffId");
        }
        JSONObject draft() { return object("handoffId",handoffId,"employeeId", employee, "kind", kind, "record", record, "reason", reason); }
    }

    private void renewalForm(RenewalForm form) {
        page("Request renewal", () -> renewalsHome(form.employee));
        a.subtitle(join(str(form.record, "label"), str(form.record, "expiryDate")));
        a.subtitle("HR will review this request. You can submit it without a replacement document.");
        bind(a.field(a.content, "Reason for renewal", form.reason, 500, MULTILINE), value -> form.reason = value);
        if (can("evidence"))
            evidenceControls(form.employee, "renewal", form.evidence, () -> renewalForm(form), chosen -> { form.evidence = chosen; renewalForm(form); });
        if (can("evidence") && a.capability("upload")) a.action("Upload replacement to DMS", () -> {
            form.evidence = renewalEvidence(form.evidence, true);
            renewalForm(form);
            a.startHrUpload(form.draft(),false);
        }, false);
        if (hasRenewalUpload()) a.action("Discard saved renewal draft", () -> confirm("Discard the saved renewal draft?", "Discard", () -> {
            Screen screen = new Screen();
            load("Removing renewal draft", () -> {
                HrCaptureTarget expected=HrCaptureTarget.forForm(screen.epoch,false,form.draft(),0);
                if(!HrCaptureTarget.consume(screen.store().evidenceSlot(screen.epoch,false),screen.epoch,false,expected,screen::visible))
                    throw new IOException("Open the original saved renewal before discarding it.");
                return true;
            },
                ignored -> renewalsHome(form.employee));
        }), false);
        a.action("Submit for HR review", () -> {
            if (form.reason.trim().isEmpty()) { a.message("Enter a reason for renewal.", true); return; }
            long record = form.record.optLong("id");
            JSONObject evidence = renewalEvidence(form.evidence, false);
            submit("Renewal request", "renewal:" + form.kind + ":" + record,
                object("op", "renewalSubmit", "employeeId", form.employee, "kind", form.kind, "id", record,
                    "revision", str(form.record, "revision"), "reason", form.reason.trim(),
                    "documentId", id(evidence), "documentVersionId", versionId(evidence)),
                () -> requestList("requests", "own", 0, this::home),form.handoffId);
        }, true);
    }

    private static JSONObject renewalEvidence(JSONObject attachment, boolean openingReplacementUpload) {
        return attachment != null && HrRules.keepEvidence(openingReplacementUpload, attachment.optLong("id"), attachment.optLong("versionId"))
            ? attachment : null;
    }

    private interface Choice { void select(JSONObject value); }
    private void evidenceControls(long employee, String purpose, JSONObject evidence, Runnable back, Choice selected) {
        a.action(evidence == null ? "Attach an existing DMS document" : "Attachment · " + str(evidence, "label"),
            () -> chooseList("Choose evidence", "evidence", employee, purpose, 1, back, selected), false);
        if (evidence != null) a.action("Remove attachment", () -> selected.select(null), false);
    }

    private void chooseList(String title, String op, long employee, String purpose, int page, Runnable back, Choice selected) {
        page(title, back);
        a.action("Return to form", back, false);
        JSONObject command = object("op", op, "employeeId", employee, "page", page);
        if (purpose != null) put(command, "purpose", purpose);
        get("Loading permitted choices", command, result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle(op.equals("evidence")
                ? "No selectable DMS documents are filed to this employee on this page."
                : "No choices are available on this page.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                if (row.optLong("id") <= 0 || (op.equals("evidence") && row.optLong("versionId") <= 0)) continue;
                a.action(str(row, "label"), () -> selected.select(row), false);
            }
            pagination(page, result, next -> chooseList(title, op, employee, purpose, next, back, selected));
        });
    }

    private void approvalsHome() {
        page(HR_REQUEST_LIST, "HR approvals", this::inbox);
        if (can("approvalsProposal")) a.card("Employee HR requests", "Review contact corrections, attendance corrections and renewals",
            () -> requestList("inbox", "proposal", 0, this::approvalsHome));
        if (can("approvalsLeave")) a.card("Leave decisions", "Review leave requests within your authority",
            () -> requestList("inbox", "leave", 0, this::approvalsHome));
        if (can("approvalsGeneral")) a.card("Other HR approvals", "Review assigned ERP approvals",
            () -> requestList("inbox", "approval", 0, this::approvalsHome));
    }

    private void requestList(String op, String kind, long after, Runnable back) {
        boolean inbox = op.equals("inbox");
        page(HR_REQUEST_LIST, inbox ? "Approval inbox" : kind.equals("team") ? "Team HR requests" : "My HR requests", back);
        route(object("op",op,"kind",kind,"after",after));
        a.action("Refresh requests", () -> requestList(op, kind, after, back), false);
        get("Loading HR requests", object("op", op, inbox ? "kind" : "scope", kind, "after", after), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle(inbox ? "No actionable requests on this page." : "No submitted requests on this page.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                a.card(str(row, "label"), join(requestSubject(row), requestReference(row), status(str(row, "status"))), validRevision(str(row, "revision"))
                    ? () -> requestOpening(row, () -> requestList(op, kind, after, back), inbox) : null);
            }
            if (after > 0) a.action("First requests", () -> requestList(op, kind, 0, back), false);
            if (result.optBoolean("more") && result.optLong("nextAfterId") > after)
                a.action("More requests", () -> requestList(op, kind, result.optLong("nextAfterId"), back), false);
        });
    }

    private void requestOpening(JSONObject row, Runnable back, boolean decisionMenu) {
        page(HR_REQUEST, "HR request", back);
        String kind = str(row, "kind"), revision = str(row, "revision");
        long employee = row.optLong("employeeId"), id = row.optLong("id");
        route(object("op","opening","kind",kind,"revision",revision,"employeeId",employee,"id",id,"officer",decisionMenu));
        a.action("Return to requests", back, false);
        get("Opening the selected request version", object("op", "opening", "kind", kind, "employeeId", employee, "id", id, "revision", revision), result -> {
            boolean exact = employee == result.optLong("employeeId") && id == result.optLong("id") && kind.equals(str(result, "kind"));
            String original = str(result, "revision");
            if (!exact || !revision.equals(original)) { a.message("This request changed. Return to the list and open the latest version.", true); return; }
            String context = join(requestReference(result), requestSubject(result), status(str(result, "status")));
            a.subtitle(context);
            showFields(first(str(result, "label"), str(row, "label")), result.getJSONArray("fields"));
            if (!decisionMenu || !result.optBoolean("canDecide")) return;
            EditText reason = a.field(a.content, "Decision reason (required to reject)", "", 500, MULTILINE);
            for (String decision : new String[]{"approve", "reject"}) {
                a.action(status(decision), () -> {
                    String problem = HrRules.decisionError(result.optBoolean("canDecide"), revision, original, decision.equals("reject"), a.value(reason));
                    if (problem != null) { a.message(problem, true); return; }
                    confirm(status(decision) + " this request?", context, status(decision), () ->
                        submit("HR decision", "decision:" + kind + ":" + id,
                            object("op", "decision", "kind", kind, "employeeId", employee, "id", id,
                                "revision", revision, "decision", decision, "reason", a.value(reason)), back));
                }, decision.equals("approve"));
            }
        });
    }

    private static String requestSubject(JSONObject row) {
        return join(str(row, "employeeLabel"), "Employee #" + row.optLong("employeeId"));
    }

    private static String requestReference(JSONObject row) {
        return first(str(row, "reference"), "Request #" + row.optLong("id"));
    }

    private static final class RosterFilter {
        JSONObject company, branch, site, team, shift;
        String date = HrRules.dubaiDate(Instant.now()).toString();
        String search = "", state = "all";
        boolean history;

        RosterFilter() {}
        RosterFilter(RosterFilter input) {
            company = input.company; branch = input.branch; site = input.site; team = input.team; shift = input.shift;
            date = input.date; search = input.search; state = input.state; history = input.history;
        }

        JSONObject selections(String kind, String search, long after) {
            return object("op", "rosterChoices", "kind", kind, "company", id(company), "branch", id(branch),
                "date", date, "search", search, "after", after);
        }
    }

    private void roster(RosterFilter input, int index) {
        RosterFilter selected = new RosterFilter(input);
        page("Supervisor timesheets", this::home);
        route(object("op","roster","company",id(selected.company),"branch",id(selected.branch),"site",id(selected.site),"team",id(selected.team),"shift",id(selected.shift),
            "date",selected.date,"page",index,"history",selected.history,"state",selected.state));
        bind(dateField("Attendance date (Dubai)", selected.date), value -> selected.date = value);
        rosterFilter("Company", "company", selected.company, selected, value -> {
            if (!java.util.Objects.equals(id(selected.company), id(value))) {
                selected.branch = null; selected.site = null; selected.team = null; selected.shift = null;
            }
            selected.company = value;
        });
        if (selected.company != null) {
            rosterFilter("Branch", "branch", selected.branch, selected, value -> {
                if (!java.util.Objects.equals(id(selected.branch), id(value))) {
                    selected.site = null; selected.team = null; selected.shift = null;
                }
                selected.branch = value;
            });
            rosterFilter("Recorded work site", "site", selected.site, selected, value -> selected.site = value);
            rosterFilter("Team", "team", selected.team, selected, value -> selected.team = value);
            rosterFilter("Shift", "shift", selected.shift, selected, value -> selected.shift = value);
        }
        bind(a.field(a.content, "Employee name or code", selected.search, 100, TEXT), value -> selected.search = value.trim());
        a.action("Status · " + status(selected.state), () -> {
            String[] states = {"all", "not_entered", "pending", "queried", "approved", "locked", "approved_leave", "ineligible"};
            String[] labels = {"All", "Not entered", "Pending", "Queried", "Approved", "Locked", "Approved leave", "Ineligible"};
            pick("Timesheet status", labels, which -> { selected.state = states[which]; roster(selected, 0); });
        }, false);
        checkBox(a.content, "Include historical eligibility", selected.history, checked -> selected.history = checked);
        a.action("Load roster", () -> {
            if (id(selected.company) == null) { a.message("Choose a permitted company first.", true); return; }
            if (!HrRules.dateRange(selected.date, selected.date)) { a.message("Choose a valid attendance date.", true); return; }
            roster(selected, 1);
        }, true);
        if (index < 1 || id(input.company) == null || !HrRules.dateRange(input.date, input.date)) return;
        RosterFilter opening = new RosterFilter(input);
        get("Loading your permitted roster", object("op", "roster", "date", opening.date, "company", id(opening.company),
            "branch", id(opening.branch), "site", id(opening.site), "team", id(opening.team), "shift", id(opening.shift),
            "page", index, "search", opening.search, "state", opening.state, "history", opening.history), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No employees match these permitted roster filters.");
            else a.subtitle(join(opening.date, str(opening.company, "label"), result.isNull("total") ? "" : result.getLong("total") + " employees"));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String summary = row.optBoolean("approved_leave") ? "Approved leave" : first(status(str(row, "approval_status")), "Not entered");
                a.card(str(row, "full_name_en"), join(str(row, "employee_code"), summary, str(row, "work_site_label")),
                    () -> rosterEntry(new RosterForm(opening, row), () -> roster(opening, index)));
            }
            pagination(index, result, page -> roster(opening, page));
        });
    }

    private void rosterFilter(String title, String kind, JSONObject value, RosterFilter filter, Choice save) {
        a.action(title + " · " + first(str(value, "label"), kind.equals("company") ? "Choose" : "All permitted"), () -> {
            if (!HrRules.dateRange(filter.date, filter.date)) { a.message("Choose a valid attendance date first.", true); return; }
            chooseRoster(title, kind, filter, "", 0, () -> roster(filter, 0), choice -> { save.select(choice); roster(filter, 0); });
        }, false);
    }

    private void chooseRoster(String title, String kind, RosterFilter filter, String term, long after, Runnable back, Choice selected) {
        page(title, back);
        EditText search = a.field(a.content, "Search permitted choices", term, 100, TEXT);
        a.action("Search", () -> chooseRoster(title, kind, filter, a.value(search), 0, back, selected), true);
        if (!kind.equals("company")) a.action(kind.equals("workSite") ? "Clear work site" : "All permitted", () -> selected.select(null), false);
        get("Loading permitted choices", filter.selections(kind, term, after), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) a.subtitle("No permitted choices match this search.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                if (row.optLong("id") > 0) a.action(str(row, "label"), () -> selected.select(row), false);
            }
            if (after > 0) a.action("First choices", () -> chooseRoster(title, kind, filter, term, 0, back, selected), false);
            long next = rows.length() == 0 ? 0 : rows.getJSONObject(rows.length() - 1).optLong("id");
            if (result.optBoolean("more") && next > after)
                a.action("More choices", () -> chooseRoster(title, kind, filter, term, next, back, selected), false);
        });
    }

    private static final class RosterForm {
        final RosterFilter filter;
        final JSONObject original;
        final List<WorkInterval> intervals = new ArrayList<>();
        JSONObject workSite;
        String kind, notes, reason = "";

        RosterForm(RosterFilter filter, JSONObject original) {
            this.filter = filter; this.original = original;
            JSONObject entered = original.optJSONObject("entered");
            kind = str(entered, "attendance_type");
            notes = str(entered, "notes");
            if (entered == null) return;
            if (entered.optLong("work_site_id") > 0) {
                workSite = object("id", entered.optLong("work_site_id"), "label", first(str(original, "work_site_label"), "Current ERP work site"));
            }
            JSONArray saved = entered.optJSONArray("intervals");
            if (saved != null) for (int i = 0; i < saved.length(); i++) {
                JSONObject row = saved.optJSONObject(i);
                if (row != null) intervals.add(new WorkInterval(row, filter.date));
            }
        }
    }

    private static final class ClockRange {
        String from = "", to = "";
        boolean fromNext, toNext;
        ClockRange() {}
        ClockRange(JSONObject saved, String date) {
            String start = str(saved, "start"), end = str(saved, "end");
            from = timePart(start); to = timePart(end);
            fromNext = !from.isEmpty() && !start.startsWith(date + "T");
            toNext = !to.isEmpty() && !end.startsWith(date + "T");
        }
    }

    private static final class WorkInterval {
        final ClockRange work;
        final List<ClockRange> breaks = new ArrayList<>();
        WorkInterval() { work = new ClockRange(); }
        WorkInterval(JSONObject saved, String date) {
            work = new ClockRange(saved, date);
            JSONArray pauses = saved.optJSONArray("breaks");
            if (pauses != null) for (int i = 0; i < pauses.length(); i++) {
                JSONObject pause = pauses.optJSONObject(i);
                if (pause != null) breaks.add(new ClockRange(pause, date));
            }
        }
        int[] minutes() {
            int[] result = new int[2 + breaks.size() * 2];
            result[0] = HrRules.minute(work.from, work.fromNext);
            result[1] = HrRules.minute(work.to, work.toNext);
            for (int i = 0; i < breaks.size(); i++) {
                ClockRange pause = breaks.get(i);
                result[2 + 2 * i] = HrRules.minute(pause.from, pause.fromNext);
                result[3 + 2 * i] = HrRules.minute(pause.to, pause.toNext);
            }
            return result;
        }
    }

    private void rosterEntry(RosterForm form, Runnable back) {
        JSONObject row = form.original;
        RosterFilter filter = form.filter;
        long employee = row.optLong("employee_id");
        String revision = str(row, "revision"), approval = str(row, "approval_status");
        Long existing = id(row);
        Runnable redraw = () -> rosterEntry(form, back);
        page("Timesheet entry", back);
        a.subtitle(join(str(row, "full_name_en"), str(row, "employee_code"), filter.date));
        a.subtitle(row.optBoolean("approved_leave") ? "Approved leave" : first(status(approval), "Not entered"));
        String warning = str(row, "context_warning");
        if (!warning.isEmpty()) a.subtitle(warning);
        showSchedule(row.optJSONArray("schedule"));
        JSONObject recorded = row.optJSONObject("entered");
        if (recorded != null) showRecorded(recorded, str(row, "work_site_label"), filter.date);
        if (row.optBoolean("eligible") && !row.optBoolean("approved_leave") && row.optBoolean("canApprove")
                && "pending".equals(approval) && existing != null && validRevision(revision)) {
            a.action("Approve recorded timesheet", () -> confirm("Approve the currently recorded timesheet?", "Approve", () ->
                submit("Timesheet approval on " + filter.date, "roster:" + employee + ":" + filter.date,
                    object("op", "rosterApprove", "employeeId", employee, "id", existing, "revision", revision), back)), false);
        }
        if (!row.optBoolean("eligible") || row.optBoolean("approved_leave") || "approved".equals(approval) || "locked".equals(approval)) return;
        if ((existing != null && !validRevision(revision)) || !str(row, "fingerprint").matches("[0-9a-f]{64}")) {
            a.subtitle("The original timesheet version is unavailable. Return to the roster and reload this date.");
            return;
        }
        a.action("Attendance type · " + first(status(form.kind), "Choose"), () -> pick("Attendance type", ATTENDANCE_LABELS, which -> {
            form.kind = ATTENDANCE_CODES[which]; redraw.run();
        }), false);
        if (!form.kind.isEmpty()) {
            if (requiresWorkSite(form.kind)) {
                a.action("Actual work site · " + first(str(form.workSite, "label"), "Choose"), () ->
                    chooseRoster("Actual work site", "workSite", filter, "", 0, redraw, chosen -> { form.workSite = chosen; redraw.run(); }), false);
            }
            boolean work = working(form.kind);
            if (work || !form.intervals.isEmpty()) {
                if (!work) a.subtitle("Remove all work intervals before saving this attendance type.");
                intervalEditor(form, redraw, work);
            }
        }
        bind(a.field(a.content, "Notes", form.notes, 500, MULTILINE), value -> form.notes = value);
        if (existing != null) bind(a.field(a.content, "Reason for changing the entry", form.reason, 500, MULTILINE), value -> form.reason = value);
        a.action("Save actual attendance", () -> saveTimesheet(form, back), true);
    }

    private void intervalEditor(RosterForm form, Runnable redraw, boolean work) {
        for (int i = 0; i < form.intervals.size(); i++) {
            WorkInterval interval = form.intervals.get(i);
            LinearLayout card = a.card("Work interval " + (i + 1), "", null);
            if (work) {
                rangeControls(card, interval.work, false);
                for (int j = 0; j < interval.breaks.size(); j++) {
                    ClockRange pause = interval.breaks.get(j);
                    a.add(card, a.button("Remove break " + (j + 1), () -> { interval.breaks.remove(pause); redraw.run(); }, false), 4);
                    rangeControls(card, pause, true);
                }
                if (interval.breaks.size() < 4) a.add(card, a.button("Add ordered break", () -> {
                    interval.breaks.add(new ClockRange()); redraw.run();
                }, false), 4);
            }
            a.add(card, a.button("Remove work interval", () -> { form.intervals.remove(interval); redraw.run(); }, false), 4);
        }
        if (work && form.intervals.size() < 8) a.action("Add work interval", () -> { form.intervals.add(new WorkInterval()); redraw.run(); }, false);
    }

    private void rangeControls(LinearLayout parent, ClockRange range, boolean pause) {
        bind(timeField(parent, pause ? "Break start" : "Actual start", range.from), value -> range.from = value);
        if (pause) checkBox(parent, "Break starts next day", range.fromNext, checked -> range.fromNext = checked);
        bind(timeField(parent, pause ? "Break finish" : "Actual finish", range.to), value -> range.to = value);
        checkBox(parent, pause ? "Break ends next day" : "Work ends next day", range.toNext, checked -> range.toNext = checked);
    }

    private void saveTimesheet(RosterForm form, Runnable back) {
        if (form.kind.isEmpty()) { a.message("Choose the attendance type.", true); return; }
        if (requiresWorkSite(form.kind) && form.workSite == null) { a.message("Choose the actual work site.", true); return; }
        int[][] intervals = new int[form.intervals.size()][];
        for (int i = 0; i < intervals.length; i++) intervals[i] = form.intervals.get(i).minutes();
        String problem = HrRules.workError(working(form.kind), intervals);
        if (problem != null) { a.message(problem, true); return; }
        String date = form.filter.date;
        JSONArray values = new JSONArray();
        for (int[] row : intervals) {
            JSONArray breaks = new JSONArray();
            for (int i = 2; i < row.length; i += 2) breaks.put(object("start", HrRules.stamp(date, row[i]), "end", HrRules.stamp(date, row[i + 1])));
            values.put(object("start", HrRules.stamp(date, row[0]), "end", HrRules.stamp(date, row[1]), "breaks", breaks));
        }
        JSONObject original = form.original;
        Long existing = id(original);
        long employee = original.optLong("employee_id");
        JSONObject request = object("employeeId", employee, "date", date, "id", existing,
            "revision", existing == null ? null : str(original, "revision"), "fingerprint", str(original, "fingerprint"), "reason", form.reason.trim(),
            "values", object("attendance_type", form.kind, "intervals", values,
                "work_site_id", requiresWorkSite(form.kind) ? id(form.workSite) : null, "notes", nullable(form.notes)));
        submit("Timesheet entry on " + date, "roster:" + employee + ":" + date, object("op", "rosterSave", "request", request), back);
    }

    private void showSchedule(JSONArray schedule) {
        if (schedule == null || schedule.length() == 0) return;
        LinearLayout card = a.card("Scheduled intervals", "", null);
        for (int i = 0; i < schedule.length(); i++) {
            JSONObject interval = schedule.optJSONObject(i);
            if (interval != null) a.detail(card, "Schedule", range(str(interval, "start"), str(interval, "end")));
        }
    }

    private void showRecorded(JSONObject entered, String site, String date) {
        LinearLayout card = a.card("Currently recorded in ERP", join(status(str(entered, "attendance_type")), site), null);
        JSONArray rows = entered.optJSONArray("intervals");
        if (rows != null) for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            a.detail(card, "Actual interval", range(displayTime(str(row, "start"), date), displayTime(str(row, "end"), date)));
            JSONArray breaks = row.optJSONArray("breaks");
            if (breaks != null) for (int j = 0; j < breaks.length(); j++) {
                JSONObject pause = breaks.optJSONObject(j);
                if (pause != null) a.detail(card, "Break", range(displayTime(str(pause, "start"), date), displayTime(str(pause, "end"), date)));
            }
        }
        a.detail(card, "Notes", str(entered, "notes"));
    }

    /** Capture from a row after its read has been admitted to the current HR page. */
    DialSource dialSource(String number) {
        Screen owner = openScreen;
        String normalized = PhoneNumber.normalize(number);
        if (owner == null || normalized == null) return null;
        DialSource source = new DialSource(owner, normalized);
        return source.currentFor(this) ? source : null;
    }

    final class DialSource {
        private final Screen owner;
        private final String number;

        private DialSource(Screen owner, String number) { this.owner = owner; this.number = number; }

        String number() { return number; }
        boolean currentFor(HrWorkspace workspace) {
            return workspace == HrWorkspace.this
                && HrRules.diallerAllowed(a.capability("hr"), owner == openScreen, owner.visible());
        }
    }

    final class Screen {
        final ErpApi api = a.api;
        final String account = api == null ? "" : api.user();
        final long epoch = api == null ? -1 : api.hrSessionEpoch();
        final long generation = LocalSecurity.generation(a);
        final Object view = a.content;
        final Object instance = lifetime;
        final long privateTicket = privacy.ticket();

        Object routeOwner(){return readRoute;}

        boolean visible() {
            return delivery() == HrRules.Delivery.SHOW && a.hrActive();
        }

        boolean sameView() {
            return ownsView() && api == a.api && api != null
                && account.equals(api.user()) && generation == LocalSecurity.generation(a);
        }

        boolean ownsView() {
            return privacy.accepts(privateTicket) && instance == lifetime && view == a.content && !a.isDestroyed() && !a.isFinishing();
        }

        boolean denied(Exception e) {
            if(!(e instanceof ErpApi.Rejected) || !HrRules.privateDenial(((ErpApi.Rejected)e).status))return false;
            if(api!=null && HrRecovery.neutralize(ownsView(),api==a.api,generation==LocalSecurity.generation(a) && LocalSecurity.isAccount(a,account),
                    api.signedIn(),epoch,api.hrSessionEpoch()))showFailure(e);
            return true;
        }

        void requireMounted() throws IOException {
            requireCurrentSession();
            if(!visible() || !a.capability("hr") || !a.capability("upload"))
                throw new ErpApi.Rejected("The original request is no longer available.",403,null);
        }

        boolean sameScope() {
            return sameView() && HrRules.current(account, epoch, view, api.user(), api.hrSessionEpoch(), a.content, true);
        }

        HrRules.Delivery delivery() {
            return HrRules.delivery(sameScope(), a.hrForeground(), LocalSecurity.unlocked(a));
        }

        void requireBoundSession() throws IOException {
            if (epoch < 0 || api.hrSessionEpoch() != epoch || !account.equals(api.user()))
                throw new ErpApi.Rejected("Open the current signed-in ERP account.", 401, null);
            LocalSecurity.requireAccount(a, account, generation);
        }

        void requireCurrentSession() throws IOException {
            requireBoundSession();
            if (!LocalSecurity.unlocked(a)) throw new IOException("Unlock the app to use HR.");
        }

        HrOperationStore store() throws IOException {
            requireCurrentSession();
            return new HrOperationStore(a, account);
        }
    }

    private static final class Result<T> {
        final T value;
        final Exception failure;
        Result(T value, Exception failure) { this.value = value; this.failure = failure; }
    }

    <T> void load(String label, LauncherActivity.Task<T> work, LauncherActivity.Success<T> done) {
        load(label, work, done, null);
    }

    <T> void load(String label, LauncherActivity.Task<T> work, LauncherActivity.Success<T> done, Runnable refreshOnResume) {
        Screen screen = new Screen();
        if (!screen.visible()) return;
        a.run(label, () -> {
            try {
                screen.requireCurrentSession();
                return new Result<>(work.run(), null);
            } catch (Exception failure) {
                return new Result<T>(null, failure);
            }
        }, result -> deliver(screen, result, done, refreshOnResume));
    }

    private <T> void deliver(Screen screen, Result<T> result, LauncherActivity.Success<T> done, Runnable refreshOnResume) {
        if (!privacy.accepts(screen.privateTicket)) { resume(); return; }
        if(screen.denied(result.failure))return;
        if (screen.delivery() == HrRules.Delivery.WAIT) {
            deferred = () -> {
                if (refreshOnResume != null && screen.visible()) refreshOnResume.run();
                else deliver(screen, result, done, null);
            };
            return;
        }
        if (!screen.visible()) {
            if (screen.ownsView() && a.hrForeground() && LocalSecurity.unlocked(a) && !screen.sameScope()) {
                reset();
                a.reconnect();
            }
            return;
        }
        if (result.failure != null) { showFailure(result.failure); return; }
        try { done.show(result.value); }
        catch (Exception failure) { if (screen.visible()) showFailure(failure); }
    }

    private void get(String label, JSONObject command, LauncherActivity.Success<JSONObject> done) {
        Screen screen = new Screen();
        load(label, () -> screen.api.hrGet(command), done);
    }

    void submit(String label, String key, JSONObject body, Runnable after) {
        submit(label,key,body,after,"");
    }

    private void submit(String label,String key,JSONObject body,Runnable after,String renewalHandoff) {
        Screen screen = new Screen();
        if (!readyToSend(screen)) return;
        String operation = UUID.randomUUID().toString();
        JSONObject target = "rosterSave".equals(str(body, "op")) ? body.optJSONObject("request") : body;
        if (target == null) { a.message("Open the original record again.", true); return; }
        put(target, target == body ? "operationId" : "operation", operation);
        route(object("op","savedOperation","operationId",operation));
        load("Submitting to ERP", () -> {
            HrOperationStore store = screen.store();
            HrOperationStore.Pending pending = store.freeze(body, operation, screen.epoch, label, key,renewalHandoff);
            return tryOriginal(screen, store, pending, true);
        }, result -> {
            if("serviceFulfil".equals(str(body,"op")) && !result.pending && result.failure instanceof ErpApi.Rejected){
                int status=((ErpApi.Rejected)result.failure).status;
                if(status==409 || status==422){
                    notice=rejection((ErpApi.Rejected)result.failure)+" Reopen the current request to continue.";
                    after.run();return;
                }
            }
            showWrite(result, after);
        });
    }

    void pending() {
        page(HR_RECEIPTS, "HR receipts and pending submissions", this::contextHome);
        route(object("op","hrReceipts"));
        a.action("Refresh saved submissions", this::pending, false);
        Screen screen = new Screen();
        load("Reading saved submissions", () -> screen.store().pending(), entries -> {
            if (entries.isEmpty()) a.subtitle("There are no saved HR submissions to review.");
            int position = 1;
            for (HrOperationStore.Pending entry : entries) {
                LinearLayout card = a.card("Saved submission " + position++, "", null);
                a.add(card, a.button("Check current access and receipt", () -> reviewSaved(entry.operation, this::pending), true), 4);
            }
        });
    }

    private static final class SavedReview {
        final HrOperationStore.Pending entry;
        final HrRules.PendingAccess access;
        SavedReview(HrOperationStore.Pending entry, boolean receipt, boolean currentTarget) {
            this.entry = entry;
            access = HrRules.pendingAccess(entry.receiptId, receipt, currentTarget);
        }
    }

    void reviewSaved(String operation, Runnable back) {
        page("Review saved submission", back);
        route(object("op","savedOperation","operationId",operation));
        Screen screen = new Screen();
        Runnable refresh = () -> reviewSaved(operation, back);
        a.action("Check again", refresh, false);
        if (!readyToSend(screen)) return;
        load("Verifying current access and receipt", () -> {
            HrOperationStore store = screen.store();
            return verifySaved(screen, store, readSaved(store, operation));
        }, result -> {
            if(result==null){
                a.subtitle("The ERP closed this original issuance without effect.");
                a.action("Reopen service review",()->services.requests("review",0,"approved",0,this::home),false);return;
            }
            HrOperationStore.Pending entry = result.entry;
            if (result.access == HrRules.PendingAccess.RECEIPT) {
                showReceipt(entry, back);
                return;
            }
            if (result.access == HrRules.PendingAccess.REDACTED) {
                a.subtitle("The ERP could not confirm this receipt or your current access. Ask HR to reconcile the saved submission.");
                return;
            }
            freshJournalOnResume = refresh;
            a.card(submissionTitle(entry), submissionContext(entry), null);
            if (HrRules.canReplay(entry.originEpoch, screen.epoch, entry.receiptId)) {
                a.action("Retry original submission", () -> confirm("Retry " + submissionTitle(entry) + "?", submissionContext(entry),
                    "Retry", () -> recover(entry.operation, back)), false);
            } else a.subtitle("The original submission belongs to an earlier sign-in. Ask HR to reconcile it before re-entering it.");
        }, refresh);
    }

    private SavedReview verifySaved(Screen screen, HrOperationStore store, HrOperationStore.Pending entry) throws Exception {
        screen.requireCurrentSession();
        try {
            JSONObject receipt = screen.api.hrGet(receiptCommand(entry));
            if (entry.matches(receipt)) {
                screen.requireBoundSession();
                return new SavedReview(store.confirm(entry.operation, receipt), true, false);
            }
            return new SavedReview(entry, false, false);
        } catch (ErpApi.Rejected error) {
            if (HrRules.privateDenial(error.status)) throw error;
            HrRecovery.Lookup fallback=HrRecovery.lookup(entry.originEpoch,screen.epoch,entry.receiptId,error.status);
            if(fallback==HrRecovery.Lookup.REDACTED)return new SavedReview(entry,false,false);
            if (fallback==HrRecovery.Lookup.CHECK_TERMINAL && entry.command.equals("serviceFulfil") && entry.receiptId==0
                && "issue-letter".equals(str(entry.body().optJSONObject("command"),"kind"))
                && error.response!=null && !error.response.optBoolean("uncertain") && currentSavedTarget(screen,entry)) {
                String revision=str(entry.body(),"revision");
                JSONObject attempt=screen.api.hrGet(HrServices.opened("serviceAttempt",entry.employeeId,entry.targetId,revision));
                if(HrRules.exactRecord(entry.employeeId,entry.targetId,revision,attempt.optLong("employeeId"),attempt.optLong("id"),str(attempt,"revision"))
                    && attempt.has("attempt") && attempt.isNull("attempt")){
                    screen.requireCurrentSession();store.discardRejected(entry.operation);return null;
                }
            }
            if(fallback!=HrRecovery.Lookup.CHECK_TARGET)return new SavedReview(entry,false,false);
        }
        return new SavedReview(entry, false, currentSavedTarget(screen, entry));
    }

    private static HrOperationStore.Pending readSaved(HrOperationStore store, String operation) throws Exception {
        for (HrOperationStore.Pending saved : store.pending()) if (saved.operation.equals(operation)) return saved;
        throw new IOException("This submission is no longer stored on this phone.");
    }

    private static JSONObject receiptCommand(HrOperationStore.Pending entry) {
        return object("op", HrV5Rules.receipt(entry.command), "operationId", entry.operation);
    }

    private boolean currentSavedTarget(Screen screen, HrOperationStore.Pending entry) throws Exception {
        screen.requireCurrentSession();
        JSONObject body = entry.body();
        try {
            switch (entry.command) {
                case "serviceDecision": case "serviceFulfil": {
                    JSONObject opened=screen.api.hrGet(HrServices.opened("serviceOpening",entry.employeeId,entry.targetId,str(body,"revision")));
                    return HrRules.exactRecord(entry.employeeId,entry.targetId,str(body,"revision"),opened.optLong("employeeId"),opened.optLong("id"),str(opened,"revision"))
                        && HrV5Rules.full(str(opened,"visibility"),opened.optBoolean("canRead")) && opened.optBoolean(entry.command.equals("serviceDecision")?"canDecide":"canFulfil");
                }
                case "serviceSubmit": case "issueAcknowledge": {
                    JSONObject subject=screen.api.hrGet(object("op","home"));
                    if(!subject.optBoolean("own") || !HrV5Rules.subject(entry.employeeId,subject.optLong("employeeId")))return false;
                    boolean ack=entry.command.equals("issueAcknowledge");
                    JSONObject p=ack?body:body.getJSONObject("proposal");
                    JSONObject opts=screen.api.hrGet(object("op","serviceOptions","employeeId",entry.employeeId,"kind",ack?"issue-return":str(p,"kind")));
                    return opts.optBoolean("canSubmit") && HrV5Rules.subject(entry.employeeId,opts.optLong("employeeId"))
                        && (!p.has("employeeRevision") || str(p,"employeeRevision").equals(str(opts,"employeeRevision")))
                        && HrServices.currentSource(screen,entry.employeeId,p.optJSONObject("source"),p.optLong("caseId"))
                        && HrServices.currentEvidence(screen,entry.employeeId,p);
                }
                case "decision": {
                    String kind = str(body, "kind");
                    String revision = str(body, "revision");
                    JSONObject opened = screen.api.hrGet(object("op", "opening", "kind", kind, "employeeId", entry.employeeId,
                        "id", entry.targetId, "revision", revision));
                    return opened.optBoolean("canDecide") && kind.equals(str(opened, "kind"))
                        && HrRules.exactRecord(entry.employeeId, entry.targetId, revision, opened.optLong("employeeId"),
                            opened.optLong("id"), str(opened, "revision"));
                }
                case "rosterSave":
                case "rosterApprove":
                    return currentSavedTimesheet(screen, entry, body);
                default:
                    return currentOwnSubmission(screen, entry, body);
            }
        } catch (ErpApi.Rejected error) {
            if (HrRules.privateDenial(error.status)) throw error;
            return false;
        }
    }

    private boolean currentOwnSubmission(Screen screen, HrOperationStore.Pending entry, JSONObject body) throws Exception {
        JSONObject access = screen.api.hrGet(object("op", "home"));
        JSONObject caps = access.getJSONObject("capabilities");
        boolean allowed;
        switch (entry.command) {
            case "profileCorrection": allowed = caps.optBoolean("profileCorrection"); break;
            case "leaveSubmit":
            case "leaveCancel":
                allowed = caps.optBoolean("leaveSubmit") && (body.optLong("documentId") <= 0 || caps.optBoolean("leaveCertificate"));
                break;
            case "timeCorrection": allowed = caps.optBoolean("timeCorrection"); break;
            case "renewalSubmit":
                allowed = caps.optBoolean("renewalSubmit") && caps.optBoolean("renewalCompliance")
                    && (!"medical-insurance".equals(str(body, "kind")) || caps.optBoolean("renewalMedical"))
                    && (body.optLong("documentId") <= 0 || caps.optBoolean("evidence"));
                break;
            default: allowed = false;
        }
        return HrRules.ownScope(entry.employeeId, access.optBoolean("own"), access.optLong("employeeId"), allowed);
    }

    private boolean currentSavedTimesheet(Screen screen, HrOperationStore.Pending entry, JSONObject body) throws Exception {
        boolean approve = entry.command.equals("rosterApprove");
        JSONObject original = approve ? body : body.getJSONObject("request");
        JSONObject opening = screen.api.hrGet(object("op", "rosterOpening", "employeeId", entry.employeeId, "id",
            entry.targetId > 0 ? entry.targetId : null));
        JSONObject current = opening.getJSONObject("row");
        if (current.optLong("employee_id") != entry.employeeId) return false;
        String date = str(original, "date");
        if (!approve && !date.equals(str(opening, "date"))) {
            if (entry.targetId > 0) return false;
            current = historicalRosterEntry(screen, entry.employeeId, opening.optLong("company"), date, str(current, "employee_code"));
        }
        if (current == null || !current.optBoolean("eligible") || current.optBoolean("approved_leave")
                || !HrRules.exactRecord(entry.employeeId, entry.targetId, str(original, "revision"), current.optLong("employee_id"),
                    current.optLong("id"), str(current, "revision"))) return false;
        return approve ? current.optBoolean("canApprove")
            : str(original, "fingerprint").equals(str(current, "fingerprint"))
                && !"approved".equals(str(current, "approval_status")) && !"locked".equals(str(current, "approval_status"));
    }

    private JSONObject historicalRosterEntry(Screen screen, long employee, long company, String date, String employeeCode) throws Exception {
        if (company <= 0 || employeeCode.isEmpty() || !HrRules.dateRange(date, date)) return null;
        for (int page = 1; page <= 100000; page++) {
            screen.requireCurrentSession();
            JSONObject result = screen.api.hrGet(object("op", "roster", "company", company, "date", date, "branch", null, "site", null,
                "team", null, "shift", null, "search", employeeCode, "page", page, "history", true, "state", "all"));
            JSONArray rows = result.getJSONArray("rows");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                long subject = row.optLong("employee_id");
                if (subject == employee) return row;
                if (subject > employee) return null;
            }
            if (!result.optBoolean("more") || rows.length() == 0) return null;
        }
        return null;
    }

    private static String submissionTitle(HrOperationStore.Pending entry) {
        return entry.decision.isEmpty() ? entry.label : status(entry.decision) + " · " + entry.label;
    }

    private static String submissionContext(HrOperationStore.Pending entry) {
        return join(entry.reference, "Employee #" + entry.employeeId);
    }

    private void recover(String operation, Runnable back) {
        Screen screen = new Screen();
        if (!readyToSend(screen)) return;
        page("Retry original submission", back);
        Screen retryScreen = new Screen();
        load("Retrying original submission", () -> {
            HrOperationStore store = retryScreen.store();
            return tryOriginal(retryScreen, store, readSaved(store, operation), false);
        }, result -> showWrite(result, back));
    }

    private static final class WriteResult {
        final HrOperationStore.Pending confirmed;
        final boolean pending, earlierSession;
        final Exception failure;
        WriteResult(HrOperationStore.Pending confirmed, boolean pending, boolean earlierSession, Exception failure) {
            this.confirmed = confirmed; this.pending = pending; this.earlierSession = earlierSession; this.failure = failure;
        }
    }

    private WriteResult tryOriginal(Screen screen, HrOperationStore store, HrOperationStore.Pending pending,
            boolean firstAttempt) throws Exception {
        JSONObject frozen = pending.body();
        JSONObject receipt;
        boolean originalLogin = HrRules.canReplay(pending.originEpoch, screen.epoch, pending.receiptId);
        screen.requireCurrentSession();
        if (!firstAttempt) {
            try {
                receipt = screen.api.hrGet(receiptCommand(pending));
                return saveReceipt(screen, store, pending, receipt);
            } catch (ErpApi.Rejected failure) {
                if (!originalLogin || failure.status != 503) return new WriteResult(null, true, !originalLogin, failure);
            } catch (Exception failure) {
                return new WriteResult(null, true, !originalLogin, failure);
            }
            if (!currentSavedTarget(screen, pending))
                return new WriteResult(null, true, false, new IOException("The original target could not be verified."));
        }
        screen.requireCurrentSession();
        if (!HrRules.canReplay(pending.originEpoch, screen.api.hrSessionEpoch(), pending.receiptId))
            return new WriteResult(null, true, true, null);
        try {
            receipt = screen.api.hrGet(frozen);
        } catch (ErpApi.Rejected failure) {
            boolean uncertain = failure.response != null && failure.response.optBoolean("uncertain");
            boolean definitive = HrRules.mayDiscardRejected(true, failure.status, uncertain);
            if (HrRules.mayDiscardRejected(firstAttempt, failure.status, uncertain)) {
                screen.requireBoundSession();
                store.discardRejected(pending.operation);
                return new WriteResult(null, false, false, failure);
            }
            if (!firstAttempt && definitive) {
                try {
                    screen.requireCurrentSession();
                    return saveReceipt(screen, store, pending, screen.api.hrGet(receiptCommand(pending)));
                } catch (Exception unresolved) { return new WriteResult(null, true, false, failure); }
            }
            return new WriteResult(null, true, false, failure);
        } catch (Exception failure) {
            return new WriteResult(null, true, false, failure);
        }
        try { return saveReceipt(screen, store, pending, receipt); }
        catch (Exception failure) { return new WriteResult(null, true, false, failure); }
    }

    private WriteResult saveReceipt(Screen screen, HrOperationStore store, HrOperationStore.Pending pending,
            JSONObject receipt) throws Exception {
        screen.requireBoundSession();
        return new WriteResult(store.confirm(pending.operation, receipt), false, false, null);
    }

    private void showReceipt(HrOperationStore.Pending entry, Runnable after) {
        page("ERP confirmation", after);
        route(object("op","savedOperation","operationId",entry.operation));
        freshJournalOnResume = () -> reviewSaved(entry.operation, after);
        a.subtitle(submissionTitle(entry));
        a.subtitle(submissionContext(entry));
        a.subtitle((entry.effect().isEmpty() ? "ERP confirmation" : HrV5Rules.effect(entry.effect())) + " · Reference #" + entry.receiptId);
        a.action("Continue", () -> {
            Screen screen = new Screen();
            load("Acknowledging confirmation", () -> {
                HrOperationStore store = screen.store();
                if (entry.command.equals("renewalSubmit") && entry.originEpoch == screen.epoch) {
                    JSONObject saved = store.evidenceSlot(screen.epoch,false).read();
                    if(saved!=null && entry.matchesRenewal(saved)){
                        HrCaptureTarget expected=HrCaptureTarget.forForm(screen.epoch,false,saved,0);
                        HrCaptureTarget.consume(store.evidenceSlot(screen.epoch,false),screen.epoch,false,expected,screen::visible);
                    }
                }
                store.acknowledge(entry.operation, entry.receiptId);
                return true;
            }, ignored -> after.run());
        }, true);
    }

    private void showWrite(WriteResult result, Runnable after) {
        if (result.failure instanceof ErpApi.Rejected && HrRules.privateDenial(((ErpApi.Rejected) result.failure).status)) privacy.hide();
        if (result.confirmed != null) {
            reviewSaved(result.confirmed.operation, after);
        } else if (result.pending) {
            String detail = result.failure instanceof ErpApi.Rejected && ((ErpApi.Rejected) result.failure).status != 503
                ? rejection((ErpApi.Rejected) result.failure) + " " : "";
            String followUp = result.earlierSession ? "The original submission was made in an earlier sign-in. Ask HR to reconcile it if its receipt is unavailable."
                : "The ERP has not confirmed this submission. Check its original receipt before retrying.";
            a.message(detail + followUp, true);
            a.action("HR receipts and pending submissions", this::pending, false);
        } else showFailure(result.failure);
    }

    private boolean readyToSend(Screen screen) {
        if (!screen.visible() || a.busy) return false;
        ConnectivityManager manager = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities network = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
        if (network == null || !network.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
            a.message("Connect to the internet before submitting or checking an HR action.", true);
            return false;
        }
        return true;
    }

    void showFailure(Exception error) {
        if (error instanceof ErpApi.Rejected) {
            if (HrRules.privateDenial(((ErpApi.Rejected) error).status)) privacy.hide();
            a.message(rejection((ErpApi.Rejected) error), true);
            return;
        }
        if (error instanceof java.net.SocketTimeoutException || error instanceof java.net.UnknownHostException
                || error instanceof java.net.ConnectException || error instanceof javax.net.ssl.SSLException) {
            a.message("The ERP could not be reached. Check your connection and retry.", true);
            return;
        }
        a.message(error instanceof IOException ? first(error.getMessage(), "HR information is unavailable. Try again.")
            : "HR information is unavailable. Try again.", true);
    }

    private static String rejection(ErpApi.Rejected rejection) {
        if (rejection.status == 401) return "Open the current signed-in ERP account.";
        if (rejection.status == 403) return "This HR information or action is unavailable with your current access.";
        if (rejection.status == 409) return "This record has changed. Open its latest version before making changes.";
        if (rejection.status == 422) return first(rejection.getMessage(), "Check the information entered and try again.");
        return "ERP HR is unavailable. Try again.";
    }

    java.util.function.BooleanSupplier actionTicket(){
        Screen owner=openScreen;
        if(owner==null || owner.view!=a.content)return null;
        return ()->owner==openScreen && owner.visible();
    }

    boolean ownsTransferRoute(Object ticket){
        return ticket!=null && ticket==readRoute && ((openScreen!=null && openScreen.ownsView()) || homeRefresh.owns(a.content));
    }

    void selectIssuance(long id){
        if(readRoute!=null && "issuedDocuments".equals(str(readRoute,"op")))HrView.set(readRoute,"issuanceId",id);
    }

    void transferFinished(HrFiles.Issued source,Exception error,String success){
        if(!files.exports.owns(source.action))return;
        boolean denied=error instanceof ErpApi.Rejected && HrRules.privateDenial(((ErpApi.Rejected)error).status);
        boolean local=source.api==a.api && ownsTransferRoute(source.routeOwner)
            && source.generation==LocalSecurity.generation(a) && LocalSecurity.isAccount(a,source.owner) && LocalSecurity.unlocked(a);
        boolean current=local && (HrV5Rules.restore(source.owner,source.epoch,a.api.user(),a.api.hrSessionEpoch(),true)
            || denied && !a.api.signedIn() && a.api.hrSessionEpoch()<0);
        switch(files.exports.completion(source.action,current,error==null,denied)){
            case DROP:return;
            case DENY:showFailure(error);return;
            case RESUME:
                transferNotice=error==null?success:"The issued PDF could not be exported. Reopen the original to try again.";
                if(a.hrActive() && !a.busy){
                    if(homeRefresh.owns(a.content))resume();else showTransferNotice();
                }
        }
    }
    private void showTransferNotice(){
        if(!transferNotice.isEmpty()){a.subtitle(transferNotice);transferNotice="";}
    }

    void leaving(Object view) {
        if(openScreen!=null && openScreen.view==view){
            files.leavingView();files.retire();dismissDialog();openScreen=null;deferred=null;freshJournalOnResume=null;readRoute=null;
        }
    }

    private boolean restoreLegacy(JSONObject r){
        String op=str(r,"op"),kind=str(r,"kind");long e=r.optLong("employeeId"),after=r.optLong("after");
        int page=r.optInt("page",1);
        switch(op){
            case "workInbox":inbox();return true;
            case "requests":case "inbox":requestList(op,kind,after,this::contextHome);return true;
            case "opening":requestOpening(r,this::contextHome,r.optBoolean("officer"));return true;
            case "profile":profile(e);return true;
            case "employees":employees("",page);return true;
            case "roster":{
                if(!can("roster"))return false;
                RosterFilter f=new RosterFilter();
                f.company=filterRef(r,"company");f.branch=filterRef(r,"branch");f.team=filterRef(r,"team");f.site=filterRef(r,"site");f.shift=filterRef(r,"shift");
                f.date=str(r,"date");f.state=str(r,"state");f.history=r.optBoolean("history");roster(f,page);return true;
            }
        }
        if(e<=0 || e!=ownEmployee)return false;
        switch(op){
            case "leaveHome":if(can("leave")){leaveHome(e);return true;}break;
            case "leaveBalances":if(can("leave")){leaveBalances(e,after);return true;}break;
            case "leaveRequests":if(can("leave")){leaveRequests(e,page);return true;}break;
            case "attendanceHome":if(can("attendance")){attendanceHome(e);return true;}break;
            case "time":if(can("attendance")){time(e,kind,HrView.title(kind),page);return true;}break;
            case "renewalsHome":if(can("renewals")){renewalsHome(e);return true;}break;
            case "renewals":if(renewalKindAllowed(kind)){renewals(e,kind,HrView.title(kind),page);return true;}break;
        }
        return false;
    }

    private static JSONObject filterRef(JSONObject route,String key){
        return route.optLong(key)>0?object("id",route.optLong(key),"label","Selected "+key):null;
    }

    void route(JSONObject descriptor) {
        readRoute = descriptor;
        routeAccount = a.api.user();
        routeEpoch = a.api.hrSessionEpoch();
    }

    void subjectRead(JSONObject command, LauncherActivity.Success<JSONObject> done) {
        long expected = command.optLong("employeeId");
        get("Loading HR records", command, result -> {
            String op=str(command,"op");
            boolean unfiltered=expected<=0 && (command.has("employeeId") || op.equals("directory") || op.equals("teamReadiness"));
            if (expected > 0 && !HrV5Rules.subject(expected, result.optLong("employeeId"))
                || unfiltered && (!result.has("employeeId") || !result.isNull("employeeId")))
                throw new ErpApi.Rejected("Employee record changed.", 409, null);
            done.show(result);
        });
    }

    void page(String title, Runnable back) { page(HR_PAGE, title, back); }

    void page(MobileRoute.Id id, String title, Runnable back) {
        readRoute = null;
        files.retire();
        deferred = null;
        freshJournalOnResume = null;
        dismissDialog();
        a.page(id, back, !id.viewer());
        openScreen = new Screen();
        a.title(title);
        if (!notice.isEmpty()) {
            a.subtitle(notice);
            notice = "";
        }
    }

    void showFields(String heading, JSONArray fields) throws Exception {
        LinearLayout card = a.card(heading, "", null);
        for (int i = 0; i < fields.length(); i++) {
            JSONObject field = fields.getJSONObject(i);
            a.detail(card, str(field, "label"), first(str(field, "value"), "Unavailable"));
        }
    }

    void confirm(String title, String yes, Runnable confirmed) {
        confirm(title, "", yes, confirmed);
    }

    void confirm(String title, String detail, String yes, Runnable confirmed) {
        Screen screen = new Screen();
        if (!screen.visible() || a.busy) return;
        AlertDialog.Builder builder = new AlertDialog.Builder(a).setTitle(title).setNegativeButton("Cancel", null)
            .setPositiveButton(yes, (dialog, which) -> { if (screen.visible()) confirmed.run(); });
        if (!detail.isEmpty()) builder.setMessage(detail);
        showDialog(builder.create());
    }

    private void showDialog(Dialog next) {
        dismissDialog();
        dialog = next;
        next.setOnDismissListener(ignored -> { if (dialog == next) dialog = null; });
        a.trackDialogInteraction(next);
        next.show();
        a.trackDialogAccessibility(next);
    }

    private void dismissDialog() {
        Dialog old = dialog;
        dialog = null;
        if (old != null) old.dismiss();
    }

    interface PageChoice { void select(int page); }
    interface TextChange { void set(String value); }
    private interface CheckChange { void set(boolean value); }

    void pick(String title, String[] labels, PageChoice choice) {
        Screen screen = new Screen();
        if (!screen.visible() || a.busy) return;
        showDialog(new AlertDialog.Builder(a).setTitle(title).setItems(labels, (dialog, which) -> {
            if (screen.visible()) choice.select(which);
        }).create());
    }

    void pagination(int page, JSONObject result, PageChoice select) {
        LinearLayout row = a.row(a.content);
        if (page > 1) a.inline(row, "Previous", () -> select.select(page - 1), false);
        if (result.optBoolean("more")) a.inline(row, "Next", () -> select.select(page + 1), false);
    }

    EditText dateField(String label, String value) {
        EditText input = a.field(a.content, label, value, 10, InputType.TYPE_CLASS_DATETIME);
        input.setFocusable(false);
        input.setOnClickListener(view -> {
            Screen screen = new Screen();
            if (!screen.visible() || a.busy) return;
            LocalDate date = HrRules.dateRange(a.value(input), a.value(input)) ? LocalDate.parse(a.value(input)) : HrRules.dubaiDate(Instant.now());
            DatePickerDialog picker = new DatePickerDialog(a, (child, year, month, day) -> {
                if (screen.visible()) input.setText(LocalDate.of(year, month + 1, day).toString());
            }, date.getYear(), date.getMonthValue() - 1, date.getDayOfMonth());
            picker.setButton(DialogInterface.BUTTON_NEUTRAL, "Clear date", (dialog, which) -> {
                if (screen.visible()) input.setText("");
            });
            showDialog(picker);
        });
        return input;
    }

    private EditText timeField(LinearLayout parent, String label, String value) {
        EditText input = a.field(parent, label, value, 5, InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_TIME);
        input.setFocusable(false);
        input.setOnClickListener(view -> {
            Screen screen = new Screen();
            if (!screen.visible() || a.busy) return;
            int selected = Math.max(0, HrRules.minute(a.value(input), false));
            android.app.TimePickerDialog picker = new android.app.TimePickerDialog(a, (child, hour, minute) -> {
                if (screen.visible()) input.setText(String.format(java.util.Locale.ROOT, "%02d:%02d", hour, minute));
            }, selected / 60, selected % 60, true);
            picker.setButton(DialogInterface.BUTTON_NEUTRAL, "Clear time", (dialog, which) -> {
                if (screen.visible()) input.setText("");
            });
            showDialog(picker);
        });
        return input;
    }

    private void checkBox(LinearLayout parent, String label, boolean checked, CheckChange callback) {
        CheckBox view = new CheckBox(a);
        view.setMinHeight(a.dp(48)); view.setMinWidth(a.dp(48));
        view.setText(label);
        view.setChecked(checked);
        view.setOnCheckedChangeListener((button, value) -> callback.set(value));
        a.add(parent, view, 2);
    }

    void bind(EditText field, TextChange changed) {
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence text, int start, int before, int count) { changed.set(text.toString()); }
            @Override public void afterTextChanged(Editable editable) { }
        });
    }

    private static Long id(JSONObject row) { return positive(row, "id"); }
    private static Long versionId(JSONObject row) { return positive(row, "versionId"); }
    private static Long positive(JSONObject row, String key) { return row == null || row.optLong(key) <= 0 ? null : row.optLong(key); }
    static void applyHomeAccess(JSONObject profile,JSONObject home)throws Exception{
        JSONObject capabilities=profile.getJSONObject("capabilities"),hr=home.getJSONObject("capabilities");
        if(home.has("entryAvailable"))capabilities.put("hr",home.getBoolean("entryAvailable"));
        profile.put("hrInboxAvailable",hasInbox(home));
        profile.put("hrDirectoryAvailable",hr.has("directory")?hr.optBoolean("directory"):hr.optBoolean("employees"));
    }
    boolean canOwn(String permission){return personalCapability==null?can(permission):personalCapability.optBoolean(permission);}
    boolean can(String permission) { return capability.optBoolean(permission); }
    private boolean renewalKindAllowed(String kind) {
        return can(kind.equals("medical-insurance") ? "renewalMedical" : "renewalCompliance");
    }
    private boolean renewalSubmitAllowed(String kind) {
        return can("renewalSubmit") && can("renewalCompliance") && renewalKindAllowed(kind);
    }
    private static String range(String first, String last) { return first.isEmpty() || last.isEmpty() ? join(first, last) : first + " to " + last; }
    private static String nullable(String value) { return value.trim().isEmpty() ? null : value.trim(); }
    private static String timePart(String value) { return value.length() >= 16 && value.charAt(10) == 'T' ? value.substring(11, 16) : ""; }
    private static String displayTime(String value, String date) {
        String clock = timePart(value);
        return clock.isEmpty() ? value : value.startsWith(date + "T") ? clock : clock + " next day";
    }
    private static boolean working(String kind) { return !kind.equals("on_leave") && !kind.equals("absent") && !kind.equals("holiday"); }
    private static boolean requiresWorkSite(String kind) {
        return kind.equals("site") || kind.equals("office") || kind.equals("yard") || kind.equals("workshop");
    }
    private static void put(JSONObject object, String key, Object value) {
        try { object.put(key, value); }
        catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
    }
}
