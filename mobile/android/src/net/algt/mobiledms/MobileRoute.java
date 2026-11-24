package net.algt.mobiledms;

import java.util.function.Consumer;

/** Foreground presentation only. Controllers retain all source, access and transfer checks. */
final class MobileRoute {
    enum Destination { HOME, DOCUMENTS, HR, INBOX, MORE }

    enum Id {
        BOOT, SIGN_IN, LOCKED, CONNECT, ACCESS,
        HOME_PAGE, DOCUMENTS_HOME, HR_HOME, INBOX_HOME, MORE_HOME,
        DOCUMENT_LIST, DOCUMENT, DOCUMENT_FILES, DMS_PAGE, DMS_RECEIPTS, DMS_PREVIEW,
        LEGACY_PREVIEW, OFFLINE, CAPTURE, HR_CAPTURE, INTAKE, REVIEW, MATCHES, APPROVAL_RECEIPT,
        QUEUE, QUEUE_MEMBER, INCOMING_LINK, TASK_LIST, TASK,
        HR_PAGE, HR_DIRECTORY, HR_RECORD, HR_REQUEST_LIST, HR_REQUEST, HR_RECEIPTS,
        HR_ISSUED_PREVIEW, HR_EVIDENCE_RETURN, HR_INBOX,
        CHAT_HOME, CHAT_CONVERSATION, CHAT_PAGE,
        PTT_HOME, PTT_CHANNEL, PTT_HISTORY, NOTIFICATION_CENTER;

        boolean viewer() { return this == LEGACY_PREVIEW || this == DMS_PREVIEW || this == HR_ISSUED_PREVIEW; }

        Destination destination(Destination from) {
            switch (this) {
                case BOOT: case SIGN_IN: case LOCKED: case CONNECT: case ACCESS: return null;
                case HOME_PAGE: return Destination.HOME;
                case HR_HOME: case HR_CAPTURE: case HR_EVIDENCE_RETURN: return Destination.HR;
                case INBOX_HOME: case HR_INBOX: case TASK: case TASK_LIST: return Destination.INBOX;
                case MORE_HOME: return Destination.MORE;
                case CHAT_HOME: case CHAT_CONVERSATION: case CHAT_PAGE:
                case PTT_HOME: case PTT_CHANNEL: case PTT_HISTORY: case NOTIFICATION_CENTER:
                    return from == null ? Destination.MORE : from;
                case DOCUMENTS_HOME: case INCOMING_LINK: return Destination.DOCUMENTS;
                case QUEUE: case QUEUE_MEMBER: case CAPTURE:
                    return from == Destination.INBOX ? from : Destination.DOCUMENTS;
                case HR_PAGE: case HR_DIRECTORY: case HR_RECORD: case HR_REQUEST_LIST: case HR_REQUEST:
                case HR_RECEIPTS: case HR_ISSUED_PREVIEW:
                    return from == Destination.MORE || from == Destination.INBOX ? from : Destination.HR;
                default:
                    return from == null || from == Destination.HOME ? Destination.DOCUMENTS : from;
            }
        }
    }

    static final class Scope {
        private final Object api;
        private final String account;
        private final long epoch, generation;
        Scope(Object api, String account, long epoch, long generation) {
            this.api = api;
            this.account = account;
            this.epoch = epoch;
            this.generation = generation;
        }
        boolean matches(Scope other) {
            return other != null && api == other.api && account.equals(other.account)
                && epoch == other.epoch && generation == other.generation;
        }
    }

    /** A foreground HR continuation is usable only for the original employee in the same sign-in. */
    static final class SubjectReturn {
        private final Scope scope;
        private final long employee;
        private final Runnable parent;
        SubjectReturn(Scope scope, long employee, Runnable parent) {
            this.scope = scope;
            this.employee = employee;
            this.parent = parent;
        }
        void resume(Scope current, long currentEmployee, Runnable recheck) {
            if (employee > 0 && employee == currentEmployee && scope.matches(current)) parent.run();
            else recheck.run();
        }
    }

    static final class Visit {
        final Id id;
        final Destination destination;
        final Scope scope;
        private final Runnable parent;
        Visit(Id id, Destination destination, Scope scope, Runnable parent) {
            this.id = id;
            this.destination = destination;
            this.scope = scope;
            this.parent = parent;
        }
        boolean hasBack() { return parent != null; }
    }

    static final class PreviewReturn {
        private Visit deleted;
        void deleted(Visit visit){ deleted = visit.id==Id.LEGACY_PREVIEW ? visit : null; }
        void clear(){ deleted=null; }
        boolean consume(MobileRoute navigation,Scope owner,boolean foreground,boolean lease,boolean externalOrBusy,Runnable reauthenticate) {
            if(deleted==null)return false;
            if(deleted!=navigation.current()){clear();return false;}
            if(!foreground || externalOrBusy)return false;
            if(!owner.matches(deleted.scope) || !lease){clear();reauthenticate.run();return false;}
            Visit parent=deleted;clear();
            return navigation.back(parent,owner);
        }
    }

    private volatile Visit current = new Visit(Id.BOOT, null, null, null);
    Visit current() { return current; }
    boolean current(Visit visit, Scope scope) {
        return visit != null && visit == current && scope.matches(visit.scope);
    }
    Visit enter(Id id, Scope scope, Runnable parent) {
        Destination from = scope.matches(current.scope) ? current.destination : null;
        current = new Visit(id, id.destination(from), scope, parent);
        return current;
    }
    boolean back(Visit expected, Scope scope) {
        if (!current(expected, scope) || !expected.hasBack()) return false;
        expected.parent.run();
        return true;
    }
    static Runnable reviewExit(DmsReviewContext member, Consumer<String> openMember, Runnable ordinary) {
        return member == null ? ordinary : () -> openMember.accept(member.member);
    }
}
