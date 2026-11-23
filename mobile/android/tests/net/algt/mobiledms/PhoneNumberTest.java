package net.algt.mobiledms;

public final class PhoneNumberTest {
    public static void main(String[] args) {
        expect("0501234567", " (050) 123-4567 ");
        expect("+971501234567", " +971 (50) 123-4567 ");
        expect("00971501234567", "00971 50 123 4567");
        expect("1234567", "123-4567");
        expect("+123456789012345", "+123456789012345");
        expect(null, "123456");
        expect(null, "+1234567890123456");
        for (String input : new String[]{null, "", " () - ", "tel:+971501234567", "https://1234567", "+97150ext1234567",
                "050+1234567", "++971501234567", "1234567;89", "1234567,89", "1234567/89", "1234567%23",
                "*1234567#", "1234567#", "1234567\n", "1234567\r", "123\t4567", "123\u00004567", "１２３４５６７"}) {
            expect(null, input);
        }
        System.out.println("Phone number passed (26 cases)");
    }

    private static void expect(String expected, String input) {
        String actual = PhoneNumber.normalize(input);
        if (!java.util.Objects.equals(expected, actual)) throw new AssertionError("For " + input + ": expected " + expected + ", got " + actual);
    }
}
