package net.algt.mobiledms;
import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.ImageIO;
public final class DmsPdfTest {
    public static void main(String[] args)throws Exception {
        BufferedImage color=new BufferedImage(11,7,BufferedImage.TYPE_INT_RGB);color.setRGB(2,2,0xffaa00);
        try(OutputStream out=new FileOutputStream(args[0])){DmsPdfWriter pdf=new DmsPdfWriter(out,2);pdf.page(11,7,o->ImageIO.write(color,"jpg",o));pdf.page(11,7,o->ImageIO.write(color,"jpg",o));pdf.finish();}
        try{new DmsPdfWriter(new ByteArrayOutputStream(),26);throw new AssertionError();}catch(IOException expected){}
        System.out.println("DmsPdfTest OK");
    }
}
