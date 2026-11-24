package net.algt.mobiledms;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.UUID;

final class HrRules {
    private static final ZoneId DUBAI = ZoneId.of("Asia/Dubai");

    enum Delivery { SHOW, WAIT, DROP }
    enum PendingAccess { REDACTED, ORIGINAL, RECEIPT }

    /** A lifecycle/denial boundary retires every read started before the private view was erased. */
    static final class PrivateView {
        private long generation;
        private final Runnable erase;
        PrivateView(Runnable erase) { this.erase = erase; }
        long ticket() { return generation; }
        boolean accepts(long ticket) { return ticket == generation; }
        void hide() { generation++; erase.run(); }
    }

    /** A neutral HR refresh belongs only to the hierarchy that requested it. */
    static final class ViewRefresh {
        private Object owner;
        void bind(Object view) { owner = view; }
        void clear() { owner = null; }
        boolean owns(Object current) {
            if (owner == null) return false;
            if (owner == current) return true;
            clear();
            return false;
        }
    }

    static boolean privateDenial(int status) { return status == 401 || status == 403; }
    static int contactLimit(String key) {
        return key.equals("personal_email") ? 254 : key.equals("emergency_contact_name") ? 160 : 40;
    }
    static boolean contactValue(String key, String value) {
        return !value.trim().isEmpty() && value.trim().length() <= contactLimit(key);
    }

    static boolean current(String account, long epoch, Object screen, String currentAccount, long currentEpoch,
            Object currentScreen, boolean activeAndUnlocked) {
        return activeAndUnlocked && !account.isEmpty() && epoch >= 0 && account.equals(currentAccount)
            && epoch == currentEpoch && screen != null && screen == currentScreen;
    }

    static boolean confirmed(String operation, String returnedOperation, long employee, long target,
            long returnedEmployee, long returnedTarget, String revision, boolean hasReplayFlag) {
        return hasReplayFlag && employee > 0 && returnedEmployee == employee && returnedTarget > 0
            && (target == 0 || target == returnedTarget) && validRevision(revision) && uuid(operation) && operation.equals(returnedOperation);
    }

    static boolean mayDiscardRejected(boolean firstAttempt, int status, boolean uncertain) {
        return firstAttempt && !uncertain && (status == 409 || status == 422);
    }

    static boolean validRevision(String value) {
        return value.matches("[1-9][0-9]{0,18}");
    }

    static boolean lockViewRequired(boolean accountPresent, boolean unlocked) {
        return accountPresent && !unlocked;
    }

    static boolean diallerAllowed(boolean hrCapability, boolean sameView, boolean currentHrSession) {
        return hrCapability && sameView && currentHrSession;
    }

    static Delivery delivery(boolean sameScope, boolean foreground, boolean unlocked) {
        if (!sameScope || !unlocked) return Delivery.DROP;
        return foreground ? Delivery.SHOW : Delivery.WAIT;
    }

    static boolean sameSubmission(String originalTarget, String requestedTarget) {
        return !originalTarget.isEmpty() && originalTarget.equals(requestedTarget);
    }

    static String leaveIntent(long employee, long type, String start, String end) {
        if (employee <= 0 || type <= 0 || !dateRange(start, end)) throw new IllegalArgumentException("Invalid leave dates or type.");
        return "new-leave:" + employee + ":" + type + ":" + start + ":" + end;
    }

    static boolean exactRecord(long employee, long target, String revision, long openedEmployee, long openedTarget, String openedRevision) {
        return employee > 0 && openedEmployee == employee && openedTarget == target
            && (target > 0 ? validRevision(revision) : target == 0 && revision.isEmpty()) && revision.equals(openedRevision);
    }

    static boolean ownScope(long employee, boolean own, long linkedEmployee, boolean permittedDomain) {
        return own && permittedDomain && employee > 0 && employee == linkedEmployee;
    }

    static boolean resumeRenewal(long employee, boolean own, long linkedEmployee, boolean canSubmit,
            long source, String revision, long currentSource, String currentRevision) {
        return ownScope(employee, own, linkedEmployee, canSubmit)
            && exactRecord(employee, source, revision, employee, currentSource, currentRevision);
    }

    static PendingAccess pendingAccess(long storedReceipt, boolean freshMatchingReceipt, boolean currentOriginal) {
        if (freshMatchingReceipt) return PendingAccess.RECEIPT;
        return storedReceipt == 0 && currentOriginal ? PendingAccess.ORIGINAL : PendingAccess.REDACTED;
    }

    static boolean canAcknowledge(long storedReceipt, long shownReceipt) {
        return storedReceipt > 0 && storedReceipt == shownReceipt;
    }

    static boolean canReplay(long originalEpoch, long currentEpoch, long storedReceipt) {
        return originalEpoch >= 0 && originalEpoch == currentEpoch && storedReceipt == 0;
    }

    static boolean keepEvidence(boolean openingReplacementUpload, long documentId, long versionId) {
        return !openingReplacementUpload && documentId > 0 && versionId > 0;
    }

    static boolean uuid(String value) {
        try { return UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException error) { return false; }
    }

    static String decisionError(boolean permitted, String version, String currentVersion, boolean needsReason, String reason) {
        if (!permitted) return "This decision is unavailable with your current access.";
        if (version.isEmpty() || !version.equals(currentVersion)) return "This request has changed. Open the latest version.";
        if (needsReason && reason.trim().isEmpty()) return "Enter a reason for this decision.";
        return null;
    }

    static LocalDate dubaiDate(Instant instant) {
        return instant.atZone(DUBAI).toLocalDate();
    }

    static boolean dateRange(String first, String last) {
        if (!first.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || !last.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return false;
        try { return !LocalDate.parse(last).isBefore(LocalDate.parse(first)); }
        catch (DateTimeException error) { return false; }
    }

    static int minute(String clock, boolean nextDay) {
        if (!clock.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) return -1;
        LocalTime value = LocalTime.parse(clock);
        return (nextDay ? 1440 : 0) + value.getHour() * 60 + value.getMinute();
    }

    static String stamp(String date, int minute) {
        return LocalDate.parse(date).plusDays(minute / 1440)
            + String.format(Locale.ROOT, "T%02d:%02d:00+04:00", minute / 60 % 24, minute % 60);
    }

    /** Consecutive start/end minute pairs describe each work interval and its breaks. */
    static String workError(boolean working, int[][] intervals) {
        if (!working) return intervals.length == 0 ? null : "Remove all work intervals for this attendance type.";
        if (intervals.length == 0) return "Add an actual work interval.";
        int previousEnd = 0;
        for (int[] row : intervals) {
            int start = row[0], end = row[1];
            if (start < 0 || end < 0) return "Choose both the start and finish of each work interval.";
            if (start >= 1440 || start < previousEnd || end <= start || end - start > 1440)
                return "Use ordered, non-overlapping intervals that begin on the selected date.";
            int lastBreakEnd = start;
            for (int i = 2; i < row.length; i += 2) {
                int breakStart = row[i], breakEnd = row[i + 1];
                if (breakStart < lastBreakEnd || breakEnd <= breakStart || breakEnd > end)
                    return "Choose ordered breaks within their work interval.";
                lastBreakEnd = breakEnd;
            }
            previousEnd = end;
        }
        return null;
    }
}
