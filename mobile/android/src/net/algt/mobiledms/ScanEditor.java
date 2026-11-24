package net.algt.mobiledms;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.media.ExifInterface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A private, bounded-memory photo editor. The caller retains and removes the original. */
public final class ScanEditor extends Activity {
    public static final String EXTRA_OUTPUT_PATH = "net.algt.mobiledms.scan.output";
    public static final String EXTRA_ORIGINAL_PATH = "net.algt.mobiledms.scan.original";
    private static final String EXTRA_INPUT = "net.algt.mobiledms.scan.input";
    private static final String EXTRA_ACCOUNT = "net.algt.mobiledms.scan.account";
    private static final String EXTRA_GENERATION = "net.algt.mobiledms.scan.generation";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final TrackedInput trackedInput = new TrackedInput(this::admitUserInput);
    private final Handler lockHandler = new Handler(Looper.getMainLooper());
    private final Runnable lockCheck = () -> updateAppLock(false);
    private Bitmap image;
    private File original;
    private CropView preview;
    private TextView guidance;
    private Button save, rotate, reset, cancel;
    private SeekBar contrastControl, angleControl;
    private float contrast = 1, angle;
    private int turns;
    private String user;
    private long generation;
    private boolean active;
    private AlertDialog editorError;
    private volatile boolean destroyed, saving;
    private final RectF crop = new RectF(0, 0, 1, 1);

    public static Intent intent(Context context, File input) throws IOException {
        File safe = privateInput(context, input);
        String account = LocalSecurity.currentAccount(context);
        long generation = LocalSecurity.generation(context);
        LocalSecurity.requireAccount(context, account, generation);
        return new Intent(context, ScanEditor.class).putExtra(EXTRA_INPUT, safe.getPath())
            .putExtra(EXTRA_ACCOUNT, account).putExtra(EXTRA_GENERATION, generation);
    }

    /** Prune old abandoned outputs while preserving pending Activity results. */
    public static void purgeTemps(Context context) { purgeTemps(context, false); }

    /** all=true is reserved for logout/account cleanup with no active editor. */
    public static void purgeTemps(Context context, boolean all) {
        long now = System.currentTimeMillis();
        pruneScanFiles(context, new File(context.getCacheDir(), "scan-edits"), false, all, now);
        pruneScanFiles(context, context.getCacheDir(), true, all, now);
    }

    private static void pruneScanFiles(Context context, File directory, boolean sources, boolean all, long now) {
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (!CaptureJobRules.isScanTemp(file.getName(), sources)) continue;
            if (!CaptureJobRules.discardScanTemp(all, file.lastModified(), now)) continue;
            try {
                String cache = context.getCacheDir().getCanonicalPath();
                String expectedDirectory = sources ? cache : cache + File.separator + "scan-edits";
                File canonical = file.getCanonicalFile();
                if (canonical.isFile() && expectedDirectory.equals(canonical.getParent())
                    && expectedDirectory.equals(directory.getCanonicalPath())) canonical.delete();
            } catch (IOException ignored) { }
        }
    }

    private static File privateInput(Context context, File input) throws IOException {
        if (input == null) throw new IOException("Choose a photo first.");
        File file = input.getCanonicalFile();
        boolean inside = false;
        for (File root : new File[]{context.getCacheDir(), context.getFilesDir(), context.getNoBackupFilesDir()}) {
            inside |= file.getPath().startsWith(root.getCanonicalPath() + File.separator);
        }
        if (!inside || !file.isFile() || file.length() < 1 || file.length() > ErpApi.MAX_FILE) {
            throw new IOException("The selected photo is unavailable in the app's private storage.");
        }
        return file;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        MobileUi.configureWindow(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        setResult(RESULT_CANCELED);
        try {
            user = state == null ? getIntent().getStringExtra(EXTRA_ACCOUNT) : state.getString("account", getIntent().getStringExtra(EXTRA_ACCOUNT));
            generation = state == null ? getIntent().getLongExtra(EXTRA_GENERATION, -1) : state.getLong("generation", getIntent().getLongExtra(EXTRA_GENERATION, -1));
            if (user == null || generation < 0) throw new IOException("Missing scan account");
            if (state != null) {
                turns = state.getInt("turns", 0);
                contrast = state.getFloat("contrast", 1);
                angle = Math.max(-15, Math.min(15, state.getFloat("angle", 0)));
                float[] bounds = state.getFloatArray("crop");
                if (bounds != null && bounds.length == 4) crop.set(bounds[0], bounds[1], bounds[2], bounds[3]);
            }
            build();
            executor.execute(() -> {
                Bitmap loaded = null;
                boolean delivered = false;
                try {
                    LocalSecurity.requireAccount(this, user, generation);
                    LocalSecurity.requireUnlocked(this);
                    // Session construction takes the upload/session monitor. It must
                    // never run on the UI thread while a network operation owns it.
                    ErpApi api = new ErpApi(this);
                    if (destroyed || Thread.currentThread().isInterrupted()) return;
                    if (!CaptureJobRules.sameAccount(user, api.user(), generation, LocalSecurity.generation(this))) throw new IOException("Scan account changed");
                    final File input = privateInput(this, new File(getIntent().getStringExtra(EXTRA_INPUT)));
                    loaded = decode(input);
                    if (turns != 0) loaded = rotated(loaded, turns * 90);
                    final Bitmap ready = loaded;
                    final String quality = quality(ready);
                    LocalSecurity.requireAccount(this, user, generation);
                    LocalSecurity.requireUnlocked(this);
                    runOnUiThread(() -> {
                        if (destroyed || isFinishing() || updateAppLock(false)) {
                            ready.recycle();
                            return;
                        }
                        original = input;
                        image = ready;
                        guidance.setText(quality + "\nDrag a corner to crop. Check every edge and readable text before saving.");
                        setBusy(false);
                        preview.invalidate();
                    });
                    delivered = true;
                } catch (Exception | OutOfMemoryError error) {
                    runOnUiThread(() -> fail("This photo could not be opened for this account. Return to Upload, unlock the app, or choose a smaller photo."));
                } finally {
                    if (!delivered && loaded != null && !loaded.isRecycled()) loaded.recycle();
                }
            });
        } catch (Exception error) { fail("The photo is unavailable for this account. Return to Upload and try again."); }
    }

    private void build() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(12), dp(16), dp(12));
        root.setBackgroundColor(getColor(R.color.erp_surface));
        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        android.widget.ScrollView toolsScroll = new android.widget.ScrollView(this);
        toolsScroll.addView(controls);
        TextView title = new TextView(this);
        title.setText("Edit scanned page"); title.setTextSize(22); title.setTextColor(getColor(R.color.erp_text));
        root.addView(title);
        guidance = new TextView(this);
        guidance.setText("Opening private photo…"); guidance.setTextSize(14); guidance.setPadding(0, dp(8), 0, dp(8));
        controls.addView(guidance);
        preview = new CropView(this);
        preview.setContentDescription("Page preview. Drag any crop corner; drag inside to move the crop.");
        root.addView(preview, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout tools = new LinearLayout(this);
        rotate = button("Rotate 90°", tools); reset = button("Full page", tools);
        rotate.setOnClickListener(v -> {
            if (image == null || saving) return;
            try {
                image = rotated(image, 90); turns = (turns + 1) % 4;
                crop.set(0, 0, 1, 1); preview.invalidate();
            } catch (OutOfMemoryError error) { guidance.setText("The phone has limited memory. Save this page or choose a smaller photo."); }
        });
        reset.setOnClickListener(v -> { crop.set(0, 0, 1, 1); preview.invalidate(); });
        root.addView(toolsScroll, new LinearLayout.LayoutParams(-1, 0, 0.8f));
        controls.addView(tools);
        TextView angleLabel = new TextView(this); angleLabel.setTextSize(13);
        angleLabel.setText(String.format(java.util.Locale.ROOT, "Straighten: %.1f° (centre resets to 0°)", angle));
        controls.addView(angleLabel);
        angleControl = new SeekBar(this); angleControl.setMinimumHeight(dp(48)); angleControl.setContentDescription("Straighten scanned page"); angleControl.setMax(60); angleControl.setProgress(Math.round(angle * 2) + 30);
        angleControl.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (!UserInputPolicy.mayApply(fromUser, ScanEditor.this::admitUserInput)) return;
                angle = (value - 30) / 2f;
                angleLabel.setText(String.format(java.util.Locale.ROOT, "Straighten: %.1f° (centre resets to 0°)", angle));
                preview.invalidate();
            }
            public void onStartTrackingTouch(SeekBar bar) { }
            public void onStopTrackingTouch(SeekBar bar) { }
        });
        controls.addView(angleControl);
        TextView label = new TextView(this); label.setText("Contrast (left: softer · centre: original · right: stronger)");
        label.setTextSize(13); controls.addView(label);
        contrastControl = new SeekBar(this); contrastControl.setMinimumHeight(dp(48)); contrastControl.setContentDescription("Page contrast");
        contrastControl.setMax(150); contrastControl.setProgress(Math.round((contrast - .5f) * 100));
        contrastControl.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (!UserInputPolicy.mayApply(fromUser, ScanEditor.this::admitUserInput)) return;
                contrast = .5f + value / 100f;
                preview.invalidate();
            }
            public void onStartTrackingTouch(SeekBar bar) { }
            public void onStopTrackingTouch(SeekBar bar) { }
        });
        controls.addView(contrastControl);
        LinearLayout actions = new LinearLayout(this);
        cancel = button("Cancel", actions); save = button("Use edited page", actions);
        cancel.setOnClickListener(v -> finish()); save.setOnClickListener(v -> savePage());
        root.addView(actions);
        MobileUi.insets(root, null);
        setContentView(root);
        trackedInput.watchAccessibility(root);
        setBusy(true);
    }

    private Button button(String label, LinearLayout parent) {
        Button button = new Button(this); button.setText(label); button.setAllCaps(false);
        button.setSingleLine(false); button.setMaxLines(Integer.MAX_VALUE); button.setEllipsize(null);
        button.setMinHeight(dp(48)); button.setMinWidth(dp(48));
        parent.addView(button, new LinearLayout.LayoutParams(0, -2, 1)); return button;
    }

    private void setBusy(boolean busy) {
        if (save == null) return;
        save.setEnabled(!busy); rotate.setEnabled(!busy); reset.setEnabled(!busy);
        contrastControl.setEnabled(!busy); angleControl.setEnabled(!busy); preview.setEnabled(!busy); cancel.setEnabled(!saving);
    }

    private void savePage() {
        if (isFinishing() || updateAppLock(false) || image == null || saving) return;
        final int[] bounds;
        try { bounds = CaptureJobRules.crop(image.getWidth(), image.getHeight(), crop.left, crop.top, crop.right, crop.bottom); }
        catch (IllegalArgumentException error) { guidance.setText("Choose a larger, non-empty crop."); return; }
        saving = true; setBusy(true); guidance.setText("Saving edited page…");
        final Bitmap source = image;
        final float selectedContrast = contrast;
        final float selectedAngle = angle;
        executor.execute(() -> {
            Bitmap edited = null;
            File output = null;
            boolean delivered = false;
            try {
                LocalSecurity.requireAccount(this, user, generation);
                LocalSecurity.requireUnlocked(this);
                // One bounded output bitmap: crop and contrast are drawn together.
                edited = Bitmap.createBitmap(bounds[2], bounds[3], Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(edited);
                canvas.drawColor(Color.WHITE);
                Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
                paint.setColorFilter(filter(selectedContrast));
                Matrix transform = new Matrix();
                transform.setValues(CaptureJobRules.imageTransform(source.getWidth(), source.getHeight(), bounds[0], bounds[1], selectedAngle));
                canvas.drawBitmap(source, transform, paint);
                File directory = new File(getCacheDir(), "scan-edits");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Private scan storage unavailable");
                output = new File(directory, UUID.randomUUID().toString() + ".jpg");
                try (FileOutputStream stream = new FileOutputStream(output)) {
                    if (!edited.compress(Bitmap.CompressFormat.JPEG, 94, stream)) throw new IOException("Photo could not be saved");
                    stream.getFD().sync();
                }
                LocalSecurity.requireAccount(this, user, generation);
                if (destroyed) throw new IOException("Editor closed");
                final File result = output;
                runOnUiThread(() -> {
                    if (destroyed || isFinishing() || updateAppLock(false)) { result.delete(); return; }
                    setResult(RESULT_OK, new Intent().putExtra(EXTRA_OUTPUT_PATH, result.getPath()).putExtra(EXTRA_ORIGINAL_PATH, original.getPath()));
                    finish();
                });
                delivered = true;
            } catch (Exception | OutOfMemoryError error) {
                runOnUiThread(() -> {
                    if (destroyed || isFinishing() || updateAppLock(false)) return;
                    saving = false; setBusy(false);
                    guidance.setText("The edited photo could not be saved. Your original is still available. Try a smaller crop.");
                });
            } finally {
                if (edited != null) edited.recycle();
                if (!delivered && output != null) output.delete();
                if (destroyed && !source.isRecycled()) source.recycle();
            }
        });
    }

    private static Bitmap decode(File file) throws IOException {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true; BitmapFactory.decodeFile(file.getPath(), options);
        try { options.inSampleSize = CaptureJobRules.sampleSize(options.outWidth, options.outHeight, 2200, 3000000); }
        catch (IllegalArgumentException error) { throw new IOException("Unsupported photo", error); }
        options.inJustDecodeBounds = false; options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getPath(), options);
        if (bitmap == null) throw new IOException("Unsupported photo");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try { orientation = new ExifInterface(file.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, orientation); }
        catch (IOException ignored) { }
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(-90); matrix.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(-90); break;
            default: return bitmap;
        }
        Bitmap corrected = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        if (corrected != bitmap) bitmap.recycle(); return corrected;
    }

    private static Bitmap rotated(Bitmap original, int degrees) {
        Matrix matrix = new Matrix(); matrix.setRotate(degrees);
        Bitmap result = Bitmap.createBitmap(original, 0, 0, original.getWidth(), original.getHeight(), matrix, true);
        if (result != original) original.recycle(); return result;
    }

    private static ColorMatrixColorFilter filter(float amount) {
        float offset = 128 * (1 - amount);
        return new ColorMatrixColorFilter(new ColorMatrix(new float[]{amount,0,0,0,offset, 0,amount,0,0,offset,
            0,0,amount,0,offset, 0,0,0,1,0}));
    }

    private static String quality(Bitmap bitmap) {
        double sum = 0, square = 0, edges = 0; int samples = 0;
        int stepX = Math.max(1, bitmap.getWidth() / 64), stepY = Math.max(1, bitmap.getHeight() / 64);
        for (int y = 0; y < bitmap.getHeight(); y += stepY) {
            int previous = -1;
            for (int x = 0; x < bitmap.getWidth(); x += stepX) {
                int color = bitmap.getPixel(x, y);
                int light = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
                sum += light; square += light * light; samples++;
                if (previous >= 0) edges += Math.abs(light - previous);
                previous = light;
            }
        }
        double mean = sum / samples, spread = Math.sqrt(Math.max(0, square / samples - mean * mean));
        String hint = Math.min(bitmap.getWidth(), bitmap.getHeight()) < 700 ? "Low resolution: taking a closer photo may improve text." : "Check that the text is sharp and all page edges are visible.";
        if (mean < 65) hint += " The page looks dark; use more even light.";
        else if (mean > 240) hint += " The page is very bright; check for washed-out text.";
        if (spread < 24 || edges / samples < 3) hint += " Low detail or contrast detected; check focus or increase contrast.";
        return hint;
    }

    private void fail(String message) {
        if (destroyed || isFinishing() || updateAppLock(false)) return;
        editorError = new AlertDialog.Builder(this).setTitle("Cannot edit photo").setMessage(message)
            .setPositiveButton("Return to Upload", (dialog, which) -> finish()).setOnCancelListener(dialog -> finish()).show();
        if (editorError.getWindow() != null) trackedInput.watchAccessibility(editorError.getWindow().getDecorView());
    }

    @Override public void onSaveInstanceState(Bundle state) {
        state.putInt("turns", turns); state.putFloat("contrast", contrast); state.putFloat("angle", angle);
        state.putString("account", user); state.putLong("generation", generation);
        state.putFloatArray("crop", new float[]{crop.left, crop.top, crop.right, crop.bottom}); super.onSaveInstanceState(state);
    }

    @Override protected void onStart() {
        super.onStart();
        active = true;
        updateAppLock(false);
    }

    @Override protected void onResume() {
        super.onResume();
        updateAppLock(false);
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        admitUserInput();
    }

    private boolean admitUserInput() { return active && !destroyed && !isFinishing() && !updateAppLock(true); }

    private boolean updateAppLock(boolean userInteraction) {
        lockHandler.removeCallbacks(lockCheck);
        if (!active || destroyed || isFinishing()) return false;
        boolean current = LocalSecurity.isAccount(this, user) && generation == LocalSecurity.generation(this);
        long remaining = current ? LocalSecurity.remaining(this, user, userInteraction) : 0;
        if (remaining == 0) {
            closePrivateEditor();
            return true;
        }
        if (remaining > 0) lockHandler.postDelayed(lockCheck, remaining);
        return false;
    }

    private void closePrivateEditor() {
        if (preview != null) preview.setVisibility(View.INVISIBLE);
        if (editorError != null) editorError.dismiss();
        finish();
    }

    @Override public void onStop() {
        active = false;
        lockHandler.removeCallbacks(lockCheck);
        // Do not leave plaintext page previews in an unattended editor or recents task.
        if (!isChangingConfigurations() && !isFinishing()) closePrivateEditor();
        super.onStop();
    }

    @Override public void onDestroy() {
        lockHandler.removeCallbacks(lockCheck);
        if (editorError != null) editorError.dismiss();
        destroyed = true; executor.shutdownNow();
        if (!saving && image != null && !image.isRecycled()) image.recycle(); super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private final class CropView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final RectF shown = new RectF();
        private int handle = -1;
        private float lastX, lastY;
        CropView(Context context) { super(context); setBackgroundColor(Color.rgb(20, 31, 44)); }
        @Override protected void onDraw(Canvas canvas) {
            if (image == null || image.isRecycled()) return;
            float scale = Math.min((float) getWidth() / image.getWidth(), (float) getHeight() / image.getHeight());
            float w = image.getWidth() * scale, h = image.getHeight() * scale;
            shown.set((getWidth()-w)/2, (getHeight()-h)/2, (getWidth()+w)/2, (getHeight()+h)/2);
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.WHITE); canvas.drawRect(shown, paint);
            canvas.save(); canvas.clipRect(shown); canvas.translate(shown.left, shown.top); canvas.scale(scale, scale);
            Matrix transform = new Matrix(); transform.setValues(CaptureJobRules.imageTransform(image.getWidth(), image.getHeight(), 0, 0, angle));
            paint.setColorFilter(filter(contrast)); canvas.drawBitmap(image, transform, paint); paint.setColorFilter(null); canvas.restore();
            RectF r = screenCrop();
            paint.setColor(0x99000000);
            canvas.drawRect(shown.left, shown.top, shown.right, r.top, paint);
            canvas.drawRect(shown.left, r.bottom, shown.right, shown.bottom, paint);
            canvas.drawRect(shown.left, r.top, r.left, r.bottom, paint);
            canvas.drawRect(r.right, r.top, shown.right, r.bottom, paint);
            paint.setColor(Color.rgb(59, 219, 201)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(2)); canvas.drawRect(r, paint);
            paint.setStyle(Paint.Style.FILL);
            for (float x : new float[]{r.left,r.right}) for (float y : new float[]{r.top,r.bottom}) canvas.drawCircle(x,y,dp(7),paint);
        }
        private RectF screenCrop() { return new RectF(shown.left+crop.left*shown.width(),shown.top+crop.top*shown.height(),shown.left+crop.right*shown.width(),shown.top+crop.bottom*shown.height()); }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (!isEnabled() || image == null || shown.width() == 0 || shown.height() == 0) return false;
            float x = event.getX(), y = event.getY();
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                RectF r = screenCrop(); float hit = dp(40);
                if (Math.abs(x-r.left)<hit && Math.abs(y-r.top)<hit) handle=0;
                else if (Math.abs(x-r.right)<hit && Math.abs(y-r.top)<hit) handle=1;
                else if (Math.abs(x-r.right)<hit && Math.abs(y-r.bottom)<hit) handle=2;
                else if (Math.abs(x-r.left)<hit && Math.abs(y-r.bottom)<hit) handle=3;
                else if (r.contains(x,y)) handle=4; else return false;
                lastX=x; lastY=y; getParent().requestDisallowInterceptTouchEvent(true); return true;
            }
            if (event.getAction() == MotionEvent.ACTION_MOVE && handle>=0) {
                float dx=(x-lastX)/shown.width(), dy=(y-lastY)/shown.height();
                if (handle==4) { dx=Math.max(-crop.left,Math.min(1-crop.right,dx)); dy=Math.max(-crop.top,Math.min(1-crop.bottom,dy)); crop.offset(dx,dy); }
                else {
                    if (handle==0 || handle==3) crop.left=Math.max(0,Math.min(crop.right-.08f,crop.left+dx));
                    else crop.right=Math.min(1,Math.max(crop.left+.08f,crop.right+dx));
                    if (handle==0 || handle==1) crop.top=Math.max(0,Math.min(crop.bottom-.08f,crop.top+dy));
                    else crop.bottom=Math.min(1,Math.max(crop.top+.08f,crop.bottom+dy));
                }
                lastX=x; lastY=y; invalidate(); return true;
            }
            if (event.getAction()==MotionEvent.ACTION_UP || event.getAction()==MotionEvent.ACTION_CANCEL) { handle=-1; getParent().requestDisallowInterceptTouchEvent(false); performClick(); return true; }
            return handle>=0;
        }
        @Override public boolean performClick() { super.performClick(); return true; }
    }
}
