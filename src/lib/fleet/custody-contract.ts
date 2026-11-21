import { z } from "zod";
import { fleetCategory, fleetId } from "@/lib/fleet/asset-contract";

const time = z.iso.datetime({ offset: true });
const choice = z.object({ id: fleetId, label: z.string() });
const kind = z.enum(["workshop", "hse"]);
const status = z.enum(["tentative", "confirmed", "active", "closed", "cancelled"]);
export const custodyActions = [
  "tentative", "reserve", "confirm", "cancel", "request-loan", "approve-loan",
  "checkout", "return", "transfer", "dispatch", "place-hold", "release-hold",
] as const;
export type CustodyAction = typeof custodyActions[number];

export const custodyCommand = z.object({
  action: z.enum([...custodyActions, "prepare-policy", "approve-policy"]),
  operation: z.uuid(), asset: fleetId, company: fleetId,
  data: z.record(z.string(), z.unknown()),
}).strict();
export type CustodyCommand = z.infer<typeof custodyCommand>;
export const custodyReceipt = z.object({
  id: fleetId, status: z.string(), replayed: z.boolean(),
  asset_id: fleetId.optional(), revision: fleetId.optional(),
}).strict();

export const custodyChoices = z.object({
  workers: z.array(choice.extend({ company: fleetId, branch: fleetId })).max(40),
  sites: z.array(choice).max(100),
});

export const fleetExitScopes = z.array(z.strictObject({ company: fleetId, branch: fleetId, label: z.string() }));
export const fleetExitTasks = z.array(z.strictObject({
  eos_id: fleetId,
  employee_id: fleetId,
  commitment_id: fleetId,
  asset_id: fleetId,
  asset_title: z.string(),
  status: z.literal("active"),
  revision: fleetId,
  planned_return: time,
  managed_by_operation: z.boolean(),
  owning_operation: fleetId.nullable(),
}));
export type FleetExitScope = z.infer<typeof fleetExitScopes>[number];
export type FleetExitTask = z.infer<typeof fleetExitTasks>[number];

export const custodyWorkspace = z.object({
  asset: fleetId, asset_no: z.string(), asset_name: z.string(), company: fleetId, category: fleetCategory,
  can_manage: z.boolean(), can_plan: z.boolean(), can_approve: z.boolean(),
  can_workshop: z.boolean(), can_hse: z.boolean(), can_policy: z.boolean(),
  commitments: z.array(z.object({
    id: fleetId, kind: z.enum(["reservation", "custody", "dispatch"]), status, revision: fleetId,
    employee: fleetId, employee_name: z.string(), site: fleetId, site_name: z.string(),
    from: time, planned_return: time, actual_return: time.nullable(), overdue: z.boolean(),
    assigned_driver: fleetId.nullable(),
    can_print: z.boolean().optional(),
    managed_by_operation: z.boolean().optional(),
    owning_operation: fleetId.nullable().optional(),
    events: z.array(z.object({
      kind: z.string(), at: time, reason: z.string(), meter: z.number().nullable(),
      meter_unit: z.enum(["km", "hours"]).nullable(), condition: z.string().nullable(),
      discrepancy: z.boolean(), signed: z.boolean(),
    })),
  })).max(26),
  loans: z.array(z.object({
    id: fleetId, commitment: fleetId.nullable(), revision: fleetId.nullable(),
    employee_name: z.string(), site_name: z.string(), start: time, until: time,
    status: z.enum(["pending", "approved"]),
  })).max(30),
  holds: z.array(z.object({
    id: fleetId, kind, placed_at: time, released_at: time.nullable(), reason: z.string().nullable(),
  })).max(30),
  signed_choices: z.array(z.object({ document: fleetId, version: fleetId, file: fleetId, label: z.string() })),
  policies: z.array(z.object({
    id: fleetId, from: z.iso.date(), until: z.iso.date(), approved: z.boolean(), prepared_by_me: z.boolean(),
    routine_minutes: z.number().int(), signed_handover: z.boolean(), tentative_allowed: z.boolean(),
    registration_required: z.boolean(), insurance_required: z.boolean(),
    licence_type: fleetId.nullable(), access_type: fleetId.nullable(), employee_category: fleetId.nullable(),
    reason: z.string(),
  })).max(20),
  policy_choices: z.object({
    licences: z.array(choice), access: z.array(choice), employee_categories: z.array(choice),
  }).nullable(),
});
export type CustodyWorkspace = z.infer<typeof custodyWorkspace>;
export type CustodyChoices = z.infer<typeof custodyChoices>;

export const fleetBoard = z.array(z.object({
  asset: fleetId, status: z.enum(["draft", "retired", "custody", "dispatch", "held", "reserved", "check-required"]),
  due: time.nullable(), overdue: z.boolean(), held: z.boolean(),
})).max(50);

export const availabilityBlockers = {
  "asset-unverified": "The asset has not been released in the register.",
  "policy-missing": "An approved Fleet policy is required for the selected dates.",
  "employee-scope": "The employee has no verified employment in this scope for the selected dates.",
  "worker-compatibility": "The employee category does not match the asset rule.",
  "site-scope": "The site is outside the permitted operating scope or dates.",
  "maintenance-overdue": "An enforced maintenance clock is overdue.",
  "workshop-hold": "Workshop assessment is open.",
  "hse-hold": "An HSE hold is active.",
  "hr-operational-hold": "An HR operational restriction is active.",
  "employee-on-leave": "The employee has approved leave in the selected window.",
  "licence-required": "A current verified driverâ€™s licence is required.",
  "site-credential-required": "A current verified site credential is required.",
  "site-policy-required": "The site needs an approved credential rule.",
  "registration-required": "Verified registration must cover the full window.",
  "insurance-required": "Verified insurance must cover the full window.",
  "asset-committed": "The asset has an overlapping hard commitment.",
  "employee-committed": "The employee has an overlapping hard commitment.",
} as const;
const blocker = z.enum(Object.keys(availabilityBlockers) as (keyof typeof availabilityBlockers)[]);
export const fleetAvailability = z.object({
  available: z.boolean(), blockers: z.array(blocker), as_of: time, policy_id: fleetId.nullable(),
});
export type FleetAvailability = z.infer<typeof fleetAvailability>;

export const custodyOccurrence = z.object({
  status: z.enum(["unavailable", "no-record", "custody-candidate", "verified-dispatch"]),
  asset_id: fleetId.optional(), commitment_id: fleetId.nullable().optional(),
  custody_candidate: fleetId.nullable().optional(), verified_driver: fleetId.nullable().optional(),
});
export const availabilityInput = z.object({ asset: fleetId, employee: fleetId, site: fleetId, from: time, until: time });
export const occurrenceInput = z.object({
  asset: fleetId.optional(), at: time, jurisdiction: z.string().trim().max(24).optional(),
  plateClass: z.string().trim().max(24).optional(), plate: z.string().trim().max(32).optional(),
});
