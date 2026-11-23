package net.algt.mobiledms;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.ActivityResult;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

final class PlayUpdates {
    enum Action { IMMEDIATE, LISTING, UP_TO_DATE }

    private PlayUpdates() {}

    static void check(Activity activity) {
        AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
        manager.getAppUpdateInfo()
                .addOnSuccessListener(activity, info -> handleCheck(activity, manager, info))
                .addOnFailureListener(activity, error -> openListing(activity));
    }

    static void resumeIfNeeded(Activity activity) {
        AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
        manager.getAppUpdateInfo().addOnSuccessListener(activity, info -> {
            AppUpdateOptions options = AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE);
            if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
                    && info.isUpdateTypeAllowed(options)) {
                startUpdate(activity, manager, info, options, false);
            }
        });
    }

    static Action decide(int availability, boolean immediateAllowed) {
        if (availability == UpdateAvailability.UPDATE_NOT_AVAILABLE) return Action.UP_TO_DATE;
        if ((availability == UpdateAvailability.UPDATE_AVAILABLE
                || availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS)
                && immediateAllowed) return Action.IMMEDIATE;
        return Action.LISTING;
    }

    private static void handleCheck(Activity activity, AppUpdateManager manager, AppUpdateInfo info) {
        AppUpdateOptions options = AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE);
        switch (decide(info.updateAvailability(), info.isUpdateTypeAllowed(options))) {
            case IMMEDIATE:
                startUpdate(activity, manager, info, options, true);
                break;
            case LISTING:
                openListing(activity);
                break;
            case UP_TO_DATE:
                show(activity, "Google Play reports that this app is up to date.");
                break;
        }
    }

    private static void startUpdate(Activity activity, AppUpdateManager manager, AppUpdateInfo info,
                                    AppUpdateOptions options, boolean manual) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        manager.startUpdateFlow(info, activity, options)
                .addOnSuccessListener(activity, result -> {
                    if (result == ActivityResult.RESULT_IN_APP_UPDATE_FAILED) showLaunchFailure(activity, manual);
                })
                .addOnFailureListener(activity, error -> showLaunchFailure(activity, manual));
    }

    private static void showLaunchFailure(Activity activity, boolean manual) {
        if (manual) {
            openListing(activity);
        } else {
            show(activity, "Google Play could not resume the update. Check for an update again.");
        }
    }

    private static void openListing(Activity activity) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        Uri marketListing = Uri.parse("market://details").buildUpon()
                .appendQueryParameter("id", activity.getPackageName()).build();
        Intent play = new Intent(Intent.ACTION_VIEW, marketListing).setPackage("com.android.vending");
        try {
            activity.startActivity(play);
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            Uri webListing = Uri.parse("https://play.google.com/store/apps/details").buildUpon()
                    .appendQueryParameter("id", activity.getPackageName()).build();
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, webListing));
            } catch (ActivityNotFoundException | SecurityException blocked) {
                show(activity, "Google Play is unavailable on this device.");
            }
        }
    }

    private static void show(Activity activity, String message) {
        if (!activity.isFinishing() && !activity.isDestroyed()) {
            Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
        }
    }
}
