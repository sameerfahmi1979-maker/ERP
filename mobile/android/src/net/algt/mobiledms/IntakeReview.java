package net.algt.mobiledms;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import static net.algt.mobiledms.ErpApi.object;
import static net.algt.mobiledms.ErpApi.str;

final class IntakeReview {
    final JSONObject upload;
    final DmsReviewContext member;
    final DmsIntakeEntry ordinary;
    final JSONArray types;
    final Map<Long, String> metadata = new HashMap<>();
    final JSONObject extracted;
    final JSONArray levels;
    final long aiResultId;
    long typeId;
    boolean originalViewed;
    String title, description, issue, expiry, confidentiality, standardFileName = "";
    JSONArray tagIds = new JSONArray();

    IntakeReview(JSONObject upload, JSONArray types) {
        this(upload,types,null);
    }
    IntakeReview(JSONObject upload, JSONArray types,DmsReviewContext member) {
        this(upload,types,member,null);
    }
    IntakeReview(JSONObject upload,JSONArray types,DmsReviewContext member,DmsIntakeEntry ordinary){
        this.member=member;this.ordinary=ordinary;
        this.upload = upload;
        this.types = types;
        JSONObject ai = upload.optJSONObject("ai");
        extracted = ai == null ? null : ai.optJSONObject("fields");
        levels = upload.optJSONArray("confidentialityLevels");
        aiResultId = ai == null ? 0 : ai.optLong("id");
        typeId = ai == null ? 0 : ai.optLong("typeId");
        title = first(str(ai, "title"), str(upload, "name").replaceFirst("(?i)\\.pdf$", ""));
        description = str(ai, "description");
        issue = first(str(ai, "issue"), str(extracted, "issue_date"));
        expiry = first(str(ai, "expiry"), str(extracted, "expiry_date"));
        confidentiality = first(str(extracted, "confidentiality_level"), str(type(), "confidentiality"));
        if (!hasLevel(confidentiality)) confidentiality = str(type(), "confidentiality");
        JSONArray saved = upload.optJSONArray("draft");
        if (saved != null) for (int i = 0; i < saved.length(); i++) applySaved(saved.optJSONObject(i));
        if(member!=null&&member.requiredType>0)typeId=member.requiredType;
        if (!hasLevel(confidentiality)) confidentiality = str(type(), "confidentiality");
    }

    JSONObject type() {
        for (int i = 0; i < types.length(); i++) {
            JSONObject item = types.optJSONObject(i);
            if (item != null && item.optLong("id") == typeId) return item;
        }
        return null;
    }

    void selectType(JSONObject item) {
        long id = item.optLong("id");
        if (typeId == id || (member!=null&&member.requiredType!=0&&id!=member.requiredType)) return;
        typeId = id;
        standardFileName = "";
        confidentiality = str(item, "confidentiality");
    }

    String metadataValue(JSONObject definition) {
        String edited = metadata.get(definition.optLong("id"));
        if (edited != null) return edited;
        Object candidate = extracted == null ? null : extracted.opt(str(definition, "code"));
        return candidate == null || candidate == JSONObject.NULL ? "" : candidate.toString();
    }

    JSONObject input(JSONArray fields) throws Exception {
        if (type() == null) throw new IOException("Choose the document type.");
        if (title.isEmpty()) throw new IOException("Enter the document title.");
        validateDate(issue, "issue");
        validateDate(expiry, "expiry");
        if (expiry.isEmpty() && type().optBoolean("expiryRequired")) throw new IOException("Enter the expiry date for this document type.");
        if (!issue.isEmpty() && !expiry.isEmpty() && expiry.compareTo(issue) < 0) throw new IOException("Expiry must be on or after the issue date.");
        JSONArray values = new JSONArray();
        for (int i = 0; i < fields.length(); i++) {
            JSONObject field = fields.getJSONObject(i);
            String value = metadataValue(field).trim();
            if (value.isEmpty() && field.optBoolean("required")) throw new IOException("Complete " + str(field, "label") + ".");
            if (!value.isEmpty()) {
                String kind = field.getString("type");
                if ("date".equals(kind)) validateDate(value, field.getString("label"));
                values.put(object("definitionId", field.getLong("id"), "fieldType", kind, "rawValue", value));
            }
        }
        JSONArray links = new JSONArray();
        String subject = str(upload, "entityType");
        long subjectId = upload.optLong("entityId");
        if (("employee".equals(subject) || "site".equals(subject)) && subjectId > 0) {
            links.put(object("entityType", subject, "entityId", subjectId, "isPrimary", true));
        }
        JSONObject input = object("uploadSessionId", upload.getLong("id"), "documentTypeId", typeId,
            "title", title, "description", optional(description), "issueDate", optional(issue), "expiryDate", optional(expiry),
            "metadataValues", values, "links", links, "tagIds", tagIds, "aiResultId", aiResultId > 0 ? aiResultId : null);
        if (hasLevel(confidentiality)) input.put("confidentialityLevel", confidentiality);
        if (!standardFileName.isEmpty()) input.put("standardFileName", standardFileName);
        return input;
    }

    private boolean hasLevel(String level) {
        if (levels == null) return false;
        for (int i = 0; i < levels.length(); i++) if (level.equals(levels.optString(i))) return true;
        return false;
    }

    private void applySaved(JSONObject entry) {
        if (entry == null) return;
        String scope = str(entry, "scope"), code = str(entry, "code");
        Object value = entry.opt("value");
        if ("metadata".equals(scope) && value instanceof String) {
            try { metadata.put(Long.parseLong(code), (String) value); }
            catch (NumberFormatException ignored) { }
        } else if ("document".equals(scope)) {
            if ("document_type_id".equals(code)) typeId = entry.optLong("value");
            else if ("tag_ids".equals(code) && value instanceof JSONArray) tagIds = (JSONArray) value;
            else if (value instanceof String) {
                String text = (String) value;
                switch (code) {
                    case "title": title = text; break;
                    case "description": description = text; break;
                    case "issue_date": issue = text; break;
                    case "expiry_date": expiry = text; break;
                    case "confidentiality_level": confidentiality = text; break;
                    case "standard_file_name": standardFileName = text; break;
                    default: break;
                }
            }
        }
    }

    private static void validateDate(String date, String label) throws IOException {
        if (date.isEmpty()) return;
        try {
            if (!date.matches("[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
            java.time.LocalDate.parse(date);
        } catch (RuntimeException error) { throw new IOException("Enter a valid " + label + " date (YYYY-MM-DD)."); }
    }

    private static Object optional(String value) { return value.isEmpty() ? null : value; }
    private static String first(String value, String other) { return value.isEmpty() ? other : value; }
}
