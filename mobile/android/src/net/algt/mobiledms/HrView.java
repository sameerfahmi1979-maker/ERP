package net.algt.mobiledms;

import android.widget.EditText;
import android.widget.LinearLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import static net.algt.mobiledms.ErpApi.*;
import static net.algt.mobiledms.LauncherActivity.*;

abstract class HrView {
    final HrWorkspace h;
    final LauncherActivity a;
    HrView(HrWorkspace workspace) { h = workspace; a = h.a; }
    interface Select { void row(JSONObject row); }

    static JSONObject copy(JSONObject source) {
        try { return new JSONObject(source.toString()); }
        catch (org.json.JSONException e) { throw new IllegalArgumentException(e); }
    }

    static void set(JSONObject value, String key, Object data) {
        try { value.put(key, data == null ? JSONObject.NULL : data); }
        catch (org.json.JSONException e) { throw new IllegalArgumentException(e); }
    }

    void choices(String heading, JSONObject command, Runnable back, Select select) {
        h.page(heading, back);
        EditText search = a.field(a.content, "Search choices", str(command,"search"), 100, 1);
        a.action("Search", () -> {
            JSONObject next = copy(command);
            set(next,"search",a.value(search));
            set(next,"after",0);
            choices(heading,next,back,select);
        }, false);
        h.subjectRead(command,result -> {
            JSONArray rows = result.getJSONArray("rows");
            if (rows.length()==0) a.subtitle("No permitted choices match.");
            for (int i=0;i<rows.length();i++) {
                JSONObject choice = rows.getJSONObject(i);
                a.action(str(choice,"label"), () -> select.row(choice),false);
            }
            if (result.optBoolean("more") && result.optLong("nextAfterId") > command.optLong("after")) {
                a.action("More choices", () -> {
                    JSONObject next = copy(command);
                    set(next,"after",result.optLong("nextAfterId"));
                    choices(heading,next,back,select);
                },false);
            }
        });
    }

    static String title(String key) {
        if (key.isEmpty()) return "";
        String words = key.replaceAll("([a-z])([A-Z])","$1 $2").replace('-',' ').replace('_',' ').toLowerCase(java.util.Locale.ROOT);
        return Character.toUpperCase(words.charAt(0))+words.substring(1);
    }

    void details(LinearLayout panel, JSONObject row, String... keys) {
        for (String key: keys) if (row.has(key)) {
            String value = str(row,key);
            if (row.opt(key) instanceof Boolean) value=row.optBoolean(key)?"Yes":"No";
            if (!value.isEmpty() && (key.endsWith("At") || key.equals("at"))) {
                try { value = java.time.OffsetDateTime.parse(value).atZoneSameInstant(java.time.ZoneId.of("Asia/Dubai"))
                    .format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm", java.util.Locale.ENGLISH))+" Dubai"; }
                catch (java.time.DateTimeException ignored) { }
            }
            a.detail(panel,title(key),first(value,"Unavailable"));
        }
    }

    void evidence(LinearLayout panel,JSONObject attachment) {
        if(attachment!=null && attachment.optLong("documentId")>0 && attachment.optLong("documentVersionId")>0)
            a.detail(panel,"Filed evidence","Document #"+attachment.optLong("documentId")+" · version reference #"+attachment.optLong("documentVersionId"));
    }

    void call(LinearLayout panel,String label,String number) {
        HrWorkspace.DialSource source = h.dialSource(number);
        if (source!=null) a.add(panel,a.button(label,()->a.openDialler(source),false),4);
    }

    void button(LinearLayout panel, String label, Runnable action) { a.add(panel,a.button(label,action,false),4); }
    static String today() { return HrRules.dubaiDate(java.time.Instant.now()).toString(); }
}
