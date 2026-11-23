package net.algt.mobiledms;

import android.graphics.PixelFormat;
import android.provider.Settings;
import android.view.*;
import android.widget.Button;

/** Optional, non-focusable Talk-only window; it never requests a keyguard dismissal. */
final class PttOverlay {
    private final PttService service;
    private final WindowManager windows;
    private Button control;
    PttOverlay(PttService s) { service=s; windows=s.getSystemService(WindowManager.class); }
    static final class Gesture implements View.OnTouchListener,View.OnAttachStateChangeListener,View.OnKeyListener {
        final PttService service;
        private final java.util.function.BooleanSupplier allowed;
        private PttState.Hold held;
        private int pointer = -1;
        Gesture(Button button,PttService service,java.util.function.BooleanSupplier allowed) {
            this.service=service; this.allowed=allowed;
            button.setOnTouchListener(this); button.setOnKeyListener(this); button.addOnAttachStateChangeListener(this);
        }
        private void down() {
            if (!allowed.getAsBoolean() || held!=null || service.state.hold!=null) return;
            service.press(); held=service.state.hold;
        }
        void end(boolean complete) {
            if (held!=null && held==service.state.hold) service.release(complete);
            held=null; pointer=-1;
        }
        public boolean onTouch(View v,MotionEvent e) {
            switch(e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    pointer=e.getPointerId(0); down(); v.setPressed(true);
                    v.getParent().requestDisallowInterceptTouchEvent(true); return true;
                case MotionEvent.ACTION_MOVE:
                    int i=e.findPointerIndex(pointer);
                    if (i<0 || e.getX(i)<0 || e.getY(i)<0 || e.getX(i)>=v.getWidth() || e.getY(i)>=v.getHeight()) {
                        end(false); v.setPressed(false);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    end(allowed.getAsBoolean()); v.setPressed(false); v.performClick(); return true;
                case MotionEvent.ACTION_POINTER_UP:
                    if(e.getPointerId(e.getActionIndex())==pointer) {end(false);v.setPressed(false);} return true;
                case MotionEvent.ACTION_CANCEL: end(false); v.setPressed(false); return true;
                default: return true;
            }
        }
        public boolean onKey(View v,int code,KeyEvent event) {
            if(code!=KeyEvent.KEYCODE_ENTER && code!=KeyEvent.KEYCODE_DPAD_CENTER && code!=KeyEvent.KEYCODE_SPACE) return false;
            if(event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0) down();
            if(event.getAction()==KeyEvent.ACTION_UP) end(!event.isCanceled() && allowed.getAsBoolean());
            return true;
        }
        public void onViewDetachedFromWindow(View v) { end(false); }
        public void onViewAttachedToWindow(View v) {}
    }
    void update() {
        if (!PttService.prefs(service).getBoolean("overlay",false) || !Settings.canDrawOverlays(service)
            || !service.liveControls() || service.state.name.isEmpty()) { close(); return; }
        if(control==null) {
            Button button=new Button(service);
            button.setAllCaps(false); button.setFilterTouchesWhenObscured(true);
            button.setMinHeight(Math.round(56*service.getResources().getDisplayMetrics().density));
            new Gesture(button,service,service::liveControls);
            WindowManager.LayoutParams params=new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
            params.gravity=Gravity.END|Gravity.CENTER_VERTICAL;
            try { windows.addView(button,params); control=button; }
            catch (RuntimeException denied) { return; }
        }
        control.setText("Hold to talk\n"+service.display());
        control.setEnabled(service.state.hold!=null || service.canTalk());
    }
    void close() {
        if(control!=null) { try { windows.removeViewImmediate(control); } catch(IllegalArgumentException ignored) {} control=null; }
    }
}
