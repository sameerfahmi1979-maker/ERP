import { z } from "zod";
import { documentEmployeeId, documentEmployeeSourcesSchema } from "./numbered-document-employee-contract";

const draftId = z.uuid();
const revision = z.number().int().nonnegative().max(2_147_483_647);
const draftText = z.string().refine(value => Array.from(value).length <= 500);
const draftChoice = documentEmployeeId.nullable();

const draftPayloadSchema = z.strictObject({
  full_name_en: draftText,
  full_name_ar: draftText,
  gender: z.enum(["", "male", "female"]),
  date_of_birth: draftText,
  nationality_id: draftChoice,
  mobile_number: draftText,
  personal_email: draftText,
  department_id: draftChoice,
  designation_id: draftChoice,
  employee_category_id: draftChoice,
  employment_type_id: draftChoice,
  joining_date: draftText,
  emergency_contact_name: draftText,
  emergency_contact_mobile: draftText,
}).partial();

export const sharedDocumentEmployeeFormSchema = draftPayloadSchema.strip();

const review = { reviewedSources: documentEmployeeSourcesSchema };
const draftReference = { ...review, draftId };

export const sharedDocumentEmployeeDraftRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("open"), ...review }),
  z.strictObject({ kind: z.literal("read"), ...draftReference }),
  z.strictObject({ kind: z.literal("save"), ...draftReference, revision, payload: draftPayloadSchema }),
]);

export const sharedDocumentEmployeeDraftSchema = z.strictObject({
  draftId,
  revision,
  ownerCompanyId: documentEmployeeId,
  branchId: draftChoice,
  sourceFingerprints: documentEmployeeSourcesSchema,
  payload: draftPayloadSchema,
});

export type SharedDocumentEmployeeDraftRequest = z.infer<typeof sharedDocumentEmployeeDraftRequestSchema>;
export type SharedDocumentEmployeeDraft = z.infer<typeof sharedDocumentEmployeeDraftSchema>;
export type SharedDocumentEmployeeDraftResult =
  | { success: true; data: SharedDocumentEmployeeDraft }
  | { success: false; code: "disabled" | "invalid" | "denied" | "changed" | "unconfirmed"; error: string };
