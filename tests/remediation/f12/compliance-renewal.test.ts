import { expect, it } from "vitest";
import { complianceDmsRenewal } from "@/lib/hr/compliance/renewal-review";

const renewal = {
  kind: "access-card", category: "access-card", sourceId: 1, originalNo: "QA-OLD", replacementId: 4,
  replacementNo: "QA-NEW", replacementTitle: "Synthetic replacement", replacementExpiry: "2027-02-25",
};

it("accepts the completed renewal projection without confirmation data", () => {
  expect(complianceDmsRenewal.parse(renewal)).toEqual(renewal);
});

it("allows evidence without a recorded expiry and rejects invalid calendar days", () => {
  expect(complianceDmsRenewal.safeParse({ ...renewal, replacementExpiry: null }).success).toBe(true);
  expect(complianceDmsRenewal.safeParse({ ...renewal, replacementExpiry: "2027-02-29" }).success).toBe(false);
});

it("rejects unexpected sensitive or approval data", () => {
  expect(complianceDmsRenewal.safeParse({ ...renewal, medicalStatus: "Fit" }).success).toBe(false);
  expect(complianceDmsRenewal.safeParse({ ...renewal, fingerprint: "old confirmation" }).success).toBe(false);
});
