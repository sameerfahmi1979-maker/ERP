package net.algt.mobiledms;

public final class CommunicationsRouteTest {
    private static void check(boolean valid) {
        if (!valid) throw new AssertionError("Communications route contract");
    }

    public static void main(String[] args) {
        MobileRoute route = new MobileRoute();
        Object api = new Object();
        MobileRoute.Scope account = new MobileRoute.Scope(api, "one", 1, 1);
        MobileRoute.Scope staleAccount = new MobileRoute.Scope(api, "one", 2, 1);
        route.enter(MobileRoute.Id.HR_RECORD, account, null);
        MobileRoute.Visit direct = route.enter(MobileRoute.Id.CHAT_CONVERSATION, account,
            () -> route.enter(MobileRoute.Id.HR_RECORD, account, null));
        check(direct.destination == MobileRoute.Destination.HR);
        check(route.current(direct, account));
        check(!route.current(direct, staleAccount));
        check(route.back(direct, account) && route.current().id == MobileRoute.Id.HR_RECORD);
        check(!route.current(direct, account));

        route.enter(MobileRoute.Id.LOCKED, staleAccount, null);
        MobileRoute.Visit ptt = route.enter(MobileRoute.Id.PTT_CHANNEL, account, null);
        check(ptt.destination == MobileRoute.Destination.MORE);
        route.enter(MobileRoute.Id.HOME_PAGE, account, null);
        check(route.enter(MobileRoute.Id.CHAT_HOME, account, null).destination == MobileRoute.Destination.HOME);
        route.enter(MobileRoute.Id.MORE_HOME, account, null);
        check(route.enter(MobileRoute.Id.NOTIFICATION_CENTER, account, null).destination == MobileRoute.Destination.MORE);
        System.out.println("CommunicationsRouteTest passed");
    }
}
