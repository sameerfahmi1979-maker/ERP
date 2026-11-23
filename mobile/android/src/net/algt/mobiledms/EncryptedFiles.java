package net.algt.mobiledms;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class EncryptedFiles {
    private static final byte[] MAGIC = {'A','L','G','T','E','N','C',1};
    static final class Info { final long size; final String sha256; Info(long size, String sha256) { this.size = size; this.sha256 = sha256; } }
    static boolean sealed(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            byte[] header = new byte[MAGIC.length];
            return input.read(header) == header.length && Arrays.equals(header, MAGIC);
        }
    }
    static Info encrypt(InputStream input, OutputStream output, SecretKey key, String aad, long max) throws IOException {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            if (cipher.getIV().length != 12) throw new IOException("Unsupported secure storage nonce.");
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            output.write(MAGIC); output.write(cipher.getIV());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = 0;
            byte[] buffer = new byte[32768];
            for (int count; (count = input.read(buffer)) != -1;) {
                if (count == 0) continue;
                size += count;
                if (size > max) throw new IOException("The file exceeds the permitted size.");
                digest.update(buffer, 0, count);
                byte[] chunk = cipher.update(buffer, 0, count);
                if (chunk != null) output.write(chunk);
            }
            output.write(cipher.doFinal());
            return new Info(size, hex(digest.digest()));
        } catch (GeneralSecurityException error) { throw new IOException("Secure storage could not encrypt this file.", error); }
    }
    static Info decrypt(InputStream input, OutputStream output, SecretKey key, String aad, long max) throws IOException {
        try {
            DataInputStream data = new DataInputStream(input);
            byte[] header = new byte[MAGIC.length], nonce = new byte[12];
            data.readFully(header); data.readFully(nonce);
            if (!Arrays.equals(header, MAGIC)) throw new IOException("The encrypted file format is invalid.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = 0, ciphertextSize = 0;
            byte[] buffer = new byte[32768];
            for (int count; (count = data.read(buffer)) != -1;) {
                if (count == 0) continue;
                ciphertextSize += count;
                if (ciphertextSize > max + 16) throw new IOException("The encrypted file exceeds the permitted size.");
                byte[] chunk = cipher.update(buffer, 0, count);
                if (chunk != null) { size += chunk.length; digest.update(chunk); output.write(chunk); }
            }
            byte[] tail = cipher.doFinal();
            size += tail.length;
            if (size > max) throw new IOException("The decrypted file exceeds the permitted size.");
            digest.update(tail); output.write(tail);
            return new Info(size, hex(digest.digest()));
        } catch (GeneralSecurityException error) { throw new IOException("This encrypted copy is damaged or belongs to another account.", error); }
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(Character.forDigit((value & 255) >>> 4, 16)).append(Character.forDigit(value & 15, 16));
        return result.toString();
    }
}
