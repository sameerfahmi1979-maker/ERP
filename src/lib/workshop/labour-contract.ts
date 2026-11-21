import { z } from "zod";
import { fleetId as id } from "@/lib/fleet/asset-contract";

const text = z.string();
const nilText = text.nullable();
const nilId = id.nullable();
const amount = z.number().nullable();
const choice = z.object({ id, label: text });
const evidence = z.object({ document: id, version: id, file: id });
const proofChoice = evidence.extend({ label: text });
const segment = z.object({ from: text, until: text });
export const workshopJobIndex = z.array(z.object({ id, assessment_id: id, cycle: id, state: text, asset_no: text, asset_name: text, title: text }));
export const labourPreview = z.object({ digest: text, minutes: z.number(), cost_status: text, amount, currency: nilText });
export const labourWorkspace = z.object({
  job: id, assessment: id, cycle: id, branch: id, asset: id, asset_name: text, asset_number: text, state: text,
  record: z.boolean(), cost: z.boolean(), can_assign: z.boolean(), employees: z.array(choice), supervisors: z.array(choice),
  sites: z.array(choice), groups: z.array(choice), documents: z.array(proofChoice),
  assignments: z.array(z.object({ id, employee_id: id, employee: text, supervisor: text, site: text, site_id: id,
    bay: text, task: text, window_start: text, window_end: text })),
  versions: z.array(z.object({ id, assignment: id, source_line: text, started: text, ended: text, day: text,
    minutes: z.number(), predecessor_id: nilId, voids_line: z.boolean(), decision: nilText, entered_at: text, decided_at: nilText,
    reason: text, employee: text, current: z.boolean(), supervisor: z.boolean(), cost_status: text, amount, currency: nilText, file: nilId })),
  rates: z.array(z.object({ id, employee_group_id: nilId, from_day: text, until_day: text, rate: z.number(), currency: text,
    reason: text, approved_at: nilText, approved_zero: z.boolean(), independent: z.boolean() })),
});
export const labourReviewScopes = z.array(z.object({ id, name: text, company: text }));
export const labourHrQueue = z.array(z.object({ id, job: id, employee: text, day: text, from: text, until: text, minutes: z.number(),
  eligible_minutes: amount, conflicted_minutes: z.number(), unmatched_minutes: amount, status: text, cost_status: text,
  can_review: z.boolean(), digest: nilText, file: nilId, candidate: nilId, previous_claims: z.array(z.object({ id, portion: text })),
  eligible_segments: z.array(segment), conflicted_segments: z.array(segment), unmatched_segments: z.array(segment) }));
export const labourPayroll = z.object({
  candidates: z.array(z.object({ id, version_id: id, employee_id: id, day: text, available_at: text, employee: text,
    eligible_minutes: z.number(), remaining_minutes: z.number(), eligible_segments: z.array(segment), remaining_segments: z.array(segment),
    amount: z.number(), currency: text })),
  corrections: z.array(z.object({ id, claim_id: id, new_version: id, day: text, employee: text, minutes: z.number(),
    amount: z.number(), currency: text, available_at: nilText, independent: z.boolean(), reason: text, current: z.boolean() })),
});
export const outsideWorkspace = z.object({
  job: id, job_state: text, manage: z.boolean(), prepare: z.boolean(), approve: z.boolean(), finance: z.boolean(),
  custody_open: z.boolean(), qc_blocked: z.boolean(),
  documents: z.array(evidence.extend({ number: text, title: text, type: text })),
  vendors: z.array(z.object({ id, name: text, requires_comparison: z.boolean() })),
  orders: z.array(z.object({
    id, revision: id, state: text, supplier: nilId, supplier_name: nilText, reference: text, comparison: nilText,
    promised_return: text, estimate: amount, actual: amount, invoice: nilText, outcome: nilText,
    dispatched: nilText, completed: nilText, returned: nilText, late: z.boolean(), can_approve: z.boolean(),
    can_approve_variance: z.boolean(), can_stage_finance: z.boolean(),
    finance_receipt: z.object({ id, state: text, amount: z.number(), invoice: text, at: text }).nullable(),
    events: z.array(z.object({ action: text, at: nilText, recorded_at: text, reason: nilText, milestone: nilText, by: text,
      proof: evidence.nullable() })),
  })),
});
export const jobWorkRequest = z.object({
  nonce: z.string().uuid(), parent: id, family: z.enum(["labour", "rate", "outside", "hr", "correction"]), action: text.min(1).max(25),
  data: z.record(z.string().max(50), z.union([text.max(2000), z.number().finite(), z.boolean(), z.null(), evidence])),
});
export type LabourWorkspace = z.infer<typeof labourWorkspace>;
export type LabourPreview = z.infer<typeof labourPreview>;
export type JobWorkRequest = z.infer<typeof jobWorkRequest>;
export type OutsideWorkspace = z.infer<typeof outsideWorkspace>;
