package net.algt.mobiledms;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class FileFingerprint {
    final long size;
    final String sha256;

    private FileFingerprint(long size, String sha256) {
        this.size = size;
        this.sha256 = sha256;
    }

    static FileFingerprint read(File file) throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        long length = 0;
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[32 * 1024];
            for (int count; (count = input.read(bytes)) != -1;) {
                length += count;
                digest.update(bytes, 0, count);
            }
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest.digest()) {
            hex.append(Character.forDigit((value & 255) >>> 4, 16));
            hex.append(Character.forDigit(value & 15, 16));
        }
        return new FileFingerprint(length, hex.toString());
    }
}
