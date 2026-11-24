package net.algt.mobiledms;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONObject;

/** Host substitutes for Android Keystore, account preferences and authenticated ERP transport.
 * The encrypted-index, blob writer/reader, lease and reconciliation paths are the production classes. */
final class LocalSecurity {
    static final Object STORAGE_LOCK=new Object();
    static long generation;
    static boolean appLocked;
    static String active="";
    static final Map<String,SecretKey> keys=new HashMap<>();
    static void activate(Context c,String account) throws Exception {
        if(!active.equals(account)){
            if(!active.isEmpty()) OfflineDocuments.requireCredentialSignIn(c,active);
            active=account; generation++;
        }
    }
    static long generation(Context c){ return generation; }
    static void requireAccount(Context c,String user,long expected) throws IOException {
        if(!active.equals(user)||generation!=expected)throw new IOException("Closed account");
    }
    static void requireAccount(Context c,String user)throws IOException{requireAccount(c,user,generation);}
    static void deactivateAccount(Context c,String user)throws IOException{requireAccount(c,user);active="";generation++;}
    static void requireUnlocked(Context c)throws IOException { if(appLocked)throw new IOException("App locked"); }
    static File directory(File parent,String name)throws IOException{
        File folder=new File(parent,name); if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException(); return folder;
    }
    static void deleteTree(File file)throws IOException{
        if(file.isDirectory())for(File child:Objects.requireNonNull(file.listFiles()))deleteTree(child);
        Files.deleteIfExists(file.toPath());
    }
    static SecretKey key(String user)throws IOException{
        try{if(!keys.containsKey(user))keys.put(user,KeyGenerator.getInstance("AES").generateKey());return keys.get(user);}
        catch(Exception error){throw new IOException(error);}
    }
    static EncryptedFiles.Info seal(Context c,String user,String purpose,File source,File dest,long max)throws IOException{
        requireAccount(c,user);
        try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(dest)){
            return EncryptedFiles.encrypt(in,out,key(user),purpose,max);
        }
    }
    static EncryptedFiles.Info unseal(Context c,String user,String purpose,File source,File dest,long max)throws IOException{
        requireAccount(c,user);
        try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(dest)){
            return EncryptedFiles.decrypt(in,out,key(user),purpose,max);
        }
    }
    static JSONObject readJson(Context c,String user,String purpose,AtomicFile file,boolean migrate)throws Exception{
        requireAccount(c,user);
        if(!file.getBaseFile().exists())return null;
        ByteArrayOutputStream json=new ByteArrayOutputStream();
        try(InputStream in=new FileInputStream(file.getBaseFile())){EncryptedFiles.decrypt(in,json,key(user),purpose,2*1024*1024);}
        return new JSONObject(new String(json.toByteArray(),StandardCharsets.UTF_8));
    }
    static void writeJson(Context c,String user,String purpose,AtomicFile file,JSONObject value)throws IOException{
        requireAccount(c,user);
        try(InputStream in=new ByteArrayInputStream(value.toString().getBytes(StandardCharsets.UTF_8));OutputStream out=new FileOutputStream(file.getBaseFile())){
            EncryptedFiles.encrypt(in,out,key(user),purpose,2*1024*1024);
        }
    }
}
final class ErpApi {
    static final long MAX_FILE=52_428_800;
    static final class Rejected extends IOException {
        final int status; final JSONObject response;
        Rejected(int status){this.status=status;response=object("code",status==403?"permission_denied":"unavailable");}
    }
    static JSONObject object(Object... args){
        JSONObject result=new JSONObject();for(int i=0;i<args.length;i+=2)result.put((String)args[i],args[i+1]==null?JSONObject.NULL:args[i+1]);return result;
    }
    static String str(JSONObject obj,String key){return obj.isNull(key)?"":obj.optString(key,"");}
    String owner; JSONObject grant; IOException failure;
    ErpApi(String user){owner=user;}
    String user(){return owner;}
    long hrSessionEpoch(){return 10;}
    boolean signedIn(){return true;}
    JSONObject get(JSONObject command)throws Exception{
        if(failure!=null)throw failure;
        if(command.getInt("days")!=1||command.getInt("leaseVersion")!=2||command.getLong("fileId")!=grant.getLong("fileId")) throw new AssertionError("Invalid revalidation request");
        return grant;
    }
}
