package net.algt.mobiledms;

import java.util.function.BiConsumer;
import java.util.function.Consumer;

/** Both review duplicate openings share this foreground return and its original private identity. */
final class ReviewReturn {
    final IntakeReview review;
    private final MobileRoute.Scope owner;
    private final long foreground;
    ReviewReturn(IntakeReview review,MobileRoute.Scope owner,long foreground){
        this.review=review;this.owner=owner;this.foreground=foreground;
    }
    void resume(MobileRoute.Scope current,long activeForeground,boolean admitted,
            Consumer<IntakeReview> paint,Consumer<String> readMember,Consumer<DmsIntakeEntry> readIntake,Runnable denied){
        if(!admitted||!owner.matches(current)){denied.run();return;}
        if(activeForeground==foreground)paint.accept(review);
        else if(review.member!=null)readMember.accept(review.member.member);
        else readIntake.accept(review.ordinary);
    }
    static void verifiedDuplicate(ReviewReturn back,long document,BiConsumer<Long,ReviewReturn> member,
            Consumer<ReviewReturn> ordinary) {
        if(back.review.member!=null)member.accept(document,back);else ordinary.accept(back);
    }
}
