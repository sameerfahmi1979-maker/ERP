package net.algt.mobiledms;

import java.util.UUID;

/** Accessed on the service's main thread. The elapsed-time deadline never depends on wall-clock movement. */
final class PttState {
    static final long MAX_TURN_MS = 60_000, MAX_STATUS_AGE_MS = 8_000;
    static final class Hold {
        final String id = UUID.randomUUID().toString(), channel;
        final long down;
        String lease = "";
        long deadline;
        boolean connected;
        Hold(String channel, long down) { this.channel = channel; this.down = down; }
    }
    volatile String selected = "";
    String name = "", availability = "available", admission = "none";
    long verified = -1;
    boolean paused;
    Hold hold;

    void select(String channel, String label) {
        if (hold != null) throw new IllegalStateException("Release Talk before selecting a channel.");
        selected = channel;
        name = label;
        status("none", -1);
    }
    void status(String value, long elapsed) { admission = value; verified = elapsed; }
    boolean fresh(long now) { return verified >= 0 && now >= verified && now - verified <= MAX_STATUS_AGE_MS; }
    boolean available() { return "available".equals(availability) && !paused; }
    boolean canPress(boolean online, boolean unlocked, long now) {
        return hold == null && online && unlocked && fresh(now) && available()
            && !selected.isEmpty() && "live".equals(admission);
    }
    Hold down(boolean online, boolean unlocked, long now) {
        if (!canPress(online, unlocked, now)) return null;
        hold = new Hold(selected, now);
        return hold;
    }
    boolean grant(Hold request, String lease, long remaining, long now) {
        if (hold == null || hold != request || !selected.equals(request.channel) || !available()
            || !fresh(now) || lease.isEmpty() || remaining <= 0 || now < request.down) return false;
        request.deadline = Math.min(request.down + MAX_TURN_MS, now + Math.min(MAX_TURN_MS, remaining));
        if (request.deadline <= now) return false;
        request.lease = lease;
        return true;
    }
    Hold release() { Hold previous = hold; hold = null; return previous; }

    static boolean recover(boolean optedIn, boolean sameAccount, boolean sameEpoch, boolean stopped, String availability) {
        return optedIn && sameAccount && sameEpoch && !stopped && !"offDuty".equals(availability);
    }
}
