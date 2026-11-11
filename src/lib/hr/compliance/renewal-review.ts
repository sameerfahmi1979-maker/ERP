import { z } from "zod";
import { complianceChildKind } from "@/lib/hr/compliance-child-contract";
import { employeeDate, employeeId } from "@/lib/hr/employee-contract";

const renewalKind = z.union([complianceChildKind, z.literal("dependent")]);
const renewalCategory = z.enum([
  "identity-document", "medical-insurance", "access-card", "training-certificate", "medical-record",
  "dependent-passport", "dependent-eid", "dependent-visa", "dependent-insurance",
]);

export const complianceDmsRenewal = z.object({
  kind: renewalKind,
  category: renewalCategory,
  sourceId: employeeId,
  originalNo: z.string(),
  replacementId: employeeId,
  replacementNo: z.string(),
  replacementTitle: z.string(),
  replacementExpiry: employeeDate.nullable(),
}).strict();

export type ComplianceDmsRenewal = z.infer<typeof complianceDmsRenewal>;
