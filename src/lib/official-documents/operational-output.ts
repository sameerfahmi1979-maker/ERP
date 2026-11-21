import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";

export const operationalOutputKind = z.enum(["custody", "timesheet", "assessment", "job-card", "fine", "recovery"]);
type OperationalOutputKind = z.infer<typeof operationalOutputKind>;

const reference = z.string().min(1).max(250);
const checksum = z.string().regex(/^[0-9a-f]{64}$/);
export const operationalEvidence = z.strictObject({
  document: fleetId,
  version: fleetId,
  file: fleetId,
  label: reference,
  reference,
  checksum,
  current: z.boolean(),
});
export const operationalOutput = z.strictObject({
  kind: operationalOutputKind,
  source: fleetId,
  title: reference,
  reference,
  company: reference,
  company_ar: reference.nullable(),
  branch: reference,
  revision: reference,
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  source_checksum: checksum,
  rows: z.array(z.tuple([reference, z.string().max(8000).nullable()])).max(160),
  evidence: z.array(operationalEvidence).max(250),
});
export type OperationalOutput = z.infer<typeof operationalOutput>;

export function outputPath(kind: OperationalOutputKind, id: number): string {
  return "/api/integrated-outputs/" + kind + "/" + id;
}
