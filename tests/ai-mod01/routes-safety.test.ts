import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { buildEntityRoute } from "@/lib/ai/common/assistant/route-builder";
import { isBlockedDangerousRequest, isApprovedAction } from "@/lib/ai/common/assistant/action-registry";

describe("canonical route and read/mutation separation", () => {
  it.each(["company", "organization", "party", "branch", "site", "work_site", "document", "dms_document"])("%s uses an actual current page", type => {
    const route = buildEntityRoute(type, 17)!; const page = "src/app/(protected)" + route.replace(/\/17$/, "/[id]") + "/page.tsx";
    expect(existsSync(page), page).toBe(true);
  });
  it.each([0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid route identity %s", id => expect(buildEntityRoute("company", id)).toBeNull());
  it.each(["constructor", "__proto__", "https://evil.example", "not_registered"])("rejects unknown/prototype route %s", type => { expect(buildEntityRoute(type, 1)).toBeNull(); expect(isApprovedAction(type as never)).toBe(false); });
  it.each(["How do I delete a document?", "Where can I approve this document?", "Why did sending email fail?", "Explain the approval workflow"])("allows informational question %s", text => expect(isBlockedDangerousRequest(text)).toBe(false));
  it.each(["Delete this document", "Send an email now", "Approve the document", "How do approvals work; delete this document", "Explain the workflow and then approve the document", "How do I correct this?\nSend email now"])("still blocks actual command %s", text => expect(isBlockedDangerousRequest(text)).toBe(true));
});
