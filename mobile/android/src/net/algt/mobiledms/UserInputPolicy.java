package net.algt.mobiledms;

import java.util.concurrent.Executor;
import java.util.function.BooleanSupplier;

final class UserInputPolicy {
    private UserInputPolicy() { }

    static boolean mayApply(boolean userInput, BooleanSupplier admitUserInput) {
        return !userInput || admitUserInput.getAsBoolean();
    }

    static boolean mayApplyAccessibility(boolean userInput, boolean attached, boolean publicCredentialClick,
            BooleanSupplier admitUserInput) {
        return !userInput || (attached && (publicCredentialClick || admitUserInput.getAsBoolean()));
    }

    static void performEditingGesture(BooleanSupplier admit, Runnable apply, Executor executor, Runnable onDenied) {
        if (admit.getAsBoolean()) apply.run();
        else if (onDenied != null) {
            if (executor == null) onDenied.run();
            else executor.execute(onDenied);
        }
    }
}
