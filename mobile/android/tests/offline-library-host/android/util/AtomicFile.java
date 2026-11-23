package android.util;
import java.io.File;
public class AtomicFile {
    final File file;
    public AtomicFile(File file){ this.file=file; }
    public File getBaseFile(){ return file; }
    public void delete(){ file.delete(); }
}
