import { describe, expect, it } from "vitest";
import { renderDmsEmail, type DmsEmailEvent } from "@/lib/email/queue/dms-notice";

const source: DmsEmailEvent = {
  event: "expiry", documentId: 44, recipientId: 7, documentNo: "DMS-2026-000044", documentUpdatedAt: "2026-11-11T10:00:00+00:00",
  typeCode: "CICPA_PASS", expiry: "2027-02-25", employeeId: 6,
};

describe("branded DMS notification email", () => {
  it.each([
    ["expiry", "Expires 25 Feb 2027", "View document"],
    ["overdue", "Expired 25 Feb 2027", "View document"],
    ["approval-request", "Approval required", "Review approval"],
    ["approved", "Document approved", "View approval"],
    ["rejected", "Document returned", "View decision"],
  ] as const)("renders %s using the current event", (event, heading, action) => {
    const email = renderDmsEmail({ ...source, event }, 22, { name: "Synthetic Person", code: "EMP-000006" });
    expect(email.subject).toBe(`${heading} · DMS-2026-000044`);
    expect(email.htmlBody).toContain('alt="ALGT logo"');
    expect(email.htmlBody).toContain(action);
    expect(email.textBody).toContain(`${action}: https://erp.algt.net/dms/documents/record/44?notice=22`);
    expect(email.htmlBody).toContain("CICPA gate pass");
    expect(email.htmlBody).toContain("Synthetic Person (EMP-000006)");
  });

  it.each([null, "PASSPORT_COPY", "OFFSHORE_ONSHORE_MEDICAL_REPORT", "OTHER"])("minimizes sensitive or unknown type %s", typeCode => {
    const email = renderDmsEmail({ ...source, typeCode }, 22, { name: "Synthetic Person", code: "EMP-000006" });
    expect(email.subject).toBe("Document expiring · DMS-2026-000044");
    expect(JSON.stringify(email)).not.toMatch(/Synthetic Person|EMP-000006|25 Feb 2027|Document type/);
  });

  it("escapes HTML values and rejects malformed identifiers before building links", () => {
    const email = renderDmsEmail(source, 22, { name: "A <script>& B", code: "EMP-000006" });
    expect(email.htmlBody).toContain("A &lt;script&gt;&amp; B");
    expect(email.htmlBody).not.toContain("<script>");
    expect(() => renderDmsEmail(source, Infinity)).toThrow();
    expect(() => renderDmsEmail({ ...source, documentNo: "Bad\r\nSubject: injected" }, 22)).toThrow();
  });
});
