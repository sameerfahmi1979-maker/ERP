package net.algt.mobiledms;

import java.util.*;

/** Only leases observed during a continuous Available interval enter the automatic playback queue. */
final class PttIncoming {
    static final class Item {
        final String lease, channel, name, started;
        final boolean delayed;
        Item(String lease,String channel,String name,String started,boolean delayed) {
            this.lease=lease;this.channel=channel;this.name=name;this.started=started;this.delayed=delayed;
        }
    }
    private final LinkedHashMap<String,Item> pending=new LinkedHashMap<>();
    private final Set<String> seen=new HashSet<>();
    private boolean continuous;
    void observe(Collection<Item> live,Set<String> authorizedChannels,boolean available,boolean occupied) {
        Set<String> active=new HashSet<>();
        for(Item item:live) active.add(item.lease);
        seen.retainAll(active);
        pending.values().removeIf(item->!authorizedChannels.contains(item.channel));
        for(Item item:live) {
            if(!seen.add(item.lease) || !available || !continuous) continue;
            pending.put(item.lease,new Item(item.lease,item.channel,item.name,item.started,occupied || !pending.isEmpty()));
        }
        if(!available)pending.clear();
        continuous=available;
    }
    Item poll() {
        Iterator<Item> i=pending.values().iterator();
        if(!i.hasNext())return null;
        Item next=i.next();i.remove();return next;
    }
    void replayFirst(Item interrupted) {
        LinkedHashMap<String,Item> ordered=new LinkedHashMap<>();
        ordered.put(interrupted.lease,interrupted);ordered.putAll(pending);
        pending.clear();pending.putAll(ordered);
    }
    void interrupt() { continuous=false; pending.clear(); }
}
