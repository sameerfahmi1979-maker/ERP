package net.algt.mobiledms;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** Account ownership is independent of a refreshable ERP token and of the optional UI lock. */
final class LocalSecurity {
    static final Object STORAGE_LOCK = new Object();
    private static final long LOCK_DISABLED = -1;
    private static final String PREFERENCES = "mobile-local-security";
    private static final String KEY_PREFIX = "algt-mobile-dms-account-";
    private static final InactivityLease LEASE = new InactivityLease();
    private static Context application;

    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE); }
    static void bind(Context context) { application = context.getApplicationContext(); }
    static Context context() throws IOException {
        if (application == null) throw new IOException("Open the signed-in account before accessing its local files.");
        return application;
    }
    static void activateAccount(Context context, String user) throws IOException {
        synchronized (STORAGE_LOCK) {
            application = context.getApplicationContext();
            String account = LeasePolicy.account(user);
            SharedPreferences prefs = preferences(context);
            String previous = prefs.getString("account", "");
            if (!account.equals(previous)) {
                if (!previous.isEmpty()) OfflineDocuments.requireCredentialSignIn(context, previous);
                purgeTemps(context);
                synchronized (LEASE) {
                    LEASE.reset();
                    if (!prefs.edit().putString("account", account).putLong("generation", generation(context) + 1).commit())
                        throw new IOException("The phone could not activate this local account.");
                }
            }
        }
    }
    static void deactivateAccount(Context context, String user) throws IOException {
        synchronized (STORAGE_LOCK) {
            if (!isAccount(context, user)) return;
            synchronized (LEASE) {
                LEASE.reset();
                if (!preferences(context).edit().remove("account").putLong("generation", generation(context) + 1).commit())
                    throw new IOException("The phone could not close this local account.");
            }
            purgeTemps(context);
        }
    }
    static long generation(Context context) { return preferences(context).getLong("generation", 0); }
    /** Lock-free identity snapshot for UI entry points; never waits for a network/session monitor. */
    static String currentAccount(Context context) {
        try { return LeasePolicy.account(preferences(context).getString("account", "")); }
        catch (IOException | RuntimeException error) { return ""; }
    }
    static boolean isAccount(Context context, String user) {
        try { return LeasePolicy.account(user).equals(preferences(context).getString("account", "")); }
        catch (IOException error) { return false; }
    }
    static void requireAccount(Context context, String user, long generation) throws IOException {
        if (!isAccount(context, user) || generation != generation(context)) throw new IOException("This local copy belongs to a closed ERP account. Open the current account again.");
    }
    static void requireAccount(Context context, String user) throws IOException { requireAccount(context, user, generation(context)); }
    static boolean enabled(Context context) { return preferences(context).getBoolean("appLock", false); }
    static boolean unlocked(Context context) { return remaining(context, null, false) != 0; }
    static long remaining(Context context, String account, boolean userInteraction) {
        synchronized (LEASE) {
            if (!enabled(context)) return LOCK_DISABLED;
            if (account != null && !isAccount(context, account)) return 0;
            long generation = generation(context);
            long now = SystemClock.elapsedRealtime();
            return userInteraction ? LEASE.interact(generation, now) : LEASE.remaining(generation, now);
        }
    }
    static boolean acceptsExternalResult(Context context, ExternalResultFence fence) {
        synchronized (LEASE) {
            return fence.allows(currentAccount(context), generation(context), remaining(context, fence.owner, false) != 0);
        }
    }
    static void lock(Context context) { synchronized (LEASE) { LEASE.reset(); } }
    static void requireUnlocked(Context context) throws IOException { if (!unlocked(context)) throw new IOException("Unlock the app to open your offline library."); }
    static void setEnabled(Context context, boolean enabled) throws IOException {
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        if (enabled && (keyguard == null || !keyguard.isDeviceSecure())) throw new IOException("Set a screen lock in Android Settings before enabling app lock.");
        synchronized (LEASE) {
            boolean wasEnabled = enabled(context);
            if (!enabled && wasEnabled && !unlocked(context)) throw new IOException("Unlock the app before turning off its app lock.");
            if (!preferences(context).edit().putBoolean("appLock", enabled).commit()) throw new IOException("The phone could not save the app-lock setting.");
            if (wasEnabled != enabled) LEASE.reset();
        }
    }
    static void unlock(Activity activity, int requestCode) throws IOException {
        KeyguardManager keyguard = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard == null || !keyguard.isDeviceSecure()) throw new IOException("Configure the Android device screen lock to unlock this app.");
        Intent intent = keyguard.createConfirmDeviceCredentialIntent("Unlock ALGT ERP System", "Confirm your device screen lock to open your private documents.");
        if (intent == null) throw new IOException("Android could not open device credential verification.");
        activity.startActivityForResult(intent, requestCode);
    }
    static boolean confirmed(Context context, String account, long generation, int resultCode) {
        synchronized (LEASE) {
            boolean success = resultCode == Activity.RESULT_OK && enabled(context)
                && isAccount(context, account) && generation == generation(context);
            return LEASE.confirmed(success, generation, SystemClock.elapsedRealtime());
        }
    }

    private static SecretKey key(String user) throws Exception {
        String alias = KEY_PREFIX + LeasePolicy.account(user);
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private static String aad(String user, String purpose) throws IOException { return "ALGT-DMS-1:" + LeasePolicy.account(user) + ":" + purpose; }
    static EncryptedFiles.Info seal(Context context, String user, String purpose, File source, File destination, long max) throws IOException {
        try (InputStream input = new FileInputStream(source)) { return seal(context, user, purpose, input, destination, max); }
    }
    static EncryptedFiles.Info seal(Context context, String user, String purpose, InputStream input, File destination, long max) throws IOException {
        synchronized (STORAGE_LOCK) {
            requireAccount(context, user);
            AtomicFile atomic = new AtomicFile(destination);
            FileOutputStream output = atomic.startWrite();
            try {
                EncryptedFiles.Info info = EncryptedFiles.encrypt(input, output, key(user), aad(user, purpose), max);
                atomic.finishWrite(output); return info;
            } catch (Exception error) { atomic.failWrite(output); throw io("The phone could not securely save this file.", error); }
        }
    }
    static EncryptedFiles.Info unseal(Context context, String user, String purpose, File source, File destination, long max) throws IOException {
        synchronized (STORAGE_LOCK) {
            requireAccount(context, user);
            AtomicFile target = new AtomicFile(destination);
            FileOutputStream output = target.startWrite();
            try (InputStream input = new AtomicFile(source).openRead()) {
                EncryptedFiles.Info info = EncryptedFiles.decrypt(input, output, key(user), aad(user, purpose), max);
                target.finishWrite(output); return info;
            } catch (Exception error) { target.failWrite(output); target.delete(); throw io("The local encrypted file could not be opened.", error); }
        }
    }
    static void unsealScoped(Context c,String account,String purpose,File encrypted,File destination,java.util.function.BooleanSupplier allowed)throws Exception {
        synchronized(STORAGE_LOCK){
            requireAccount(c,account);DmsArchive.check(allowed.getAsBoolean());
            try(InputStream in=new AtomicFile(encrypted).openRead();java.io.OutputStream out=DmsArchive.bounded(DmsArchive.existing(destination),ErpApi.MAX_FILE,allowed)){
                EncryptedFiles.decrypt(in,out,key(account),aad(account,purpose),ErpApi.MAX_FILE);DmsArchive.check(allowed.getAsBoolean());
            }catch(Exception e){destination.delete();throw e;}
        }
    }

    static JSONObject readJson(Context context, String user, String purpose, AtomicFile source, boolean migratePlain) throws Exception {
        synchronized (STORAGE_LOCK) {
            requireAccount(context, user);
            byte[] bytes;
            try (InputStream input = source.openRead()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (EncryptedFiles.sealed(source.getBaseFile())) EncryptedFiles.decrypt(input, output, key(user), aad(user, purpose), 2 * 1024 * 1024);
                else {
                    if (!migratePlain) throw new IOException("The encrypted metadata format is invalid.");
                    ErpApi.copy(input, output, 2 * 1024 * 1024);
                }
                bytes = output.toByteArray();
            } catch (FileNotFoundException error) {
                if (source.getBaseFile().exists()) throw error;
                return null;
            }
            JSONObject data = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (migratePlain && !EncryptedFiles.sealed(source.getBaseFile())) writeJson(context, user, purpose, source, data);
            return data;
        }
    }
    static void writeJson(Context context, String user, String purpose, AtomicFile destination, JSONObject data) throws IOException {
        byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
        try (InputStream input = new ByteArrayInputStream(bytes)) { seal(context, user, purpose, input, destination.getBaseFile(), 2 * 1024 * 1024); }
    }
    private static IOException io(String message, Exception error) { return error instanceof IOException ? (IOException) error : new IOException(message, error); }
    static File directory(File parent, String name) throws IOException {
        File folder = new File(parent, name);
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("The phone could not create its private storage folder.");
        return folder;
    }
    static void deleteTree(File target) throws IOException {
        if (!target.exists()) return;
        deleteTree(target, target.getCanonicalPath());
    }
    private static void deleteTree(File target, String root) throws IOException {
        String path = target.getCanonicalPath();
        if (!path.equals(root) && !path.startsWith(root + File.separator)) throw new IOException("Unsafe private-storage path.");
        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children == null) throw new IOException("Private storage could not be read.");
            for (File child : children) deleteTree(child, root);
        }
        if (!target.delete() && target.exists()) throw new IOException("The phone could not remove a private file.");
    }
    static void purgeTemps(Context context) throws IOException {
        deleteTree(new File(context.getCacheDir(), "offline-previews"));
        deleteTree(new File(context.getCacheDir(), "draft-work"));
    }
    static void clearAccount(Context context, String user) throws IOException {
        synchronized (STORAGE_LOCK) {
            String account = LeasePolicy.account(user);
            IOException failure = null;
            try { deactivateAccount(context, account); } catch (IOException error) { failure = error; }
            File retainedOffline = new File(new File(context.getNoBackupFilesDir(), "offline"), account);
            File retainedCommunications = new File(new File(context.getNoBackupFilesDir(), "communications"), account);
            // The sign-out hook purges timed copies before releasing the local account.
            if (!retainedOffline.exists() && !retainedCommunications.isDirectory()) {
                try { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(KEY_PREFIX + account); }
                catch (Exception error) { if (failure == null) failure = io("The phone could not remove this account's encryption key.", error); }
            }
            File[] directories = {new File(context.getNoBackupFilesDir(), account),
                new File(new File(context.getCacheDir(), "offline-previews"), account), new File(new File(context.getCacheDir(), "draft-work"), account)};
            for (File directory : directories) { try { deleteTree(directory); } catch (IOException error) { if (failure == null) failure = error; } }
            if (failure != null) throw failure;
        }
    }
}
