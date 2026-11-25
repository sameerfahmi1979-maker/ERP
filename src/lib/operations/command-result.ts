import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";

export const operationsRefreshTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("supply"), job: fleetId.nullable().optional() }),
  z.strictObject({ kind: z.literal("workshop"), asset: fleetId, job: fleetId.optional() }),
  z.strictObject({ kind: z.literal("job-work"), job: fleetId.nullable() }),
  z.strictObject({ kind: z.literal("recovery") }),
]);
export type OperationsRefreshTarget = z.infer<typeof operationsRefreshTarget>;

export type OperationsRefreshResult =
  | { refreshFailed: false }
  | { refreshFailed: true; refreshTarget: OperationsRefreshTarget };

export type OperationsCommandResult<Receipt> =
  | ({ ok: true; receipt: Receipt } & OperationsRefreshResult)
  | { ok: false; error: string; uncertain: boolean };

