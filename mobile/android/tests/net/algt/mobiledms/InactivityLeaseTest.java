package net.algt.mobiledms;

public final class InactivityLeaseTest {
    private static final long OWNER = 12;

    public static void main(String[] args) {
        expiresAtTheExactBoundary();
        shortBackgroundRoundTripKeepsTheRemainingTime();
        userInteractionRenewsOnlyAnExistingLease();
        backgroundChecksDoNotRenew();
        newProcessAndChangedAccountAreLocked();
        explicitLockAndFailedConfirmationClearTheLease();
        negativeAndReversedTimeAreLocked();
        deadlineDoesNotOverflow();
        System.out.println("Inactivity lease passed (8 scenarios)");
    }

    private static void expiresAtTheExactBoundary() {
        InactivityLease lease = new InactivityLease();
        check(lease.confirmed(true, OWNER, 250), "credential confirmation opens the lease");
        check(lease.remaining(OWNER, 600249) == 1, "still unlocked one millisecond before expiry");
        check(lease.remaining(OWNER, 600250) == 0, "locked at the exact deadline");
    }

    private static void shortBackgroundRoundTripKeepsTheRemainingTime() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, 0);
        check(lease.remaining(OWNER, 120000) == 480000, "app switch leaves the lease valid");
        check(lease.remaining(OWNER, 125000) == 475000, "return does not move the deadline");
    }

    private static void userInteractionRenewsOnlyAnExistingLease() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, 0);
        check(lease.interact(OWNER, 500000) == 600000, "first interaction renews the lease");
        check(lease.interact(OWNER, 1000000) == 600000, "second interaction renews the lease");
        check(lease.interact(OWNER, 1600000) == 0, "interaction at the deadline cannot unlock");
        check(lease.remaining(OWNER, 1600001) == 0, "expired view remains locked");
    }

    private static void backgroundChecksDoNotRenew() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, 1000);
        check(lease.remaining(OWNER, 400000) == 201000, "network check observes remaining time");
        check(lease.remaining(OWNER, 500000) == 101000, "worker check observes the same deadline");
        check(lease.remaining(OWNER, 601000) == 0, "both checks leave the original deadline intact");
    }

    private static void newProcessAndChangedAccountAreLocked() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, 0);
        check(new InactivityLease().remaining(OWNER, 10000) == 0, "process restart has no lease");
        check(lease.remaining(OWNER, 10000) == 590000, "same account generation keeps its lease");
        check(lease.remaining(OWNER + 1, 11000) == 0, "different account generation is locked");
        check(lease.remaining(OWNER, 12000) == 0, "previous generation cannot be revived");
    }

    private static void explicitLockAndFailedConfirmationClearTheLease() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, 1000);
        lease.reset();
        check(lease.remaining(OWNER, 1001) == 0, "explicit lock clears the lease");
        check(lease.confirmed(true, OWNER, 1002), "another confirmation opens the lease");
        check(!lease.confirmed(false, OWNER, 1003), "failed confirmation reports locked");
        check(lease.remaining(OWNER, 1004) == 0, "failed confirmation clears any prior lease");
        check(lease.confirmed(true, OWNER, 1005), "successful confirmation starts a fresh lease");
        check(lease.remaining(OWNER, 1005) == 600000, "fresh confirmation uses the full timeout");
    }

    private static void negativeAndReversedTimeAreLocked() {
        InactivityLease lease = new InactivityLease();
        check(!lease.confirmed(true, OWNER, -1), "negative time cannot start a lease");
        lease.confirmed(true, OWNER, 1000);
        check(lease.remaining(OWNER, 1050) == 599950, "time advanced after the last interaction");
        check(lease.interact(OWNER, 1049) == 0, "rollback since the last check cannot renew the lease");
        check(lease.remaining(OWNER, 1100) == 0, "rollback permanently invalidates the lease");
        lease.confirmed(true, OWNER, 1200);
        check(lease.remaining(OWNER, -1) == 0, "negative observation locks a valid lease");
        lease.confirmed(true, OWNER, 1300);
        check(!lease.confirmed(true, OWNER, 1299), "confirmation at a reversed time fails closed");
    }

    private static void deadlineDoesNotOverflow() {
        InactivityLease lease = new InactivityLease();
        lease.confirmed(true, OWNER, Long.MAX_VALUE - 5);
        check(lease.remaining(OWNER, Long.MAX_VALUE) == 599995, "remaining time uses an elapsed duration");
    }

    private static void check(boolean outcome, String expected) {
        if (!outcome) throw new AssertionError(expected);
    }
}
