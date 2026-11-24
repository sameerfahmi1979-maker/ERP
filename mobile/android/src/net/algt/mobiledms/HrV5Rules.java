package net.algt.mobiledms;

final class HrV5Rules {
    static boolean subject(long expected, long actual) { return expected > 0 && actual == expected; }

    static boolean selfAction(long selected,long linked,boolean permitted){return permitted && subject(selected,linked);}
    static boolean offered(String[] choices,String proposed){
        if(proposed.isEmpty())return false;
        for(String choice:choices)if(proposed.equals(choice))return true;
        return false;
    }
    static boolean photoHeader(long e,String employeeHeader,String expected,String actual){
        return e>0 && Long.toString(e).equals(employeeHeader) && expected.matches("[a-f0-9]{64}") && expected.equals(actual);
    }

    static boolean full(String visibility, boolean readable) { return readable && "full".equals(visibility); }

    static boolean restore(String owner, long epoch, String account, long current, boolean authorized) {
        return authorized && epoch >= 0 && epoch == current && !owner.isEmpty() && owner.equals(account);
    }

    static int sample(int width, int height, int target) {
        if (width < 1 || height < 1 || width > 16384 || height > 16384 || (long) width * height > 64000000 || target < 1) return 0;
        int sample = 1;
        while (Math.max(width,height) / sample > target) sample *= 2;
        return sample;
    }

    static String effect(String value) {
        switch (value) {
            case "approved": return "Accepted for HR action";
            case "rejected": return "Rejected";
            case "acknowledged": case "recorded": return "Receipt acknowledged";
            case "fulfilled": return "Fulfilled";
            case "submitted": return "Submitted";
            case "pending": return "Pending";
            default: return value.replace('-', ' ');
        }
    }

    static boolean receiptEffect(String command,String decision,String effect) {
        switch(command) {
            case "serviceSubmit":return "submitted".equals(effect);
            case "issueAcknowledge":return "acknowledged".equals(effect);
            case "serviceFulfil":return "fulfilled".equals(effect);
            case "serviceDecision":return "approve".equals(decision)?"approved".equals(effect):"reject".equals(decision)&&"rejected".equals(effect);
            default:return false;
        }
    }

    static String receipt(String command) {
        switch(command) {
            case "serviceSubmit": case "serviceDecision": case "serviceFulfil": case "issueAcknowledge": return "serviceReceipt";
            case "rosterSave": return "rosterReceipt";
            default: return "receipt";
        }
    }
}
