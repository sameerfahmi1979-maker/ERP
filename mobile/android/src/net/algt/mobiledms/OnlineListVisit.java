package net.algt.mobiledms;

import java.util.function.BooleanSupplier;

/** A foreground list may publish only while its original actor, login and mounted view still own it. */
final class OnlineListVisit {
    private final BooleanSupplier mountedForeground;
    private final Runnable reopen;
    private volatile boolean retired;
    OnlineListVisit(BooleanSupplier mountedForeground,Runnable reopen){this.mountedForeground=mountedForeground;this.reopen=reopen;}
    boolean visible(){return !retired&&mountedForeground.getAsBoolean();}
    void hide(Runnable clearRows){retired=true;clearRows.run();}
    void resume(BooleanSupplier sameOwner,Runnable expired){if(sameOwner.getAsBoolean())reopen.run();else expired.run();}
}
