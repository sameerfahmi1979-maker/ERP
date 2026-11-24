package net.algt.mobiledms;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

/** Delivers one foreground callback per newly validated default network. */
final class OfflineConnectionMonitor {
    private ConnectivityManager manager;
    private ConnectivityManager.NetworkCallback registration;

    synchronized void start(Context context, Runnable connected) {
        if (registration!=null) return;
        manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(manager==null) return;
        registration=new ConnectivityManager.NetworkCallback(){
            private Network validated;
            @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){
                synchronized(OfflineConnectionMonitor.this){
                    if(registration!=this) return;
                    if(!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)){ validated=null; return; }
                    if(network.equals(validated)) return;
                    validated=network;
                }
                connected.run();
            }
            @Override public void onLost(Network network){
                synchronized(OfflineConnectionMonitor.this){ if(network.equals(validated)) validated=null; }
            }
        };
        try { manager.registerDefaultNetworkCallback(registration); }
        catch(RuntimeException unavailable){ registration=null; }
    }
    synchronized void stop(){
        if(registration!=null){
            try { manager.unregisterNetworkCallback(registration); }
            catch(IllegalArgumentException alreadyReleased){ /* The registration has already gone. */ }
            registration=null;
        }
    }
}
