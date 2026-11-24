package net.algt.mobiledms;

import org.junit.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;

public final class ChatManifestAuthorityTest {
    @Test public void authoritative403RemovesOnlyTheDeniedHistoryMode() throws IOException {
        List<String> purges = new ArrayList<>();
        ChatManifest.clearDeniedHistory("review", 403, "permission_denied", purges::add);
        ChatManifest.clearDeniedHistory("participant", 403, "permission_denied", purges::add);
        assertEquals(Arrays.asList("cache/review", "cache/participant"), purges);
    }

    @Test public void authoritative401RemovesTheAccountChatCacheWithoutTouchingDrafts() throws IOException {
        List<String> purges = new ArrayList<>();
        ChatManifest.clearDeniedHistory("review", 401, "unauthenticated", purges::add);
        assertEquals(Arrays.asList("cache"), purges);
    }

    @Test public void transportAndBudgetFailuresPreserveOfflineHistory() throws IOException {
        List<String> purges = new ArrayList<>();
        ChatManifest.clearDeniedHistory("review", 403, "", purges::add);
        ChatManifest.clearDeniedHistory("participant", 401, "", purges::add);
        ChatManifest.clearDeniedHistory("review", 503, "temporarily_unavailable", purges::add);
        assertEquals(0, purges.size());
    }
}
