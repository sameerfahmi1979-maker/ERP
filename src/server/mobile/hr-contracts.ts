import { expandedCommand } from "./hr-services-contracts";
import { z } from "zod";
import { attendanceRosterQuery, attendanceRowRequest } from "@/lib/hr/attendance-workbench-contract";

export const id = z.number().int().positive().safe();
export const revision = z.string().regex(/^[1-9]\d{0,18}$/);
const page = z.number().int().min(1).max(100000);
const after = z.number().int().nonnegative().safe();
const operationId = z.uuid();
const date = z.iso.date();
const search = z.string().trim().max(100);
const reason = z.string().trim().min(1).max(500);
const original = { employeeId:id, id, revision };
const attachment = { documentId:id.nullable(), documentVersionId:id.nullable() };
const openingKind = z.enum(["proposal","approval","leave"]);
const renewKind = z.enum(["identity-document","medical-insurance","access-card","training-certificate"]);
const changes = z.strictObject({
  mobile_number:z.string().trim().min(1).max(40).optional(),
  personal_email:z.email().max(254).optional(),
  emergency_contact_name:z.string().trim().min(1).max(160).optional(),
  emergency_contact_mobile:z.string().trim().min(1).max(40).optional(),
}).refine(r=>Object.keys(r).length>0);
const legacyCommand = z.discriminatedUnion("op", [
  z.strictObject({op:z.literal("home")}),
  z.strictObject({op:z.literal("profile"),employeeId:id.optional()}),
  z.strictObject({op:z.literal("employees"),page,search}),
  z.strictObject({op:z.literal("leaveOptions"),employeeId:id,page}),
  z.strictObject({op:z.literal("leaveBalances"),employeeId:id,after}),
  z.strictObject({op:z.literal("leaveRequests"),employeeId:id,page}),
  z.strictObject({op:z.literal("time"),employeeId:id,page,kind:z.enum(["attendance","punch","shift","overtime"])}),
  z.strictObject({op:z.literal("renewals"),employeeId:id,page,kind:renewKind}),
  z.strictObject({op:z.literal("evidence"),employeeId:id,page,purpose:z.enum(["renewal","leave"]).default("renewal")}),
  z.strictObject({op:z.literal("requests"),scope:z.enum(["own","team"]),after}),
  z.strictObject({op:z.literal("inbox"),kind:openingKind,after}),
  z.strictObject({op:z.literal("opening"),kind:openingKind,...original}),
  z.strictObject({op:z.literal("rosterChoices"),kind:z.enum(["company","branch","site","team","shift","workSite"]),company:id.nullable(),branch:id.nullable(),date,search,after}),
  attendanceRosterQuery.extend({op:z.literal("roster")}),
  z.strictObject({op:z.literal("rosterOpening"),employeeId:id,id:id.nullable()}),
  z.strictObject({op:z.literal("rosterReceipt"),operationId}),
  z.strictObject({op:z.literal("receipt"),operationId}),
  z.strictObject({op:z.literal("profileCorrection"),employeeId:id,operationId,revision,changes}),
  z.strictObject({op:z.literal("leaveSubmit"),employeeId:id,operationId,leaveTypeId:id,startDate:date,endDate:date,reason,...attachment}),
  z.strictObject({op:z.literal("leaveCancel"),...original,operationId,reason}),
  z.strictObject({op:z.literal("timeCorrection"),employeeId:id,operationId,date,id:id.nullable(),revision:revision.nullable(),reason}),
  z.strictObject({op:z.literal("renewalSubmit"),...original,operationId,kind:renewKind,...attachment,reason}),
  z.strictObject({op:z.literal("decision"),...original,operationId,kind:openingKind,decision:z.enum(["approve","reject"]),reason:z.string().trim().max(500)}),
  z.strictObject({op:z.literal("rosterSave"),request:attendanceRowRequest}),
  z.strictObject({op:z.literal("rosterApprove"),...original,operationId}),
]).superRefine((r,c)=>{
  if ("documentId" in r && (r.documentId===null)!==(r.documentVersionId===null)) c.addIssue({code:"custom",message:"Select the original document version."});
  if(r.op==="timeCorrection" && (r.id===null)!==(r.revision===null)) c.addIssue({code:"custom",message:"Select the original attendance entry."});
  if(r.op==="leaveSubmit" && r.endDate<r.startDate) c.addIssue({code:"custom",message:"Leave end precedes start."});
  if(r.op==="decision" && r.decision==="reject" && !r.reason) c.addIssue({code:"custom",message:"Enter the rejection reason."});
  if(r.op==="rosterChoices" && r.kind!=="company" && r.company===null) c.addIssue({code:"custom",message:"Choose the roster company."});
});
export const hrCommand = z.union([legacyCommand,expandedCommand]);
export type HrCommand = z.infer<typeof hrCommand>;
