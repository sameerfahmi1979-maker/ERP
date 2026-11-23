package net.algt.mobiledms;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.function.BooleanSupplier;

public final class PrivateInteractionTest {
    public static void main(String[] args) throws IOException {
        softEditRenewsJustBeforeExpiry();
        programmaticPopulationStaysPassive();
        inputDeliveredAtTheDeadlineIsConsumed();
        expiredExportNeverOpensDestination();
        changedOwnerOrGenerationNeverOpensDestination();
        expiryDuringDestinationOpenNeverWrites();
        exportStopsAfterExpiryBetweenChunks();
        diallerRequiresAnAdmittedCurrentHrScreen();
        publicCredentialClickDoesNotRenewTheLockedLease();
        privateAndRetiredAccessibilityActionsStayDenied();
        handwritingEditRenewsAValidLease();
        handwritingEditAtExpiryIsCancelledOnTheCallerExecutor();
        deniedHandwritingAllowsAnAbsentCallback();
        System.out.println("Private interactions passed (13 scenarios)");
    }

    private static void softEditRenewsJustBeforeExpiry() {
        InactivityLease lease = unlocked();
        check(UserInputPolicy.mayApply(true, () -> lease.interact(12, 599999) > 0), "soft edit reaches the field");
        check(lease.remaining(12, 600000) == 599999, "soft edit renews the lease near expiry");
    }

    private static void programmaticPopulationStaysPassive() {
        InactivityLease lease = unlocked();
        check(UserInputPolicy.mayApply(false, () -> { throw new AssertionError("population cannot renew"); }), "population is allowed");
        check(lease.remaining(12, 600000) == 0, "population leaves the original deadline");
    }

    private static void inputDeliveredAtTheDeadlineIsConsumed() {
        InactivityLease lease = unlocked();
        check(!UserInputPolicy.mayApply(true, () -> lease.interact(12, 600000) > 0), "expired input never reaches its control");
        check(lease.remaining(12, 600001) == 0, "expired input cannot revive the lease");
    }

    private static void expiredExportNeverOpensDestination() throws IOException {
        ExternalResultFence fence = new ExternalResultFence("owner", 12);
        InactivityLease lease = unlocked();
        rejects(() -> fence.writeTo(() -> fence.allows("owner", 12, lease.remaining(12, 600000) > 0),
            () -> { throw new AssertionError("expired destination opened"); }, stream -> stream.write(1)));
    }

    private static void changedOwnerOrGenerationNeverOpensDestination() throws IOException {
        ExternalResultFence fence = new ExternalResultFence("owner", 12);
        for (BooleanSupplier access : new BooleanSupplier[]{
                () -> fence.allows("replacement", 12, true), () -> fence.allows("owner", 13, true)}) {
            rejects(() -> fence.writeTo(access, () -> { throw new AssertionError("stale destination opened"); }, stream -> stream.write(1)));
        }
    }

    private static void expiryDuringDestinationOpenNeverWrites() throws IOException {
        ExternalResultFence fence = new ExternalResultFence("owner", 12);
        ByteArrayOutputStream destination = new ByteArrayOutputStream();
        long[] now = {599999};
        InactivityLease lease = unlocked();
        rejects(() -> fence.writeTo(() -> lease.remaining(12, now[0]) > 0,
            () -> { now[0] = 600000; return destination; }, stream -> stream.write(1)));
        check(destination.size() == 0, "zero destination bytes after expiry during open");
    }

    private static void exportStopsAfterExpiryBetweenChunks() throws IOException {
        ExternalResultFence fence = new ExternalResultFence("owner", 12);
        ByteArrayOutputStream destination = new ByteArrayOutputStream();
        long[] now = {599999};
        InactivityLease lease = unlocked();
        rejects(() -> fence.writeTo(() -> lease.remaining(12, now[0]) > 0, () -> destination, stream -> {
            stream.write(new byte[]{1, 2}, 0, 2);
            now[0] = 600000;
            stream.write(new byte[]{3, 4}, 0, 2);
        }));
        check(destination.size() == 2, "only the admitted chunk reached the destination");
    }

    private static void diallerRequiresAnAdmittedCurrentHrScreen() {
        check(HrRules.diallerAllowed(true, true, true), "current HR row may open the dialler");
        check(!HrRules.diallerAllowed(false, true, true), "DMS-only profile cannot open the HR dialler");
        check(!HrRules.diallerAllowed(true, false, true), "retired HR row cannot open the dialler");
        check(!HrRules.diallerAllowed(true, true, false), "stale HR session cannot open the dialler");
    }

    private static void publicCredentialClickDoesNotRenewTheLockedLease() {
        InactivityLease lease = unlocked();
        check(lease.remaining(12, 600000) == 0, "the app is already locked");
        check(UserInputPolicy.mayApplyAccessibility(true, true, true,
            () -> { throw new AssertionError("the public credential click must not use the private input gate"); }),
            "the current public credential button can be activated while locked");
        check(lease.remaining(12, 600001) == 0, "activating the credential button alone leaves the app locked");
    }

    private static void privateAndRetiredAccessibilityActionsStayDenied() {
        InactivityLease lease = unlocked();
        check(!UserInputPolicy.mayApplyAccessibility(true, true, false, () -> lease.interact(12, 600000) > 0),
            "a private action on an attached view is denied when locked");
        check(!UserInputPolicy.mayApplyAccessibility(true, false, true,
            () -> { throw new AssertionError("a retired control must never reach the input gate"); }),
            "a detached credential control is denied even if it matches the public target");
    }

    private static void handwritingEditRenewsAValidLease() {
        InactivityLease lease = unlocked();
        int[] applied = {0};
        UserInputPolicy.performEditingGesture(() -> lease.interact(12, 599999) > 0,
            () -> applied[0]++, null, () -> { throw new AssertionError("a valid handwriting edit is not cancelled"); });
        check(applied[0] == 1, "a valid handwriting edit is forwarded once");
        check(lease.remaining(12, 600000) == 599999, "handwriting renews the valid lease");
    }

    private static void handwritingEditAtExpiryIsCancelledOnTheCallerExecutor() {
        InactivityLease lease = unlocked();
        Runnable[] scheduled = {null};
        int[] cancelled = {0};
        UserInputPolicy.performEditingGesture(() -> lease.interact(12, 600000) > 0,
            () -> { throw new AssertionError("expired handwriting edits cannot mutate the field"); },
            callback -> scheduled[0] = callback, () -> cancelled[0]++);
        check(scheduled[0] != null && cancelled[0] == 0, "the IME cancellation uses the supplied executor");
        scheduled[0].run();
        check(cancelled[0] == 1, "the IME receives one cancellation");
        check(lease.remaining(12, 600001) == 0, "denied handwriting does not unlock the app");
    }

    private static void deniedHandwritingAllowsAnAbsentCallback() {
        UserInputPolicy.performEditingGesture(() -> false,
            () -> { throw new AssertionError("denied handwriting cannot mutate the field"); },
            callback -> { throw new AssertionError("there is no IME callback to schedule"); }, null);
        int[] cancelled = {0};
        UserInputPolicy.performEditingGesture(() -> false,
            () -> { throw new AssertionError("denied handwriting cannot mutate the field"); }, null, () -> cancelled[0]++);
        check(cancelled[0] == 1, "a callback without a supplied executor receives cancellation inline");
    }

    private static InactivityLease unlocked() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, 12, 0);
        return lease;
    }

    private interface Write { void run() throws IOException; }

    private static void rejects(Write write) throws IOException {
        try { write.run(); }
        catch (IOException expected) { return; }
        throw new AssertionError("private write was not rejected");
    }

    private static void check(boolean result, String expectation) {
        if (!result) throw new AssertionError(expectation);
    }
}
