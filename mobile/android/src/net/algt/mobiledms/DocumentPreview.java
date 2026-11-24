package net.algt.mobiledms;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

final class DocumentPreview extends View {
    private static final float MIN_ZOOM = 1f;
    private static final float MAX_ZOOM = 6f;

    private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final RectF frame = new RectF();
    private final ScaleGestureDetector pinch;
    private Bitmap page;
    private float fit, zoom = MIN_ZOOM, left, top;
    private float lastX, lastY;
    private int dragPointer = -1;

    DocumentPreview(Context context, Bitmap page, String description) {
        super(context);
        this.page = page;
        setContentDescription(description);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        setBackgroundColor(context.getColor(R.color.erp_border));
        pinch = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector gesture) {
                scale(gesture.getScaleFactor(), gesture.getFocusX(), gesture.getFocusY());
                return true;
            }
        });
        pinch.setQuickScaleEnabled(false);
    }

    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        if (page == null) return;
        fit = Math.min((float) width / page.getWidth(), (float) height / page.getHeight());
        reset();
    }

    @Override protected void onDraw(Canvas canvas) {
        if (page == null) return;
        frame.set(left, top, left + page.getWidth() * fit * zoom, top + page.getHeight() * fit * zoom);
        canvas.drawBitmap(page, null, frame, paint);
    }

    void zoomBy(float factor) { scale(factor, getWidth() / 2f, getHeight() / 2f); }

    void reset() {
        zoom = MIN_ZOOM;
        left = top = 0;
        clamp();
    }

    private void scale(float factor, float x, float y) {
        if (page == null || fit <= 0 || !Float.isFinite(factor) || factor <= 0) return;
        float next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
        float ratio = next / zoom;
        left = x - (x - left) * ratio;
        top = y - (y - top) * ratio;
        zoom = next;
        clamp();
    }

    private void clamp() {
        if (page == null) return;
        left = bound(left, getWidth(), page.getWidth() * fit * zoom);
        top = bound(top, getHeight(), page.getHeight() * fit * zoom);
        invalidate();
    }

    static float bound(float position, float viewport, float content) {
        return content <= viewport ? (viewport - content) / 2f : Math.max(viewport - content, Math.min(0, position));
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        pinch.onTouchEvent(event);
        int index;
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                track(event, 0);
                return true;
            case MotionEvent.ACTION_POINTER_DOWN:
                dragPointer = -1;
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!pinch.isInProgress() && (index = event.findPointerIndex(dragPointer)) >= 0) {
                    float x = event.getX(index), y = event.getY(index);
                    left += x - lastX;
                    top += y - lastY;
                    lastX = x;
                    lastY = y;
                    clamp();
                }
                return true;
            case MotionEvent.ACTION_POINTER_UP:
                if (event.getPointerCount() == 2) track(event, event.getActionIndex() == 0 ? 1 : 0);
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                dragPointer = -1;
                return true;
            default:
                return true;
        }
    }

    private void track(MotionEvent event, int index) {
        dragPointer = event.getPointerId(index);
        lastX = event.getX(index);
        lastY = event.getY(index);
    }

    @Override protected void onDetachedFromWindow() {
        // The view owns its bitmap. Release the reference when replacing the page.
        page = null;
        super.onDetachedFromWindow();
    }
}
