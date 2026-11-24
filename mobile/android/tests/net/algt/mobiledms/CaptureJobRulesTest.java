package net.algt.mobiledms;

public final class CaptureJobRulesTest {
    private static int checks;
    private static void equal(long expected, long actual) {
        checks++;
        if (expected != actual) throw new AssertionError(expected + " != " + actual);
    }
    private static void truth(boolean value) {
        checks++;
        if (!value) throw new AssertionError("Expected true");
    }
    private static void near(float expected, float actual) {
        checks++; if (Math.abs(expected-actual) > .001) throw new AssertionError(expected+" != "+actual);
    }
    public static void main(String[] args) {
        // Catch a decode policy which admits a camera image above the memory budget.
        equal(8, CaptureJobRules.sampleSize(12000, 9000, 2200, 3000000));
        equal(1, CaptureJobRules.sampleSize(1200, 1600, 2200, 3000000));
        equal(4, CaptureJobRules.sampleSize(50000, 100, 22000, 3000000));
        // Catch unbounded or empty crops and preserve hand-derived pixel edges.
        int[] crop = CaptureJobRules.crop(1000, 800, .1, .25, .9, .75);
        equal(100, crop[0]); equal(200, crop[1]); equal(800, crop[2]); equal(400, crop[3]);
        crop = CaptureJobRules.crop(10, 10, -3, -1, 4, 8);
        equal(0, crop[0]); equal(0, crop[1]); equal(10, crop[2]); equal(10, crop[3]);
        try { CaptureJobRules.crop(100, 100, .5, .5, .5, .5); throw new AssertionError("empty crop"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { CaptureJobRules.sampleSize(0, 4, 2200, 3000000); throw new AssertionError("invalid size"); }
        catch (IllegalArgumentException expected) { checks++; }
        // Catch account switching, permissive UUID parsing, and revoked generations.
        String user = "1a5d2ead-1d3b-4f0a-b61b-714aa24eeec4";
        truth(CaptureJobRules.sameAccount(user, user, 12, 12));
        truth(!CaptureJobRules.sameAccount(user, "25c38f2b-e6bd-4a23-9324-f4704bb90cad", 12, 12));
        truth(!CaptureJobRules.sameAccount(user, user, 12, 13));
        truth(!CaptureJobRules.sameAccount("1-1-1-1-1", "1-1-1-1-1", 12, 12));
        // Catch retrying denied/conflicting requests forever or dropping recoverable transport errors.
        truth(CaptureJobRules.retryStatus(0)); truth(CaptureJobRules.retryStatus(408));
        truth(CaptureJobRules.retryStatus(429)); truth(CaptureJobRules.retryStatus(503));
        truth(!CaptureJobRules.retryStatus(401)); truth(!CaptureJobRules.retryStatus(403));
        truth(!CaptureJobRules.retryStatus(409)); truth(!CaptureJobRules.retryStatus(422));
        // Catch notification noise for unchanged rows and missed first/new status events.
        truth(!CaptureJobRules.changed("uploaded", "uploaded"));
        truth(CaptureJobRules.changed("uploaded", "ai_complete"));
        truth(CaptureJobRules.changed(null, "pending"));
        truth(!CaptureJobRules.changed(null, ""));
        // Catch skipping duplicate preflight for a newly queued offline operation, or
        // repeating it after admission may have retained that same upload on the server.
        String operation = "6cb1be4e-0ea2-4da4-b4db-5fa1abf00a19";
        String recovered = "58c3f210-e901-49aa-a5dc-694b16200abe";
        truth(CaptureJobRules.needsPreflight(operation, operation, "", false));
        truth(!CaptureJobRules.needsPreflight(operation, operation, "", true));
        truth(!CaptureJobRules.needsPreflight(recovered, operation, recovered, true));
        try { CaptureJobRules.needsPreflight(recovered, operation, "", false); throw new AssertionError("wrong operation"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { CaptureJobRules.needsPreflight(recovered, operation, recovered, false); throw new AssertionError("unverified recovery"); }
        catch (IllegalArgumentException expected) { checks++; }
        // Catch a straightened save using a different centre/crop offset from its preview.
        float[] straight = CaptureJobRules.imageTransform(1000, 800, 100, 200, 15);
        near(400, straight[0]*500+straight[1]*400+straight[2]);
        near(200, straight[3]*500+straight[4]*400+straight[5]);
        straight = CaptureJobRules.imageTransform(1000, 800, 100, 200, 0);
        near(1, straight[0]); near(0, straight[1]); near(-100, straight[2]); near(-200, straight[5]);
        straight = CaptureJobRules.imageTransform(1000, 800, 100, 200, 90);
        near(800, straight[2]); near(-300, straight[5]);
        // Catch an upload-only account being blocked by an unrelated denied notification reader.
        truth(CaptureJobRules.mayPoll("uploads", false, true, false, false));
        truth(!CaptureJobRules.mayPoll("notifications", false, true, false, false));
        truth(CaptureJobRules.mayPoll("uploads", false, false, true, false));
        truth(CaptureJobRules.mayPoll("uploads", true, false, false, false));
        truth(CaptureJobRules.mayPoll("notifications", false, false, false, true));
        truth(!CaptureJobRules.mayPoll("uploads", false, false, false, true));
        truth(!CaptureJobRules.mayPoll("uploads", false, false, false, false));
        // Catch cold-start cleanup deleting a fresh output before restored RESULT_OK delivery.
        truth(!CaptureJobRules.discardScanTemp(false, 100000000, 100000001));
        truth(CaptureJobRules.discardScanTemp(false, 100000000, 186400000));
        truth(!CaptureJobRules.discardScanTemp(false, 200000000, 100000000));
        truth(!CaptureJobRules.discardScanTemp(false, 0, 200000000));
        truth(CaptureJobRules.discardScanTemp(true, 100000000, 100000001));
        // Catch broad cleanup deleting unrelated cache files, and root source leaks.
        truth(CaptureJobRules.isScanTemp("scan-source-187624312.img", true));
        truth(CaptureJobRules.isScanTemp("scan-source-aB9_-7.img", true));
        truth(!CaptureJobRules.isScanTemp("scan-source-187624312.img.backup", true));
        truth(!CaptureJobRules.isScanTemp("../scan-source-187624312.img", true));
        truth(CaptureJobRules.isScanTemp("58c3f210-e901-49aa-a5dc-694b16200abe.jpg", false));
        truth(!CaptureJobRules.isScanTemp("scan-source-187624312.img", false));
        truth(!CaptureJobRules.isScanTemp("58c3f210-e901-49aa-a5dc-694b16200abe.jpg", true));
        truth(!CaptureJobRules.isScanTemp("1-1-1-1-1.jpg", false));
        System.out.println("CaptureJobRules: " + checks + " checks passed");
    }
}
