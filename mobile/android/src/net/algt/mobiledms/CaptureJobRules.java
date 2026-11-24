package net.algt.mobiledms;

import java.util.UUID;

/** Framework-independent bounds and identity decisions shared by capture and jobs. */
final class CaptureJobRules {
    private CaptureJobRules() { }

    static int sampleSize(int width, int height, int maxSide, long maxPixels) {
        if (width < 1 || height < 1 || maxSide < 1 || maxPixels < 1) throw new IllegalArgumentException("Invalid image size");
        int sample = 1;
        while (((long) width + sample - 1) / sample > maxSide
            || ((long) height + sample - 1) / sample > maxSide
            || (((long) width + sample - 1) / sample) * (((long) height + sample - 1) / sample) > maxPixels) {
            if (sample > (1 << 29)) throw new IllegalArgumentException("Invalid image size");
            sample *= 2;
        }
        return sample;
    }

    static int[] crop(int width, int height, double left, double top, double right, double bottom) {
        if (width < 1 || height < 1 || Double.isNaN(left) || Double.isNaN(top)
            || Double.isNaN(right) || Double.isNaN(bottom) || right <= left || bottom <= top) {
            throw new IllegalArgumentException("Choose a non-empty crop");
        }
        int x = (int) Math.floor(Math.max(0, Math.min(1, left)) * width);
        int y = (int) Math.floor(Math.max(0, Math.min(1, top)) * height);
        int r = (int) Math.ceil(Math.max(0, Math.min(1, right)) * width);
        int b = (int) Math.ceil(Math.max(0, Math.min(1, bottom)) * height);
        if (r <= x || b <= y) throw new IllegalArgumentException("Choose a non-empty crop");
        return new int[]{x, y, r - x, b - y};
    }

    static boolean sameAccount(String expected, String actual, long scheduledGeneration, long currentGeneration) {
        if (expected == null || actual == null || scheduledGeneration != currentGeneration) return false;
        try {
            return expected.equals(UUID.fromString(expected).toString()) && expected.equals(actual);
        } catch (IllegalArgumentException ignored) { return false; }
    }

    static boolean retryStatus(int status) {
        return status == 0 || status == 408 || status == 425 || status == 429 || status >= 500;
    }

    static boolean changed(String before, String after) {
        return after != null && !after.isEmpty() && !after.equals(before);
    }

    static boolean needsPreflight(String frozenOperation, String journalOperation, String recoveryOperation, boolean completed) {
        if (frozenOperation == null || journalOperation == null
            || !frozenOperation.equals(UUID.fromString(frozenOperation).toString())
            || !journalOperation.equals(UUID.fromString(journalOperation).toString())) {
            throw new IllegalArgumentException("Invalid upload operation");
        }
        if (!frozenOperation.equals(journalOperation) && !(completed && frozenOperation.equals(recoveryOperation))) {
            throw new IllegalArgumentException("The upload queue belongs to a different operation");
        }
        if (!completed && recoveryOperation != null && !recoveryOperation.isEmpty()) {
            throw new IllegalArgumentException("Unverified upload recovery");
        }
        return !completed;
    }

    /** The same image-to-crop matrix is used for the preview and saved straightened bitmap. */
    static float[] imageTransform(int width, int height, int cropX, int cropY, float degrees) {
        if (width < 1 || height < 1 || Float.isNaN(degrees) || Float.isInfinite(degrees)) throw new IllegalArgumentException("Invalid image transform");
        double radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
        double cx = width / 2.0, cy = height / 2.0;
        return new float[]{(float)cos, (float)-sin, (float)(cx-cos*cx+sin*cy-cropX),
            (float)sin, (float)cos, (float)(cy-sin*cx-cos*cy-cropY), 0, 0, 1};
    }

    static boolean mayPoll(String kind, boolean view, boolean upload, boolean review, boolean notifications) {
        return "notifications".equals(kind) ? notifications : "uploads".equals(kind) && (view || upload || review);
    }

    static boolean discardScanTemp(boolean all, long modifiedAt, long now) {
        // Fresh outputs can still be awaiting a restored Activity result. Unknown
        // timestamps/clock rollback preserve them until normal import or logout.
        return all || (modifiedAt > 0 && now >= modifiedAt && now - modifiedAt >= 24 * 60 * 60_000L);
    }

    static boolean isScanTemp(String name, boolean source) {
        if (name == null) return false;
        if (source) return name.matches("scan-source-[A-Za-z0-9_-]{1,128}\\.img");
        if (!name.endsWith(".jpg")) return false;
        String id = name.substring(0, name.length() - 4);
        try { return id.equals(UUID.fromString(id).toString()); }
        catch (IllegalArgumentException error) { return false; }
    }
}
