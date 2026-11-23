package net.algt.mobiledms;

import com.google.android.play.core.install.model.UpdateAvailability;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static net.algt.mobiledms.PlayUpdates.Action.IMMEDIATE;
import static net.algt.mobiledms.PlayUpdates.Action.LISTING;
import static net.algt.mobiledms.PlayUpdates.Action.UP_TO_DATE;

public final class PlayUpdatesTest {
    @Test public void startsAllowedUpdate() {
        assertEquals(IMMEDIATE, PlayUpdates.decide(UpdateAvailability.UPDATE_AVAILABLE, true));
    }

    @Test public void resumesInterruptedImmediateUpdate() {
        assertEquals(IMMEDIATE, PlayUpdates.decide(UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS, true));
    }

    @Test public void opensListingForDisallowedOrUnknownUpdate() {
        assertEquals(LISTING, PlayUpdates.decide(UpdateAvailability.UPDATE_AVAILABLE, false));
        assertEquals(LISTING, PlayUpdates.decide(UpdateAvailability.UNKNOWN, false));
    }

    @Test public void displaysCurrentVersionOnlyWhenPlayConfirms() {
        assertEquals(UP_TO_DATE, PlayUpdates.decide(UpdateAvailability.UPDATE_NOT_AVAILABLE, false));
    }
}
