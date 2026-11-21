"use server";

import { cache } from "react";
import { z } from "zod";
import { fleetId as id } from "@/lib/fleet/asset-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const readMaterialActor = cache(getAuthContext);
const option = z.object({ id, label: z.string() });
const quantityEvent = z.object({ id, quantity: z.number(), at: z.string() });
const optionalText = z.string().nullable();

const receipt = z.object({
  id, label: optionalText, received_at: z.string(), delivered: z.number(),
  accepted: z.number(), rejected: z.number(), quarantined: z.number(),
  accepted_movement: id.nullable(), quarantine_movement: id.nullable(),
  inspections: z.array(quantityEvent.extend({ outcome: z.enum(["accepted", "rejected"]), movement: id.nullable() })),
  returns: z.array(quantityEvent.extend({ reference: optionalText, movement: id, original: id })),
});

const demand = z.object({
  id, label: z.string(), source_line: z.string(), source_revision: id.nullable(), owner: z.string(), uom: z.string(),
  created_at: z.string(), requested: z.number(), reserved: z.number(), issued: z.number(),
  returned: z.number(), reversed: z.number(), remaining: z.number(),
  reservations: z.array(quantityEvent.extend({
    reference: z.string(), state: z.enum(["reserved", "in-transit", "completed", "cancelled"]),
  })),
  movements: z.array(quantityEvent.extend({
    kind: z.enum(["issue", "unused-return", "reverse"]), reference: id.nullable(),
    valuation: z.enum(["pending-finance", "verified"]), amount: z.number().nullable(), currency: optionalText,
  })),
  corrections: z.array(quantityEvent.extend({
    kind: z.enum(["unused-return", "reverse"]), original: id, movement: id.nullable(),
    state: z.enum(["pending", "approved", "rejected"]),
  })),
  purchases: z.array(z.object({
    id, quantity: z.number(), approved_at: optionalText, reference: optionalText,
    supplier: optionalText, receipts: z.array(receipt),
  })),
});
const materialWorkspace = z.object({
  job: id, branch: id, cycle: id, revision: id, active: z.boolean(), can_request: z.boolean(),
  inventory: z.boolean(), procurement: z.boolean(), stock_route: z.boolean(), purchasing_route: z.boolean(),
  items: z.array(option.extend({ unit_id: id })), units: z.array(option), owners: z.array(option),
  demands: z.array(demand),
});

export async function readWorkshopMaterial(job: number) {
  if (!id.safeParse(job).success) return null;
  try {
    if (!canUseApplication(await readMaterialActor())) return null;
    const { data, error } = await (await createClient()).rpc("t12_material_workspace", { p_job: job }, { get: true });
    if (error) {
      logger.warn("Workshop material read failed", { code: error.code });
      return null;
    }
    const parsed = materialWorkspace.safeParse(data);
    if (!parsed.success && data !== null) logger.warn("Workshop material response validation failed");
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
