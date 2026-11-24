package net.algt.mobiledms;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicLong;

/** Exercise real HR controllers with a held file and the same deferred read gate as the Android proxy. */
public final class IssuedExportLifetimeTest {
    private static void check(boolean result,String label){
        if(!result)throw new AssertionError(label);
        System.out.println("PASS "+label);
    }

    private static final class Login {
        final String account="fixture-employee";
        final long epoch=12,generation=3;
        final AtomicLong clock=new AtomicLong();
        final ErpApi.SessionFence session=new ErpApi.SessionFence(epoch,account);
        boolean current(){
            return DmsRules.admitted(account,epoch,generation,session.owner(),epoch,generation,
                session.current(epoch),clock.get(),3600000);
        }
        void verifyIssuance()throws IOException{
            if(!current())throw new IOException("Fixture login unavailable.");
        }
    }

    private static final class Held implements AutoCloseable {
        final HrFiles owner;
        final Object action;
        final File file;
        final SeekableByteChannel handle;
        final DmsTransfer.Open proxy;
        int transferred;

        Held(HrWorkspace controller,Login login,int value)throws Exception{
            owner=controller.files;
            action=owner.beginExport();
            file=File.createTempFile("issued-chooser-", ".pdf");
            Files.write(file.toPath(),new byte[]{(byte)value});
            owner.staged.attach(action,file::delete);
            handle=Files.newByteChannel(file.toPath(),java.nio.file.StandardOpenOption.READ);
            proxy=new DmsTransfer.Open(()->login.current()&&owner.staged.remaining(action)>0,login::verifyIssuance,file::delete);
            proxy.open();
        }
        int read()throws Exception{
            proxy.firstRead();
            ByteBuffer byteRead=ByteBuffer.allocate(1);
            int next=handle.read(byteRead)>0?(byteRead.get(0)&255):-1;
            if(next>=0)transferred++;
            return next;
        }
        boolean refused()throws Exception{
            try{read();return false;}catch(IOException denied){return true;}
        }
        public void close()throws Exception{
            handle.close();Files.deleteIfExists(file.toPath());
        }
    }

    private static void destroyAndReplace()throws Exception{
        Login login=new Login();
        HrWorkspace old=new HrWorkspace(null,login.clock::get);
        try(Held a=new Held(old,login,65)){
            old.background();
            old.files.reopenWallet(old.files::leavingView);
            check(a.file.exists()&&a.transferred==0&&old.files.staged.remaining(a.action)>0,"ordinary pause and wallet remount retain the unread chooser grant");
            old.reset(); // Called by LauncherActivity.onDestroy.
            check(!a.file.exists()&&old.files.staged.remaining(a.action)==0,"definitive cancellation removes A before any replacement exists");
            HrWorkspace next=new HrWorkspace(null,login.clock::get);
            try(Held b=new Held(next,login,66)){
                check(old.files!=next.files&&old.files.staged!=next.files.staged,"recreated activity has a separate HR controller and staging owner");
                check(login.current()&&a.refused()&&a.transferred==0,"destroyed controller deletes A and its already-open descriptor releases zero bytes");
                old.reset();
                check(b.file.exists()&&b.read()==66&&b.transferred==1,"late old-controller cancellation leaves current B readable");
                next.reset();
            }
        }
    }

    private static void overlappingControllers()throws Exception{
        Login login=new Login();
        HrWorkspace old=new HrWorkspace(null,login.clock::get),next=new HrWorkspace(null,login.clock::get);
        try(Held a=new Held(old,login,65);Held b=new Held(next,login,66)){
            boolean removedWhenReplaced=!a.file.exists();
            check(a.refused()&&a.transferred==0&&removedWhenReplaced,"replacement B retires A even before old activity destruction");
            File stale=File.createTempFile("stale-issued-", ".pdf");
            try{
                try{old.files.staged.attach(a.action,stale::delete);throw new AssertionError("retired A reattached");}
                catch(IOException denied){check(!stale.exists()&&b.file.exists(),"late A preparation discards only A's file");}
            }finally{Files.deleteIfExists(stale.toPath());}
            old.reset();next.background();
            check(b.read()==66,"paused current chooser can still make its first read after stale A cancellation");
            login.clock.set(600000);
            check(b.refused()&&!b.file.exists(),"remaining proxy reads stop at genuine inactivity expiry");
            next.reset();
        }
    }

    private static void leaveMountedWallet()throws Exception{
        Login login=new Login();
        HrWorkspace controller=new HrWorkspace(null,login.clock::get);
        try(Held a=new Held(controller,login,65)){
            controller.background();
            controller.files.reopenWallet(controller.files::leavingView);
            controller.files.leavingView();
            check(!a.file.exists()&&a.refused()&&a.transferred==0,"deliberate navigation away from the remounted wallet revokes the unread export");
        }finally{controller.reset();}
    }

    public static void main(String[] args)throws Exception{
        destroyAndReplace();overlappingControllers();leaveMountedWallet();
    }
}