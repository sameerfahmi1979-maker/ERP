package net.algt.mobiledms;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

/** One bounded luminance plane. Quarter-turns change coordinates without rotating bitmaps. */
final class QrDecoder {
    static String decode(int[] rgb,int width,int height){
        if(width<1||height<1||(long)width*height>3000000||rgb.length!=(long)width*height)return null;
        byte[] gray=new RGBLuminanceSource(width,height,rgb).getMatrix();
        for(int turn=0;turn<4;turn++){
            final int rot=turn,w=(turn%2==0?width:height), h=(turn%2==0?height:width);
            LuminanceSource plane=new LuminanceSource(w,h){
                public byte[] getRow(int y,byte[] row){
                    if(row==null||row.length<w)row=new byte[w];
                    for(int x=0;x<w;x++){
                        int col=rot==0?x:rot==1?y:rot==2?width-1-x:width-1-y;
                        int line=rot==0?y:rot==1?height-1-x:rot==2?height-1-y:x;
                        row[x]=gray[line*width+col];
                    }return row;
                }
                public byte[] getMatrix(){
                    if(rot==0)return gray;
                    byte[] data=new byte[w*h],row=new byte[w];for(int y=0;y<h;y++)System.arraycopy(getRow(y,row),0,data,y*w,w);
                    return data;
                }
            };
            try{String text=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(plane))).getText();return DmsRules.qr(text);}
            catch(ReaderException ignored){}
        }return null;
    }
}
