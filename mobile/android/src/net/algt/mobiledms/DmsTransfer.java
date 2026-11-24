package net.algt.mobiledms;

import java.io.*;
import java.util.function.BooleanSupplier;

/** The source predicate is evaluated on both sides of blocking opens. */
final class DmsTransfer {
    interface Source { void verify() throws Exception; }
    interface Destination { OutputStream open() throws IOException; }
    static final class NotSent extends IOException {
        NotSent(Throwable cause){super("The request body was not sent. Reopen the current source.",cause);}
    }
    static void local(BooleanSupplier allowed)throws IOException {
        if(!allowed.getAsBoolean())throw new IOException("The account or source is no longer available.");
    }
    interface BeforeWrite {void begin()throws IOException;}
    static void send(Destination destination,InputStream input,long limit,BooleanSupplier allowed)throws IOException {
        send(destination,input,limit,allowed,null);
    }
    static void send(Destination destination,InputStream input,long limit,BooleanSupplier allowed,BeforeWrite before)throws IOException {
        boolean attempted=false;
        try {
            local(allowed);
            try(OutputStream out=destination.open()){
                local(allowed);
                long total=0;
                byte[] chunk=new byte[32768];
                for(int count;(count=input.read(chunk))!=-1;){
                    local(allowed);
                    if((total+=count)>limit)throw new IOException("The original exceeds its size limit.");
                    if(!attempted&&before!=null){before.begin();local(allowed);}
                    attempted=true;
                    out.write(chunk,0,count);
                }
            }
        }catch(IOException failure){if(!attempted)throw new NotSent(failure);throw failure;}
    }
    static final class Open{
        final BooleanSupplier local;final Source source;final Runnable invalidate;
        boolean admitted;
        Open(BooleanSupplier local,Source source){this(local,source,()->{});}
        Open(BooleanSupplier local,Source source,Runnable invalidate){this.local=local;this.source=source;this.invalidate=invalidate;}
        void open()throws Exception{
            try{local(local);source.verify();local(local);}catch(Exception failure){invalidate.run();throw failure;}
        }
        synchronized void firstRead()throws Exception{
            if(!admitted){open();admitted=true;}
            else if(!local.getAsBoolean()){invalidate.run();throw new IOException("Private file access ended.");}
        }
    }
    static void deliver(BooleanSupplier allowed,Source source,Destination destination,InputStream in,long max)throws Exception{
        Open gate=new Open(allowed,source);
        gate.open();
        try(OutputStream out=destination.open()){
            if(out==null)throw new IOException("The destination could not be opened.");
            gate.open();
            byte[] buffer=new byte[32768];long total=0;
            for(int count;(count=in.read(buffer))!=-1;){
                gate.firstRead();
                if((total+=count)>max)throw new IOException("Private file exceeded the permitted length.");
                out.write(buffer,0,count);
            }
        }
    }
    static <T> T render(Source check,Renderer<T> render,java.util.function.Consumer<T> discard)throws Exception{
        check.verify();T result=render.get();
        try{check.verify();return result;}catch(Exception denied){discard.accept(result);throw denied;}
    }
    interface Renderer<T>{T get()throws Exception;}
}
