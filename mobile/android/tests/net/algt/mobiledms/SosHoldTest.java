package net.algt.mobiledms;
public final class SosHoldTest {
    static void check(boolean value) {if(!value) throw new AssertionError();}
    public static void main(String[] args) {
        SosHold h=new SosHold();
        check(!h.begin("A",0,0,false)); check(!h.begin("",0,0,true));
        check(!h.begin("A",101,100,true));
        check(h.begin("A",100,100,true));check(!h.begin("B",100,100,true));
        for(long now=100;now<3100;now+=SosHold.TICK_MS)check(!h.timerDue("A",now,true));
        check(!h.timerDue("A",3099,true) && h.remaining(3099)==1);
        check(h.timerDue("A",3100,true));
        check(!h.timerDue("A",3100,true) && !h.release("A",3101,true));

        // A short physical touch queued while the main thread was busy.
        check(h.begin("A",100,4200,true));
        check(!h.timerDue("A",4200,true) && h.remaining(4200)==SosHold.DURATION);
        check(!h.release("A",400,true) && !h.holding());
        // A stall after DOWN can also leave an early UP or CANCEL in the input queue.
        check(h.begin("A",100,100,true));check(!h.timerDue("A",200,true));
        check(!h.timerDue("A",4200,true) && h.remaining(4200)==SosHold.DURATION);
        check(!h.release("A",3099,true) && !h.holding());
        check(h.begin("A",100,100,true));check(!h.timerDue("A",4200,true));
        h.cancel();check(!h.release("A",5000,true));
        // A genuine three-second hold remains provable by its ordered input timestamps.
        check(h.begin("A",100,4200,true));check(h.release("A",3100,true));
        check(!h.release("A",3100,true) && !h.timerDue("A",8000,true));
        // A continuing press resumes its visible countdown after a stalled frame.
        check(h.begin("A",0,0,true));check(!h.timerDue("A",4000,true));
        for(long now=4100;now<7000;now+=SosHold.TICK_MS)check(!h.timerDue("A",now,true));
        check(h.timerDue("A",7000,true));
        check(h.begin("A",200,200,true));check(!h.timerDue("B",300,true));check(!h.holding());
        check(h.begin("A",0,0,true));check(!h.timerDue("A",100,false));check(!h.release("A",3000,true));
        check(h.begin("A",0,0,true));check(!h.release("A",3000,false));
        check(h.begin("A",10,10,true));check(!h.timerDue("A",2,true));check(!h.holding());
        check(SosHold.freshFix(60_000_000_001L,1));check(!SosHold.freshFix(60_000_000_002L,1));
        check(!SosHold.freshFix(10,11));check(!SosHold.freshFix(10,0));
        System.out.println("PASS normal 3s timer, early/queued release, stalled countdown, cancellation, authority/clock scope, duplicate trigger and location freshness.");
    }
}
