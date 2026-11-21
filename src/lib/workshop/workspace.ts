import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";

export const workshopPermissions = [
  "fleet.inspections.report", "workshop.assess", "workshop.jobs.manage",
  "workshop.jobs.release", "fleet.maintenance.manage",
] as const;

export const findingKinds = {
  "custody-return": "Signed custody return",
  "dispatch-inspection": "Failed pre-trip inspection",
  inspection: "Inspection finding",
  incident: "Incident",
  "reported-failure": "Reported failure",
  "planned-service": "Planned service",
} as const;

export const clockUnits = {
  days: "Calendar days", km: "Kilometres", hours: "Engine hours", cycles: "Cycles", "usage-hours": "Usage hours",
} as const;

const text = z.string().nullable();
const amount = z.number().nullable();
const person = z.object({ id: fleetId, name: z.string(), code: text });

export const workshopAssetList = z.array(z.object({
  id: fleetId, asset_no: z.string(), name: z.string(), needs_assessment: z.boolean(),
}));
export const workshopJob = z.object({
  id: fleetId, cycle: fleetId, revision: fleetId, state: z.enum(["triage", "planned", "in-progress", "qc", "closed"]),
  scope: z.string(), held: z.boolean(), closed: text, worker: fleetId.nullable(),
  plan_start: text, plan_end: text, actual_start: text, actual_end: text, actual_work: text, estimate: amount,
  cost: amount, warranty: text, warranty_until: text, qc: text, returned: text, proof: fleetId.nullable(),
  independent_qc: z.boolean(), workers: z.array(person).nullable(),
  events: z.array(z.object({ revision: fleetId, operation: z.string(), at: z.string(), reason: z.string(), by: z.string() })).nullable(),
});
const findingKind = z.enum(["custody-return", "dispatch-inspection", "inspection", "incident", "reported-failure", "planned-service"]);
const clockStatus = z.object({
  status: z.enum(["current", "upcoming", "due", "overdue", "unavailable"]),
  unavailable: text, remaining: amount, due_day: text, due_reading: amount, observed: amount,
  blocking: z.boolean(), reminder_active: z.boolean(),
});
export const workshopClock = z.object({
  id: fleetId, label: z.string(), unit: z.enum(["days", "km", "hours", "cycles", "usage-hours"]),
  revision: fleetId, baseline_day: z.string(), baseline_value: z.number(), interval: z.number(),
  notice: z.number(), tolerance: z.number(), max_age: z.number(), block: z.boolean(), editable: z.boolean(), current: clockStatus,
  history: z.array(z.object({
    id: fleetId, base_day: z.string(), action: z.string(), reason: z.string(), last_service_job: fleetId.nullable(),
    previous_service_status: clockStatus.extend({
      compliance: z.enum(["on-time", "within-tolerance", "late", "unavailable"]), rule_version: fleetId, completed_at: z.string(),
    }).nullable(),
  })).nullable(),
});
export const workshopDocument = z.object({
  document: fleetId, version: fleetId, file: fleetId, number: z.string(), title: z.string(), type: z.string(),
});
export const workshopWorkspace = z.object({
  asset: fleetId, number: z.string(), name: z.string(), report: z.boolean(), maintenance: z.boolean(),
  documents: z.array(workshopDocument), clocks: z.array(workshopClock),
  cases: z.array(z.object({
    id: fleetId, kind: findingKind, reference: z.string(), finding: z.string(), occurred: z.string(), reported_by: z.string(),
    assessed_by: text, outcome: z.enum(["usable-as-is", "repair"]).nullable(), diagnosis: text, proof: fleetId.nullable(),
    blocking: z.boolean(), can_refer: z.boolean(), can_assess: z.boolean(), manage: z.boolean(), release: z.boolean(),
    clock: fleetId.nullable(), jobs: z.array(workshopJob), can_print: z.boolean().optional(),
  })),
});
export const workshopReferrals = z.array(z.object({
  id: fleetId, employee_id: fleetId, employee: z.string(), asset_no: z.string(), source_kind: findingKind, occurred_at: z.string(),
  referred_at: z.string(), reason: z.string(), diagnosis: z.string(), proof: fleetId.nullable(),
}));
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
export const workshopRequest = z.object({
  nonce: z.string().uuid(), asset: fleetId,
  action: z.enum(["report", "assess", "plan", "start", "submit-qc", "return-to-work", "release", "reopen", "create",
    "edit", "activate-reminder", "deactivate-reminder", "record-service", "reading"]),
  data: z.record(z.string(), z.union([scalar, z.object({ document: fleetId, version: fleetId, file: fleetId })])),
});
export type WorkshopRequest = z.infer<typeof workshopRequest>;
export type WorkshopWorkspace = z.infer<typeof workshopWorkspace>;
export type WorkshopDocument = z.infer<typeof workshopDocument>;
export type WorkshopJob = z.infer<typeof workshopJob>;
export type WorkshopClock = z.infer<typeof workshopClock>;
