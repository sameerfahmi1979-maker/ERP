package net.algt.mobiledms;
public final class SosHoldTest {
    static void check(boolean value) {if(!value) throw new AssertionError();}
    public static void main(String[] args) {
        SosHold h=new SosHold();
        check(!h.begin("A",0,false)); check(!h.begin("",0,true));
        check(h.begin("A",100,true));check(!h.begin("B",100,true));
        check(!h.due("A",3099,true) && h.remaining(3099)==1);
        h.cancel();check(!h.due("A",3100,true));
        check(h.begin("A",200,true));check(!h.due("B",3200,true));check(!h.due("A",3201,true));
        check(h.begin("A",0,true));check(!h.due("A",3000,false));check(!h.due("A",4000,true));
        check(h.begin("A",100,true));check(h.due("A",3100,true));check(!h.due("A",3100,true));
        check(h.begin("A",10,true));check(!h.due("A",2,true));check(!h.holding());
        check(SosHold.freshFix(60_000_000_001L,1));check(!SosHold.freshFix(60_000_000_002L,1));
        check(!SosHold.freshFix(10,11));check(!SosHold.freshFix(10,0));
        System.out.println("PASS 3s hold, early release, target change, offline/authority loss, duplicate trigger, stale/absent/future fix.");
    }
}
