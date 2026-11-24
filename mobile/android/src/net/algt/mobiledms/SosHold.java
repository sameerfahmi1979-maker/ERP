package net.algt.mobiledms;

/** Pure monotonic gesture state. No queued or reconnect transition. */
final class SosHold {
    static final long DURATION = 3000, TICK_MS = 100;
    private String target;
    private long downEvent, countdownStart, lastTick;

    boolean begin(String channel, long eventTime, long dispatchTime, boolean authorized) {
        if (target != null || !authorized || channel == null || channel.isEmpty()
                || eventTime < 0 || dispatchTime < eventTime) return false;
        target = channel;
        downEvent = eventTime;
        countdownStart = lastTick = dispatchTime;
        return true;
    }
    void cancel() { target = null; }
    boolean holding() { return target != null; }
    long remaining(long now) { return Math.max(0, DURATION - (now - countdownStart)); }

    private boolean valid(String channel, boolean authorized) {
        if (!authorized || target == null || !target.equals(channel)) {
            cancel();
            return false;
        }
        return true;
    }
    boolean timerDue(String channel, long now, boolean authorized) {
        if (!valid(channel, authorized)) return false;
        if (now < lastTick) { cancel(); return false; }
        // A stalled dispatcher can still have an earlier physical UP or CANCEL to deliver.
        if (now - lastTick > 2 * TICK_MS) countdownStart = now;
        lastTick = now;
        if (remaining(now) != 0) return false;
        cancel();
        return true;
    }
    boolean release(String channel, long eventTime, boolean authorized) {
        if (!valid(channel, authorized)) return false;
        cancel();
        return eventTime >= downEvent && eventTime - downEvent >= DURATION;
    }
    static boolean freshFix(long nowNanos, long fixNanos) {
        return fixNanos > 0 && nowNanos >= fixNanos && nowNanos - fixNanos <= 60_000_000_000L;
    }
}
