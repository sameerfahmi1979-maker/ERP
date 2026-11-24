package net.algt.mobiledms;

import java.time.LocalDate;

public final class HrRulesTest {
    private static final String ACCOUNT = "240a7b16-4f1c-4db8-8e69-afe9a4223124";
    private static final String OTHER = "b3d38b9d-6f60-4f16-a17e-9c3b23f26f9d";
    private static final String OPERATION = "8c30736d-2052-428b-a893-d00cb703a43c";

    public static void main(String[] args) {
        callbacksRequireTheSameActiveAccountSessionAndScreen();
        receiptMustMatchTheFrozenOperationAndHaveAResult();
        uncertainOperationsRemainPendingAfterAnApparentRejection();
        decisionRequiresPermissionAnExactVersionAndAReasonWhenNeeded();
        dateUsesDubaiDayAndValidChronology();
        handlesOvernightBreaksAndNonWorkingEntries();
        preventsOutOfOrderIntervalsAndBreaksThatEscapeTheirWorkInterval();
        lockedActivityRedactsEvenDuringAnOperation();
        backgroundResultWaitsForTheSameUnlockedScreen();
        durableConfirmationBlocksReplacementUntilExactAcknowledgement();
        aNewLoginCanCheckTheReceiptButCannotReplayTheAction();
        replacementUploadDropsPreviouslySelectedEvidence();
        staffAccessToAnotherEmployeeDoesNotRevealTheOriginalTarget();
        cachedConfirmationRequiresAFreshMatchingReceipt();
        earlierLoginKeepsTheSameLeaveIntentWithoutBlockingIndependentLeave();
        backgroundHidesAnOpenPrivateViewAndRequiresANewRead();
        aReadCompletingWhileStoppedCannotRevealPrivateContent();
        denialErasesVisibleSourceAndDialogWithoutChangingFrozenOperation();
        contactLimitsMatchTheCanonicalWriter();
        restoredRenewalDraftRequiresCurrentActionAndExactSource();
        aDeniedHrRefreshCannotTakeOverDmsNavigation();
        System.out.println("HR rules passed (21 scenarios)");
    }

    private static void aDeniedHrRefreshCannotTakeOverDmsNavigation() {
        HrRules.ViewRefresh refresh = new HrRules.ViewRefresh();
        Object deniedHrNeutral = new Object(), dmsDocumentForm = new Object();
        refresh.bind(deniedHrNeutral);
        check(refresh.owns(deniedHrNeutral)); // genuine HR neutral background/resume can fetch fresh access
        check(!refresh.owns(dmsDocumentForm)); // user chose DMS after a denial
        check(!refresh.owns(deniedHrNeutral)); // different hierarchy permanently retires that queued refresh
        refresh.bind(deniedHrNeutral);
        check(refresh.owns(deniedHrNeutral));
        refresh.clear();
        check(!refresh.owns(deniedHrNeutral));
    }

    private static void restoredRenewalDraftRequiresCurrentActionAndExactSource() {
        check(HrRules.resumeRenewal(82, true, 82, true, 71, "3", 71, "3"));
        check(!HrRules.resumeRenewal(82, true, 82, false, 71, "3", 71, "3"));
        check(!HrRules.resumeRenewal(82, true, 83, true, 71, "3", 71, "3"));
        check(!HrRules.resumeRenewal(82, true, 82, true, 71, "3", 72, "3"));
        check(!HrRules.resumeRenewal(82, true, 82, true, 71, "3", 71, "4"));
        check(!HrRules.resumeRenewal(82, true, 82, true, 71, "3", 0, ""));
    }

    private static void backgroundHidesAnOpenPrivateViewAndRequiresANewRead() {
        String[] ui = {"Employee private profile", "Decision dialog"};
        HrRules.PrivateView view = new HrRules.PrivateView(() -> { ui[0] = ""; ui[1] = ""; });
        long opening = view.ticket();
        check(view.accepts(opening));
        view.hide(); // app lock may be disabled; remote role/link/session can now change
        check(ui[0].isEmpty() && ui[1].isEmpty());
        check(!view.accepts(opening));
        check(view.accepts(view.ticket())); // only a new exact server read can render
    }

    private static void aReadCompletingWhileStoppedCannotRevealPrivateContent() {
        String[] ui = {""};
        HrRules.PrivateView view = new HrRules.PrivateView(() -> ui[0] = "");
        long started = view.ticket();
        view.hide();
        if (view.accepts(started)) ui[0] = "Old authorized background response";
        check(ui[0].isEmpty());
        long fresh = view.ticket();
        if (view.accepts(fresh)) ui[0] = "Fresh exact authorized response";
        check(ui[0].equals("Fresh exact authorized response"));
    }

    private static void denialErasesVisibleSourceAndDialogWithoutChangingFrozenOperation() {
        String frozen = OPERATION + ":original exact payload";
        for (int status : new int[]{401, 403}) {
            String[] ui = {"Medical source", "Approve source"};
            HrRules.PrivateView view = new HrRules.PrivateView(() -> { ui[0] = ""; ui[1] = ""; });
            long read = view.ticket();
            if (HrRules.privateDenial(status)) view.hide();
            check(ui[0].isEmpty() && ui[1].isEmpty() && !view.accepts(read));
            check(frozen.equals(OPERATION + ":original exact payload"));
        }
        check(!HrRules.privateDenial(409));
    }

    private static void contactLimitsMatchTheCanonicalWriter() {
        check(HrRules.contactLimit("mobile_number") == 40);
        check(HrRules.contactLimit("emergency_contact_mobile") == 40);
        check(HrRules.contactLimit("emergency_contact_name") == 160);
        check(HrRules.contactValue("mobile_number", repeat('1', 40)));
        check(!HrRules.contactValue("mobile_number", repeat('1', 41)));
        check(HrRules.contactValue("emergency_contact_name", repeat('a', 160)));
        check(!HrRules.contactValue("emergency_contact_name", repeat('a', 161)));
    }

    private static String repeat(char c, int length) {
        char[] value = new char[length]; java.util.Arrays.fill(value, c); return new String(value);
    }

    private static void callbacksRequireTheSameActiveAccountSessionAndScreen() {
        Object oldScreen = new Object();
        check(HrRules.current(ACCOUNT, 23, oldScreen, ACCOUNT, 23, oldScreen, true));
        check(!HrRules.current(ACCOUNT, 23, oldScreen, OTHER, 23, oldScreen, true));
        check(!HrRules.current(ACCOUNT, 23, oldScreen, ACCOUNT, 24, oldScreen, true));
        check(!HrRules.current(ACCOUNT, 23, oldScreen, ACCOUNT, 23, new Object(), true));
        check(!HrRules.current(ACCOUNT, 23, oldScreen, ACCOUNT, 23, oldScreen, false));
        check(!HrRules.current(ACCOUNT, -1, oldScreen, ACCOUNT, -1, oldScreen, true));
    }

    private static void receiptMustMatchTheFrozenOperationAndHaveAResult() {
        check(HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 941, "4", true));
        check(HrRules.confirmed(OPERATION, OPERATION, 82, 0, 82, 941, "4", true));
        check(!HrRules.confirmed(OPERATION, OTHER, 82, 941, 82, 941, "4", true));
        check(!HrRules.confirmed(OPERATION, OPERATION, 82, 941, 81, 941, "4", true));
        check(!HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 942, "4", true));
        check(!HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 941, "00", true));
        check(!HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 941, "4", false));
        check(!HrRules.confirmed("", "", 82, 941, 82, 941, "4", true));
    }

    private static void uncertainOperationsRemainPendingAfterAnApparentRejection() {
        check(HrRules.mayDiscardRejected(true, 409, false));
        check(HrRules.mayDiscardRejected(true, 422, false));
        check(!HrRules.mayDiscardRejected(false, 409, false));
        check(!HrRules.mayDiscardRejected(false, 422, false));
        check(!HrRules.mayDiscardRejected(true, 409, true));
        check(!HrRules.mayDiscardRejected(true, 503, false));
        check(!HrRules.mayDiscardRejected(true, 401, false));
        check(!HrRules.mayDiscardRejected(true, 403, false));
    }

    private static void decisionRequiresPermissionAnExactVersionAndAReasonWhenNeeded() {
        check(HrRules.decisionError(true, "rev-1", "rev-1", false, "") == null);
        check(HrRules.decisionError(false, "rev-1", "rev-1", false, "") != null);
        check(HrRules.decisionError(true, "rev-1", "rev-2", false, "") != null);
        check(HrRules.decisionError(true, "", "", false, "") != null);
        check(HrRules.decisionError(true, "rev-1", "rev-1", true, " ") != null);
        check(HrRules.decisionError(true, "rev-1", "rev-1", true, "Incorrect date") == null);
    }

    private static void dateUsesDubaiDayAndValidChronology() {
        check(HrRules.dubaiDate(java.time.Instant.parse("2026-11-20T20:05:00Z")).equals(LocalDate.of(2026, 11, 21)));
        check(HrRules.dateRange("2026-11-21", "2026-11-21"));
        check(!HrRules.dateRange("2026-11-21", "2026-11-20"));
        check(!HrRules.dateRange("2026-02-29", "2026-03-01"));
        check(!HrRules.dateRange("", ""));
    }

    private static void handlesOvernightBreaksAndNonWorkingEntries() {
        check(HrRules.workError(true, new int[][]{{1320, 1800, 1410, 1440}}) == null);
        check(HrRules.workError(true, new int[][]{{1320, 360}}) != null);
        check(HrRules.workError(true, new int[][]{{480, 480}}) != null);
        check(HrRules.minute("8:00", false) == -1);
        check(HrRules.workError(false, new int[0][]) == null);
        check(HrRules.workError(false, new int[][]{{480, 960}}) != null);
        check(HrRules.workError(true, new int[0][]) != null);
    }

    private static void preventsOutOfOrderIntervalsAndBreaksThatEscapeTheirWorkInterval() {
        check(HrRules.minute("23:45", false) == 1425);
        check(HrRules.minute("00:15", true) == 1455);
        check(HrRules.minute("24:00", false) == -1);
        check(HrRules.stamp("2026-11-30", 1455).equals("2026-12-01T00:15:00+04:00"));
        check(HrRules.workError(true, new int[][]{{1320, 1800, 1430, 1450}}) == null);
        check(HrRules.workError(true, new int[][]{{1320, 1800, 1430, 1810}}) != null);
        check(HrRules.workError(true, new int[][]{{480, 720, 600, 630, 620, 640}}) != null);
        check(HrRules.workError(true, new int[][]{{480, 720}, {710, 780}}) != null);
        check(HrRules.workError(true, new int[][]{{480, 720}, {720, 780}}) == null);
        check(HrRules.workError(true, new int[][]{{1440, 1450}}) != null);
        check(HrRules.workError(false, new int[][]{{480, 720}}) != null);
        check(HrRules.workError(false, new int[0][]) == null);
    }

    private static void lockedActivityRedactsEvenDuringAnOperation() {
        check(HrRules.lockViewRequired(true, false));
        check(!HrRules.lockViewRequired(true, true));
        check(!HrRules.lockViewRequired(false, false));
    }

    private static void backgroundResultWaitsForTheSameUnlockedScreen() {
        check(HrRules.delivery(true, false, true) == HrRules.Delivery.WAIT);
        check(HrRules.delivery(true, true, true) == HrRules.Delivery.SHOW);
        check(HrRules.delivery(true, false, false) == HrRules.Delivery.DROP);
        check(HrRules.delivery(true, true, false) == HrRules.Delivery.DROP);
        check(HrRules.delivery(false, true, true) == HrRules.Delivery.DROP);
    }

    private static void durableConfirmationBlocksReplacementUntilExactAcknowledgement() {
        check(HrRules.sameSubmission("decision:leave:19", "decision:leave:19"));
        check(!HrRules.sameSubmission("decision:leave:19", "decision:leave:20"));
        check(!HrRules.canAcknowledge(19, 0));
        check(!HrRules.canAcknowledge(0, 19));
        check(!HrRules.canAcknowledge(19, 20));
        check(HrRules.canAcknowledge(19, 19));
    }

    private static void aNewLoginCanCheckTheReceiptButCannotReplayTheAction() {
        check(HrRules.canReplay(42, 42, 0));
        check(!HrRules.canReplay(42, 43, 0));
        check(!HrRules.canReplay(42, 42, 19));
        check(!HrRules.canReplay(-1, -1, 0));
    }

    private static void replacementUploadDropsPreviouslySelectedEvidence() {
        check(HrRules.keepEvidence(false, 91, 201));
        check(!HrRules.keepEvidence(true, 91, 201));
        check(!HrRules.keepEvidence(false, 91, 0));
        check(!HrRules.keepEvidence(false, 0, 201));
    }

    private static void staffAccessToAnotherEmployeeDoesNotRevealTheOriginalTarget() {
        boolean globalStaffToolsRemain = true;
        boolean targetAllowed = HrRules.exactRecord(82, 941, "4", 83, 941, "4");
        check(globalStaffToolsRemain && !targetAllowed);
        check(HrRules.pendingAccess(0, false, targetAllowed) == HrRules.PendingAccess.REDACTED);
        check(!HrRules.exactRecord(82, 941, "4", 82, 942, "4"));
        check(!HrRules.exactRecord(82, 941, "4", 82, 941, "5"));
        check(HrRules.exactRecord(82, 941, "4", 82, 941, "4"));
        check(HrRules.pendingAccess(0, false, true) == HrRules.PendingAccess.ORIGINAL);
        check(!HrRules.ownScope(82, true, 82, false));
        check(!HrRules.ownScope(82, true, 83, true));
        check(!HrRules.ownScope(82, false, 82, true));
        check(HrRules.ownScope(82, true, 82, true));
    }

    private static void cachedConfirmationRequiresAFreshMatchingReceipt() {
        check(HrRules.pendingAccess(941, false, false) == HrRules.PendingAccess.REDACTED);
        check(HrRules.pendingAccess(941, false, true) == HrRules.PendingAccess.REDACTED);
        boolean differentRecord = HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 942, "4", true);
        check(HrRules.pendingAccess(941, differentRecord, true) == HrRules.PendingAccess.REDACTED);
        boolean currentReceipt = HrRules.confirmed(OPERATION, OPERATION, 82, 941, 82, 941, "4", true);
        check(HrRules.pendingAccess(941, currentReceipt, false) == HrRules.PendingAccess.RECEIPT);
    }

    private static void earlierLoginKeepsTheSameLeaveIntentWithoutBlockingIndependentLeave() {
        String original = HrRules.leaveIntent(82, 5, "2026-11-21", "2026-11-23");
        check(!HrRules.canReplay(42, 43, 0));
        check(HrRules.sameSubmission(original, HrRules.leaveIntent(82, 5, "2026-11-21", "2026-11-23")));
        check(!HrRules.sameSubmission(original, HrRules.leaveIntent(82, 5, "2026-12-21", "2026-12-23")));
        check(!HrRules.sameSubmission(original, HrRules.leaveIntent(82, 6, "2026-11-21", "2026-11-23")));
        check(!HrRules.sameSubmission(original, HrRules.leaveIntent(83, 5, "2026-11-21", "2026-11-23")));
    }

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
