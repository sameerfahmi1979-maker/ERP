package net.algt.mobiledms;

import android.annotation.TargetApi;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityNodeProvider;
import android.view.inputmethod.CompletionInfo;
import android.view.inputmethod.CorrectionInfo;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.HandwritingGesture;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.inputmethod.InputContentInfo;
import android.view.inputmethod.TextAttribute;
import android.widget.EditText;
import android.widget.SeekBar;
import java.util.List;
import java.util.WeakHashMap;
import java.util.concurrent.Executor;
import java.util.function.BooleanSupplier;
import java.util.function.IntConsumer;
import java.util.function.Predicate;
import static android.view.accessibility.AccessibilityNodeInfo.*;

/** Android input entry points that bypass the Activity's touch/key dispatcher. */
final class TrackedInput {
    private final BooleanSupplier admit;
    private final Predicate<View> publicCredentialButton;
    private final WeakHashMap<View, Boolean> trackedViews = new WeakHashMap<>();

    TrackedInput(BooleanSupplier admit) { this(admit, view -> false); }

    TrackedInput(BooleanSupplier admit, Predicate<View> publicCredentialButton) {
        this.admit = admit;
        this.publicCredentialButton = publicCredentialButton;
    }

    EditText textField(Context context) {
        EditText editor = new EditText(context) {
            @Override public InputConnection onCreateInputConnection(EditorInfo attributes) {
                InputConnection connection = super.onCreateInputConnection(attributes);
                if (connection == null) return null;
                BooleanSupplier currentEditor = () -> isAttachedToWindow() && hasFocus() && admit.getAsBoolean();
                if (Build.VERSION.SDK_INT >= 34) return new Api34EditConnection(connection, currentEditor);
                if (Build.VERSION.SDK_INT >= 33) return new Api33EditConnection(connection, currentEditor);
                return new EditConnection(connection, currentEditor);
            }
        };
        // Generated IDs continue to label fields. Android saved-instance state must never contain their text.
        editor.setSaveEnabled(false);
        editor.setSaveFromParentEnabled(false);
        return editor;
    }

    void watchAccessibility(View root) {
        trackTree(root);
        // Framework dialogs and scrolling lists can create controls during layout.
        ViewTreeObserver.OnGlobalLayoutListener layout = () -> trackTree(root);
        root.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View view) { view.getViewTreeObserver().addOnGlobalLayoutListener(layout); }
            @Override public void onViewDetachedFromWindow(View view) {
                view.getViewTreeObserver().removeOnGlobalLayoutListener(layout);
            }
        });
        if (root.isAttachedToWindow()) root.getViewTreeObserver().addOnGlobalLayoutListener(layout);
    }

    private void trackTree(View view) {
        if (!trackedViews.containsKey(view)) {
            AccessibilityNodeProvider provider = view.getAccessibilityNodeProvider();
            if (provider != null || view.isClickable() || view.isLongClickable() || view instanceof EditText || view instanceof SeekBar
                    || view.canScrollVertically(-1) || view.canScrollVertically(1)
                    || view.canScrollHorizontally(-1) || view.canScrollHorizontally(1)) {
                View.AccessibilityDelegate previous = Build.VERSION.SDK_INT >= 29 ? view.getAccessibilityDelegate() : null;
                view.setAccessibilityDelegate(new ActionDelegate(previous, provider));
                trackedViews.put(view, true);
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) trackTree(group.getChildAt(index));
        }
    }

    private boolean acceptAction(View host, int action) {
        boolean userInput = action == ACTION_CLICK || action == ACTION_LONG_CLICK || action == ACTION_SET_TEXT
            || action == ACTION_SET_SELECTION || action == ACTION_CUT || action == ACTION_COPY || action == ACTION_PASTE
            || action == ACTION_SCROLL_FORWARD || action == ACTION_SCROLL_BACKWARD
            || action == AccessibilityAction.ACTION_SET_PROGRESS.getId()
            || action == AccessibilityAction.ACTION_SCROLL_UP.getId() || action == AccessibilityAction.ACTION_SCROLL_DOWN.getId()
            || action == AccessibilityAction.ACTION_SCROLL_LEFT.getId() || action == AccessibilityAction.ACTION_SCROLL_RIGHT.getId();
        boolean publicCredentialClick = action == ACTION_CLICK && publicCredentialButton.test(host);
        return UserInputPolicy.mayApplyAccessibility(userInput, host.isAttachedToWindow(), publicCredentialClick, admit);
    }

    private final class ActionDelegate extends View.AccessibilityDelegate {
        private final View.AccessibilityDelegate previous;
        private final AccessibilityNodeProvider platformProvider;

        ActionDelegate(View.AccessibilityDelegate previous, AccessibilityNodeProvider platformProvider) {
            this.previous = previous == null ? new View.AccessibilityDelegate() : previous;
            this.platformProvider = platformProvider;
        }

        @Override public boolean performAccessibilityAction(View host, int action, Bundle args) {
            return acceptAction(host, action) && previous.performAccessibilityAction(host, action, args);
        }
        @Override public AccessibilityNodeProvider getAccessibilityNodeProvider(View host) {
            AccessibilityNodeProvider provider = previous.getAccessibilityNodeProvider(host);
            if (provider == null) provider = platformProvider;
            if (provider == null) return null;
            AccessibilityNodeProvider original = provider;
            return new AccessibilityNodeProvider() {
                @Override public AccessibilityNodeInfo createAccessibilityNodeInfo(int node) { return original.createAccessibilityNodeInfo(node); }
                @Override public List<AccessibilityNodeInfo> findAccessibilityNodeInfosByText(String text, int node) {
                    return original.findAccessibilityNodeInfosByText(text, node);
                }
                @Override public AccessibilityNodeInfo findFocus(int focus) { return original.findFocus(focus); }
                @Override public void addExtraDataToAccessibilityNodeInfo(int node, AccessibilityNodeInfo info, String key, Bundle args) {
                    original.addExtraDataToAccessibilityNodeInfo(node, info, key, args);
                }
                @Override public boolean performAction(int node, int action, Bundle args) {
                    return acceptAction(host, action) && original.performAction(node, action, args);
                }
            };
        }
        @Override public void sendAccessibilityEvent(View host, int event) { previous.sendAccessibilityEvent(host, event); }
        @Override public void sendAccessibilityEventUnchecked(View host, AccessibilityEvent event) { previous.sendAccessibilityEventUnchecked(host, event); }
        @Override public boolean dispatchPopulateAccessibilityEvent(View host, AccessibilityEvent event) {
            return previous.dispatchPopulateAccessibilityEvent(host, event);
        }
        @Override public void onPopulateAccessibilityEvent(View host, AccessibilityEvent event) { previous.onPopulateAccessibilityEvent(host, event); }
        @Override public void onInitializeAccessibilityEvent(View host, AccessibilityEvent event) { previous.onInitializeAccessibilityEvent(host, event); }
        @Override public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
            previous.onInitializeAccessibilityNodeInfo(host, info);
        }
        @Override public void addExtraDataToAccessibilityNodeInfo(View host, AccessibilityNodeInfo info, String key, Bundle args) {
            previous.addExtraDataToAccessibilityNodeInfo(host, info, key, args);
        }
        @Override public boolean onRequestSendAccessibilityEvent(ViewGroup host, View child, AccessibilityEvent event) {
            return previous.onRequestSendAccessibilityEvent(host, child, event);
        }
    }

    private static class EditConnection extends InputConnectionWrapper {
        private final BooleanSupplier admit;

        EditConnection(InputConnection target, BooleanSupplier admit) {
            super(target, false);
            this.admit = admit;
        }

        final boolean edit() { return UserInputPolicy.mayApply(true, admit); }
        @Override public boolean commitText(CharSequence text, int cursor) { return edit() && super.commitText(text, cursor); }
        @Override public boolean setComposingText(CharSequence text, int cursor) { return edit() && super.setComposingText(text, cursor); }
        @Override public boolean deleteSurroundingText(int before, int after) { return edit() && super.deleteSurroundingText(before, after); }
        @Override public boolean deleteSurroundingTextInCodePoints(int before, int after) {
            return edit() && super.deleteSurroundingTextInCodePoints(before, after);
        }
        @Override public boolean commitCompletion(CompletionInfo completion) { return edit() && super.commitCompletion(completion); }
        @Override public boolean commitCorrection(CorrectionInfo correction) { return edit() && super.commitCorrection(correction); }
        @Override public boolean commitContent(InputContentInfo content, int flags, Bundle options) {
            return edit() && super.commitContent(content, flags, options);
        }
        @Override public boolean performEditorAction(int action) { return edit() && super.performEditorAction(action); }
        @Override public boolean performContextMenuAction(int action) { return edit() && super.performContextMenuAction(action); }
        @Override public boolean sendKeyEvent(KeyEvent event) { return edit() && super.sendKeyEvent(event); }
    }

    @TargetApi(33)
    private static class Api33EditConnection extends EditConnection {
        Api33EditConnection(InputConnection target, BooleanSupplier admit) { super(target, admit); }

        @Override public boolean commitText(CharSequence text, int cursor, TextAttribute attributes) {
            return edit() && super.commitText(text, cursor, attributes);
        }
        @Override public boolean setComposingText(CharSequence text, int cursor, TextAttribute attributes) {
            return edit() && super.setComposingText(text, cursor, attributes);
        }
    }

    @TargetApi(34)
    private static final class Api34EditConnection extends Api33EditConnection {
        Api34EditConnection(InputConnection target, BooleanSupplier admit) { super(target, admit); }

        @Override public boolean replaceText(int start, int end, CharSequence text, int cursor, TextAttribute attributes) {
            return edit() && super.replaceText(start, end, text, cursor, attributes);
        }

        @Override public void performHandwritingGesture(HandwritingGesture gesture, Executor executor, IntConsumer consumer) {
            UserInputPolicy.performEditingGesture(this::edit,
                () -> super.performHandwritingGesture(gesture, executor, consumer), executor,
                consumer == null ? null : () -> consumer.accept(HANDWRITING_GESTURE_RESULT_CANCELLED));
        }
    }
}
