package net.algt.mobiledms;

import org.json.JSONObject;

public final class DmsOfflineSelectionTest {
    private static final String HASH = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

    public static void main(String[] args) throws Exception {
        JSONObject doc = new JSONObject().put("id", 9).put("currentVersionId", 14);
        JSONObject file = new JSONObject().put("id", 21).put("versionId", 14)
            .put("role", "original").put("mime", "application/pdf").put("sourceHash", HASH)
            .put("canPreview", true).put("canDownload", true);
        expect("?fileId=21&disposition=attachment&expectedDocumentId=9&expectedVersionId=14&expectedSourceHash=" + HASH,
            DmsDocuments.offlineAttachmentPath(doc, file), "direct current original pins the exact transfer");
        expect(null, DmsDocuments.offlineAttachmentPath(doc, changed(file, "versionId", 13)), "historical version");
        expect(null, DmsDocuments.offlineAttachmentPath(doc, changed(file, "role", "attachment")), "attachment");
        expect(null, DmsDocuments.offlineAttachmentPath(doc, changed(file, "mime", "application/msword")), "unsupported MIME");
        expect(null, DmsDocuments.offlineAttachmentPath(doc, changed(file, "canPreview", false)), "no preview permission");
        expect(null, DmsDocuments.offlineAttachmentPath(doc, changed(file, "canDownload", false)), "no download permission");
        expect(null, DmsDocuments.offlineAttachmentPath(changed(doc, "selectedEmployee", 42), file), "employee-linked selection");
        System.out.println("PASS DmsOfflineSelectionTest");
    }

    private static JSONObject changed(JSONObject source, String key, Object value) throws Exception {
        return new JSONObject(source.toString()).put(key, value);
    }

    private static void expect(String expected, String actual, String label) {
        if (!java.util.Objects.equals(expected, actual)) throw new AssertionError(label);
    }
}
