package net.algt.mobiledms;

import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;

import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** The native shell's communications entries. Feature operations check their own authority. */
final class MobileCommunications {
    static final String OPEN_NOTIFICATION = "net.algt.mobiledms.OPEN_NOTIFICATION";
    static final String EVENT_ID = "notificationId";
    static final String ACCOUNT_ID = "notificationAccount";

    interface Notifications {
        void home(Runnable back);
        void openEvent(String eventId, Runnable back);
    }

    private final LauncherActivity a;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private MobileRoute.Scope verified;
    private JSONObject features;
    private BooleanSupplier checking;
    private Runnable refreshRows;
    private Runnable refreshHeader;
    private int unread = -1;
    private boolean checked;
    private Notifications notifications;
    private CommunicationBudgetWorkspace budget;
    private String pendingId = "", pendingAccount = "", pendingPttEpoch = "";

    ChatWorkspace chat;
    PttWorkspace ptt;

    MobileCommunications(LauncherActivity activity) { a = activity; }

    void mount(ChatWorkspace chatWorkspace, PttWorkspace pttWorkspace) {
        chat = chatWorkspace;
        ptt = pttWorkspace;
    }

    void mountNotifications(Notifications controller) {
        notifications = controller;
        updateEntries();
        drain();
    }

    void mountBudget(CommunicationBudgetWorkspace controller) { budget = controller; updateEntries(); }

    private boolean servicesAvailable() { return eligible("chat") || eligible("ptt"); }

    boolean available() { return servicesAvailable() || eligible("budget"); }

    private JSONObject feature(String name) {
        return features != null && verified != null && a.routeScope().matches(verified)
            ? features.optJSONObject(name) : null;
    }

    private boolean eligible(String name) {
        JSONObject feature = feature(name);
        return feature != null && ("budget".equals(name) ? Boolean.TRUE.equals(feature.opt("eligible")) : feature.optBoolean("eligible"));
    }

    private boolean held(String name) {
        JSONObject feature = feature(name);
        return feature != null && "held".equals(str(feature, "availability"));
    }

    boolean chatManualRefresh() {
        JSONObject chat = feature("chat");
        return chat == null || !"live".equals(str(chat, "refreshMode"));
    }

    void refreshAccess(Runnable complete) {
        if (checked || checking != null && checking.getAsBoolean()) return;
        ErpApi api = a.api;
        if (api == null || !api.signedIn()) return;
        BooleanSupplier ticket = a.communicationsSessionTicket();
        if (!ticket.getAsBoolean()) return;
        checking = ticket;
        worker.execute(() -> {
            JSONObject claim = null;
            try {
                Object result = api.communicationsCall(object("op", "communications.profile", "args", object()), ticket);
                if (result instanceof JSONObject) {
                    JSONObject profile = (JSONObject) result;
                    if (str(profile, "profileId").matches("[1-9][0-9]{0,18}")) claim = profile;
                }
            } catch (Exception unavailable) {
                // An older or unavailable endpoint leaves the business workspace available independently.
            }
            JSONObject access = claim;
            a.runOnUiThread(() -> {
                if (checking != ticket) return;
                checking = null;
                if (!ticket.getAsBoolean()) return;
                checked = true;
                verified = access == null ? null : a.routeScope();
                features = access;
                updateEntries();
                complete.run();
                drain();
            });
        });
    }

    void bindRows(LinearLayout rows, Button messages, Button walkieTalkie, Button budgetButton) {
        BooleanSupplier current = a.communicationsViewTicket();
        rows.setVisibility(View.GONE);
        refreshRows = () -> {
            if (!current.getAsBoolean()) return;
            rows.setVisibility(available() ? View.VISIBLE : View.GONE);
            messages.setVisibility(eligible("chat") ? View.VISIBLE : View.GONE);
            walkieTalkie.setVisibility(eligible("ptt") ? View.VISIBLE : View.GONE);
            budgetButton.setVisibility(eligible("budget") && budget != null ? View.VISIBLE : View.GONE);
            String label = unread > 0 ? "Messages (" + unread + ")" : "Messages";
            String spoken = unread > 0 ? "Messages, " + unread + " unread" : "Messages";
            messages.setText(held("chat") ? label + " · Service on hold" : label);
            messages.setContentDescription(held("chat") ? spoken + ", service on hold" : spoken);
            walkieTalkie.setText(held("ptt") ? "Walkie-Talkie · Service on hold" : "Walkie-Talkie");
        };
        updateEntries();
    }

    void bindNotificationButton(View button) {
        BooleanSupplier current = a.communicationsViewTicket();
        button.setVisibility(View.GONE);
        refreshHeader = () -> {
            if (current.getAsBoolean())
                button.setVisibility(servicesAvailable() && notifications != null ? View.VISIBLE : View.GONE);
        };
        updateEntries();
    }

    void updateUnread(BooleanSupplier current, int count) {
        if (!current.getAsBoolean() || !eligible("chat")) return;
        unread = Math.max(0, count);
        updateEntries();
    }

    private void updateEntries() {
        if (refreshRows != null) refreshRows.run();
        if (refreshHeader != null) refreshHeader.run();
    }

    void openMessages(Runnable back) {
        if (eligible("chat") && chat != null && a.communicationsSessionTicket().getAsBoolean()) chat.home(back);
    }

    void openOfflineMessages(Runnable back) {
        if (chat != null && a.at(MobileRoute.Id.CONNECT) && a.communicationsSessionTicket().getAsBoolean())
            chat.home(back);
    }

    void openPtt(Runnable back) {
        if (eligible("ptt") && ptt != null && a.communicationsSessionTicket().getAsBoolean()) ptt.home(back);
    }

    Runnable budgetEntry(Runnable back) {
        BooleanSupplier current = a.communicationsTicket();
        return () -> {
            if (current.getAsBoolean() && eligible("budget") && budget != null) budget.home(back);
        };
    }

    void openNotifications(Runnable back) {
        if (servicesAvailable() && notifications != null && a.communicationsSessionTicket().getAsBoolean())
            notifications.home(back);
    }

    void addEmployeeMessage(LinearLayout panel, long employee, Runnable back) {
        if (!eligible("chat") || chat == null || employee <= 0) return;
        BooleanSupplier current = a.communicationsTicket();
        ErpApi api = a.api;
        worker.execute(() -> {
            String user;
            try {
                Object result = api.communicationsCall(object("op", "chat.linkedIdentity",
                    "args", object("employeeId", Long.toString(employee))), current);
                if (!(result instanceof JSONObject)) return;
                user = str((JSONObject) result, "profileId");
                if (!user.matches("[1-9][0-9]{0,18}")) return;
            } catch (Exception unavailable) { return; }
            a.runOnUiThread(() -> {
                if (!current.getAsBoolean() || !eligible("chat") || !panel.isAttachedToWindow()) return;
                a.add(panel, a.button("Message", () -> {
                    if (current.getAsBoolean() && eligible("chat")) chat.openDirect(user, back);
                }, false), 4);
            });
        });
    }

    boolean accept(Intent intent) {
        if (intent == null) return false;
        if (PttResumeReceiver.OPEN.equals(intent.getAction())) {
            discardPending();
            try {
                pendingAccount = canonicalUuid(intent.getStringExtra("pttAccount"));
                pendingPttEpoch = canonicalUuid(intent.getStringExtra("pttEpoch"));
            } catch (RuntimeException malformed) { discardPending(); }
            return true;
        }
        if (!OPEN_NOTIFICATION.equals(intent.getAction())) return false;
        final String event, account;
        discardPending();
        try {
            event = canonicalUuid(intent.getStringExtra(EVENT_ID));
            account = canonicalUuid(intent.getStringExtra(ACCOUNT_ID));
        } catch (RuntimeException malformed) { return true; }
        if (!event.isEmpty() && !account.isEmpty()) {
            pendingId = event;
            pendingAccount = account;
        }
        return true;
    }

    private static String canonicalUuid(String input) {
        if (input == null || input.length() != 36) return "";
        try {
            String value = UUID.fromString(input).toString();
            return value.equals(input) ? value : "";
        } catch (IllegalArgumentException malformed) { return ""; }
    }

    void drain() {
        if (pendingId.isEmpty() && pendingPttEpoch.isEmpty() || a.api == null || !a.notificationReady()) return;
        if (!pendingAccount.equals(a.api.user())) {
            discardPending();
            return;
        }
        if (!pendingPttEpoch.isEmpty()) {
            android.content.SharedPreferences saved = PttService.prefs(a);
            boolean current = PttState.recover(saved.getBoolean("enabled", false),
                pendingAccount.equals(saved.getString("account", "")),
                pendingPttEpoch.equals(saved.getString("epoch", "")),
                saved.getLong("login", -1) != a.api.sessionEpoch(), saved.getString("availability", "offDuty"));
            if (!current) { discardPending(); return; }
            if (!eligible("ptt") || ptt == null) return;
            discardPending();
            PttService.cancelReminder(a);
            openPtt(a.mobile()::home);
            return;
        }
        if (notifications == null) return;
        if (!servicesAvailable()) return;
        String event = pendingId;
        discardPending();
        notifications.openEvent(event, a.mobile()::home);
    }

    private void discardPending() {
        pendingId = "";
        pendingAccount = "";
        pendingPttEpoch = "";
        Intent current = a.getIntent();
        if (current != null && (OPEN_NOTIFICATION.equals(current.getAction()) || PttResumeReceiver.OPEN.equals(current.getAction())))
            a.setIntent(new Intent(a, LauncherActivity.class));
    }

    void lock() {
        invalidateAccess();
        unread = -1;
        refreshRows = null;
        refreshHeader = null;
    }

    void invalidateAccess() {
        verified = null;
        features = null;
        checked = false;
        checking = null;
    }

    void clearForSignOut() { lock(); discardPending(); }

    void renderLocked(LinearLayout parent) {
        if (ptt != null && a.api != null && a.api.signedIn()) ptt.renderActiveControls(parent);
    }

    void close() {
        if (budget != null) budget.close();
        worker.shutdownNow();
        lock();
    }
}
