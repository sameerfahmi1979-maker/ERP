package android.content;
public final class SharedPreferences {
    public boolean getBoolean(String key,boolean fallback){return fallback;}
    public String getString(String key,String fallback){return fallback;}
    public long getLong(String key,long fallback){return fallback;}
}
