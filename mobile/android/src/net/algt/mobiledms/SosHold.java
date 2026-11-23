package net.algt.mobiledms;

/** Pure monotonic gesture state. No queued or reconnect transition. */
final class SosHold {
    static final long DURATION = 3000;
    private String target;
    private long started;

    boolean begin(String channel, long now, boolean authorized) {
        if (target != null || !authorized || channel == null || channel.isEmpty()) return false;
        target = channel;
        started = now;
        return true;
    }
    void cancel() { target = null; }
    boolean holding() { return target != null; }
    long remaining(long now) { return Math.max(0, DURATION - (now - started)); }

    boolean due(String channel, long now, boolean authorized) {
        if (!authorized || target == null || !target.equals(channel) || now < started) {
            cancel();
            return false;
        }
        if (remaining(now) != 0) return false;
        cancel();
        return true;
    }
    static boolean freshFix(long nowNanos, long fixNanos) {
        return fixNanos > 0 && nowNanos >= fixNanos && nowNanos - fixNanos <= 60_000_000_000L;
    }
}
