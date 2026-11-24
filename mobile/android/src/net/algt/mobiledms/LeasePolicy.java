package net.algt.mobiledms;

import java.io.IOException;
import java.util.UUID;

final class LeasePolicy {
    static final long MAX_LEGACY_LEASE = 7L * 86400000L;
    static String account(String user) throws IOException {
        try {
            String canonical = UUID.fromString(user).toString();
            if (!canonical.equalsIgnoreCase(user)) throw new IllegalArgumentException();
            return canonical;
        } catch (RuntimeException error) { throw new IOException("A valid ERP account is required.", error); }
    }
    static void validateGrant(String user, String permitUser, long authorized, long expires, long wall, long elapsed) throws IOException {
        if (!account(user).equals(account(permitUser))) throw new IOException("This offline authorization belongs to another ERP account.");
        if (authorized < 1000000000000L || expires <= authorized || expires - authorized > MAX_LEGACY_LEASE || expires <= wall || elapsed < 0)
            throw new IOException("The offline authorization is invalid or expired. Refresh it while connected.");
        if (authorized > wall)
            throw new IOException("Check the phone date and time before saving offline.");
    }
    static long effectiveTime(long authorized, long expires, long anchorWall, long anchorElapsed,
            long lastWall, long lastElapsed, int savedBoot, long wall, long elapsed, int boot) throws IOException {
        if (expires <= authorized || expires - authorized > 30L * 86400000L) throw new IOException("Invalid offline authorization.");
        long effective=trustedTime(authorized,anchorWall,anchorElapsed,lastWall,lastElapsed,savedBoot,wall,elapsed,boot);
        if(effective>=expires) throw new Expired();
        return effective;
    }
    static final class Expired extends IOException {
        Expired(){ super("This offline copy has expired. Refresh it while connected."); }
    }
    static long trustedTime(long authorized,long anchorWall,long anchorElapsed,long lastWall,long lastElapsed,
                            int savedBoot,long wall,long elapsed,int boot) throws IOException {
        if (authorized < 1000000000000L || boot < 0 || savedBoot < 0 || anchorElapsed < 0 || lastElapsed < anchorElapsed
                || elapsed < lastElapsed || wall < lastWall || lastWall < anchorWall || savedBoot != boot)
            throw new IOException("The phone clock changed or restarted. Refresh this offline copy while connected.");
        long delta = elapsed - anchorElapsed;
        long anchor = Math.max(authorized,anchorWall);
        if (delta > Long.MAX_VALUE - anchor) throw new IOException("The offline authorization has expired.");
        return Math.max(wall, anchor + delta);
    }
}
