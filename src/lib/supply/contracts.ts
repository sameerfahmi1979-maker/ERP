import { z } from "zod";
import { fleetId as id } from "@/lib/fleet/asset-contract";

const textOrNull = z.string().nullable();
const idOrNull = id.nullable();
const numberOrNull = z.number().nullable();
const option = z.object({ id, label: z.string() });
export const workspaceKinds = z.enum(["inventory", "procurement", "fuel"]);
export const supplyBranchList = z.array(z.object({ id, name: z.string(), company: z.string() }));
export const supplyActionQueueKinds = z.enum(["receiving", "stock-review"]);
export const supplyActionQueuePage = z.number().int().min(1).max(1_000_000);
export const supplyActionQueueSearch = z.string().trim().max(120);
const queuePage = z.object({
  page: supplyActionQueuePage, pageSize: z.number().int().min(1).max(100),
  totalCount: z.number().int().nonnegative(),
});
export const supplyActionQueue = z.discriminatedUnion("queue", [
  queuePage.extend({ queue: z.literal("receiving"), rows: z.array(option.extend({
    item: z.string(), uom: id, quantity: z.number(), delivered: z.number(),
    remaining: z.number().positive(), supplier: textOrNull,
  })) }),
  queuePage.extend({ queue: z.literal("stock-review"), rows: z.array(option.extend({
    item: z.string(), kind: z.string(), quantity: z.number(),
  })) }),
]);
export const stockMovement = z.object({
  id, kind: z.string(), quantity: z.number(), item: z.string(), uom: z.string(), owner: z.string(),
  recorded_at: z.string(), revision: id, reference: idOrNull, from_layer: idOrNull, to_layer: idOrNull,
  valuation: z.enum(["pending-finance", "verified"]), amount: numberOrNull, currency: textOrNull,
});
export const supplyWorkspace = z.object({
  branch: id, name: z.string(), rights: z.array(z.string()), company_setup: z.boolean(),
  units: z.array(option.extend({ decimals: z.number() })),
  items: z.array(option.extend({ uom: id, kind: z.string(), trace: z.string() })),
  owners: z.array(option), bins: z.array(option.extend({ kind: z.string(), branch: id })),
  policies: z.array(z.object({ id, domain: z.string(), decision: textOrNull, reason: z.string(), name: z.string(), can_decide: z.boolean() })),
  demands: z.array(option.extend({ item_id: id, owner_id: id, quantity: z.number(), job_id: idOrNull, fuel_id: idOrNull, active: z.boolean() })),
  sites: z.array(option).optional(), parties: z.array(option).optional(), approvers: z.array(option).optional(),
  jobs: z.array(option).optional(), fuel: z.array(option.extend({ litres: z.number() })).optional(),
  layers: z.array(option.extend({ uom: id, kind: z.string(), on_hand: z.number(), reserved: z.number(), revision: id,
    lot: textOrNull, serial: textOrNull, count_root: idOrNull, count_total: numberOrNull, owner: z.string(), valued: z.boolean(),
    bin_id: id })).optional(),
  reservations: z.array(option.extend({ state: z.string(), quantity: z.number(), destination_bin: idOrNull, demand_id: idOrNull, layer_id: id })).optional(),
  reviews: z.array(option.extend({ kind: z.string(), outcome: textOrNull, quantity: z.number(), movement_id: idOrNull })).optional(),
  movements: z.array(stockMovement).optional(),
  suppliers: z.array(option).optional(),
  purchases: z.array(option.extend({ approved_at: textOrNull, quantity: z.number(), delivered: z.number(),
    item_id: id, uom: id, supplier: textOrNull })).optional(),
  receipts: z.array(option.extend({ purchase_id: id, delivered: z.number(), accepted: z.number(),
    rejected: z.number(), quarantined: z.number(), lot: textOrNull, serial: textOrNull, received_at: z.string(), uom: id,
    accepted_movement: idOrNull, quarantine_movement: idOrNull,
    inspections: z.array(z.object({ id, outcome: z.string(), quantity: z.number(), movement: idOrNull })),
    returns: z.array(z.object({ id, quantity: z.number(), movement: id, reference: z.string() })),
  })).optional(),
});
export const fuelAssetList = z.object({ assets: z.array(option) });
export const fuelWorkspace = z.object({
  asset: id, label: z.string(), report: z.boolean(), suppliers: z.array(option), bins: z.array(option), items: z.array(option), owners: z.array(option),
  evidence: z.array(z.object({ document: id, version: id, file: id, label: z.string() })),
  vouchers: z.array(z.object({
    id, reference: z.string(), source_kind: z.string(), source_ref: z.string(), occurred_at: z.string(), litres: z.number(),
    meter_unit: z.string(), meter_value: z.number(), accepted_at: textOrNull, reason: z.string(), booked_litres: z.number(),
    issues: z.array(z.object({ id, issued: z.number(), returned: z.number() })),
    file: idOrNull, can_verify: z.boolean(),
  })),
});
export const supplyRequest = z.object({
  nonce: z.string().uuid(), parent: id, family: z.enum(["setup", "stock", "purchase", "fuel"]), action: z.string().min(1).max(24),
  data: z.record(z.string().max(31), z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null(),
    z.object({ document: id, version: id, file: id })])),
});
export const supplyActionReceipt = z.object({
  id, replayed: z.boolean(), movement: idOrNull.optional(), accepted_movement: idOrNull.optional(),
  quarantine_movement: idOrNull.optional(), revision: id.optional(),
});
export type SupplyRequest = z.infer<typeof supplyRequest>;
export type SupplyWorkspace = z.infer<typeof supplyWorkspace>;
export type SupplyActionQueue = z.infer<typeof supplyActionQueue>;
export type FuelWorkspace = z.infer<typeof fuelWorkspace>;
