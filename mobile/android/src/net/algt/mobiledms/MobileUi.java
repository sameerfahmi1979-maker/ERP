package net.algt.mobiledms;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

final class MobileUi {
    private final LauncherActivity a;
    MobileUi(LauncherActivity activity) { a = activity; }

    private BackRegistration back;
    void systemBack(boolean wanted) {
        if (Build.VERSION.SDK_INT < 33) return;
        if (wanted && back == null) back = new BackRegistration(a);
        else if (!wanted && back != null) { back.remove(); back = null; }
    }

    @android.annotation.TargetApi(33)
    private static final class BackRegistration {
        final android.window.OnBackInvokedDispatcher dispatcher;
        final android.window.OnBackInvokedCallback callback;
        BackRegistration(LauncherActivity activity) {
            dispatcher = activity.getOnBackInvokedDispatcher();
            callback = activity::gestureBack;
            dispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback);
        }
        void remove() { dispatcher.unregisterOnBackInvokedCallback(callback); }
    }

    static void configureWindow(Activity activity) {
        Window window = activity.getWindow();
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false);
        else window.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility()
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    static void insets(View root, View footer) {
        final int left = root.getPaddingLeft(), top = root.getPaddingTop();
        final int right = root.getPaddingRight(), bottom = root.getPaddingBottom();
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int l, t, r, b;
            boolean keyboard;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
                l = Math.max(safe.left, ime.left); t = Math.max(safe.top, ime.top);
                r = Math.max(safe.right, ime.right); b = Math.max(safe.bottom, ime.bottom);
                keyboard = in.isVisible(WindowInsets.Type.ime());
            } else {
                l = in.getSystemWindowInsetLeft(); t = in.getSystemWindowInsetTop();
                r = in.getSystemWindowInsetRight(); b = in.getSystemWindowInsetBottom();
                keyboard = b > in.getStableInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && in.getDisplayCutout() != null) {
                    android.view.DisplayCutout cutout = in.getDisplayCutout();
                    l = Math.max(l, cutout.getSafeInsetLeft()); t = Math.max(t, cutout.getSafeInsetTop());
                    r = Math.max(r, cutout.getSafeInsetRight()); b = Math.max(b, cutout.getSafeInsetBottom());
                }
            }
            v.setPadding(left + l, top + t, right + r, bottom + b);
            if (footer != null) footer.setVisibility(keyboard ? View.GONE : View.VISIBLE);
            return in;
        });
    }

    Drawable surface(int fill, int stroke, boolean interactive) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill); shape.setCornerRadius(a.dp(8));
        if (stroke != 0) shape.setStroke(a.dp(1), stroke);
        return interactive ? new RippleDrawable(ColorStateList.valueOf(0x30115ea3), shape, null) : shape;
    }

    ImageButton icon(int drawable, String label, Runnable action) {
        ImageButton button = new ImageButton(a);
        button.setImageResource(drawable);
        button.setImageTintList(ColorStateList.valueOf(a.getColor(R.color.erp_primary)));
        button.setBackground(surface(a.getColor(R.color.erp_panel), a.getColor(R.color.erp_primary), true));
        button.setMinimumWidth(a.dp(48));
        button.setMinimumHeight(a.dp(48));
        button.setContentDescription(label);
        button.setTooltipText(label);
        button.setFocusable(true);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    void header(MobileRoute.Visit visit, Runnable back) {
        LinearLayout header = a.row(a.root);
        header.setMinimumHeight(a.dp(52)); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(a.dp(16), a.dp(4), a.dp(12), a.dp(4));
        header.setBackgroundColor(a.getColor(R.color.erp_panel));
        ImageView logo = new ImageView(a);
        logo.setImageResource(R.drawable.mobile_dms_icon);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        header.addView(logo, new LinearLayout.LayoutParams(a.dp(40), a.dp(40)));
        TextView brand = a.text(a.getString(R.string.app_name), 17, a.getColor(R.color.erp_text), true);
        LinearLayout.LayoutParams flexible = new LinearLayout.LayoutParams(0, -2, 1);
        flexible.setMarginStart(a.dp(12)); header.addView(brand, flexible);
        if (visit.hasBack()) {
            Button button = a.button("Back", back, false);
            button.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_back, 0, 0, 0);
            header.addView(button);
        }
        if (visit.destination != null && a.profile != null && !visit.id.viewer()
                && visit.id != MobileRoute.Id.NOTIFICATION_CENTER) {
            ImageButton notifications = icon(R.drawable.action_notifications, "Notifications",
                () -> {
                    if (a.notificationReady())
                        a.communications.openNotifications(() -> a.mobile().destination(visit.destination));
                });
            LinearLayout.LayoutParams target = new LinearLayout.LayoutParams(a.dp(48), a.dp(48));
            target.setMarginStart(a.dp(8));
            header.addView(notifications, target);
            a.communications.bindNotificationButton(notifications);
        }
        divider(a.root);
    }

    private void divider(LinearLayout parent) {
        View rule = new View(a);
        rule.setBackgroundColor(a.getColor(R.color.erp_border));
        parent.addView(rule, new LinearLayout.LayoutParams(-1, a.dp(1)));
    }

    View footer(MobileRoute.Visit visit) {
        LinearLayout footer = a.column();
        footer.setBackgroundColor(a.getColor(R.color.erp_panel));
        divider(footer);
        HorizontalScrollView scroll = new HorizontalScrollView(a);
        scroll.setFillViewport(true);
        LinearLayout bar = new LinearLayout(a);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(a.dp(4), a.dp(4), a.dp(4), a.dp(4));
        scroll.addView(bar); footer.addView(scroll);
        for (MobileRoute.Destination item : MobileRoute.Destination.values()) {
            if (!a.mobile().offers(item)) continue;
            String label;
            int icon;
            switch (item) {
                case HOME: label="Home"; icon=R.drawable.nav_home; break;
                case DOCUMENTS: label="Docs"; icon=R.drawable.nav_documents; break;
                case HR: label="HR"; icon=R.drawable.nav_hr; break;
                case INBOX: label="Inbox"; icon=R.drawable.nav_inbox; break;
                default: label="More"; icon=R.drawable.nav_more;
            }
            boolean selected = visit.destination == item;
            Button tab = a.button(label, () -> a.navigate(visit, item), false);
            tab.setSelected(selected);
            tab.setTextSize(13);
            tab.setTextColor(a.getColor(selected ? R.color.erp_primary : R.color.erp_text_secondary));
            tab.setContentDescription(item == MobileRoute.Destination.DOCUMENTS ? "Documents" : label);
            tab.setMinWidth(a.dp(52)); tab.setMinimumWidth(a.dp(52));
            tab.setPadding(a.dp(6), a.dp(4), a.dp(6), a.dp(4));
            tab.setCompoundDrawablesWithIntrinsicBounds(0,icon,0,0);
            tab.setCompoundDrawableTintList(ColorStateList.valueOf(tab.getCurrentTextColor()));
            tab.setBackground(surface(a.getColor(selected ? R.color.erp_primary_surface : R.color.erp_panel),
                selected ? a.getColor(R.color.erp_primary) : 0, true));
            bar.addView(tab, new LinearLayout.LayoutParams(-2, -2, 1));
        }
        a.root.addView(footer);
        return footer;
    }
}
