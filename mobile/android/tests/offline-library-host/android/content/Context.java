package android.content;
import java.io.File;
import android.app.KeyguardManager;
public class Context {
    public static final int MODE_PRIVATE=0;
    public static final String KEYGUARD_SERVICE="keyguard";
    public final KeyguardManager guard=new KeyguardManager();
    public final File root;
    public final SharedPreferences preferences=new SharedPreferences();
    public Context(File root){ this.root=root; }
    public Context getApplicationContext(){ return this; }
    public Object getSystemService(String name){ return guard; }
    public Context getContentResolver(){ return this; }
    public File getNoBackupFilesDir(){ return root; }
    public File getCacheDir(){ File cache=new File(root,"temp"); cache.mkdirs(); return cache; }
    public SharedPreferences getSharedPreferences(String key,int mode){ return preferences; }
}
