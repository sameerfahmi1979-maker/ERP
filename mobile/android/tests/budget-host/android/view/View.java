package android.view;
public class View {
    public static final int VISIBLE=0,GONE=8;
    public volatile int visibility=VISIBLE;
    public void setVisibility(int value){visibility=value;}
    public boolean isAttachedToWindow(){return true;}
}
