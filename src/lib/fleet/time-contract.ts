import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { operationalEvidence } from "@/lib/official-documents/operational-output";

export const fleetTimeDate = z.iso.date();
export const fleetTimeInstant = z.iso.datetime({ offset: true });
const id = fleetId;
const text = z.string();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timeBounds = { from: fleetTimeInstant, until: fleetTimeInstant };

export const fleetTimeOrder = z.object({
  id, number: text, subject: text, can_propose: z.boolean(), can_record: z.boolean(),
  assignments: z.array(z.object({ id, asset: text, employee: text, from: fleetTimeInstant, until: fleetTimeInstant.nullable() })),
  hosts: z.array(z.object({ id, assignment: id, company: text, branch: text, ...timeBounds,
    accepted: z.boolean(), can_accept: z.boolean(), can_record: z.boolean() })),
  work: z.array(z.object({
    id, assignment: id, employee: text, date: fleetTimeDate, ...timeBounds, minutes: z.number(), matched_minutes: z.number(),
    activity: z.enum(["customer-rental", "internal"]), host: text, review: id.nullable(), can_verify: z.boolean(),
    can_print: z.boolean().optional(),
    can_file_sheet: z.boolean().optional(), internal_sheets: z.array(operationalEvidence).optional(),
    source_digest: digest, attendance_linked: z.boolean(), payroll_reviewed: z.boolean(),
    eligible_minutes: z.number(), eligibility: text,
    sources: z.array(z.object({ usage: id, document: id, evidence: id, file: id, version: id,
      state: z.enum(["signed", "missing", "disputed"]), current: z.boolean(), span: text })),
  })).max(26),
});

export const fleetAttendanceDrafts = z.array(z.object({
  employee: id, name: text, code: text, attendance: id.nullable(), status: text.nullable(),
  eligible: z.boolean(), leave: z.boolean(), token: digest, can_create: z.boolean(),
  entered: z.object({
    intervals: z.array(z.object({ start: fleetTimeInstant, end: fleetTimeInstant, breaks: z.array(z.object({
      start: fleetTimeInstant, end: fleetTimeInstant,
    })) })),
  }).nullable(),
  works: z.array(z.object({ id, ...timeBounds, order: id, site: text, linked_minutes: z.number(), reviewed: z.boolean() })),
})).max(26);

export const fleetPayrollQueue = z.array(z.object({
  work: id, employee: id, name: text, date: fleetTimeDate, status: text, digest: digest.nullable(),
  minutes: z.number(), rate: text.nullable(), amount: text.nullable(), currency: text.nullable(), rule: id.nullable(),
  basis: text.nullable(), available: fleetTimeInstant.nullable(),
})).max(26);

export const fleetPayrollCandidates = z.array(z.object({
  id, work: id, employee: id, employment: id, employer: id, host: id, date: fleetTimeDate,
  minutes: z.number(), periods: text, currency: text, amount: text, rule: id, available: fleetTimeInstant,
  snapshot: z.object({
    status: z.literal("ready"), eligible: text, review: id, attendance_link: id, employment: id, day: fleetTimeDate,
    attendance_links: z.array(z.object({id,attendance:id,digest,approved_at:fleetTimeInstant})),
    daily_attendance: z.array(z.object({id,digest,approved_at:fleetTimeInstant})),
    calendar: z.record(z.string(),z.unknown()), rule:id,rule_revision:id,rule_digest:digest,
    wage: z.object({profile:id,revision:id,currency:text,basis:z.number(),salary_effect:id.nullable(),
      effect_digest:digest.nullable(),components:z.array(z.object({id,revision:id,type:id,amount:z.number()}))}),
    rate:z.number(),multiplier:z.number(),monthly_hours:z.number(),
  }),
})).max(26);
export const fleetReceivingOrders = z.array(z.object({id,number:text,subject:text,pending:z.boolean()})).max(26);

const reason = z.string().trim().min(1).max(500);
export const fleetTimeCommand = z.object({
  operation: z.uuid(), order: id,
  action: z.enum(["record", "verify", "propose-host", "accept-host"]),
  data: z.object({
    assignment: id.optional(), from: fleetTimeInstant.optional(), until: fleetTimeInstant.optional(), work: id.optional(),
    reason, company: id.optional(), branch: id.optional(), site: id.optional(), host: id.optional(),
    source_digest: digest.optional(), review: id.nullable().optional(),
  }).strict(),
}).strict();
export const fleetAttendanceCommand = z.object({
  operation: z.uuid(), employee: id, day: fleetTimeDate, mode: z.enum(["create-draft", "link-existing"]), token: digest, reason,
}).strict();
export const fleetPayrollCommand = z.object({ operation: z.uuid(), work: id, digest, reason }).strict();

export type FleetTimeOrder = z.infer<typeof fleetTimeOrder>;
export type FleetAttendanceDraft = z.infer<typeof fleetAttendanceDrafts>[number];
export type FleetPayrollRow = z.infer<typeof fleetPayrollQueue>[number];
