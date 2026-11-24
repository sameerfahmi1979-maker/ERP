package net.algt.mobiledms;

import static net.algt.mobiledms.MobileRoute.Id.*;

import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.widget.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.json.*;
import static net.algt.mobiledms.ErpApi.*;

final class HrFiles extends HrView {
    private final ThreadPoolExecutor photos=new ThreadPoolExecutor(0,2,15,TimeUnit.SECONDS,
        new ArrayBlockingQueue<Runnable>(26),new ThreadPoolExecutor.DiscardPolicy());
    private volatile long generation;
    private final HrRecovery.Share shareState=new HrRecovery.Share();
    final HrRecovery.ExportActions exports=new HrRecovery.ExportActions();
    private volatile ShareJob sharing;
    final HrRecovery.ExportFiles staged;
    void interacted(){staged.interacted();}
    boolean ownsExport(Issued source){return exports.owns(source.action)&&staged.remaining(source.action)>0;}
    private boolean reopeningWallet;
    void pause(){shareState.pause();}
    // Restoring the same wallet replaces its temporary loading view after a chooser pause.
    void reopenWallet(Runnable open){
        reopeningWallet=true;
        try{open.run();}finally{reopeningWallet=false;}
    }
    void leavingView(){if(!reopeningWallet)cancelShare();}
    synchronized void cancelShare(){
        sharing=null;
        exports.clear();
        staged.select(null);
    }
    HrFiles(HrWorkspace h,java.util.function.LongSupplier elapsedRealtime){
        super(h);staged=new HrRecovery.ExportFiles(elapsedRealtime);
        photos.setCorePoolSize(2);photos.allowCoreThreadTimeOut(true);
    }
    void retire(){generation++;photos.getQueue().clear();}

    void avatar(LinearLayout panel,long employee,long dependent,String name,JSONObject source,int size){
        FrameLayout box=new FrameLayout(a);
        LinearLayout.LayoutParams layout=new LinearLayout.LayoutParams(a.dp(size),a.dp(size));
        panel.addView(box,0,layout);
        TextView fallback=new TextView(a);
        String[] parts=name.trim().split("\\s+");
        String initials=parts[0].isEmpty()?"":parts[0].substring(0,parts[0].offsetByCodePoints(0,1));
        if(parts.length>1)initials+=parts[parts.length-1].substring(0,parts[parts.length-1].offsetByCodePoints(0,1));
        fallback.setText(initials.toUpperCase(java.util.Locale.ROOT));fallback.setGravity(Gravity.CENTER);
        fallback.setTextSize(size>48?28:18);fallback.setTextColor(0xff115ea3);fallback.setBackgroundColor(0xffebf3fc);
        box.addView(fallback); box.setContentDescription(name);
        if(source==null)return;
        long ticket=generation;
        HrWorkspace.Screen screen=h.new Screen();
        photos.execute(()->{
            try{
                if(ticket!=generation)return;
                screen.requireCurrentSession();
                byte[] bytes=screen.api.hrPhoto(screen.account,screen.epoch,employee,dependent,source);
                if(ticket!=generation)return;
                BitmapFactory.Options opts=new BitmapFactory.Options();
                opts.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
                opts.inSampleSize=HrV5Rules.sample(opts.outWidth,opts.outHeight,Math.min(512,a.dp(size)*2));
                if(opts.inSampleSize==0)return;
                opts.inJustDecodeBounds=false;
                Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
                if(image==null)return;
                a.runOnUiThread(()->{
                    if(ticket!=generation || !screen.visible()) { image.recycle();return; }
                    ImageView photo=new ImageView(a);photo.setScaleType(ImageView.ScaleType.FIT_CENTER);
                    photo.setImageBitmap(image);photo.setContentDescription("Photo of "+name);
                    box.removeAllViews();box.addView(photo);
                });
            }catch(Exception ex){
                if(ex instanceof ErpApi.Rejected && HrRules.privateDenial(((ErpApi.Rejected)ex).status))
                    a.runOnUiThread(()->{if(ticket==generation)screen.denied(ex);});
            }
        });
    }

    static final class Issued {
        final long employee,id,size,epoch;
        final String owner,hash;
        final ErpApi api;
        final long generation;
        final Object routeOwner,action;
        Issued(HrWorkspace.Screen screen,long employee,JSONObject row) throws Exception {
            this.employee=employee;id=row.getLong("id");size=row.getLong("bytes");hash=row.getString("checksum");
            epoch=screen.epoch;owner=screen.account;api=screen.api;generation=screen.generation;routeOwner=screen.routeOwner();action=null;
        }
        private Issued(Issued selected,Object action){
            employee=selected.employee;id=selected.id;size=selected.size;hash=selected.hash;epoch=selected.epoch;
            owner=selected.owner;api=selected.api;generation=selected.generation;routeOwner=selected.routeOwner;this.action=action;
        }
        void fetch(ErpApi api,File target,boolean preview,BooleanSupplier allowed)throws Exception {api.hrIssued(owner,epoch,employee,id,hash,size,preview,target,allowed);}
        void verify(ErpApi current,BooleanSupplier local)throws Exception{
            DmsTransfer.local(local);
            if(api!=current||!owner.equals(current.user())||epoch!=current.hrSessionEpoch())throw new IOException("Issued account changed.");
            current.verifyIssued(owner,epoch,employee,id,hash,size);DmsTransfer.local(local);
        }
    }

    synchronized Object beginExport(){
        Object action=exports.begin();
        staged.select(action);
        sharing=null;
        return action;
    }

    synchronized Issued admitExport(Issued selected){
        Issued admitted=new Issued(selected,beginExport());
        h.selectIssuance(admitted.id);
        return admitted;
    }

    DmsPrivateFiles.Entry prepare(Issued issued,String name,BooleanSupplier actionCurrent)throws Exception{
        final DmsPrivateFiles.Entry entry;
        synchronized(this){
            DmsTransfer.local(actionCurrent);
            entry=DmsPrivateFiles.create(a,issued.api,name,"application/pdf",false,actionCurrent);
            entry.admissionRemaining=()->staged.remaining(issued.action);
            entry.expire();
            entry.admission=issued::verify;
            staged.attach(issued.action,entry::remove);
        }
        try{
            issued.fetch(issued.api,entry.file,false,()->entry.valid()&&actionCurrent.getAsBoolean());
            entry.verifySource();
            return entry;
        }catch(Exception failure){entry.remove();throw failure;}
    }

    void walletActions(LinearLayout panel,long employee,JSONObject row,int walletPage,Runnable back) throws Exception{
        if(!row.optBoolean("canDownload") || row.isNull("checksum") || row.optLong("bytes")<=0)return;
        HrWorkspace.Screen source=h.new Screen();
        Issued issued=new Issued(source,employee,row); String name=str(row,"fileName");
        button(panel,"Preview PDF",()->{if(source.visible())preview(issued,walletPage,0,back);});
        button(panel,"Save PDF",()->{if(source.visible())a.saveHrIssued(issued,name);});
        button(panel,"Share PDF",()->{if(source.visible()){
            sharing=new ShareJob(admitExport(issued),name);resumeShare();
        }});
    }

    /** Deliberate export survives retirement of its initiating view. File bytes never wait for foreground. */
    private final class ShareJob {
        final Issued source;
        final String name;
        final ExternalResultFence fence;
        boolean running;
        ShareJob(Issued source,String name){
            this.source=source;this.name=name;fence=new ExternalResultFence(source.owner,source.generation);
        }
        boolean current(){
            return ownsExport(source) && sharing==this && !a.isDestroyed() && !a.isFinishing() && source.api==a.api
                && HrV5Rules.restore(source.owner,source.epoch,source.api.user(),source.api.hrSessionEpoch(),LocalSecurity.acceptsExternalResult(a,fence));
        }
    }

    boolean resumeShare(){
        ShareJob job=sharing;
        if(job==null)return false;
        if(!job.current() || !h.ownsTransferRoute(job.source.routeOwner)){sharing=null;return false;}
        if(job.running || !a.hrActive())return true;
        job.running=true;
        long prepared=shareState.start();
        a.hrFileTask(()->{
            DmsPrivateFiles.Entry result=null;Exception failure=null;
            try{result=prepare(job.source,job.name,job::current);}catch(Exception ex){failure=ex;}
            final DmsPrivateFiles.Entry file=result;final Exception error=failure;
            a.runOnUiThread(()->finishShare(job,prepared,file,error));
        });
        return true;
    }

    private void finishShare(ShareJob job,long prepared,DmsPrivateFiles.Entry file,Exception error){
        job.running=false;
        HrRecovery.Dispatch action=exports.dispatch(job.source.action,shareState,prepared,job.current() && h.ownsTransferRoute(job.source.routeOwner),a.hrActive());
        if(action==HrRecovery.Dispatch.SHOW && error==null && file!=null){
            sharing=null;
            a.shareHrIssued(file);
            return;
        }
        if(file!=null)file.remove();
        if(sharing!=job || !exports.owns(job.source.action))return;
        if(error!=null){
            sharing=null;
            h.transferFinished(job.source,error,"");return;
        }
        if(action==HrRecovery.Dispatch.WAIT)return;
        if(action==HrRecovery.Dispatch.REFETCH){resumeShare();return;}
        sharing=null;
    }

    void restorePreview(JSONObject route,Runnable parent){
        long e=route.optLong("employeeId"),id=route.optLong("issuanceId");
        int walletPage=route.optInt("page",1),pdfPage=route.optInt("pdfPage");
        Runnable wallet=()->h.work.wallet(e,walletPage,id,parent);
        h.page(HR_ISSUED_PREVIEW, "Issued PDF",wallet);h.route(route);
        h.subjectRead(object("op","issuedDocuments","employeeId",e,"page",walletPage),r->{
            JSONArray rows=r.getJSONArray("rows");
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);
                if(row.optLong("id")==id && row.optBoolean("canDownload") && str(row,"checksum").equals(str(route,"checksum")) && row.optLong("bytes")==route.optLong("bytes")){
                    preview(new Issued(h.new Screen(),e,row),walletPage,pdfPage,wallet);return;
                }
            }
            wallet.run();
            a.subtitle("The selected issued original is no longer available on this page.");
        });
    }

    private void preview(Issued issued,int walletPage,int index,Runnable back){
        h.page(HR_ISSUED_PREVIEW, "Issued PDF",back);
        h.route(object("op","issuedPreview","employeeId",issued.employee,"page",walletPage,"issuanceId",issued.id,"pdfPage",index,"checksum",issued.hash,"bytes",issued.size));
        HrWorkspace.Screen source=h.new Screen();
        h.load("Opening issued PDF",()->{
            File temp=File.createTempFile("hr-issue-",".tmp",a.getCacheDir());
            try{
                issued.fetch(source.api,temp,true,source::visible);source.requireCurrentSession();
                try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(temp,ParcelFileDescriptor.MODE_READ_ONLY);
                    PdfRenderer pdf=new PdfRenderer(fd);PdfRenderer.Page page=pdf.openPage(index)){
                    float scale=Math.min(1800f/page.getWidth(),2500f/page.getHeight());
                    Bitmap image=Bitmap.createBitmap(Math.max(1,Math.round(scale*page.getWidth())),Math.max(1,Math.round(scale*page.getHeight())),Bitmap.Config.ARGB_8888);
                    image.eraseColor(Color.WHITE);page.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    return new Render(image,pdf.getPageCount());
                }
            }finally{temp.delete();}
        },render->{
            DocumentPreview view=new DocumentPreview(a,render.image,"Issued PDF, page "+(index+1));
            a.content.addView(view,new LinearLayout.LayoutParams(-1,0,1));
            a.viewerControls(view,index,render.pages,n->preview(issued,walletPage,n,back),a::viewerButton);
        });
    }
    private static final class Render {
        final Bitmap image;final int pages;
        Render(Bitmap image,int pages){this.image=image;this.pages=pages;}
    }
}
