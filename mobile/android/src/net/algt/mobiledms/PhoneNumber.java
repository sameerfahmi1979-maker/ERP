package net.algt.mobiledms;

final class PhoneNumber {
    private static final int MIN_DIGITS = 7;
    private static final int MAX_DIGITS = 15;

    /** Accept only ordinary dialable numbers with common visual separators. */
    static String normalize(String input) {
        if (input == null) return null;
        StringBuilder number = new StringBuilder(MAX_DIGITS + 1);
        int digits = 0;
        for (int index = 0; index < input.length(); index++) {
            char ch = input.charAt(index);
            if (ch >= '0' && ch <= '9') {
                if (++digits > MAX_DIGITS) return null;
                number.append(ch);
            } else if (ch == '+' && number.length() == 0) {
                number.append(ch);
            } else if (ch != ' ' && ch != '-' && ch != '(' && ch != ')') {
                return null;
            }
        }
        return digits >= MIN_DIGITS ? number.toString() : null;
    }
}
