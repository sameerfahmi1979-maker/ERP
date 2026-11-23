package net.algt.mobiledms;
import com.google.zxing.*; import com.google.zxing.common.BitMatrix;
public final class QrDecoderTest {
    public static void main(String[] args)throws Exception{
        String value="ALGT:DMS:1:4851";int w=270,h=151;
        BitMatrix bits=new MultiFormatWriter().encode(value,BarcodeFormat.QR_CODE,w,h);
        int[] pixels=new int[w*h],turned=new int[w*h];
        for(int y=0;y<h;y++)for(int x=0;x<w;x++){pixels[y*w+x]=bits.get(x,y)?0xff000000:0xffffffff;turned[x*h+h-1-y]=pixels[y*w+x];}
        if(!value.equals(QrDecoder.decode(pixels,w,h))||!value.equals(QrDecoder.decode(turned,h,w))||QrDecoder.decode(new int[w*h],w,h)!=null)throw new AssertionError();
        System.out.println("QrDecoderTest OK");
    }
}
