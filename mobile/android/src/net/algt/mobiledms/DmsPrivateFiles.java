package net.algt.mobiledms;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.*;
import android.os.storage.StorageManager;
import android.provider.OpenableColumns;
import java.io.*;
import java.util.*;
import java.util.function.BooleanSupplier;

/** A grant is process local. Restart, expiry, account replacement and actual lock retire it. */
public final class DmsPrivateFiles extends ContentProvider {
    static final String AUTH="net.algt.mobiledms.scoped";
    private static final Map<String,Entry> entries=new HashMap<>();
    private static final Handler clock=new Handler(Looper.getMainLooper());
    interface Admission {void verify(ErpApi api,BooleanSupplier local)throws Exception;}
    private static final HandlerThread proxyThread=new HandlerThread("DMS private file delivery");
    static {proxyThread.start();}
    private static final Handler proxy=new Handler(proxyThread.getLooper());
    static final class Entry {
        final Context c;final ErpApi api;final String user,id,name,mime;final long epoch,generation,expiry;
        final File file;final boolean camera;volatile boolean published;
        volatile Admission admission;
        volatile java.util.function.LongSupplier admissionRemaining=()->-1L;
        private final Runnable timer=this::expire;
        void expire(){
            clock.removeCallbacks(timer);
            if(!valid()){remove();return;}
            long lease=LocalSecurity.remaining(c,user,false),scope=admissionRemaining.getAsLong(),ttl=expiry-SystemClock.elapsedRealtime();
            if(lease>0)ttl=Math.min(ttl,lease);
            if(scope>=0)ttl=Math.min(ttl,scope);
            clock.postDelayed(timer,Math.max(1,ttl));
        }
        void verifySource()throws Exception{
            try{
                DmsTransfer.local(this::valid);
                Admission check=admission;
                if(camera||check==null)throw new IOException("This file has no current export admission.");
                check.verify(api,this::valid);DmsTransfer.local(this::valid);
            }catch(Exception failure){remove();throw failure;}
        }
        Entry(Context c,ErpApi api,String name,String mime,boolean camera)throws IOException{
            this.c=c.getApplicationContext();this.api=api;this.name=name;this.mime=mime;this.camera=camera;
            user=api.user();epoch=api.sessionEpoch();generation=LocalSecurity.generation(c);expiry=SystemClock.elapsedRealtime()+3600000L;id=UUID.randomUUID().toString();
            DmsArchive.check(owner());File dir=LocalSecurity.directory(c.getCacheDir(),"dms-scoped");
            file=new File(dir,id);DmsArchive.check(file.createNewFile());
        }
        boolean owner(){return DmsRules.admitted(user,epoch,generation,api.user(),api.sessionEpoch(),LocalSecurity.generation(c),LocalSecurity.isAccount(c,user)&&LocalSecurity.remaining(c,user,false)!=0,SystemClock.elapsedRealtime(),expiry);}
        boolean valid(){synchronized(entries){return entries.get(id)==this&&owner()&&admissionRemaining.getAsLong()!=0;}}
        Uri uri(){return new Uri.Builder().scheme("content").authority(AUTH).appendPath(id).build();}
        void remove(){synchronized(entries){if(entries.get(id)!=this)return;clock.removeCallbacks(timer);entries.remove(id);file.delete();c.revokeUriPermission(uri(),Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}}
    }
    static Entry create(Context c,ErpApi api,String name,String mime,boolean camera,BooleanSupplier allowed)throws IOException{
        synchronized(entries){
            DmsArchive.check(allowed.getAsBoolean());Entry e=new Entry(c,api,name,mime,camera);entries.put(e.id,e);
            if(!allowed.getAsBoolean()||!e.owner()){e.remove();throw new IOException("Document selection expired.");}
            e.expire();return e;
        }
    }
    static void sweep(Context c,boolean clear){
        synchronized(entries){
            for(Entry e:new ArrayList<>(entries.values()))if(clear||!e.valid())e.remove();
            File dir=new File(c.getCacheDir(),"dms-scoped");File[] files=dir.listFiles();
            if(files!=null)for(File f:files)if(!entries.containsKey(f.getName()))f.delete();
        }
    }
    private Entry get(Uri uri)throws FileNotFoundException{
        synchronized(entries){
            Entry e=entries.get(uri.getLastPathSegment());
            if(e==null||!e.uri().equals(uri)||!e.published||!e.valid()){if(e!=null&&!e.valid())e.remove();throw new FileNotFoundException();}
            return e;
        }
    }
    private static void guard(Entry e)throws android.system.ErrnoException{if(!e.valid()){e.remove();throw new android.system.ErrnoException("Expired private document",android.system.OsConstants.EACCES);}}
    public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException{
        Entry e=get(u);boolean write=e.camera && ("w".equals(mode)||"rw".equals(mode)||"rwt".equals(mode));
        if(!write&&!"r".equals(mode))throw new FileNotFoundException();
        if(e.camera&&!write&&Binder.getCallingUid()!=android.os.Process.myUid())throw new FileNotFoundException();
        DmsTransfer.Open source=new DmsTransfer.Open(e::valid,e::verifySource,e::remove);
        try{
            if(!e.camera)source.open();
            RandomAccessFile f;
            synchronized(entries){if(!e.valid()||!e.file.isFile())throw new FileNotFoundException();f=new RandomAccessFile(e.file,write?"rw":"r");}
            try{return getContext().getSystemService(StorageManager.class).openProxyFileDescriptor(write?ParcelFileDescriptor.MODE_READ_WRITE:ParcelFileDescriptor.MODE_READ_ONLY,new ProxyFileDescriptorCallback(){
                public long onGetSize()throws android.system.ErrnoException{guard(e);return e.file.length();}
                public int onRead(long off,int size,byte[] data)throws android.system.ErrnoException{guard(e);try{if(write)throw new IOException("Camera write grant");if(!e.camera)source.firstRead();synchronized(f){f.seek(off);int n=f.read(data,0,size);guard(e);return Math.max(0,n);}}catch(Exception ex){throw new android.system.ErrnoException("read",5);}}
                public int onWrite(long off,int size,byte[] data)throws android.system.ErrnoException{guard(e);if(!write||off<0||off>DmsArchive.FILE_LIMIT-size)throw new android.system.ErrnoException("write",27);try{synchronized(f){f.seek(off);guard(e);f.write(data,0,size);return size;}}catch(IOException ex){throw new android.system.ErrnoException("write",5);}}
                public void onFsync()throws android.system.ErrnoException{guard(e);}
                public void onRelease(){try{f.close();}catch(IOException ignored){}}
            },proxy);}catch(Exception ex){f.close();throw ex;}
        }catch(Exception failure){throw new FileNotFoundException();}
    }
    public boolean onCreate(){sweep(getContext(),false);return true;}
    public String getType(Uri u){try{return get(u).mime;}catch(Exception e){return null;}}
    public Cursor query(Uri u,String[] cols,String sel,String[] args,String sort){try{
        Entry e=get(u);if(!e.camera)e.verifySource();if(cols==null)cols=new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE};
        MatrixCursor c=new MatrixCursor(cols);Object[] values=new Object[cols.length];for(int i=0;i<cols.length;i++)values[i]=OpenableColumns.DISPLAY_NAME.equals(cols[i])?e.name:OpenableColumns.SIZE.equals(cols[i])?e.file.length():null;c.addRow(values);return c;
    }catch(Exception ex){return null;}}
    public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
