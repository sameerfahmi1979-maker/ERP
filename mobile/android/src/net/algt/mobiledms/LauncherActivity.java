package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.text.InputFilter;
import android.text.InputType;
import android.util.AtomicFile;
import android.view.ActionMode;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.SearchEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;
import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;

public final class LauncherActivity extends Activity {
    private int primary, primarySurface, surface, panel, foreground, muted, border, errorColor;
    private final MobileRoute routes = new MobileRoute();
    final MobileUi ui = new MobileUi(this);
    final MobileCommunications communications = new MobileCommunications(this);
    private static final String UPLOAD_PROGRESS = "Checking for duplicates and uploading";
    private static final int PICK = 10, CAMERA = 11, SAVE = 12;
    private static final int TEXT = InputType.TYPE_CLASS_TEXT;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService offlineRevalidation = Executors.newSingleThreadExecutor();
    private final TrackedInput trackedInput = new TrackedInput(this::admitTrackedInput, this::isCurrentLockedControl);
    volatile ErpApi api;
    LocalDraft draft;
    JSONObject profile;
    LinearLayout root, content;
    private MobileWorkspace workspace;
    DmsWorkspace dms;
    MobileWorkspace mobile(){return workspace;}
    void closeDmsDialog(){dismissTrackedDialog();}
    String dmsName(Uri uri){return fileName(uri);}
    void reviewDms(IntakeReview review){showReview(review);}
    boolean queuePage(MobileRoute.Id id,Runnable back,IntakeReview review){
        page(id,back,false);
        boolean mounted = review.member == null
            ? dms.mountOrdinaryForm(review.ordinary, () -> openReview(review.ordinary))
            : dms.mountReview(review.member);
        if (!mounted) unlockAndOpen();
        return mounted;
    }
    boolean launchDms(Intent intent,int request){if(externalFence!=null)return false;launch(intent,request);return externalFence!=null&&externalRequest==request;}
    private HrWorkspace hr;
    private MobileRoute.SubjectReturn hrUploadReturn;
    private ScrollView scroll;
    private View uploadForm;
    private TextView notice;
    private ProgressBar progress;
    private CaptureOrigin captureOrigin;
    private final MobileRoute.PreviewReturn previewReturn = new MobileRoute.PreviewReturn();
    String query = "", draftName = "";
    boolean busy;
    private volatile long foregroundGeneration;
    private boolean incomingHandled, externalActivity;
    private volatile boolean unlocking;
    private volatile boolean active, hrResumed;
    private int externalRequest;
    private ExternalResultFence externalFence;
    private HrFiles.Issued savingIssued;
    private String unlockAccount = "";
    private long unlockGeneration = -1;
    private Button credentialButton;
    private LinearLayout lockedPttControls;
    private Dialog trackedDialog;
    private File scanInput;
    private String scanReplacement = "";
    private volatile boolean queuedPreflight;
    private static final int SCAN = 13, UNLOCK = 14;
    private long saveId, displayedUploadId;
    private JSONObject displayedUploadStatus;
    private boolean sendAfterScope;
    private TextView uploadStatus;
    private Button startAi, refreshAi, viewUploaded, uploadAnother, reviewUpload;
    private final Handler statusHandler = new Handler(Looper.getMainLooper());
    private final Runnable appLockCheck = () -> updateAppLock(false);
    private final Runnable pollUpload = () -> {
        if (busy) scheduleUploadPoll();
        else refreshUpload(false, true);
    };
    private File preview;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (android.os.Build.VERSION.SDK_INT >= 33) registerNativeBack();
        MobileUi.configureWindow(this);
        workspace = new MobileWorkspace(this);
        dms = new DmsWorkspace(this);
        if (dms.sharing.accept(getIntent()) == null) communications.accept(getIntent());
        hr = new HrWorkspace(this);
        communications.mount(new ChatWorkspace(this), new PttWorkspace(this));
        communications.mountNotifications(new NotificationWorkspace(this));
        if (LocalSecurity.enabled(this)) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        primary = getColor(R.color.erp_primary);
        primarySurface = getColor(R.color.erp_primary_surface);
        surface = getColor(R.color.erp_surface);
        panel = getColor(R.color.erp_panel);
        foreground = getColor(R.color.erp_text);
        muted = getColor(R.color.erp_text_secondary);
        border = getColor(R.color.erp_border);
        errorColor = getColor(R.color.erp_error);
        if (state != null) {
            saveId = state.getLong("saveId");
            externalRequest = state.getInt("externalRequest");
            String externalOwner = state.getString("externalOwner");
            if (externalOwner != null) {
                externalFence = new ExternalResultFence(externalOwner, state.getLong("externalGeneration", -1));
                externalActivity = true;
            }
        }
        if (state != null && state.getString("scanInput") != null) scanInput = new File(state.getString("scanInput"));
        if (state != null) scanReplacement = state.getString("scanReplacement", "");
        run("Opening ALGT ERP System", () -> {
            File[] files = getCacheDir().listFiles((folder, name) -> name.startsWith("dms-preview-") || name.startsWith("dms-save-") || name.startsWith("hr-issue-"));
            if (files != null) for (File file : files) file.delete();
            DmsPrivateFiles.sweep(this,false);
            SharedDocuments.prune(this, false);
            synchronized (UploadJobs.LOCK) {
                if (state == null) ScanEditor.purgeTemps(this);
                OfflineDocuments.purgeTemps(this);
                LocalDraft.purgeTemps(this);
            }
            api = new ErpApi(this);
            if (!api.user().isEmpty()) LocalSecurity.activateAccount(this, api.user());
            if (!api.user().isEmpty()) draft = new LocalDraft(this, api.user());
            return api.signedIn();
        }, signedIn -> {
            if (updateAppLock(false)) return;
            if (!consumePendingExternal()) {
                if (signedIn) unlockAndOpen();
                else signIn();
            }
        });
    }

    @Override public void onSaveInstanceState(Bundle state) {
        state.putLong("saveId", saveId);
        if (externalFence != null) {
            state.putInt("externalRequest", externalRequest);
            state.putString("externalOwner", externalFence.owner);
            state.putLong("externalGeneration", externalFence.generation);
        }
        if (scanInput != null) state.putString("scanInput", scanInput.getAbsolutePath());
        state.putString("scanReplacement", scanReplacement);
        super.onSaveInstanceState(state);
    }

    // API 33+ uses registerNativeBack(); this override is the API 26-32 fallback.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() {
        handleBack();
    }

    @android.annotation.TargetApi(33)
    private void registerNativeBack() {
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }

    private void handleBack() {
        if (busy) return;
        if (routes.current().hasBack()) goBack(routes.current());
        else if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (!moveTaskToBack(false)) finish();
        } else super.onBackPressed();
    }

    @Override protected void onStart() {
        super.onStart();
        active = true;
        if (uploadStatus != null && needsPoll(displayedUploadStatus)) scheduleUploadPoll();
        if (!updateAppLock(false) && !unlocking) {
            if (externalFence == null && pendingExternal == null) hr.resume();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        workspace.startOfflineConnectivityMonitor(offlineRevalidation);
        PlayUpdates.resumeIfNeeded(this);
        hrResumed = true;
        if(!updateAppLock(false)&&!unlocking)dms.foreground();
        if (!updateAppLock(false) && !unlocking && externalFence == null && pendingExternal == null) {
            if (!consumePreviewReturn()) hr.resume();
            if (profile != null) refreshCommunicationsAccess();
            communications.drain();
        }
    }

    private boolean consumePreviewReturn() {
        return previewReturn.consume(routes,routeScope(),hrResumed && hrForeground(),
            api!=null && !accountNeedsUnlock(),busy || unlocking || externalFence!=null || pendingExternal!=null,()->{
                if(api==null || api.user().isEmpty())signIn();else unlockAndOpen();
            });
    }

    @Override protected void onPause() {
        workspace.stopOfflineConnectivityMonitor();
        hrResumed = false;
        foregroundGeneration++;
        hrUploadReturn = null;
        hr.background();
        dms.pause();
        if (communications.chat != null) communications.chat.pause();
        super.onPause();
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        updateAppLock(true);
    }

    private boolean admitTrackedInput() {
        return hrForeground() && !unlocking && !at(LOCKED) && !updateAppLock(true);
    }

    private boolean isCurrentLockedControl(View view) {
        if (!at(LOCKED) || !hrForeground() || unlocking) return false;
        if (view == credentialButton) return !busy;
        if (lockedPttControls == null || !lockedPttControls.isShown()) return false;
        // Feature handlers independently check the same account, device and active PTT lease.
        for (android.view.ViewParent parent = view.getParent(); parent instanceof View; parent = parent.getParent()) {
            if (parent == lockedPttControls) return true;
        }
        return false;
    }

    private boolean updateAppLock(boolean userInteraction) {
        statusHandler.removeCallbacks(appLockCheck);
        if(userInteraction&&onlineForeground()&&!unlocking&&hr!=null)hr.files.interacted();
        if (!hrForeground() || unlocking || api == null || !LocalSecurity.enabled(this)) return false;
        String account = api.user();
        if (account.isEmpty()) {
            if (at(BOOT) || at(SIGN_IN)) return false;
            if (busy) showLocked();
            else signIn();
            return true;
        }
        long remaining = LocalSecurity.remaining(this, account, userInteraction);
        if (remaining == 0) {
            if (at(SIGN_IN)) return false;
            showLocked();
            return true;
        }
        if (remaining > 0) statusHandler.postDelayed(appLockCheck, remaining);
        return false;
    }

    private boolean accountNeedsUnlock() {
        String account = api == null ? "" : api.user();
        return HrRules.lockViewRequired(!account.isEmpty(), LocalSecurity.remaining(this, account, false) != 0);
    }

    @Override protected void onStop() {
        active = false;
        hr.background();
        statusHandler.removeCallbacks(pollUpload);
        statusHandler.removeCallbacks(appLockCheck);
        if (api != null && !api.user().isEmpty() && !unlocking && !externalActivity) {
            if (accountNeedsUnlock()) showLocked();
            if (preview != null) {
                preview.delete(); preview = null;
                if(at(LEGACY_PREVIEW)){content.removeAllViews(); root.setVisibility(View.INVISIBLE); previewReturn.deleted(routes.current());}
            }
            worker.execute(() -> {
                synchronized (UploadJobs.LOCK) {
                    try { OfflineDocuments.purgeTemps(this); LocalDraft.purgeTemps(this); }
                    catch (IOException ignored) { }
                }
            });
        }
        super.onStop();
    }

    @Override protected void onDestroy() {
        statusHandler.removeCallbacks(pollUpload);
        statusHandler.removeCallbacks(appLockCheck);
        dismissTrackedDialog();
        if (pendingExternal != null) pendingExternal.discard(this);
        hr.reset();
        if (preview != null) preview.delete();
        ui.systemBack(false);
        if (communications.chat != null) communications.chat.close();
        communications.close();
        offlineRevalidation.shutdownNow();
        worker.shutdown();
        super.onDestroy();
    }

    int dp(float n) { return Math.round(n * getResources().getDisplayMetrics().density); }

    TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        return view;
    }

    LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    LinearLayout row(LinearLayout parent) {
        LinearLayout layout = new LinearLayout(this);
        parent.addView(layout, new LinearLayout.LayoutParams(-1, -2));
        return layout;
    }

    void add(LinearLayout parent, View view, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(top);
        parent.addView(view, params);
    }

    void title(String value) {
        TextView heading = text(value, 24, foreground, true);
        if (android.os.Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
        add(content, heading, 4);
    }
    void subtitle(String value) { if (!value.isEmpty()) add(content, text(value, 16, muted, false), 8); }
    void section(String label) {
        TextView heading = text(label, 19, foreground, true);
        if (android.os.Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
        add(content, heading, 24);
    }

    Button button(String label, Runnable action, boolean filled) {
        Button view = new Button(this);
        view.setAllCaps(false);
        view.setMinHeight(dp(48));
        view.setMinimumHeight(dp(48)); view.setMinWidth(dp(48));
        view.setSingleLine(false); view.setMaxLines(Integer.MAX_VALUE);
        view.setEllipsize(null);
        view.setText(label);
        view.setTextSize(16);
        view.setTextColor(filled ? panel : primary);
        view.setBackground(ui.surface(filled ? primary : panel, filled ? primary : border, true));
        view.setPadding(dp(12), dp(8), dp(12), dp(8));
        BooleanSupplier hrOwner = hr == null ? null : hr.actionTicket();
        view.setOnClickListener(v -> { if (!busy && (hrOwner == null || hrOwner.getAsBoolean())) action.run(); });
        return view;
    }

    void action(String label, Runnable work, boolean primary) { add(content, button(label, work, primary), 4); }

    void inline(LinearLayout parent, String label, Runnable work, boolean active) {
        boolean stacked = !routes.current().id.viewer() && (getResources().getConfiguration().screenWidthDp < 420
            || getResources().getConfiguration().fontScale > 1.2f);
        if (stacked) parent.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams layout = stacked ? new LinearLayout.LayoutParams(-1, -2)
            : new LinearLayout.LayoutParams(0, -2, 1);
        if (stacked) layout.topMargin = dp(4); else layout.setMarginEnd(dp(4));
        parent.addView(button(label, work, active), layout);
    }

    EditText field(LinearLayout parent, String label, String value, int limit, int inputType) {
        TextView caption = text(label, 14, foreground, true);
        add(parent, caption, 12);
        EditText edit = editText();
        edit.setSingleLine((inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0);
        edit.setInputType(inputType);
        edit.setTextSize(16);
        edit.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)});
        edit.setText(value);
        edit.setId(View.generateViewId()); caption.setLabelFor(edit.getId());
        edit.setMinHeight(dp(48));
        add(parent, edit, 0);
        return edit;
    }

    EditText editText() { return trackedInput.textField(this); }

    String value(EditText view) { return view.getText().toString().trim(); }
    private JSONObject command(String op) { return object("op", op); }

    boolean capability(String name) {
        JSONObject capabilities = profile == null ? null : profile.optJSONObject("capabilities");
        return capabilities != null && capabilities.optBoolean(name);
    }

    MobileRoute.Scope routeScope() {
        return new MobileRoute.Scope(api, api == null ? "" : api.user(),
            api == null ? -1 : api.sessionEpoch(), LocalSecurity.generation(this));
    }

    boolean at(MobileRoute.Id id) { return routes.current().id == id; }
    MobileRoute.Destination destination() { return routes.current().destination; }

    BooleanSupplier communicationsSessionTicket() {
        MobileRoute.Scope owner = routeScope();
        long generation = foregroundGeneration;
        return () -> generation == foregroundGeneration && communicationUiAllowed()
            && owner.matches(routeScope()) && api != null && api.signedIn();
    }

    BooleanSupplier communicationsTicket() {
        MobileRoute.Visit visit = routes.current();
        BooleanSupplier session = communicationsSessionTicket();
        return () -> session.getAsBoolean() && routes.current(visit, routeScope());
    }

    BooleanSupplier communicationsViewTicket() {
        MobileRoute.Visit visit = routes.current();
        return () -> communicationUiAllowed() && routes.current(visit, routeScope());
    }

    private boolean communicationUiAllowed() {
        return hrResumed && active && !unlocking && LocalSecurity.unlocked(this);
    }

    boolean notificationReady() {
        return !busy && !externalActivity && pendingExternal == null && !hasIncomingFiles()
            && profile != null && api != null && api.signedIn() && communicationUiAllowed()
            && !at(BOOT) && !at(CONNECT) && !at(SIGN_IN) && !at(LOCKED) && !at(ACCESS);
    }

    private boolean shellAction(MobileRoute.Visit visit) {
        if (visit != routes.current() || busy || !hrForeground() || unlocking || updateAppLock(false)) return false;
        if (!routeScope().matches(visit.scope)) { unlockAndOpen(); return false; }
        BooleanSupplier hrTicket = hr.actionTicket();
        return (hrTicket == null || hrTicket.getAsBoolean())
            && (dms.current == null || dms.current.visible() && !dms.current.working);
    }

    void gestureBack() {
        if (!busy && !updateAppLock(true)) goBack(routes.current());
    }

    private void goBack(MobileRoute.Visit visit) {
        if (shellAction(visit)) routes.back(visit, routeScope());
    }

    void navigate(MobileRoute.Visit visit, MobileRoute.Destination item) {
        if (shellAction(visit) && workspace.offers(item)) workspace.destination(item);
    }

    void page(MobileRoute.Id id, Runnable onBack, boolean navigation) {
        if(hr!=null)hr.leaving(content);
        if(dms!=null)dms.leaving();
        if (communications.chat != null) communications.chat.leaving();
        if (preview != null && id != LEGACY_PREVIEW) { preview.delete(); preview = null; }
        credentialButton = null;
        lockedPttControls = null;
        previewReturn.clear();
        MobileRoute.Visit visit = routes.enter(id, routeScope(), onBack);
        statusHandler.removeCallbacks(pollUpload);
        if (!LocalSecurity.enabled(this)) statusHandler.removeCallbacks(appLockCheck);
        uploadStatus = null;
        startAi = refreshAi = viewUploaded = uploadAnother = reviewUpload = null;
        root = column();
        root.setBackgroundColor(surface);
        root.setFocusableInTouchMode(true);
        ui.systemBack(visit.hasBack());
        ui.header(visit, () -> goBack(visit));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(4)));
        notice = text("", 14, primary, true);
        notice.setPadding(dp(16), dp(8), dp(16), dp(8));
        notice.setVisibility(View.GONE);
        notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(root, notice, 0);
        content = column();
        scroll = null;
        uploadForm = null;
        if (id.viewer()) {
            content.setPadding(dp(8), dp(4), dp(8), dp(8));
            root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        } else {
            scroll = new ScrollView(this);
            scroll.setFillViewport(true);
            content.setPadding(dp(16), dp(12), dp(16), dp(24));
            scroll.addView(content);
            root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        }
        View footer = navigation && profile != null && visit.destination != null ? ui.footer(visit) : null;
        MobileUi.insets(root, footer);
        setContentView(root);
        trackedInput.watchAccessibility(root);
        root.requestFocus();

    }

    void message(String value, boolean error) {
        notice.setText(value);
        notice.setTextColor(error ? errorColor : primary);
        notice.setVisibility(value.isEmpty() ? View.GONE : View.VISIBLE);
    }

    interface Task<T> { T run() throws Exception; }
    interface Success<T> { void show(T data) throws Exception; }

    <T> void run(String status, Task<T> task, Success<T> next) {
        run(status, task, next, false);
    }

    <T> void run(String status, Task<T> task, Success<T> next, boolean quiet) {
        if(dms!=null && dms.current!=null && (dms.current.online!=null || dms.capture.review()
                || dms.current.intake!=null && (at(REVIEW) || at(MATCHES)))){
            dms.work(status,t->{t.require();return task.run();},next::show,null);return;
        }
        if (busy) return;
        if (root == null) page(BOOT, null, false);
        busy = true;
        if (!quiet) {
            progress.setVisibility(View.VISIBLE);
            message(status, false);
        }
        worker.execute(() -> {
            try {
                T result = task.run();
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) {
                        if (result instanceof File) ((File) result).delete();
                        return;
                    }
                    ready(quiet);
                    if (accountNeedsUnlock()) {
                        if (result instanceof File) ((File) result).delete();
                        if (active) unlockAndOpen();
                        return;
                    }
                    try { next.show(result); } catch (Exception error) { showError(error); }
                    drainSharedFiles();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    ready(quiet);
                    if (accountNeedsUnlock()) {
                        showLocked();
                        return;
                    }
                    if (quiet && api != null && api.signedIn() && uploadStatus != null
                            && (!(error instanceof ErpApi.Rejected) || ((ErpApi.Rejected) error).status >= 500)) {
                        scheduleUploadPoll();
                        drainSharedFiles();
                        return;
                    }
                    if ((at(CAPTURE) || at(HR_CAPTURE)) && draft != null && (UPLOAD_PROGRESS.equals(status) || draft.frozen != null)) capture();
                    showError(error);
                    drainSharedFiles();
                });
            }
        });
    }

    private void ready(boolean quiet) {
        busy = false;
        statusHandler.post(this::consumePreviewReturn);
        statusHandler.post(communications::drain);
        if (!quiet || at(LOCKED)) {
            progress.setVisibility(View.GONE);
            message("", false);
        }
    }

    private void showError(Exception error) {
        if (api != null && !api.signedIn() && !at(SIGN_IN)) signIn();
        String detail = error.getMessage();
        if (error instanceof java.net.SocketTimeoutException || error instanceof java.net.UnknownHostException
                || error instanceof java.net.ConnectException || error instanceof javax.net.ssl.SSLException) {
            detail = "The ERP could not be reached. Check your connection and retry.";
        } else if (!(error instanceof IOException)) {
            detail = "This action could not be completed. Try again.";
        }
        message(detail == null ? "This action could not be completed." : detail, true);
    }

    private void signIn() {
        communications.lock();
        captureOrigin = null;
        workspace.resetFilters();
        if(dms!=null)dms.signedOut();
        dismissTrackedDialog();
        if (hr != null) hr.reset();
        hrUploadReturn = null;
        profile = null;
        draft = null;
        query = draftName = "";
        displayedUploadStatus = null;
        displayedUploadId = 0;
        sendAfterScope = false;
        page(SIGN_IN, null, false);
        title("Sign in");
        subtitle("Use your ERP account to open your workspace.");
        EditText email = field(content, "ERP email", "", 254, TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = field(content, "Password", "", 1024, TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        
        action("Sign in", () -> {
            String account = value(email), secret = password.getText().toString();
            if (account.isEmpty()) { email.setError("Enter your ERP email."); email.requestFocus(); return; }
            if (secret.isEmpty()) { password.setError("Enter your password."); password.requestFocus(); return; }
            password.setText("");
            run("Signing in", () -> {
                api.login(account, secret);
                LocalSecurity.activateAccount(this, api.user());
                OfflineDocuments.onCredentialSignIn(this, api.user());
                draft = new LocalDraft(this, api.user());
                return null;
            }, ignored -> unlockAndOpen());
        }, true);
        if (api != null && !api.user().isEmpty()) action("Open saved offline documents", this::unlockAndOpen, false);
    }

    private void openProfile() {
        communications.invalidateAccess();
        dms.onlinePage(CONNECT,null,this::openProfile,false);
        title("Connect to ERP");
        action("Retry connection", this::openProfile, true);
        if (draft != null) action("Open saved upload", this::capture, false);
        if (api != null && api.signedIn()) {
            action("Open offline documents", () -> workspace.offlineRoot(), false);
            action("Open offline Messages", () -> communications.openOfflineMessages(this::openProfile), false);
        }
        action("Sign out", this::logout, false);
        run("Checking your ERP account", () -> {
            JSONObject result = api.get(command("profile"));
            JSONObject caps = result.optJSONObject("capabilities");
            if (caps != null && (DmsApi.VERSION.equals(str(result,"dmsContractVersion"))||caps.optBoolean("hr"))) {
                try {
                    JSONObject access = api.hrGet(object("op", "home"));
                    HrWorkspace.applyHomeAccess(result,access);
                } catch (ErpApi.Rejected denied) {
                    if (denied.status == 401) throw denied;
                    if(denied.status==403)caps.put("hr",false);
                } catch (IOException unavailable) {
                    // HR entry independently refreshes access and can discover available work later.
                }
            }
            return result;
        }, this::home);
    }

    void reconnect() { openProfile(); }
    void resumeAccount(){if(api==null||!api.signedIn()||api.user().isEmpty())signIn();else unlockAndOpen();}
    void connectionError(Exception error){showError(error);}

    void unlockAndOpen() {
        if (api == null || api.user().isEmpty()) return;
        if (updateAppLock(false)) return;
        if (accountNeedsUnlock()) {
            showLocked();
            return;
        }
        if (busy) return;
        run("Opening your account", () -> {
            synchronized (UploadJobs.LOCK) {
                LocalSecurity.activateAccount(this, api.user());
                if (!api.user().isEmpty()) draft = new LocalDraft(this, api.user());
                queuedPreflight = draft != null && UploadJobs.awaitingPreflight(this, draft);
            }
            return null;
        }, ignored -> {
            if (!consumePendingExternal()) {
                if (api.signedIn()) openProfile();
                else workspace.offlineRoot();
            }
        });
    }

    private void showLocked() {
        statusHandler.removeCallbacks(appLockCheck);
        if (at(LOCKED)) return;
        dms.locked();
        communications.lock();
        hrUploadReturn = null;
        captureOrigin = null;
        workspace.resetFilters();
        dismissTrackedDialog();
        hr.reset();
        profile = null;
        page(LOCKED, null, false);
        title("Unlock your workspace");
        credentialButton = button("Unlock with device credential", this::requestAppUnlock, true);
        add(content, credentialButton, 4);
        lockedPttControls = column();
        add(content, lockedPttControls, 0);
        communications.renderLocked(lockedPttControls);
        if (busy) message("Waiting for the current ERP action to finish.", false);
    }

    private void requestAppUnlock() {
        if (unlocking) return;
        String account = api == null ? "" : api.user();
        if (account.isEmpty() || !LocalSecurity.isAccount(this, account)) { signIn(); return; }
        unlockAccount = account;
        unlockGeneration = LocalSecurity.generation(this);
        try {
            unlocking = true;
            LocalSecurity.unlock(this, UNLOCK);
        } catch (Exception error) {
            unlocking = false;
            unlockAccount = "";
            unlockGeneration = -1;
            LocalSecurity.lock(this);
            message(error.getMessage(), true);
        }
    }

    void openDialler(HrWorkspace.DialSource source) {
        if (source == null || updateAppLock(false) || !source.currentFor(hr)) return;
        try {
            startActivity(new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", source.number(), null)));
        } catch (ActivityNotFoundException error) {
            message("No Android dialler is available.", true);
        }
    }

    AlertDialog.Builder dialogBuilder() {
        return new AlertDialog.Builder(this) {
            @Override public AlertDialog show() {
                AlertDialog dialog = create();
                showTrackedDialog(dialog);
                return dialog;
            }
        };
    }

    void showTrackedDialog(Dialog dialog) {
        if (updateAppLock(false)) return;
        dismissTrackedDialog();
        trackedDialog = dialog;
        dialog.setOnDismissListener(ignored -> { if (trackedDialog == dialog) trackedDialog = null; });
        trackDialogInteraction(dialog);
        dialog.show();
        trackDialogAccessibility(dialog);
    }

    private void dismissTrackedDialog() {
        Dialog dialog = trackedDialog;
        trackedDialog = null;
        if (dialog != null) dialog.dismiss();
    }

    void trackDialogInteraction(Dialog dialog) {
        Window window = dialog.getWindow();
        if (window == null) return;
        if (LocalSecurity.enabled(this)) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        window.setCallback(new DialogInputCallback(window.getCallback()));
    }

    void trackDialogAccessibility(Dialog dialog) {
        Window window = dialog.getWindow();
        if (window != null) trackedInput.watchAccessibility(window.getDecorView());
    }

    /** Dialog windows dispatch input separately from Activity.onUserInteraction. */
    private final class DialogInputCallback implements Window.Callback {
        private final Window.Callback original;

        DialogInputCallback(Window.Callback original) { this.original = original; }

        @Override public boolean dispatchTouchEvent(MotionEvent event) {
            return (event.getActionMasked() == MotionEvent.ACTION_DOWN && updateAppLock(true)) || original.dispatchTouchEvent(event);
        }

        @Override public boolean dispatchKeyEvent(KeyEvent event) {
            return (event.getAction() == KeyEvent.ACTION_DOWN && updateAppLock(true)) || original.dispatchKeyEvent(event);
        }

        @Override public boolean dispatchKeyShortcutEvent(KeyEvent event) {
            return (event.getAction() == KeyEvent.ACTION_DOWN && updateAppLock(true)) || original.dispatchKeyShortcutEvent(event);
        }

        @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
            return (event.getActionMasked() == MotionEvent.ACTION_SCROLL && updateAppLock(true)) || original.dispatchGenericMotionEvent(event);
        }

        @Override public boolean dispatchTrackballEvent(MotionEvent event) {
            return updateAppLock(true) || original.dispatchTrackballEvent(event);
        }

        @Override public boolean dispatchPopulateAccessibilityEvent(AccessibilityEvent event) { return original.dispatchPopulateAccessibilityEvent(event); }
        @Override public View onCreatePanelView(int feature) { return original.onCreatePanelView(feature); }
        @Override public boolean onCreatePanelMenu(int feature, Menu menu) { return original.onCreatePanelMenu(feature, menu); }
        @Override public boolean onPreparePanel(int feature, View view, Menu menu) { return original.onPreparePanel(feature, view, menu); }
        @Override public boolean onMenuOpened(int feature, Menu menu) { return original.onMenuOpened(feature, menu); }
        @Override public boolean onMenuItemSelected(int feature, MenuItem item) { return original.onMenuItemSelected(feature, item); }
        @Override public void onWindowAttributesChanged(WindowManager.LayoutParams attrs) { original.onWindowAttributesChanged(attrs); }
        @Override public void onContentChanged() { original.onContentChanged(); }
        @Override public void onWindowFocusChanged(boolean focused) { original.onWindowFocusChanged(focused); }
        @Override public void onAttachedToWindow() { original.onAttachedToWindow(); }
        @Override public void onDetachedFromWindow() { original.onDetachedFromWindow(); }
        @Override public void onPanelClosed(int feature, Menu menu) { original.onPanelClosed(feature, menu); }
        @Override public boolean onSearchRequested() { return original.onSearchRequested(); }
        @Override public boolean onSearchRequested(SearchEvent event) { return original.onSearchRequested(event); }
        @Override public ActionMode onWindowStartingActionMode(ActionMode.Callback callback) { return original.onWindowStartingActionMode(callback); }
        @Override public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) { return original.onWindowStartingActionMode(callback, type); }
        @Override public void onActionModeStarted(ActionMode mode) { original.onActionModeStarted(mode); }
        @Override public void onActionModeFinished(ActionMode mode) { original.onActionModeFinished(mode); }
        @Override public void onProvideKeyboardShortcuts(java.util.List<android.view.KeyboardShortcutGroup> groups, Menu menu, int deviceId) {
            original.onProvideKeyboardShortcuts(groups, menu, deviceId);
        }
        @Override public void onPointerCaptureChanged(boolean captured) { original.onPointerCaptureChanged(captured); }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        DmsSharing.Incoming received=dms.sharing.accept(intent);
        if(received!=null){
            if(hrActive()){
                if(at(INCOMING_LINK)||at(DOCUMENTS_HOME))workspace.documentsHome();
                message(received.valid()?"ERP link received. Open it from Document tools.":"This ERP link is invalid or unavailable.",!received.valid());
            }
            return;
        }
        if (communications.accept(intent)) {
            communications.drain();
            return;
        }
        incomingHandled = false;
        if (profile != null && !busy) receiveSharedFiles();
    }

    private boolean hasIncomingFiles() {
        Intent intent = getIntent();
        return !incomingHandled && intent != null && (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()));
    }

    private void drainSharedFiles() {
        if (!busy && profile != null && hasIncomingFiles()) receiveSharedFiles();
    }

    private void receiveSharedFiles() {
        Intent intent = getIntent();
        if (incomingHandled || intent == null || profile == null || busy) return;
        if (!LocalSecurity.unlocked(this)) { unlockAndOpen(); return; }
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        if(Intent.ACTION_SEND_MULTIPLE.equals(action)&&dms.available()&&capability("upload")){
            if(dms.capture.incoming!=null)return;
            try{dms.capture.incoming=DmsCapture.uris(intent,true,true);incomingHandled=true;message("Shared originals received. Open Separate document uploads to choose how to file them.",false);}
            catch(Exception error){incomingHandled=true;showError(error);}return;
        }
        incomingHandled = true;
        if (!capability("upload")) { message("Your ERP account needs upload permission to receive documents.", true); return; }
        if (draft == null || !draft.pages.isEmpty() || draft.frozen != null) {
            message("Finish or discard your current draft, then share the new document into ALGT ERP System again.", true); return;
        }
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> supplied = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (supplied != null) uris.addAll(supplied);
        } else {
            Uri supplied = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (supplied != null) uris.add(supplied);
        }
        if (uris.isEmpty() || uris.size() > LocalDraft.MAX_PAGES) { message("Share one PDF or up to ten photos.", true); return; }
        run("Adding shared document", () -> {
            synchronized (UploadJobs.LOCK) {
                for (Uri uri : uris) {
                    if (!"content".equals(uri.getScheme())) throw new IOException("Choose a document from Android Files, Photos or another sharing app.");
                    String mime = getContentResolver().getType(uri);
                    if (mime == null || (!mime.startsWith("image/") && !mime.equals("application/pdf"))) throw new IOException("Share a PDF or an image.");
                    try (InputStream input = getContentResolver().openInputStream(uri)) {
                        if (input == null) throw new IOException("The shared file could not be read.");
                        draft.add(input, fileName(uri), mime);
                    }
                }
            }
            return null;
        }, ignored -> capture());
    }

    private void home(JSONObject result) {
        profile = result;
        ErpApi authenticatedApi = api;
        offlineRevalidation.execute(() -> workspace.onReauthenticated(authenticatedApi));
        scheduleTaskChecks(false);
        if (hasBusinessWorkspace()) {
            workspace.home(!hasIncomingFiles());
            receiveSharedFiles();
        }
        refreshCommunicationsAccess();
    }

    private boolean hasBusinessWorkspace() {
        return capability("upload") || capability("view") || capability("tasks") || capability("hr");
    }

    private void refreshCommunicationsAccess() {
        communications.refreshAccess(() -> {
            if (profile != null && communicationsSessionTicket().getAsBoolean())
                NotificationWorkspace.refreshRegistration(this);
            if (profile == null || hasBusinessWorkspace() || !at(CONNECT)) return;
            if (communications.available()) {
                workspace.home(false);
            } else {
                page(ACCESS, null, false);
                title("ERP access required");
                subtitle("Ask your ERP administrator for mobile workspace access.");
                action("Retry connection", this::openProfile, true);
                action("Sign out", this::logout, false);
            }
        });
    }

    boolean onlineForeground(){return hrResumed&&hrForeground();}
    boolean hrForeground() { return active && !isDestroyed() && !isFinishing(); }

    boolean hrActive() {
        if (!hrResumed || !hrForeground() || api == null || !api.signedIn() || profile == null) return false;
        String account = api.user();
        return !account.isEmpty() && LocalSecurity.remaining(this, account, false) != 0;
    }

    void openHr() {
        if (!hrActive()) { unlockAndOpen(); return; }
        hr.home();
    }

    void openHrParent() { workspace.home(); }

    void employeeDirectory() { if (hrActive() && capability("hr")) hr.openEmployees(); else unlockAndOpen(); }
    void hrInbox() { if (hrActive() && capability("hr")) hr.inbox(); else unlockAndOpen(); }
    boolean hasHrReceipts() { return capability("hr") && HrOperationStore.hasOperations(this, api.user()); }
    void hrReceipts() { if (hrActive() && hasHrReceipts()) hr.pending(); }


    void startHrUpload(JSONObject form, boolean service) {
        long employeeId=form.optLong("employeeId");
        if (!hrActive() || !capability("upload")) {
            message("Document upload is unavailable with your current ERP access.", true);
            return;
        }
        final HrWorkspace.Screen owner=hr.new Screen();
        final LocalDraft destination=draft;
        hr.load("Preparing evidence upload", () -> {
            owner.requireMounted();
            JSONObject subject=owner.api.hrGet(object("op","home"));
            if(!HrV5Rules.selfAction(employeeId,subject.optLong("employeeId"),subject.optBoolean("own")))
                throw new ErpApi.Rejected("The selected employee is no longer linked to this account.",403,null);
            synchronized(UploadJobs.LOCK){
                owner.requireMounted();
                if(destination==null || draft!=destination)throw new ErpApi.Rejected("Upload account changed.",403,null);
                destination.reload();
                long before=destination.lastUpload==null?0:destination.lastUpload.optLong("id");
                owner.requireMounted();
                return HrCaptureTarget.admit(owner.epoch,service,form,destination.evidence,
                    destination.frozen!=null || !destination.pages.isEmpty(),before,owner.store().evidenceSlot(owner.epoch,service),target->{
                        owner.requireMounted();
                        destination.beginEvidence(target,object("entityType","employee","id",employeeId,
                            "label",first(str(subject,"name"),"Employee #"+employeeId)));
                    });
            }
        }, binding -> {
            if(!owner.visible())return;
            captureOrigin = null;
            hrUploadReturn = new MobileRoute.SubjectReturn(routeScope(), employeeId, ()->restoreHrEvidence(binding));
            capture();
        });
    }

    boolean returnActiveEvidence(boolean service) {
        if(draft==null || draft.evidence==null || draft.evidence.service!=service || !hasCurrentEvidence())return false;
        returnToHr();
        return true;
    }

    private void restoreHrEvidence(HrCaptureTarget binding) {
        if(binding.service)hr.services.returnUpload(binding);
        else hr.returnFromDocumentUpload(binding);
    }

    private void returnToHr() {
        if (!hrActive()) { unlockAndOpen(); return; }
        HrCaptureTarget binding = draft == null ? null : draft.evidence;
        if (!hasCurrentEvidence()) { message("Open the current HR request to continue.",true); return; }
        MobileRoute.SubjectReturn resume=hrUploadReturn;
        Runnable recheck=()->restoreHrEvidence(binding);
        leaveEvidence(binding,true,()->{
            JSONObject employee=profile==null?null:profile.optJSONObject("employee");
            if(resume==null)recheck.run();
            else resume.resume(routeScope(),employee==null?0:employee.optLong("id"),recheck);
        });
    }

    private void leaveEvidence(HrCaptureTarget binding,boolean returningToRequest,Runnable next) {
        LocalDraft original=draft;
        MobileRoute.Scope owner=routeScope();
        run("Closing this evidence upload",()->{
            synchronized(UploadJobs.LOCK){
                if(original==null || original!=draft || !owner.matches(routeScope()))
                    throw new IOException("The evidence account changed.");
                synchronized(LocalSecurity.STORAGE_LOCK){
                    original.reload();
                    if(returningToRequest){
                        if(!hrActive() || !owner.matches(routeScope()))throw new IOException("Reopen the signed-in HR request.");
                        HrCaptureTarget.restore(new HrOperationStore(this,api.user()).evidenceSlot(binding.epoch,binding.service),
                            api.sessionEpoch(),binding.service,binding);
                    }
                    original.leaveEvidence(binding);
                }
            }
            return true;
        },done->{hrUploadReturn=null;if(owner.matches(routeScope()))next.run();});
    }

    void ordinaryCapture(Runnable next) {
        HrCaptureTarget binding=draft==null?null:draft.evidence;
        if(binding==null){next.run();return;}
        dialogBuilder().setTitle("Leave HR evidence upload?")
            .setMessage("This draft is linked to an HR request. Leave the handoff to use ordinary document filing. Your HR request stays available in HR.")
            .setNegativeButton("Cancel",null)
            .setNeutralButton("Continue HR upload",(d,w)->openUpload())
            .setPositiveButton("Leave HR upload",(d,w)->leaveEvidence(binding,false,next)).show();
    }

    void logout() {
        dialogBuilder().setTitle("Sign out of ALGT ERP?")
            .setMessage("Unsent document pages, HR drafts and timed offline copies will be removed. "
                + "Permanent offline copies stay encrypted and locked until the same account signs in "
                + "and ERP checks its current permissions. Unsent Messages stay as drafts for manual sending.")
            .setNegativeButton("Keep working", null).setPositiveButton("Sign out", (d,w) -> finishLogout()).show();
    }

    private void finishLogout() {
        NotificationWorkspace.clearDevice(this);
        communications.clearForSignOut();
        if (communications.ptt != null) communications.ptt.stopForSignOut(api.user());
        dms.clear();
        run("Signing out", () -> {
            String user = api.user();
            LogoutOutcome outcome = new LogoutOutcome();
            try { if (communications.chat != null) communications.chat.beforeSignOut(user); }
            catch (IOException cleanup) { outcome.localCleanupComplete = false; }
            try { OfflineDocuments.onExplicitSignOut(this, user); }
            catch (IOException cleanup) { outcome.localCleanupComplete = false; }
            synchronized (UploadJobs.LOCK) {
                UploadJobs.cancel(this);
                try { api.logout(); }
                catch (Exception unconfirmed) { outcome.revocationConfirmed = false; }
                finally {
                    SharedDocuments.prune(this, true);
                    ScanEditor.purgeTemps(this, true);
                    CameraFiles.file(this).delete();
                    try { hr.clearAccount(user); }
                    catch (IOException cleanup) { outcome.localCleanupComplete = false; }
                    try { LocalSecurity.clearAccount(this, user); }
                    catch (IOException cleanup) { outcome.localCleanupComplete = false; }
                }
            }
            return outcome;
        }, outcome -> {
            signIn();
            String warning = join(
                outcome.revocationConfirmed ? "" : "The ERP could not confirm session revocation.",
                outcome.localCleanupComplete ? "" : "This phone could not finish clearing all local session data.");
            if (!warning.isEmpty()) message(warning, true);
        });
    }

    private static final class LogoutOutcome {
        boolean revocationConfirmed = true;
        boolean localCleanupComplete = true;
    }

    void scheduleTaskChecks(boolean report) {
        worker.execute(() -> {
            boolean scheduled = UploadJobs.scheduleNotifications(this);
            if (report) runOnUiThread(() -> {
                if (!isDestroyed() && !isFinishing()) message(scheduled
                    ? "Task checks enabled. Delivery follows Android background scheduling."
                    : "Android task checks could not be scheduled. Check notification permission and sign in again.", !scheduled);
            });
        });
    }

    LinearLayout card(String heading, String detail, Runnable open) {
        LinearLayout card = column();
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(panel);
        shape.setCornerRadius(dp(8));
        shape.setStroke(dp(1), border);
        card.setBackground(shape);
        add(card, text(heading, 16, foreground, true), 0);
        if (!detail.isEmpty()) add(card, text(detail, 14, muted, false), 3);
        if (open != null) {
            BooleanSupplier ticket = hr == null ? null : hr.actionTicket();
            MobileRoute.Visit visit = routes.current();
            card.setMinimumHeight(dp(56)); card.setFocusable(true);
            card.setBackground(ui.surface(panel, border, true));
            card.setOnClickListener(v -> {
                if (!busy && visit == routes.current() && routeScope().matches(visit.scope)
                        && (ticket == null || ticket.getAsBoolean())) open.run();
            });
            TextView label = (TextView) card.getChildAt(0);
            label.setCompoundDrawablesRelativeWithIntrinsicBounds(0, 0, R.drawable.nav_forward, 0);
            label.setCompoundDrawablePadding(dp(8));
        }
        add(content, card, 8);
        return card;
    }

    private void documents(int number) {
        workspace.documents(number);
    }

    void document(long id, Runnable parent) {
        if(dms.enabled("details")){dms.docs.detail(id,null,parent);return;}legacyDocument(id,parent);
    }
    void legacyDocument(long id, Runnable parent) {
        dms.onlinePage(DOCUMENT,parent,()->legacyDocument(id,parent));
        
        DmsWorkspace.Ticket visit=dms.current;
        run("Loading document", () -> {
            JSONObject doc=visit.api.get(object("op","document","id",id));
            if(dms.enabled("requests")){
                visit.require();
                JSONObject selected=DmsApi.fetch(visit.api,DmsApi.cmd("documentDetails","documentId",id),visit::visible);
                doc.put("renewalSource",selected);
            }
            return doc;
        }, doc -> {
            title(first(str(doc, "title"), str(doc, "number")));
            LinearLayout details = card("Document details", "", null);
            detail(details, "Document number", str(doc, "number"));
            detail(details, "Type", str(doc, "type"));
            detail(details, "Status", status(str(doc, "status")));
            detail(details, "Issue date", str(doc, "issue"));
            detail(details, "Expiry date", str(doc, "expiry"));
            detail(details, "Description", str(doc, "description"));
            workspace.documentActions(doc, details, parent);
            JSONArray versions = doc.getJSONArray("versions"), files = doc.getJSONArray("files");
            if (files.length() == 0) { subtitle("No originals are available for this document."); return; }
            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                String name = first(str(file, "file_name"), "Document");
                String mime = first(str(file, "mime_type"), "application/octet-stream");
                long fileId = file.getLong("id");
                String version = "";
                for (int j = 0; j < versions.length(); j++) {
                    JSONObject item = versions.getJSONObject(j);
                    if (item.optLong("id") != file.optLong("version_id")) continue;
                    version = join("Version " + item.optInt("version_number"), item.optBoolean("is_current") ? "Current" : "");
                    break;
                }
                LinearLayout original = card(name, version, null);
                LinearLayout buttons = row(original);
                if (capability("preview") && canRender(mime)) {
                    inline(buttons, "Preview", () -> previewFile(name, mime, () -> document(id, parent),
                        target -> api.preview(fileId, target)), true);
                } else if (capability("preview")) {
                    add(original, text("In-app preview supports PDF and image files.", 13, muted, false), 4);
                }
                if (capability("download")) {
                    inline(buttons, "Download", () -> saveFile(fileId, name, mime), false);
                    inline(buttons, "Share", () -> shareFile(fileId, name, mime), false);
                    if (capability("offline") && canRender(mime)) {
                        MobileRoute.Visit offlineVisit = routes.current();
                        String label = "Save offline: " + name;
                        original.addView(ui.icon(R.drawable.action_offline, label, () -> {
                            if (shellAction(offlineVisit)) workspace.saveOffline(doc, file);
                        }), new LinearLayout.LayoutParams(dp(48), dp(48)));
                    }
                }
                if (!capability("download") && !capability("preview")) {
                    add(original, text("Your ERP account has access to the document details.", 13, muted, false), 4);
                }
            }
        });
    }

    void detail(LinearLayout panel, String label, String value) {
        if (value.isEmpty()) return;
        add(panel, text(label, 13, muted, true), 9);
        add(panel, text(value, 16, foreground, false), 2);
    }

    private static boolean canRender(String mime) { return "application/pdf".equals(mime) || mime.startsWith("image/"); }

    private void shareFile(long id, String name, String mime) {
        run("Preparing attachment", () -> {
            File file = SharedDocuments.prepare(this, name);
            try { api.original(id, file); return file; }
            catch (Exception error) { SharedDocuments.remove(file); throw error; }
        }, file -> {
            Uri uri = SharedDocuments.uri(file);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(mime);
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.setClipData(ClipData.newUri(getContentResolver(), name, uri));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try { startActivity(Intent.createChooser(share, "Share document")); }
            catch (android.content.ActivityNotFoundException error) {
                SharedDocuments.remove(file);
                message("No app is available to share this file.", true);
            }
        });
    }

    void hrFileTask(Runnable work){worker.execute(work);}

    void shareHrIssued(DmsPrivateFiles.Entry file) {
        if(!file.valid()||file.admission==null){file.remove();return;}
        file.published=true;
        Uri uri=file.uri();
        Intent intent=new Intent(Intent.ACTION_SEND).setType("application/pdf");
        intent.putExtra(Intent.EXTRA_STREAM,uri);
        intent.setClipData(ClipData.newRawUri("Issued PDF",uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(Intent.createChooser(intent,"Share issued PDF")); }
        catch(ActivityNotFoundException ex){ file.remove();message("No app is available to share the PDF.",true); }
    }

    void saveHrIssued(HrFiles.Issued issued,String name) {
        if(externalFence!=null || !hrActive() || api.hrSessionEpoch()!=issued.epoch || !api.user().equals(issued.owner))return;
        savingIssued=hr.files.admitExport(issued);
        saveFile(0,name,"application/pdf");
    }

    private void saveFile(long id, String name, String mime) {
        if(id>0)savingIssued=null;
        saveId = id;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(first(mime, "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, SharedDocuments.fileName(name));
        launch(intent, SAVE);
    }


    boolean hasCurrentEvidence() {
        HrCaptureTarget binding=draft==null?null:draft.evidence;
        if(binding==null || !hrActive() || binding.epoch!=api.sessionEpoch())return false;
        try{
            JSONObject form=new HrOperationStore(this,api.user()).evidenceSlot(binding.epoch,binding.service).read();
            return binding.matches(api.sessionEpoch(),binding.service,form);
        }catch(Exception unavailable){return false;}
    }

    CaptureOrigin captureOrigin() {
        return captureOrigin==null ? CaptureOrigin.documents(routeScope()) : captureOrigin;
    }

    void returnToCaptureOrigin(CaptureOrigin origin) {
        origin.returnTo(routeScope(), workspace::documentsHome, dms.capture::queue, workspace::reopenTask);
    }

    void openCaptureFrom(CaptureOrigin origin) {
        ordinaryCapture(()->{captureOrigin=origin;hrUploadReturn=null;openUpload();});
    }

    void openUpload() {
        if(dms.capture.review()){dms.capture.member(dms.capture.mountedReview.member);return;}
        if (draft == null) { openProfile(); return; }
        run("Opening saved upload", () -> {
            synchronized (UploadJobs.LOCK) {
                draft.reload(); queuedPreflight = UploadJobs.awaitingPreflight(this, draft);
            }
            return null;
        }, ignored -> {
            capture();
            if (draft.lastUpload != null) refreshUpload(draft.lastUpload.optBoolean("startPending"));
        });
    }

    void capture() {
        if (draft == null) { openProfile(); return; }
        boolean evidence = hasCurrentEvidence();
        CaptureOrigin origin=captureOrigin();
        Runnable parent = profile == null ? this::openProfile : evidence ? this::returnToHr : ()->returnToCaptureOrigin(origin);
        page(evidence ? HR_CAPTURE : CAPTURE, parent, true);
        title("Upload a document");
        if (draft.evidence != null) {
            if (evidence) action("Return to HR request", this::returnToHr, false);
            else subtitle("The original HR evidence handoff needs current HR access.");
            action("Leave HR evidence upload", ()->ordinaryCapture(this::capture),false);
            if (!evidence) return;
        }
        if (draft.evidence==null && capability("records") && draft.frozen == null) {
            action("Choose employee or site", () -> workspace.chooseRecord(), false);
        }
        if (draft.evidence==null && capability("personal") && draft.frozen == null && draft.record == null) {
            action("File under my employee record", () -> workspace.selectMyRecord(), false);
        }
        if (profile != null && draft.lastUpload != null && (draft.evidence==null || draft.lastUpload.optLong("id")!=draft.evidence.previousUpload)) showUploadCard();
        boolean frozen = draft.frozen != null;
        boolean queued = frozen && queuedPreflight;
        uploadForm = text(queued ? "Queued on this phone. Upload and duplicate checks will continue when connected."
            : frozen ? "Resume the saved upload to finish the same transfer." : "Add one PDF or up to ten photos. Photos are combined in page order.", 15, muted, false);
        add(content, uploadForm, 10);
        if (queued) action("Cancel queued upload", () -> dialogBuilder().setTitle("Cancel this queued upload?")
            .setMessage("The unsent pages will be removed. You can then choose a different file or filing location.")
            .setNegativeButton("Keep queued", null).setPositiveButton("Cancel upload", (d,w) -> run("Cancelling queued upload", () -> {
                UploadJobs.discardQueued(this, draft); draftName = ""; return null;
            }, ignored -> capture())).show(), false);
        for (int i = 0; i < draft.pages.size(); i++) {
            int index = i;
            JSONObject item = draft.pages.get(i);
            card("Page " + (i + 1), str(item, "name"), () -> previewFile(str(item, "name"), str(item, "mime"), this::capture, target -> {
                try (InputStream input = new FileInputStream(draft.source(item)); OutputStream output = new FileOutputStream(target)) {
                    ErpApi.copy(input, output, ErpApi.MAX_FILE);
                }
            }));
            if (!frozen) {
                LinearLayout edit = row(content);
                if (!"application/pdf".equals(str(item, "mime"))) inline(edit, "Edit scan", () -> editPhoto(item), false);
                if (i > 0) inline(edit, "Move up", () -> updateDraft(() -> draft.move(index, index - 1)), false);
                if (i + 1 < draft.pages.size()) inline(edit, "Move down", () -> updateDraft(() -> draft.move(index, index + 1)), false);
                inline(edit, "Remove", () -> updateDraft(() -> draft.remove(index)), false);
            }
        }
        if (!frozen && !draft.isPdf() && draft.pages.size() < LocalDraft.MAX_PAGES) {
            LinearLayout add = row(content);
            inline(add, "Take photo", this::camera, false);
            inline(add, "Choose file", this::picker, false);
        }
        JSONObject record = draft.record, scope = draft.scope;
        if (record != null || scope != null) {
            subtitle("Filing location · " + first(str(record, "label"), str(scope, "label")));
            if (draft.evidence==null && !frozen && profile != null) action("Change company or branch", () -> scopes("", null), false);
        }
        if (!draft.pages.isEmpty()) {
            String suggested = draft.isPdf() ? str(draft.pages.get(0), "name") : "Scan-" + java.time.LocalDate.now() + ".pdf";
            EditText name = frozen ? null : field(content, "File name", first(draftName, suggested), 200, TEXT);
            if (name != null) name.setOnFocusChangeListener((v, focus) -> { if (!focus) draftName = value(name); });
            if (frozen) subtitle(str(draft.frozen.optJSONObject("metadata"), "original_filename"));
            if (profile != null) action(frozen ? "Resume upload" : "Upload document", () -> beginUpload(frozen ? "" : value(name)), true);
            if (!frozen) action("Discard local draft", () -> dialogBuilder().setTitle("Discard local draft?")
                .setMessage("The pages saved on this phone will be removed.").setNegativeButton("Cancel", null)
                .setPositiveButton("Discard", (dialog, which) -> updateDraft(() -> { draft.clear(); draftName = ""; })).show(), false);
        }
        if (profile == null) action("Reconnect to ERP", this::openProfile, true);
    }

    private void showUploadCard() {
        LinearLayout receipt = card("Last upload", str(draft.lastUpload, "name"), null);
        uploadStatus = text("Uploaded to ERP", 15, primary, true);
        uploadStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(receipt, uploadStatus, 8);
        reviewUpload = button("Review and save", this::openReview, true);
        viewUploaded = button("View uploaded file", this::viewUpload, false);
        uploadAnother = button("Upload another", this::chooseUploadSource, false);
        refreshAi = button("Refresh AI status", () -> refreshUpload(draft.lastUpload.optBoolean("startPending")), false);
        startAi = button("Start AI", () -> refreshUpload(true), true);
        for (Button button : new Button[]{reviewUpload, viewUploaded, uploadAnother, refreshAi, startAi}) add(receipt, button, 3);
        reviewUpload.setVisibility(View.GONE);
        viewUploaded.setVisibility(View.GONE);
        uploadAnother.setVisibility(View.GONE);
        startAi.setVisibility(View.GONE);
        if (displayedUploadId == draft.lastUpload.optLong("id") && displayedUploadStatus != null) showUploadStatus(displayedUploadStatus);
    }

    private void chooseUploadSource() {
        if (!draft.pages.isEmpty()) {
            if (scroll != null && uploadForm != null) scroll.smoothScrollTo(0, uploadForm.getTop());
            message("Finish or discard the current draft to start another document.", false);
            return;
        }
        dialogBuilder().setTitle("Upload another document")
            .setItems(new String[]{"Take photo", "Choose file"}, (dialog, choice) -> {
                if (choice == 0) camera(); else picker();
            }).setNegativeButton("Cancel", null).show();
    }

    private void viewUpload() {
        JSONObject upload = displayedUploadStatus;
        if (upload == null || displayedUploadId != draft.lastUpload.optLong("id")) return;
        long documentId = upload.optLong("documentId");
        if (documentId > 0) {
            openReview(dms.intakeSource(upload.optLong("id"),str(upload,"code")));
            return;
        }
        String name = first(str(upload, "name"), str(draft.lastUpload, "name"));
        previewFile(name, str(upload, "mime"), this::openUpload, target -> api.previewUpload(upload.getLong("id"), target));
    }

    private interface Change { void apply() throws Exception; }

    private void editPhoto(JSONObject page) {
        run("Opening scan editor", () -> {
            synchronized (UploadJobs.LOCK) {
                draft.reload();
                File original = draft.source(page);
                File temp = File.createTempFile("scan-source-", ".img", getCacheDir());
                try (InputStream input = new FileInputStream(original); OutputStream output = new FileOutputStream(temp)) {
                    ErpApi.copy(input, output, ErpApi.MAX_FILE);
                } catch (Exception error) { temp.delete(); throw error; }
                return temp;
            }
        }, temp -> {
            scanReplacement = str(page, "id"); scanInput = temp;
            launch(ScanEditor.intent(this, temp), SCAN);
        });
    }
    private void updateDraft(Change change) {
        run("Saving draft", () -> {
            synchronized (UploadJobs.LOCK) { draft.reload(); change.apply(); }
            return null;
        }, ignored -> capture());
    }

    private void scopes(String search, JSONObject after) {
        run("Loading permitted companies", () -> api.get(object("op", "scopes", "search", search, "after", after)), result -> showScopes(search, result));
    }

    private void showScopes(String search, JSONObject result) throws org.json.JSONException {
        Runnable cancel = () -> { sendAfterScope = false; capture(); };
        page(DMS_PAGE, cancel, false);
        title("Owning company or branch");
        EditText field = field(content, "Search company or branch", search, 100, TEXT);
        action("Search", () -> scopes(value(field), null), true);
        action("Back to upload", cancel, false);
        JSONArray rows = result.getJSONArray("rows");
        if (rows.length() == 0) subtitle("No permitted companies or branches match.");
        for (int i = 0; i < rows.length(); i++) {
            JSONObject item = rows.getJSONObject(i);
            card(str(item, "label"), "", () -> run("Saving filing location", () -> {
                draft.destination(item, null);
                return null;
            }, ignored -> {
                capture();
                if (sendAfterScope) { sendAfterScope = false; sendDraft(draftName); }
            }));
        }
        if (result.optBoolean("more") && rows.length() > 0) {
            JSONObject last = rows.getJSONObject(rows.length() - 1);
            action("More companies", () -> scopes(search, object("companyId", last.optLong("companyId"), "branchId", last.optLong("branchId"))), false);
        }
    }

    private void beginUpload(String name) {
        if (!LocalDraft.needsFilingLocation(draft.frozen,draft.scope,draft.record)) {
            sendDraft(name);
            return;
        }
        draftName = name;
        run("Checking filing location", () -> api.get(object("op", "scopes", "search", "", "after", null)), result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length() == 0) {
                message("Your account has no permitted upload company or branch.", true);
                return;
            }
            if (rows.length() > 1 || result.optBoolean("more")) {
                sendAfterScope = true;
                showScopes("", result);
                return;
            }
            run("Saving filing location", () -> {
                draft.destination(rows.getJSONObject(0), null);
                return null;
            }, ignored -> sendDraft(name));
        });
    }

    private void sendDraft(String name) {
        draftName = name;
        run(UPLOAD_PROGRESS, () -> {
            try { return UploadJobs.transfer(this, api, draft, name); }
            finally { queuedPreflight = UploadJobs.awaitingPreflight(this, draft); }
        }, match -> {
            if (match != null) {
                capture();
                showDuplicate(match);
                return;
            }
            draftName = "";
            capture();
            refreshUpload(true);
        });
    }

    private void showDuplicate(JSONObject match) { showDuplicate(match,this::capture); }
    private void showDuplicate(JSONObject match,Runnable parent) {
        boolean pending = "retained_upload".equals(str(match, "status"));
        long documentId = match.optLong("documentId");
        String number = str(match, "documentNo");
        String text = pending ? "This file already has an upload in the ERP. Continue with that upload."
            : number.isEmpty() ? "An identical file already exists in DMS." : "An identical file is already saved as " + number + ".";
        AlertDialog.Builder dialog = dialogBuilder().setTitle("File already exists").setMessage(text)
            .setNegativeButton("Close", null);
        if (pending) {
            dialog.setPositiveButton("Open existing upload", (window, selected) -> openDuplicateUpload(match));
        } else if (documentId > 0 && capability("view")) {
            dialog.setPositiveButton("Open document", (window, selected) -> document(documentId, parent));
        }
        dialog.show();
    }

    private JSONObject checkDuplicate(long size, String sha256) throws Exception {
        return api.duplicate(size, sha256).put("size", size).put("sha256", sha256);
    }

    private void openDuplicateUpload(JSONObject match) {
        run("Opening existing upload", () -> {
            JSONObject upload = api.get(object("op", "intake", "code", match.getString("sessionCode")));
            draft.useExistingUpload(upload, match);
            return upload;
        }, upload -> {
            capture();
            showUploadStatus(upload);
        });
    }

    private JSONObject readUpload() throws Exception {
        JSONObject receipt = draft.lastUpload;
        JSONObject status = api.get(object("op", "intake", "code", receipt.getString("code")));
        if (status.getLong("id") != receipt.getLong("id")) throw new IOException("The ERP returned a different upload.");
        return status;
    }

    private void refreshUpload(boolean start) { refreshUpload(start, false); }

    private void refreshUpload(boolean start, boolean quiet) {
        if (draft.lastUpload == null || uploadStatus == null) return;
        statusHandler.removeCallbacks(pollUpload);
        run(start ? "Checking and starting AI" : "Checking AI status", () -> {
            JSONObject status = readUpload();
            if (!start) return status;
            draft.markAiAttempted();
            if (!status.optBoolean("canStart")) return status;
            try {
                api.call(object("op", "start", "sessionId", status.getLong("id")));
            } catch (IOException error) {
                if (!api.signedIn()) throw error;
                JSONObject current;
                try { current = readUpload(); }
                catch (Exception unavailable) {
                    return object("status", "unconfirmed");
                }
                if ("uploaded".equals(str(current, "status"))) {
                    current.put("startError", error instanceof ErpApi.Rejected ? error.getMessage() : "AI start was not confirmed. Refresh the status.");
                }
                return current;
            }
            return readUpload();
        }, this::showUploadStatus, quiet);
    }

    private void scheduleUploadPoll() {
        statusHandler.removeCallbacks(pollUpload);
        if (active && uploadStatus != null) statusHandler.postDelayed(pollUpload, 8000);
    }

    private static boolean needsPoll(JSONObject result) {
        switch (str(result, "status")) {
            case "uploading": case "ocr_pending": case "ocr_processing": case "ocr_complete":
            case "ai_pending": case "ai_processing": case "queued": case "already_processing": case "unconfirmed":
                return true;
            default:
                return false;
        }
    }

    private void showUploadStatus(JSONObject result) {
        displayedUploadId = draft.lastUpload.optLong("id");
        displayedUploadStatus = result;
        String state = str(result, "status");
        String detail;
        switch (state) {
            case "uploaded":
                if (result.optBoolean("duplicate")) detail = "Possible duplicate. Check the ERP Inbox.";
                else if (result.optBoolean("canStart")) detail = first(str(result, "startError"), "Uploaded. Ready for AI.");
                else detail = "Uploaded. An authorised ERP user can start AI from the Inbox.";
                break;
            case "uploading": detail = "Waiting for file verification."; break;
            case "ocr_pending": case "ocr_processing": case "ocr_complete": case "ai_pending": case "ai_processing": case "queued": case "already_processing":
                detail = "AI processing is in progress."; break;
            case "ai_complete": case "review_pending":
                detail = "AI processing complete. Your document is ready for review."; break;
            case "review_in_progress":
                detail = "AI processing complete. Review is in progress."; break;
            case "approved": detail = "Saved in DMS."; break;
            case "failed": detail = "AI processing failed. Check the ERP Inbox."; break;
            case "unconfirmed": detail = "AI start is unconfirmed. Refresh the status."; break;
            default: detail = first(status(state), "Upload status is unavailable.");
        }
        boolean maySave = result.optBoolean("canReview") && canRender(str(result, "mime"));
        startAi.setVisibility(result.optBoolean("canStart") ? View.VISIBLE : View.GONE);
        boolean complete = "ai_complete".equals(state) || "review_pending".equals(state) || "review_in_progress".equals(state);
        boolean approved = "approved".equals(state) || result.optLong("documentId") > 0;
        boolean canViewFile = approved ? capability("view") : result.optBoolean("canPreview") && canRender(str(result, "mime"));
        reviewUpload.setVisibility(maySave && !approved ? View.VISIBLE : View.GONE);
        viewUploaded.setVisibility(canViewFile && (complete || approved) ? View.VISIBLE : View.GONE);
        if (complete && !approved && !maySave) detail += "\n\nAn authorised ERP reviewer can save this document from the Inbox.";
        if (complete && !approved && !result.optBoolean("canPreview")) detail += "\n\nYour ERP account needs preview permission to view this file.";
        viewUploaded.setText(approved ? "View document" : "View uploaded file");
        uploadAnother.setVisibility(complete || approved ? View.VISIBLE : View.GONE);
        refreshAi.setVisibility(approved ? View.GONE : View.VISIBLE);
        uploadStatus.setText(detail);
        if (needsPoll(result)) scheduleUploadPoll();
    }

    private void openReview() {
        JSONObject original=draft.lastUpload;
        if(original==null||original.optLong("id")<=0){message("The original upload is unavailable.",true);return;}
        openReview(dms.intakeSource(original.optLong("id"),str(original,"code")));
    }
    void openReview(DmsIntakeEntry source){
        dms.intakePage(INTAKE,source,"Review upload",this::openUpload,()->openReview(source),upload->
            dms.work("Checking original approval",t->LocalDraft.read(draft.approval(source.session)),stored->{
                if(stored!=null){pendingSave(source,false);return;}
                if(upload.optLong("documentId")>0){document(upload.optLong("documentId"),this::openUpload);return;}
                if(!upload.optBoolean("canReview")){openUpload();return;}
                dms.work("Loading document types",t->t.api.list(command("types")),types->
                    showReview(new IntakeReview(upload,types,null,source)),null);
            },null));
    }

    Runnable reviewReturn(IntakeReview review) {
        return reviewReturn(new ReviewReturn(review,routeScope(),foregroundGeneration));
    }
    private Runnable reviewReturn(ReviewReturn back) {
        return () -> back.resume(routeScope(),foregroundGeneration,hrActive(),
            this::showReview,dms.capture::member,this::openReview,this::unlockAndOpen);
    }

    private void showReview(IntakeReview review) {
        Runnable exit = MobileRoute.reviewExit(review.member, dms.capture::member, this::openUpload);
        if(!queuePage(REVIEW,exit,review))return;
        title("Review and save");
        String name = str(review.upload, "name");
        subtitle(name);
        JSONObject ai = review.upload.optJSONObject("ai");
        if (ai != null && !str(ai, "confidence").isEmpty()) subtitle("AI confidence · " + str(ai, "confidence"));
        if (ai != null && !str(ai, "reason").isEmpty()) subtitle(str(ai, "reason"));
        String subject = first(str(review.upload, "entityLabel"), str(review.upload, "entityType"));
        if (!subject.isEmpty()) subtitle("Linked record · " + subject);
        LinearLayout form = card("Document details", "", null);
        EditText title = field(form, "Title", review.title, 500, TEXT);
        EditText description = field(form, "Description", review.description, 2000, TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        EditText issue = workspace.dateField(form, "Issue date", review.issue);
        EditText expiry = workspace.dateField(form, "Expiry date", review.expiry);
        EditText fileName = field(form, "Standard file name (optional)", review.standardFileName, 200, TEXT);
        ArrayList<Runnable> captureValues = new ArrayList<>();
        captureValues.add(() -> {
            review.title = value(title);
            review.description = value(description);
            review.issue = value(issue);
            review.expiry = value(expiry);
            review.standardFileName = value(fileName);
        });
        Runnable readFields = () -> captureValues.forEach(Runnable::run);
        JSONObject type = review.type();
        add(form, button(type == null ? "Choose document type" : "Type · " + str(type, "label"), () -> {
            readFields.run();
            chooseReviewType(review);
        }, false), 7);
        if (review.levels != null && review.levels.length() > 0) {
            add(form, button("Confidentiality · " + first(status(review.confidentiality), "Type default"), () -> {
                readFields.run();
                String[] choices = new String[review.levels.length()];
                for (int i = 0; i < choices.length; i++) choices[i] = status(review.levels.optString(i));
                dialogBuilder().setTitle("Confidentiality").setItems(choices, (dialog, index) -> {
                    review.confidentiality = review.levels.optString(index);
                    showReview(review);
                }).setNegativeButton("Cancel", null).show();
            }, false), 3);
        }
        boolean previewable = canRender(str(review.upload, "mime"));
        if (previewable) add(form, button(review.originalViewed ? "View original again" : "View original", () -> {
            readFields.run();
            if(review.member!=null){if(review.member.current(dms.current))dms.capture.previewReview(review);return;}
            previewFile(name, str(review.upload, "mime"), reviewReturn(review),
                target -> api.previewUpload(review.upload.getLong("id"), target), () -> review.originalViewed = true);
        }, false), 6);
        if (type == null || !previewable) {
            return;
        }
        Button retryFields = button("Retry loading ERP fields", () -> { readFields.run(); showReview(review); }, false);
        add(content, retryFields, 4);
        loadReviewFields(review, captureValues, readFields, retryFields);
    }

    private void loadReviewFields(IntakeReview review, ArrayList<Runnable> captureValues, Runnable readFields, Button retryFields) {
        run("Loading ERP fields", () -> api.list(object("op", "fields", "typeId", review.typeId)), definitions -> {
            retryFields.setVisibility(View.GONE);
            if (definitions.length() > 0) {
                LinearLayout metadata = card("Document fields", "", null);
                for (int i = 0; i < definitions.length(); i++) {
                    JSONObject definition = definitions.getJSONObject(i);
                    long fieldId = definition.getLong("id");
                    String kind = definition.getString("type");
                    String label = definition.getString("label");
                    if ("date".equals(kind)) label += " (YYYY-MM-DD)";
                    if ("boolean".equals(kind)) label += " (true or false)";
                    if (definition.optBoolean("required")) label += " *";
                    JSONObject ai = review.upload.optJSONObject("ai");
                    JSONObject confidence = ai == null ? null : ai.optJSONObject("fieldConfidence");
                    Object fieldConfidence = confidence == null ? null : confidence.opt(definition.optString("code"));
                    if (fieldConfidence != null && fieldConfidence != JSONObject.NULL) {
                        String detail = fieldConfidence.toString();
                        if ("low".equalsIgnoreCase(detail) || fieldConfidence instanceof Number && ((Number)fieldConfidence).doubleValue() < 0.8) label += " · Check AI value";
                    }
                    if ("boolean".equals(kind) || "select".equals(kind) || "multi_select".equals(kind)) {
                        EditText editor = workspace.optionField(metadata, label, review.metadataValue(definition), definition);
                        captureValues.add(() -> review.metadata.put(fieldId, value(editor)));
                    } else {
                        int input = "number".equals(kind) ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED
                            : "textarea".equals(kind) ? TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE : TEXT;
                        EditText editor = "date".equals(kind) ? workspace.dateField(metadata, label, review.metadataValue(definition))
                            : field(metadata, label, review.metadataValue(definition), 16384, input);
                        captureValues.add(() -> review.metadata.put(fieldId, value(editor)));
                    }
                }
            }
            action("Save to DMS", () -> {
                readFields.run();
                if (!review.originalViewed) {
                    message("Open the original and check the document fields before saving.", true);
                    return;
                }
                verifyReview(review, definitions);
            }, true);
            if (capability("view")) action("Check possible saved matches", () -> {
                readFields.run(); workspace.similarDocuments(review, reviewReturn(review));
            }, false);
        });
    }

    private void chooseReviewType(IntakeReview review) {
        EditText filter = editText();
        filter.setSingleLine(true);
        filter.setMinHeight(dp(48));
        ListView choices = new ListView(this);
        LinearLayout picker = column();
        picker.setPadding(dp(16), 0, dp(16), 0);
        TextView searchLabel = text("Search document types",14,foreground,true);
        filter.setId(View.generateViewId()); searchLabel.setLabelFor(filter.getId());
        add(picker,searchLabel,8); add(picker, filter, 0);
        picker.addView(choices, new LinearLayout.LayoutParams(-1, dp(280)));
        ArrayList<JSONObject> visible = new ArrayList<>();
        ArrayAdapter<String> labels = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1);
        choices.setAdapter(labels);
        Runnable update = () -> {
            String term = value(filter).toLowerCase(Locale.ROOT);
            visible.clear();
            labels.clear();
            for (int i = 0; i < review.types.length(); i++) {
                JSONObject type = review.types.optJSONObject(i);
                String label = str(type, "label");
                if (type != null && label.toLowerCase(Locale.ROOT).contains(term)) {
                    visible.add(type);
                    labels.add(label);
                }
            }
        };
        filter.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { update.run(); }
            @Override public void afterTextChanged(android.text.Editable s) { }
        });
        update.run();
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Document type").setView(picker)
            .setNegativeButton("Cancel", null).create();
        choices.setOnItemClickListener((list, row, index, id) -> {
            review.selectType(visible.get(index));
            dialog.dismiss();
            showReview(review);
        });
        showTrackedDialog(dialog);
    }

    private void verifyReview(IntakeReview review, JSONArray fields) {
        JSONObject input;
        try { input = review.input(fields); }
        catch (Exception error) { showError(error); return; }
        run("Verifying original with ERP", () -> {
            if(review.member!=null && !review.member.current(dms.current))throw new IOException("The original review expired.");
            JSONObject latest = review.member==null?draft.lastUpload:review.member.receipt;
            String sha256 = str(latest, "sha256");
            if (latest != null && latest.optLong("id") == input.getLong("uploadSessionId") && !sha256.isEmpty()) {
                JSONObject match = api.duplicate(latest.getLong("size"), sha256);
                if ("existing_document".equals(str(match, "status"))) return match;
            }
            return api.get(object("op", "verify", "sessionId", input.getLong("uploadSessionId"),
                "typeId", input.getLong("documentTypeId"), "expiryDate", input.get("expiryDate")));
        }, plan -> {
            if ("existing_document".equals(str(plan,"status"))) {
                ReviewReturn back=new ReviewReturn(review,routeScope(),foregroundGeneration);
                ReviewReturn.verifiedDuplicate(back,plan.optLong("documentId"),(id,original)->{
                    if(id>0)dms.docs.detail(id,null,reviewReturn(original));
                    else message("An identical saved document exists.",true);
                },original->showDuplicate(plan,reviewReturn(original)));
            }
            else if (str(plan, "reason").contains("requires a scoped administrator to verify the file and justify the duplicate exception")) {
                showDuplicate(object("status", "existing_document"));
            } else confirmSave(input,plan,review);
        });
    }

    private void confirmSave(JSONObject input, JSONObject plan,IntakeReview review) throws Exception {
        DmsReviewContext queue=review.member;
        long sessionId = input.getLong("uploadSessionId");
        if (sessionId != plan.getLong("sessionId") || input.getLong("documentTypeId") != plan.getLong("typeId")
                || !sameJson(input.get("expiryDate"), plan.get("expiryDate"))) {
            throw new IOException("The ERP verification no longer matches this document. Check the fields and try again.");
        }
        boolean override = plan.getBoolean("requiresOverride");
        String reason = str(plan, "reason");
        if (override && !plan.optBoolean("canOverride")) {
            message(first(reason, "The ERP requires an administrator to review this document."), true);
            return;
        }
        LinearLayout body = column();
        body.setPadding(dp(20), dp(8), dp(20), dp(8));
        add(body, text("Confirm that you checked the original file and the document fields.", 15, foreground, false), 0);
        if (!reason.isEmpty()) add(body, text(reason, 14, muted, false), 8);
        EditText explanation = override ? field(body, "Override reason", "", 1000, TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE) : null;
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Save to DMS?").setView(body)
            .setNegativeButton("Cancel", null).setPositiveButton("Save", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String explanationText = explanation == null ? "" : value(explanation);
            if (override && explanationText.length() < 20) { explanation.setError("Enter at least 20 characters."); return; }
            try {
                plan.put("confirmed", true);
                plan.put("override", override);
                plan.put("reasonText", override ? explanationText : JSONObject.NULL);
                input.put("allowDuplicate", override);
            } catch (org.json.JSONException error) { showError(error); return; }
            JSONObject request = object("op", "approve", "operationId", UUID.randomUUID().toString(), "input", input, "review", plan);
            if (request.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 262_144) {
                dialog.dismiss();
                message("The review exceeds the ERP request limit. Shorten the document fields before saving.", true);
                return;
            }
            dialog.dismiss();
            if(queue!=null)dms.capture.approve(queue,request);
            else submitSave(review.ordinary,request);
        }));
        showTrackedDialog(dialog);
    }

    private void submitSave(DmsIntakeEntry source,JSONObject newRequest){
        dms.intakePage(APPROVAL_RECEIPT,source,"Save to DMS",this::openUpload,()->pendingSave(source,false),live->
            dms.work("Saving to DMS",t->{
                DmsOrdinaryApproval approval=DmsOrdinaryApproval.open(source,t);
                approval.submit(newRequest,live,t::visible,(original,before)->
                    t.api.ordinaryApproval(original,t::visible,t::requireOriginIdentity,before));
                return true;
            },done->pendingSave(source,false),null));
    }
    private void pendingSave(DmsIntakeEntry source,boolean inspect){
        dms.intakePage(APPROVAL_RECEIPT,source,"Original document approval",this::openUpload,()->pendingSave(source,inspect),live->
            dms.work("Inspecting original approval",t->DmsOrdinaryApproval.open(source,t).resume(live),result->{
                switch(result.phase){
                    case REVIEW:
                        openReview(source);return;
                    case READY:
                        subtitle("The reviewed approval is saved on this phone. Its request has not been sent.");
                        if(live.optBoolean("canReview"))dms.action("Submit reviewed approval",()->submitSave(source,null),true);break;
                    case POSSIBLE:
                        subtitle("The original approval receipt is unconfirmed.");
                        dms.action("Continue original approval",()->submitSave(source,null),true);break;
                    case CONFIRMED:
                        savedDocument(source,result.receipt);return;
                    case SOURCE_CHANGED:
                        subtitle("The original approval was confirmed. The current intake does not identify the filed document.");break;
                    case INSPECT_ONLY:
                        subtitle("This original belongs to an earlier or unverified sign-in. You can inspect the current intake.");break;
                }
                if(inspect)subtitle("ERP intake · "+str(live,"status")+(live.optLong("documentId")>0?" · document #"+live.optLong("documentId"):""));
                dms.action("Inspect intake status",()->pendingSave(source,true),false);
                if(live.optLong("documentId")>0)dms.action("View current document",()->document(live.optLong("documentId"),()->pendingSave(source,true)),false);
                dms.action("Back to upload",this::openUpload,false);
            },null));
    }
    private void savedDocument(DmsIntakeEntry source,JSONObject receipt) {
        boolean ownEvidence=hasCurrentEvidence() && draft.lastUpload!=null
            && draft.lastUpload.optLong("id")!=draft.evidence.previousUpload
            && source.code.equals(str(draft.lastUpload,"code"))
            && (source.session==0 || source.session==draft.lastUpload.optLong("id"));
        if(ownEvidence && !draft.evidence.service)hr.onRenewalDocumentUploaded(receipt);
        title("Saved to DMS");
        subtitle(str(receipt, "documentNo"));
        dms.action("View document", () -> document(receipt.optLong("documentId"),()->pendingSave(source,false)), true);
        dms.action("Upload another", () -> { capture(); chooseUploadSource(); }, false);
        if (ownEvidence) dms.action("Return to HR request", this::returnToHr, false);
    }

    private static boolean sameJson(Object first, Object second) {
        if (first instanceof JSONObject && second instanceof JSONObject) {
            JSONObject a = (JSONObject) first, b = (JSONObject) second;
            if (a.length() != b.length()) return false;
            java.util.Iterator<String> keys = a.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!sameJson(a.opt(key), b.opt(key))) return false;
            }
            return true;
        }
        if (first instanceof Number && second instanceof Number) return first.toString().equals(second.toString());
        return java.util.Objects.equals(first, second);
    }

    private void picker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, draft.pages.isEmpty() ? new String[]{"application/pdf", "image/*"} : new String[]{"image/*"});
        launch(intent, PICK);
    }

    private void camera() {
        CameraFiles.file(this).delete();
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, CameraFiles.URI);
        intent.setClipData(ClipData.newRawUri("Document photo", CameraFiles.URI));
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        launch(intent, CAMERA);
    }

    private void launch(Intent intent, int request) {
        if (externalFence != null) return;
        String owner = api == null ? "" : api.user();
        ExternalResultFence fence = new ExternalResultFence(owner, LocalSecurity.generation(this));
        if (!externalAllowed(fence, api)) {
            takeExternalResult(fence, request, null).discard(this);
            updateAppLock(false);
            return;
        }
        externalFence = fence;
        externalRequest = request;
        try { externalActivity = true; startActivityForResult(intent, request); }
        catch (ActivityNotFoundException error) {
            externalActivity = false;
            externalFence = null;
            externalRequest = 0;
            takeExternalResult(fence, request, null).discard(this);
            message("No Android app is available for this action.", true);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (communications.chat != null && communications.chat.activityResult(request, result, data)) return;
        if (communications.ptt != null && communications.ptt.activityResult(request, result, data)) return;
        statusHandler.post(this::consumePreviewReturn);
        if (request == UNLOCK) {
            unlocking = false;
            String account = unlockAccount;
            long generation = unlockGeneration;
            unlockAccount = "";
            unlockGeneration = -1;
            boolean current = api != null && !account.isEmpty() && account.equals(api.user());
            if (LocalSecurity.confirmed(this, account, generation, current ? result : RESULT_CANCELED)) unlockAndOpen();
            else {
                updateAppLock(false);
                message("Unlock the app to access your account or offline documents.", true);
            }
            return;
        }
        if(DmsCapture.owned(request)){
            if(request!=externalRequest||externalFence==null)return;
            boolean accepted=result==RESULT_OK&&externalAllowed(externalFence,api);
            externalActivity=false;externalFence=null;externalRequest=0;dms.capture.result(request,accepted,data);return;
        }
        if (request != SCAN && request != CAMERA && request != PICK && request != SAVE) return;
        if (externalFence != null && request != externalRequest) return;
        ExternalResult arrived = takeExternalResult(externalFence, request, data);
        externalActivity = false;
        externalFence = null;
        externalRequest = 0;
        if (request == CAMERA) revokeUriPermission(CameraFiles.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (result != RESULT_OK || arrived.fence == null || !LocalSecurity.acceptsExternalResult(this, arrived.fence)) {
            arrived.discard(this);
            updateAppLock(false);
            return;
        }
        if (api == null || (at(BOOT) && busy)) pendingExternal = arrived;
        else consumeExternal(arrived);
    }

    private boolean externalAllowed(ExternalResultFence fence, ErpApi ownerApi) {
        return ownerApi != null && ownerApi == api && fence.owner.equals(ownerApi.user())
            && LocalSecurity.acceptsExternalResult(this, fence);
    }

    private boolean consumePendingExternal() {
        ExternalResult pending = pendingExternal;
        pendingExternal = null;
        return pending != null && consumeExternal(pending);
    }

    private boolean consumeExternal(ExternalResult result) {
        ExternalResultFence fence = result.fence;
        ErpApi ownerApi = api;
        BooleanSupplier allowed = () -> externalAllowed(fence, ownerApi);
        int request = result.request;
        Uri uri = result.uri;
        if (busy || !allowed.getAsBoolean()) {
            result.discard(this);
            updateAppLock(false);
            return false;
        }
        if (request == SCAN && result.scanOutput != null) {
            run("Saving edited scan", () -> {
                try {
                    fence.require(allowed);
                    try (InputStream input = new FileInputStream(result.scanOutput)) {
                        synchronized (UploadJobs.LOCK) {
                            fence.require(allowed);
                            draft.reload();
                            fence.require(allowed);
                            if (result.scanReplacement.isEmpty()) draft.add(input, "Scanned page.jpg", "image/jpeg");
                            else draft.replacePhoto(result.scanReplacement, input);
                        }
                    }
                } finally { result.discard(this); }
                return null;
            }, ignored -> { if (profile == null) openProfile(); else capture(); });
        } else if (request == CAMERA || (request == PICK && uri != null)) {
            String chosenMime = request == CAMERA ? "image/jpeg" : getContentResolver().getType(uri);
            if (chosenMime != null && chosenMime.startsWith("image/")) {
                run("Preparing scan editor", () -> {
                    try {
                        fence.require(allowed);
                        File temp = File.createTempFile("scan-source-", ".img", getCacheDir());
                        try (InputStream input = request == CAMERA ? new FileInputStream(CameraFiles.file(this)) : getContentResolver().openInputStream(uri);
                             OutputStream output = new FileOutputStream(temp)) {
                            if (input == null) throw new IOException("The selected photo could not be read.");
                            fence.require(allowed);
                            ErpApi.copy(input, output, ErpApi.MAX_FILE);
                            fence.require(allowed);
                            return temp;
                        } catch (Exception error) { temp.delete(); throw error; }
                    } finally { result.discard(this); }
                }, temp -> {
                    if (!allowed.getAsBoolean()) { temp.delete(); updateAppLock(false); return; }
                    try {
                        Intent editor = ScanEditor.intent(this, temp);
                        scanInput = temp;
                        launch(editor, SCAN);
                    } catch (Exception error) { temp.delete(); scanInput = null; throw error; }
                });
                return true;
            }
            run("Saving page on this phone", () -> {
                fence.require(allowed);
                if (chosenMime == null || !chosenMime.equals("application/pdf")) throw new IOException("Choose a photo or PDF.");
                String name = fileName(uri);
                fence.require(allowed);
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("The selected file could not be opened.");
                    synchronized (UploadJobs.LOCK) {
                        fence.require(allowed);
                        if (draft == null && ownerApi.signedIn()) draft = new LocalDraft(this, fence.owner);
                        if (draft == null) throw new IOException("Sign in again to open your draft.");
                        fence.require(allowed);
                        draft.add(input, name, chosenMime);
                    }
                }
                return null;
            }, ignored -> capture());
        } else if(request==SAVE && uri!=null && result.issued!=null) {
            HrFiles.Issued issued=result.issued;
            BooleanSupplier canSave=()->hr.files.ownsExport(issued) && HrV5Rules.restore(issued.owner,issued.epoch,ownerApi.user(),ownerApi.hrSessionEpoch(),allowed.getAsBoolean());
            this.<Exception>run("Saving issued PDF",()->{
                try{
                    fence.require(canSave);
                    DmsPrivateFiles.Entry entry=hr.files.prepare(issued,"Issued PDF",canSave);
                    try(FileInputStream in=new FileInputStream(entry.file)){
                        DmsTransfer.deliver(()->canSave.getAsBoolean()&&entry.valid(),entry::verifySource,
                            ()->getContentResolver().openOutputStream(uri,"wt"),in,issued.size);
                    }finally{entry.remove();}
                    return null;
                }catch(Exception failure){return failure;}
            },failure->hr.transferFinished(issued,failure,"Issued PDF saved."));
        } else if (request == SAVE && uri != null && result.fileId > 0) {
            long epoch = ownerApi.hrSessionEpoch();
            BooleanSupplier mayExport = () -> allowed.getAsBoolean() && epoch >= 0 && epoch == ownerApi.hrSessionEpoch();
            run("Saving original file", () -> {
                fence.require(mayExport);
                File temp = File.createTempFile("dms-save-", ".tmp", getCacheDir());
                try {
                    ownerApi.original(result.fileId, temp);
                    try (InputStream input = new FileInputStream(temp)) {
                        fence.writeTo(mayExport, () -> getContentResolver().openOutputStream(uri, "wt"),
                            output -> ErpApi.copy(input, output, ErpApi.MAX_FILE));
                    }
                } finally { temp.delete(); }
                return null;
            }, ignored -> message("Original saved.", false));
        } else {
            result.discard(this);
            return false;
        }
        return true;
    }

    private ExternalResult takeExternalResult(ExternalResultFence fence, int request, Intent data) {
        long fileId = request == SAVE ? saveId : 0;
        if (request == SAVE) saveId = 0;
        File source = null, output = null;
        String replacement = "";
        if (request == SCAN) {
            String path = data == null ? null : data.getStringExtra(ScanEditor.EXTRA_ORIGINAL_PATH);
            if (scanInput != null) path = scanInput.getPath();
            source = scanTemp(path, true);
            output = scanTemp(data == null ? null : data.getStringExtra(ScanEditor.EXTRA_OUTPUT_PATH), false);
            replacement = scanReplacement;
            scanInput = null;
            scanReplacement = "";
        }
        ExternalResult result=new ExternalResult(fence, request, data == null ? null : data.getData(), fileId, source, output, replacement);
        if(request==SAVE){result.issued=savingIssued;savingIssued=null;}
        return result;
    }

    private File scanTemp(String path, boolean source) {
        if (path == null) return null;
        try {
            File file = new File(path).getCanonicalFile();
            File cache = getCacheDir().getCanonicalFile();
            File folder = source ? cache : new File(cache, "scan-edits");
            return folder.equals(file.getParentFile()) && CaptureJobRules.isScanTemp(file.getName(), source) ? file : null;
        } catch (IOException error) { return null; }
    }

    private static final class ExternalResult {
        final ExternalResultFence fence;
        final int request;
        final Uri uri;
        final long fileId;
        final File scanSource, scanOutput;
        final String scanReplacement;
        HrFiles.Issued issued;

        ExternalResult(ExternalResultFence fence, int request, Uri uri, long fileId, File source, File output, String replacement) {
            this.fence = fence; this.request = request; this.uri = uri; this.fileId = fileId;
            scanSource = source; scanOutput = output; scanReplacement = replacement;
        }

        void discard(LauncherActivity activity) {
            if (request == CAMERA) CameraFiles.file(activity).delete();
            if (scanSource != null) scanSource.delete();
            if (scanOutput != null) scanOutput.delete();
        }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (communications.chat != null && communications.chat.permissionResult(request, permissions, grants)) return;
        if (communications.ptt != null && communications.ptt.permissionResult(request, permissions, grants)) return;
        if (request == 15 && grants.length > 0 && grants[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            scheduleTaskChecks(true);
        }
    }

    private ExternalResult pendingExternal;

    private String fileName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return first(cursor.getString(0), "Selected document");
        } catch (RuntimeException ignored) { }
        return "Selected document";
    }

    interface FetchFile { void fetch(File target) throws Exception; }

    void previewFile(String name, String mime, Runnable parent, FetchFile fetch) {
        previewFile(name, mime, parent, fetch, () -> { });
    }

    void previewFile(String name, String mime, Runnable parent, FetchFile fetch, Runnable rendered) {
        run("Opening original", () -> {
            File file = File.createTempFile("dms-preview-", ".tmp", getCacheDir());
            try { fetch.fetch(file); return file; }
            catch (Exception error) { file.delete(); throw error; }
        }, file -> {
            if (preview != null) preview.delete();
            preview = file;
            previewPage(name, mime, 0, parent, rendered);
        });
    }

    private void previewPage(String name, String mime, int index, Runnable parent, Runnable rendered) {
        page(LEGACY_PREVIEW, parent, false);
        subtitle(name);
        File file = preview;
        run("Rendering page", () -> {
            if (!"application/pdf".equals(mime)) return new PreviewPage(LocalDraft.readPhoto(file, 2400), 1);
            try (PdfRenderer renderer = openPdf(file); PdfRenderer.Page pdf = renderer.openPage(index)) {
                float scale = Math.min(1800f / pdf.getWidth(), 2600f / pdf.getHeight());
                int width = Math.max(1, Math.round(scale * pdf.getWidth())), height = Math.max(1, Math.round(scale * pdf.getHeight()));
                Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                bitmap.eraseColor(Color.WHITE);
                pdf.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                return new PreviewPage(bitmap, renderer.getPageCount());
            }
        }, result -> {
            rendered.run();
            DocumentPreview image = new DocumentPreview(this, result.bitmap, "Document preview, page " + (index + 1));
            content.addView(image, new LinearLayout.LayoutParams(-1, 0, 1));
            viewerControls(image, index, result.total, n -> previewPage(name, mime, n, parent, rendered),
                (label, act) -> viewerButton(label, act));
        });
    }

    interface ViewControl { void add(String label, Runnable work); }
    private LinearLayout viewerBar;
    void viewerButton(String label, Runnable work) {
        viewerBar.addView(button(label, work, false));
    }
    void viewerControls(DocumentPreview image, int index, int total,
            java.util.function.IntConsumer select, ViewControl controls) {
        android.widget.HorizontalScrollView scroller = new android.widget.HorizontalScrollView(this);
        viewerBar = new LinearLayout(this);
        viewerBar.setGravity(Gravity.CENTER_VERTICAL);
        scroller.addView(viewerBar);
        content.addView(scroller);
        TextView count = text("Page " + (index + 1) + " of " + total, 14, foreground, true);
        count.setPadding(dp(8), 0, dp(8), 0); viewerBar.addView(count);
        if (index > 0) controls.add("Previous", () -> select.accept(index - 1));
        if (index + 1 < total) controls.add("Next", () -> select.accept(index + 1));
        controls.add("Zoom out", () -> image.zoomBy(.67f));
        controls.add("Fit page", image::reset);
        controls.add("Zoom in", () -> image.zoomBy(1.5f));
        viewerBar = null;
    }

    private static PdfRenderer openPdf(File file) throws IOException {
        ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        try { return new PdfRenderer(descriptor); }
        catch (IOException | RuntimeException error) { descriptor.close(); throw error; }
    }

    private static final class PreviewPage {
        final Bitmap bitmap;
        final int total;
        PreviewPage(Bitmap bitmap, int total) { this.bitmap = bitmap; this.total = total; }
    }


    static String first(String value, String fallback) { return value == null || value.isEmpty() ? fallback : value; }
    static String status(String value) {
        if (value.isEmpty()) return "";
        String plain = value.replace('_', ' ');
        return plain.substring(0, 1).toUpperCase(Locale.ROOT) + plain.substring(1);
    }
    static String dateLine(String label, JSONObject row, String key) {
        String date = str(row, key);
        return date.isEmpty() ? "" : label + " " + date;
    }
    static String join(String... values) {
        ArrayList<String> parts = new ArrayList<>();
        for (String value : values) if (value != null && !value.isEmpty()) parts.add(value);
        return android.text.TextUtils.join(" · ", parts);
    }
}
