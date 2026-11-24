package android.content;
import java.util.HashMap;
public class SharedPreferences {
    final HashMap<String,Boolean> values=new HashMap<>();
    final HashMap<String,Integer> numbers=new HashMap<>();
    public int getInt(String key,int fallback){return numbers.getOrDefault(key,fallback);}
    public boolean getBoolean(String key,boolean fallback){ return values.getOrDefault(key,fallback); }
    public Editor edit(){ return new Editor(); }
    public class Editor {
        final HashMap<String,Boolean> patch=new HashMap<>();
        public Editor putInt(String key,int value){numbers.put(key,value); return this;}
        public void apply(){commit();}
        public Editor putBoolean(String key,boolean value){ patch.put(key,value); return this; }
        public Editor remove(String key){ patch.put(key,null); return this; }
        public boolean commit(){ patch.forEach((k,v)->{if(v==null)values.remove(k);else values.put(k,v);});return true; }
    }
}
