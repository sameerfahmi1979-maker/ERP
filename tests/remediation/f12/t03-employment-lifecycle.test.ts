import { expect, it } from "vitest";
import { recruitmentLifecycleRequest } from "@/lib/hr/recruitment-lifecycle-contract";

const finishJoining = {
  kind: "joining", candidateId: 12, id: 12, revision: "4", action: "finish",
  reason: "Actual arrival verified",
};

it("requires the actual joining date without accepting unrelated decision fields", () => {
  expect(recruitmentLifecycleRequest.safeParse({ ...finishJoining, values: {} }).success).toBe(false);
  expect(recruitmentLifecycleRequest.safeParse({ ...finishJoining, values: { actual_joining_date: "2026-11-18" } }).success).toBe(true);
  expect(recruitmentLifecycleRequest.safeParse({ ...finishJoining, values: { actual_joining_date: "2026-02-30" } }).success).toBe(false);
  expect(recruitmentLifecycleRequest.safeParse({ ...finishJoining, values: { actual_joining_date: "2026-11-18", owner_company_id: 9 } }).success).toBe(false);
});
