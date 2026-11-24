package net.algt.mobiledms;

import java.util.*;

public final class PttLifecycleTest {
    static void check(boolean value) { if(!value)throw new AssertionError(); }
    static PttState ready() { PttState state=new PttState();state.select("ops","Operations");state.status("live",100);return state; }
    static PttIncoming.Item lease(String id,String channel) {return new PttIncoming.Item(id,channel,channel,"original-"+id,false);}
    public static void main(String[] args) {
        PttState state=ready();
        check(!state.canPress(false,true,100) && !state.canPress(true,false,100));
        PttState.Hold released=state.down(true,true,101);
        check(released!=null && state.down(true,true,102)==null);
        check(state.release()==released);
        PttState.Hold next=state.down(true,true,105);
        check(!state.grant(released,"stale",59995,110) && state.hold==next);
        check(state.grant(next,"winning",999999,120) && next.deadline==60105);
        check(state.release()==next && state.release()==null);
        state.select("dispatch","Dispatch");
        check(!state.grant(next,"old destination",1000,130));
        state.status("waiting",140);check(!state.canPress(true,true,141));
        state.status("live",140);check(!state.canPress(true,true,8141));
        for(String availability:Arrays.asList("busy","offDuty")){
            state.availability=availability;check(state.down(true,true,145)==null);
        }
        state.availability="available";state.paused=true;check(state.down(true,true,145)==null);state.paused=false;
        next=state.down(true,true,145);check(!state.grant(next,"expired",0,146));state.release();
        check(PttState.recover(true,true,true,false,"busy"));
        check(!PttState.recover(false,true,true,false,"available") && !PttState.recover(true,true,true,true,"available"));
        check(!PttState.recover(true,true,false,false,"available") && !PttState.recover(true,false,true,false,"available"));
        check(!PttState.recover(true,true,true,false,"offDuty"));
        PttIncoming queue=new PttIncoming();
        Set<String> allowed=new HashSet<>(Arrays.asList("ops","office"));
        queue.observe(Arrays.asList(lease("backlog","ops")),allowed,true,false);check(queue.poll()==null);
        List<PttIncoming.Item> simultaneous=Arrays.asList(lease("a","ops"),lease("b","office"));
        queue.observe(simultaneous,allowed,true,false);
        PttIncoming.Item first=queue.poll();check(first.lease.equals("a") && !first.delayed);
        queue.observe(Collections.emptyList(),allowed,true,true);
        PttIncoming.Item delayed=queue.poll();check(delayed.lease.equals("b") && delayed.delayed && delayed.started.equals("original-b"));
        check(state.selected.equals("dispatch"));
        queue.observe(Arrays.asList(lease("c","ops")),allowed,true,true);
        queue.interrupt();check(queue.poll()==null);
        queue.observe(Arrays.asList(lease("missed","ops")),allowed,true,false);check(queue.poll()==null);
        queue.observe(Arrays.asList(lease("revoked","office")),allowed,true,true);
        queue.observe(Collections.emptyList(),Collections.singleton("ops"),true,false);check(queue.poll()==null);
        System.out.println("PTT lifecycle, stale callbacks, deadline, admission, recovery and incoming queue tests passed.");
    }
}
