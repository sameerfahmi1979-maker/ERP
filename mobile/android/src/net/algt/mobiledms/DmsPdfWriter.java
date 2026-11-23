package net.algt.mobiledms;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Sequential JPEG page streams and indirect lengths keep bitmap and encoder memory per-page. */
final class DmsPdfWriter {
    interface Encoder{boolean jpeg(OutputStream out)throws IOException;}
    final OutputStream out;final int count;final long[] offsets;long position,pixels;int index;
    DmsPdfWriter(OutputStream stream,int count)throws IOException{
        DmsArchive.check(count>0&&count<=25);this.count=count;offsets=new long[3+count*4];
        out=new FilterOutputStream(stream){public void write(int b)throws IOException{out.write(b);position++;}
            public void write(byte[] b,int o,int n)throws IOException{out.write(b,o,n);position+=n;}};
        text("%PDF-1.4\n");obj(1);text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");obj(2);
        text("<< /Type /Pages /Count "+count+" /Kids [");for(int i=0;i<count;i++)text((3+i*4)+" 0 R ");text("] >>\nendobj\n");
    }
    void text(String s)throws IOException{out.write(s.getBytes(StandardCharsets.US_ASCII));}
    void obj(int n)throws IOException{offsets[n]=position;text(n+" 0 obj\n");}
    void page(int width,int height,Encoder image)throws IOException{
        long area=(long)width*height;DmsArchive.check(index<count&&width>0&&height>0&&area<=2000000&&(pixels+=area)<=16000000);
        int n=3+index++*4;obj(n);text("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+width+" "+height+"] /Resources << /XObject << /Im "+(n+1)+" 0 R >> >> /Contents "+(n+3)+" 0 R >>\nendobj\n");
        obj(n+1);text("<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+(n+2)+" 0 R >>\nstream\n");long start=position;
        DmsArchive.check(image.jpeg(out));long length=position-start;DmsArchive.check(length>0);text("\nendstream\nendobj\n");obj(n+2);text(length+"\nendobj\n");
        String paint="q "+width+" 0 0 "+height+" 0 0 cm /Im Do Q\n";obj(n+3);text("<< /Length "+paint.length()+" >>\nstream\n"+paint+"endstream\nendobj\n");
    }
    void finish()throws IOException{
        DmsArchive.check(index==count);long start=position;text("xref\n0 "+offsets.length+"\n0000000000 65535 f \n");
        for(int i=1;i<offsets.length;i++)text(String.format(Locale.ROOT,"%010d 00000 n \n",offsets[i]));
        text("trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+start+"\n%%EOF\n");out.flush();
    }
}
