package net.algt.mobiledms;

import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.function.BooleanSupplier;

/** The local owner that sent an external request must still have access when its result is used. */
final class ExternalResultFence {
    interface Destination { OutputStream open() throws IOException; }
    interface Transfer { void write(OutputStream stream) throws IOException; }

    final String owner;
    final long generation;

    ExternalResultFence(String owner, long generation) {
        this.owner = owner;
        this.generation = generation;
    }

    boolean allows(String currentOwner, long currentGeneration, boolean unlocked) {
        return unlocked && owner != null && !owner.isEmpty() && generation >= 0
            && owner.equals(currentOwner) && generation == currentGeneration;
    }

    void require(BooleanSupplier allowed) throws IOException {
        if (!allowed.getAsBoolean()) throw new IOException("Open the current unlocked account and choose the file again.");
    }

    void writeTo(BooleanSupplier allowed, Destination destination, Transfer transfer) throws IOException {
        require(allowed);
        try (OutputStream output = destination.open()) {
            if (output == null) throw new IOException("The selected location could not be opened.");
            require(allowed);
            transfer.write(new FilterOutputStream(output) {
                @Override public void write(int value) throws IOException {
                    require(allowed);
                    out.write(value);
                }
                @Override public void write(byte[] bytes, int offset, int length) throws IOException {
                    require(allowed);
                    out.write(bytes, offset, length);
                }
            });
        }
    }
}
