import { describe, expect, it } from "vitest";
import { masterRecordCode } from "../form-code";

describe("master-data immutable codes", () => {
  it.each(["designation_code", "site_code", "role_code", "rule_code"])(
    "uses the saved %s when an edit omits its disabled input",
    field => {
      const form = new FormData();
      expect(masterRecordCode(form, field, "EXISTING-001")).toBe("EXISTING-001");
      form.set(field, "ALTERED-999");
      expect(masterRecordCode(form, field, "EXISTING-001")).toBe("EXISTING-001");
      expect(masterRecordCode(form, field)).toBe("ALTERED-999");
    },
  );
  it("returns null for a missing new-record code, allowing validation to reject it", () => {
    expect(masterRecordCode(new FormData(), "designation_code")).toBeNull();
  });
});
