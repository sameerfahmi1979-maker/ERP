package net.algt.mobiledms;
import java.io.*;
import java.security.*;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.zip.*;

final class DmsArchive {
    static final long LIMIT=104857600L,FILE_LIMIT=52428800L;
    static final class Member{
        final File file;final String name,hash; final long size;
        Member(File file,String name,long size,String hash){this.file=file;this.name=name;this.size=size;this.hash=hash;}
    }
    static void check(boolean condition)throws IOException{if(!condition)throw new IOException("The selected source, account or output limit changed. Open the selection again.");}
    static String name(String raw,Set<String> used){
        String base=raw.replace('\\','/');base=base.substring(base.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}<>:\"|?*]","_").replaceAll("^[. ]+|[. ]+$","");
        if(base.isEmpty())base="document";
        if(base.matches("(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?"))base="_"+base;
        if(base.length()>180)base=base.substring(0,180);
        String next=base;int dot=base.lastIndexOf('.');
        for(int n=2;!used.add(next.toLowerCase(Locale.ROOT));n++)next=(dot>0?base.substring(0,dot):base)+" ("+n+")"+(dot>0?base.substring(dot):"");
        return next;
    }
    static OutputStream existing(File target)throws IOException{return java.nio.file.Files.newOutputStream(target.toPath(),java.nio.file.StandardOpenOption.WRITE,java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);}
    static String entryName(String supplied,Set<String> used){
        String[] parts=supplied.split("/",-1);
        if(parts.length==2&&!parts[0].equals(".")&&!parts[0].equals("..")&&!parts[0].isEmpty()&&!parts[1].isEmpty()){
            String folder=name(parts[0],new HashSet<>())+"/";
            Set<String> siblings=new HashSet<>();for(String path:used)if(path.startsWith(folder.toLowerCase(Locale.ROOT)))siblings.add(path.substring(folder.length()));
            String result=folder+name(parts[1],siblings);used.add(result.toLowerCase(Locale.ROOT));return result;
        }
        return name(supplied,used);
    }
    static OutputStream bounded(OutputStream out,long limit,BooleanSupplier gate){
        return new FilterOutputStream(out){
            long seen;public void write(int b)throws IOException{check(gate.getAsBoolean()&&++seen<=limit);out.write(b);}
            public void write(byte[] b,int off,int len)throws IOException{check(gate.getAsBoolean()&&(seen+=len)<=limit);out.write(b,off,len);}
        };
    }
    static String digest(byte[] data){StringBuilder s=new StringBuilder();for(byte b:data)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    static void copyMember(Member m,OutputStream out,BooleanSupplier allowed)throws IOException{
        check(m.size>0&&m.size<=FILE_LIMIT&&m.file.length()==m.size);
        try(InputStream in=new FileInputStream(m.file)){
            MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] buf=new byte[32768];long count=0;
            for(int n;(n=in.read(buf))!=-1;){check(allowed.getAsBoolean()&&(count+=n)<=m.size);md.update(buf,0,n);out.write(buf,0,n);}
            check(count==m.size && (m.hash.isEmpty()||m.hash.equals(digest(md.digest()))));
        }catch(NoSuchAlgorithmException e){throw new IOException(e);}
    }
    static void zip(List<Member> files,File target,BooleanSupplier allowed)throws IOException{
        boolean done=false;
        try{
            check(allowed.getAsBoolean()&&!files.isEmpty()&&files.size()<=50);
            long total=0;Set<String> names=new HashSet<>();
            try(ZipOutputStream zip=new ZipOutputStream(bounded(existing(target),LIMIT,allowed))){
                for(Member f:files){check((total+=f.size)<=LIMIT);zip.putNextEntry(new ZipEntry(entryName(f.name,names)));copyMember(f,zip,allowed);zip.closeEntry();}
            }
            int entries=0;
            try(ZipInputStream zip=new ZipInputStream(new FileInputStream(target))){
                for(ZipEntry e;(e=zip.getNextEntry())!=null;){check(entries<files.size());byte[] b=new byte[32768];long n=0;for(int k;(k=zip.read(b))!=-1;){check(allowed.getAsBoolean());n+=k;}check(n==files.get(entries++).size);}
            }
            check(entries==files.size());done=true;
        }finally{if(!done)target.delete();}
    }
}
