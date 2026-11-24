package net.algt.mobiledms;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ChatPilotRefreshTest {
    @Test public void idlePilotHasNoNetworkTimers() {
        assertEquals(0, ChatWorkspace.pollDelay(true, 12_000));
        assertEquals(0, ChatWorkspace.pollDelay(true, 20_000));
        assertEquals(12_000, ChatWorkspace.pollDelay(false, 12_000));
        assertEquals(20_000, ChatWorkspace.pollDelay(false, 20_000));
    }

    @Test public void coalescesForegroundAndReconnectWithoutSwallowingManualRefresh() {
        ChatWorkspace.PilotRefresh refresh = new ChatWorkspace.PilotRefresh();
        assertTrue(refresh.begin(100, true, false));
        assertFalse(refresh.begin(101, true, true));
        refresh.complete(true, true);
        assertFalse(refresh.begin(200, true, true));
        assertTrue(refresh.begin(201, true, false));
        refresh.complete(true, true);
        refresh.suspend();
        assertTrue(refresh.begin(202, true, true));
    }

    @Test public void rowsExpireLocallyWithoutLosingApprovedOfflineAccess() {
        ChatWorkspace.PilotRefresh refresh = new ChatWorkspace.PilotRefresh();
        assertTrue(refresh.begin(100, true, false));
        refresh.complete(true, true);
        assertTrue(refresh.visible(60_099, true));
        assertFalse(refresh.visible(60_100, true));
        assertTrue(refresh.visible(60_100, false));
        assertTrue(refresh.begin(60_100, true, false));
        refresh.complete(false, true);
        assertFalse(refresh.visible(60_101, true));
        assertFalse(refresh.visible(60_101, false));
    }

    @Test public void offlineHistoryCannotBeReusedOnReconnect() {
        ChatWorkspace.PilotRefresh refresh = new ChatWorkspace.PilotRefresh();
        assertTrue(refresh.begin(100, false, true));
        refresh.complete(true, false);
        assertTrue(refresh.visible(101, false));
        assertFalse(refresh.visible(101, true));
        assertTrue(refresh.begin(101, true, true));
    }

    @Test public void reconnectAfterAnOfflineCacheMissStillGetsAFreshAttempt() {
        ChatWorkspace.PilotRefresh refresh = new ChatWorkspace.PilotRefresh();
        assertTrue(refresh.begin(100, false, true));
        assertFalse(refresh.begin(101, true, true));
        refresh.complete(false, false);
        assertTrue(refresh.begin(102, true, true));
        assertFalse(refresh.visible(103, true));
    }

    @Test public void presenceDoesNotRetryOnEveryKeystrokeOrDuplicateTap() {
        ChatWorkspace.PilotRefresh refresh = new ChatWorkspace.PilotRefresh();
        assertTrue(refresh.beginActivity(100));
        assertFalse(refresh.beginActivity(200));
        refresh.suspend();
        assertFalse(refresh.beginActivity(30_099));
        assertTrue(refresh.beginActivity(30_100));
    }
}
