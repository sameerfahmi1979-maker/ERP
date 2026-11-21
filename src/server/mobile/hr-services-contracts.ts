import { z } from "zod";

export const id = z.number().int().positive().safe();
export const revision = z.string().regex(/^[1-9]\d{0,18}$/);
const text = (max: number, min = 1) => z.string().refine(value=>!(/\p{Cc}/u.test(value))).trim().min(min).max(max);
const day = z.iso.date();
const operationId = z.uuid();
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const lang = z.enum(["en","ar","bilingual"]);
const sourceOf = <T extends string>(...kinds: [T, ...T[]]) => z.strictObject({kind:z.enum(kinds),id,revision});
const issue = sourceOf("asset","ppe");
const task = sourceOf("onboarding-task");
const dependent = sourceOf("dependent");
const room = sourceOf("accommodation");
const shift = sourceOf("shift-assignment");
const pro = sourceOf("pro-process");
const clearance = sourceOf("clearance");
const source = sourceOf("employee","asset","ppe","dependent","accommodation","shift-assignment","onboarding-task","pro-process","clearance");
const evidence = z.strictObject({documentId:id,documentVersionId:id});
const attachment = {evidence:evidence.nullable()};
const employeeRevision = revision;
const reason = text(2000);
const note = text(2000,0);
const ref = text(100).nullable();
const changes = z.strictObject({
  nameEn:text(160).optional(), nameAr:text(160).optional(), relationshipId:id.optional(),
  dateOfBirth:day.refine(value=>value<=new Date(Date.now()+4*3600000).toISOString().slice(0,10)).nullable().optional(), nationalityId:id.nullable().optional(),
  passportNumber:ref.optional(), passportExpiry:day.nullable().optional(),
  emiratesIdNumber:ref.optional(), emiratesIdExpiry:day.nullable().optional(),
  visaNumber:ref.optional(), visaExpiry:day.nullable().optional(),
  sponsoredBy:z.enum(["employee","company"]).optional(), active:z.boolean().optional(),
}).refine(r=>Object.keys(r).length>0);
export const proposalSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind:z.literal("letter"),employeeRevision,outputCode:text(100),language:lang,recipient:text(200),purpose:text(500),neededBy:day.nullable(),...attachment}),
  z.strictObject({kind:z.literal("issue-replacement"),source:issue,reason,...attachment}),
  z.strictObject({kind:z.literal("issue-return"),source:issue,requestedDate:day,reason,...attachment}),
  z.strictObject({kind:z.literal("task-evidence"),source:task,evidence,note}),
  z.strictObject({kind:z.literal("dependent-change"),source:dependent.nullable(),employeeRevision,changes,...attachment})
    .refine(p=>!!p.source || !!(p.changes.nameEn && p.changes.relationshipId)),
  z.strictObject({kind:z.literal("accommodation-issue"),source:room.nullable(),employeeRevision,category:z.enum(["maintenance","room","transport","safety","other"]),description:reason,...attachment}),
  z.strictObject({kind:z.literal("overtime"),employeeRevision,date:day,hours:z.number().positive().max(24).multipleOf(0.01),reason:text(500),...attachment}),
  z.strictObject({kind:z.literal("shift-change"),source:shift.nullable(),employeeRevision,shiftId:id,from:day,to:day.nullable(),reason}).refine(p=>!p.to || p.to>=p.from),
  z.strictObject({kind:z.literal("pro-follow-up"),source:pro,message:reason,...attachment}),
  z.strictObject({kind:z.literal("clearance-evidence"),source:clearance,caseId:id,evidence,note}),
]);
export const serviceKind=z.enum(["letter","issue-replacement","issue-return","task-evidence","dependent-change","accommodation-issue","overtime","shift-change","pro-follow-up","clearance-evidence"]);
export const canonical = z.strictObject({
  kind:z.enum(["issued-document","asset","ppe","onboarding-task","dependent","accommodation","overtime","shift-assignment","pro-process","clearance","hr-action"]),
  id,revision:revision.nullable(),operationId:operationId.nullable(),issuanceId:id.nullable(),
});
export const fulfilSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind:z.literal("issue-letter"),outputCode:text(100),language:lang,sourceReviewId:id.nullable(),sourceId:id.nullable(),templateId:id.nullable()}),
  z.strictObject({kind:z.literal("link-issued-letter"),issuanceId:id,checksum:sha}),
  z.strictObject({kind:z.literal("recover-letter"),issuanceId:id}),
  z.strictObject({kind:z.literal("record-return"),source:issue,returnedDate:day,condition:text(500).nullable()}),
  z.strictObject({kind:z.literal("record-replacement"),source:issue,newSource:issue,canonicalOperationId:operationId}),
  z.strictObject({kind:z.literal("complete-task"),source:task}),
  z.strictObject({kind:z.literal("save-dependent"),source:dependent.nullable(),canonicalOperationId:operationId}),
  z.strictObject({kind:z.literal("resolve-accommodation"),canonical}),
  z.strictObject({kind:z.literal("create-overtime")}),
  z.strictObject({kind:z.literal("change-shift"),source:shift.nullable()}),
  z.strictObject({kind:z.literal("record-pro-follow-up"),source:pro}),
  z.strictObject({kind:z.literal("record-clearance"),source:clearance,caseId:id}),
]);
const op = <T extends string,S extends z.ZodRawShape>(name:T,shape:S) => z.strictObject({op:z.literal(name),...shape});
const subject = {employeeId:id};
const opened = {...subject,id,revision};
const page = z.number().int().min(1).max(100000);
const after = z.number().int().nonnegative().safe();
const search = text(100,0);
const filters = {companyId:id.nullable(),branchId:id.nullable()};
const workKind = z.enum(["assignments","requirements","readiness","blocks","assets","ppe","accommodation"]);
export const expandedCommand = z.discriminatedUnion("op", [
  op("directoryChoices",{kind:z.enum(["company","branch","department","designation","site","status"]),...filters,search,after}),
  op("directory",{page,search,...filters,departmentId:id.nullable(),designationId:id.nullable(),siteId:id.nullable(),status:text(80).nullable()}),
  op("employeeRecord",subject),op("work",{...subject,date:day}),op("teamReadiness",{date:day,page,search,...filters,siteId:id.nullable()}),
  op("operationRecords",{...subject,page,kind:workKind}),op("operationDetail",{...subject,id,kind:workKind}),
  op("proProcesses",{...subject,page}),op("proProcess",{...subject,id}),
  op("dependents",{...subject,page}),op("dependent",{...subject,id}),
  op("onboarding",{...subject,page}),op("onboardingTask",{...subject,id}),
  op("offboarding",{...subject,page}),op("clearance",{...subject,caseId:id,page}),op("clearanceHistory",{...subject,caseId:id,id,after}),
  op("teamCalendar",{from:day,to:day,page,...filters,employeeId:id.nullable(),search}).refine(q=>q.to>=q.from && Date.parse(q.to)-Date.parse(q.from)<=92*86400000),
  op("issuedDocuments",{...subject,page}),
  op("serviceOptions",{...subject,kind:serviceKind}),op("serviceChoices",{...subject,kind:z.enum(["letter","shift","shift-assignment","relationship","nationality"]),search,after}),
  op("serviceEvidence",{...subject,kind:serviceKind,source:source.nullable(),search,after}),
  op("serviceSubmit",{...subject,operationId,proposal:proposalSchema}),op("issueAcknowledge",{...subject,operationId,source:issue,statementVersion:z.literal("receipt-v1"),confirmed:z.literal(true)}),
  op("serviceRequests",{employeeId:id.nullable(),scope:z.enum(["own","review","team"]),after,status:z.enum(["all","pending","approved","rejected","fulfilled","recorded"])}),
  op("serviceOpening",opened),op("serviceAttempt",opened),
  op("serviceActionChoices",{...opened,kind:z.enum(["letter-source","letter-template","issuance","canonical-proof"]),after,search}),
  op("serviceDecision",{...opened,decision:z.enum(["approve","reject"]),operationId,reason:text(500,0)}).refine(q=>q.decision==="approve" || q.reason.length>0),
  op("serviceReceipt",{operationId}),op("serviceFulfil",{...opened,operationId,command:fulfilSchema}),
]);
export type ExpandedCommand = z.infer<typeof expandedCommand>;
export type ExpandedInput<K extends ExpandedCommand["op"]> = Extract<ExpandedCommand,{op:K}>;
