
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import type { AuthContext } from "@/lib/rbac/check";

export const fleetFinePath = "/modules/fleet/fines";
export const fleetFinePermissions = [
  "fleet.fines.view", "fleet.fines.record", "fleet.fines.match", "fleet.fines.verify",
  "fleet.incidents.manage", "workshop.recoveries.intake",
] as const;

const administratorRoles = new Set(["system_admin", "group_admin", "company_admin", "branch_admin"]);
export function fineAssignments(assignments: AuthContext["roleAssignments"]) {
  return (assignments ?? []).filter(assignment =>
    assignment.ownerCompanyId !== null && !administratorRoles.has(assignment.roleCode) &&
    fleetFinePermissions.some(permission => assignment.permissionCodes.includes(permission)));
}

export function scopeFineBranches<T extends { id: number; owner_company_id: number }>(
  branches: T[], assignments: AuthContext["roleAssignments"],
) {
  const permitted = fineAssignments(assignments);
  return branches.filter(branch => permitted.some(assignment => assignment.ownerCompanyId === branch.owner_company_id &&
    (assignment.branchId === null || assignment.branchId === branch.id)));
}

export const fineBranchChoices = z.array(z.object({
  id: fleetId, owner_company_id: fleetId, branch_name_en: z.string(), branch_code: z.string(),
}));
const date = z.iso.date();
const time = z.iso.datetime({ offset: true });
const note = (max: number) => z.string().trim().min(1).max(max);
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const evidence = z.object({
  document: fleetId, version: fleetId, file: fleetId, reference: note(150).optional(),
}).strict();
const retainedEvidence = evidence.extend({ reference: z.string().nullish() });
const reason = note(1000);
const authorityRevisionStatuses = z.enum(["revised", "appealed", "upheld", "reduced", "increased", "cancelled"]);
export const fineRevisionStatuses = authorityRevisionStatuses.options;
const authorityTerms = {
  notice_on: date, amount: money, discount_amount: money.optional(),
  appeal_deadline: date.optional(), payment_deadline: date.optional(),
};
const envelope = { operation: z.uuid(), target: fleetId };
const revision = { revision: fleetId };

export const fineFleetCommand = z.discriminatedUnion("action", [
  z.object({ ...envelope, action: z.literal("record-fine"), data: z.object({
    ...authorityTerms, authority: note(100), reference: note(150), offence: note(300), location: note(300), occurred_at: time,
    plate_jurisdiction: note(24), plate_class: note(24), plate_number: note(32), currency: currencyCode,
    evidence, incident: fleetId.optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("revise-fine"), data: z.object({
    ...authorityTerms, ...revision, authority_revision: note(150), status: authorityRevisionStatuses, evidence, reason,
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("match-custody"), data: z.object(revision).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("verify-driver"), data: z.object({
    ...revision, employee: fleetId, evidence, reason,
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("open-damage"), data: z.object({
    assessment: fleetId, incident: fleetId.optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("refresh-damage"), data: z.object(revision).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("open-incident"), data: z.object({
    asset: fleetId, reference: note(150), occurred_at: time, summary: note(500),
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("link-incident"), data: z.object({
    ...revision, incident: fleetId,
  }).strict() }).strict(),
  z.object({ ...envelope, action: z.literal("link-activity"), data: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["work", "repair", "hse"]), parent: fleetId }).strict(),
    z.object({ kind: z.literal("insurer"), reference: note(150), evidence }).strict(),
  ]) }).strict(),
]);
export type FineFleetCommand = z.infer<typeof fineFleetCommand>;
export const fineReceipt = z.object({ id: fleetId, replayed: z.boolean() });

export const fineEvidenceType = z.enum(["T13_AUTHORITY_NOTICE", "T13_AUTHORITY_REVISION", "T13_DRIVER_EVIDENCE", "T13_INSURER_RECORD"]);
export type FineEvidenceType = z.infer<typeof fineEvidenceType>;
const originalChoice = z.object({
  document: fleetId, version: fleetId, file: fleetId, label: z.string(), type_code: fineEvidenceType,
});
const fineCase = z.object({
  id: fleetId, source_kind: z.enum(["fine", "damage"]), source_revision: fleetId,
  source_status: z.string(), subject_status: z.string(), source_amount: z.number(), occurred_at: time, currency: currencyCode,
  incident_id: fleetId.nullable(), asset_id: fleetId.nullable(), assessment_id: fleetId.nullable(),
  match_state: z.string().nullable(), custody_candidate_id: fleetId.nullable(), commitment_id: fleetId.nullable(),
  employee_id: fleetId.nullable(), authority: z.string().nullable(), reference: z.string().nullable(),
  offence: z.string().nullable(), location: z.string().nullable(), plate_jurisdiction: z.string().nullable(),
  plate_class: z.string().nullable(), plate_number: z.string().nullable(), notice_on: date.nullable(),
  appeal_deadline: date.nullable(), payment_deadline: date.nullable(), discount_amount: z.number().nullable(),
  assessment_outcome: z.string().nullable(), estimated_amount: z.number().nullable(), actual_amount: z.number().nullable(),
  evidence: retainedEvidence.nullable(),
  history: z.array(z.object({
    revision: fleetId, action: z.string(), status: z.string(), amount: z.number(), notice_on: date.nullable(),
    authority_revision: z.string().nullable(), recorded_at: time, evidence: retainedEvidence.nullable(),
  })),
});

const incidentActivity = z.object({
  id: fleetId, kind: z.enum(["work", "repair", "hse", "insurer"]), parent: fleetId.nullable(),
  reference: z.string().nullable(), evidence: retainedEvidence.nullable(),
});
const fineIncident = z.object({
  id: fleetId, asset_id: fleetId, reference: z.string(), occurred_at: time, summary: z.string().nullable(),
  activities: z.array(incidentActivity),
});
const fineAssessment = z.object({
  id: fleetId, asset_id: fleetId, reference: z.string(), occurred_at: time, outcome: z.string(), case_id: fleetId.nullable(),
});
export const fineDriverChoices = z.array(z.object({ id: fleetId, label: z.string() }));
export const fineFleetWorkspace = z.object({
  company_id: fleetId, branch_id: fleetId,
  cases: z.array(fineCase), incidents: z.array(fineIncident), assessments: z.array(fineAssessment),
  next_before: fleetId.nullable(),
  assets: fineDriverChoices.default([]), evidence_choices: z.array(originalChoice).default([]),
  can_record: z.boolean(), can_match: z.boolean(), can_verify: z.boolean(),
  can_intake_damage: z.boolean(), can_link: z.boolean(), can_print: z.boolean().optional(),
});
export type FineFleetWorkspace = z.infer<typeof fineFleetWorkspace>;


