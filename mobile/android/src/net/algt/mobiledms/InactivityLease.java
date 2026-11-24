package net.algt.mobiledms;

/** Process-local unlock for one local account generation. Callers supply monotonic time. */
final class InactivityLease {
    private static final long TIMEOUT_MS = 600000;
    private long generation = -1;
    private long lastInteraction = -1;
    private long lastObserved = -1;

    boolean confirmed(boolean success, long generation, long now) {
        boolean valid = success && generation >= 0 && now >= 0 && now >= lastObserved;
        reset();
        if (valid) {
            this.generation = generation;
            lastInteraction = now;
            lastObserved = now;
        }
        return valid;
    }

    long remaining(long generation, long now) {
        if (this.generation != generation || lastInteraction < 0 || now < lastObserved
                || now - lastInteraction >= TIMEOUT_MS) {
            reset();
            return 0;
        }
        lastObserved = now;
        return TIMEOUT_MS - (now - lastInteraction);
    }

    long interact(long generation, long now) {
        if (remaining(generation, now) == 0) return 0;
        lastInteraction = now;
        return TIMEOUT_MS;
    }

    void reset() {
        generation = lastInteraction = lastObserved = -1;
    }
}
