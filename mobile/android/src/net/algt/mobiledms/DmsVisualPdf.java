package net.algt.mobiledms;
import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.os.ParcelFileDescriptor;
import java.io.*;
import java.util.*;
import java.util.function.BooleanSupplier;

final class DmsVisualPdf {
    static final class Page{final Bitmap bitmap;final int total;Page(Bitmap b,int n){bitmap=b;total=n;}}
    static final class Plan{final File f;final String mime;final int index,w,h;Plan(File f,String m,int i,int w,int h){this.f=f;mime=m;index=i;this.w=w;this.h=h;}}
    static boolean supports(String m){return Arrays.asList("application/pdf","image/jpeg","image/png","image/webp").contains(m);}
    static PdfRenderer pdf(File f)throws IOException{
        ParcelFileDescriptor fd=ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);try{return new PdfRenderer(fd);}catch(RuntimeException|IOException e){fd.close();throw e;}
    }
    static void plan(List<Plan> list,File f,String mime,int index,int w,int h)throws IOException{
        DmsArchive.check(w>0&&h>0&&list.size()<25);list.add(new Plan(f,mime,index,w,h));
    }
    static int[] fit(int w,int h,long cap){double scale=Math.min(1,Math.sqrt(cap/((double)w*h)));return new int[]{Math.max(1,(int)(w*scale)),Math.max(1,(int)(h*scale))};}
    static Bitmap render(Plan p,long cap)throws Exception{
        int[] dim=fit(p.w,p.h,cap);DmsArchive.check((long)dim[0]*dim[1]<=cap);
        if(p.mime.equals("application/pdf")){try(PdfRenderer renderer=pdf(p.f);PdfRenderer.Page page=renderer.openPage(p.index)){
            Bitmap b=Bitmap.createBitmap(dim[0],dim[1],Bitmap.Config.ARGB_8888);b.eraseColor(Color.WHITE);try{page.render(b,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);return b;}catch(RuntimeException e){b.recycle();throw e;}
        }}
        BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=CaptureJobRules.sampleSize(p.w,p.h,Math.max(dim[0],dim[1]),cap);
        Bitmap raw=BitmapFactory.decodeFile(p.f.getPath(),opts);if(raw==null)throw new IOException("Image could not be rendered.");
        try{
            DmsArchive.check((long)raw.getWidth()*raw.getHeight()<=cap);
            int o=1;try{o=new ExifInterface(p.f.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);}catch(IOException ignored){}
            Matrix orient=new Matrix();switch(o){case 2:orient.setScale(-1,1);break;case 3:orient.setRotate(180);break;case 4:orient.setScale(1,-1);break;case 5:orient.setRotate(90);orient.postScale(-1,1);break;case 6:orient.setRotate(90);break;case 7:orient.setRotate(-90);orient.postScale(-1,1);break;case 8:orient.setRotate(-90);break;default:break;}
            RectF bounds=new RectF(0,0,raw.getWidth(),raw.getHeight());orient.mapRect(bounds);orient.postTranslate(-bounds.left,-bounds.top);
            Bitmap out=Bitmap.createBitmap(Math.round(bounds.width()),Math.round(bounds.height()),Bitmap.Config.ARGB_8888);Canvas c=new Canvas(out);c.drawColor(Color.WHITE);c.drawBitmap(raw,orient,new Paint(Paint.FILTER_BITMAP_FLAG));return out;
        }finally{raw.recycle();}
    }
    static Plan image(File f,String m)throws Exception{BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(f.getPath(),o);DmsArchive.check(o.outWidth>0&&o.outHeight>0);return new Plan(f,m,0,o.outWidth,o.outHeight);}
    static Page preview(File f,String mime,int index)throws Exception{
        if(mime.equals("application/pdf")){Plan plan;int n;try(PdfRenderer r=pdf(f);PdfRenderer.Page p=r.openPage(index)){n=r.getPageCount();plan=new Plan(f,mime,index,p.getWidth(),p.getHeight());}return new Page(render(plan,2000000),n);}
        DmsArchive.check(mime.startsWith("image/"));return new Page(render(image(f,mime),2000000),1);
    }
    static void assemble(List<DmsArchive.Member> files,List<String> mimes,File target,BooleanSupplier gate)throws Exception{
        boolean success=false;try{
            List<Plan> pages=new ArrayList<>();for(int i=0;i<files.size();i++){DmsArchive.check(gate.getAsBoolean());String m=mimes.get(i);DmsArchive.check(supports(m));File f=files.get(i).file;
                if(m.equals("application/pdf")){try(PdfRenderer r=pdf(f)){int count=r.getPageCount();DmsArchive.check(count>0&&pages.size()+count<=25);for(int k=0;k<count;k++)try(PdfRenderer.Page p=r.openPage(k)){plan(pages,f,m,k,p.getWidth(),p.getHeight());}}}
                else {Plan p=image(f,m);plan(pages,f,m,0,p.w,p.h);}}
            DmsArchive.check(gate.getAsBoolean()&&!pages.isEmpty());long cap=Math.min(2000000,16000000/pages.size());
            try(OutputStream out=DmsArchive.bounded(DmsArchive.existing(target),DmsArchive.LIMIT,gate)){DmsPdfWriter writer=new DmsPdfWriter(out,pages.size());for(Plan p:pages){DmsArchive.check(gate.getAsBoolean());Bitmap b=render(p,cap);try{writer.page(b.getWidth(),b.getHeight(),stream->b.compress(Bitmap.CompressFormat.JPEG,90,stream));}finally{b.recycle();}}writer.finish();}
            try(PdfRenderer r=pdf(target)){DmsArchive.check(r.getPageCount()==pages.size()&&gate.getAsBoolean());}success=true;
        }finally{if(!success)target.delete();}
    }
}
