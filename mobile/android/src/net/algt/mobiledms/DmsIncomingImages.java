package net.algt.mobiledms;
import java.util.*;
import java.io.IOException;

/** Mode selection owns the ordered group Android supplied. Consumers receive the same originals. */
final class DmsIncomingImages {
    interface Consumer<T>{void take(List<T> original)throws Exception;}
    static <T> void consume(List<T> original,boolean allImages,boolean asOnePdf,Consumer<T> pages,Consumer<T> separate)throws Exception{
        if(original==null||original.isEmpty()||original.size()>10||asOnePdf&&!allImages)throw new IOException("Choose an available upload mode.");
        List<T> ordered=Collections.unmodifiableList(new ArrayList<>(original));
        if(asOnePdf)pages.take(ordered);else separate.take(ordered);
    }
}
