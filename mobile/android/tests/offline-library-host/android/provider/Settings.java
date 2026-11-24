package android.provider;
import android.content.Context;
public class Settings {
    public static class Global {
        public static final String BOOT_COUNT="boots";
        public static int boot=1;
        public static int getInt(Context c,String key,int fallback){ return boot; }
    }
}
