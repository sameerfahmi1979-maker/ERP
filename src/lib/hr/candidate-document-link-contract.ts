import { z } from "zod";

export const candidateLinkId = z.number().int().positive().safe();
export const candidateLinkOperation = z.string().uuid().transform(value => value.toLowerCase());

export const candidateDocumentLinkInput = z.object({
  dms_document_id: candidateLinkId,
  document_purpose: z.enum(["cv", "passport", "certificate", "offer", "photo", "other"]).nullish(),
  notes: z.string().nullish(),
}).strict();

export const candidateDocumentLinkReceipt = z.object({
  id: candidateLinkId,
  candidate_id: candidateLinkId,
  dms_document_id: candidateLinkId,
  operation_id: candidateLinkOperation,
  outcome: z.enum(["linked", "reactivated", "already_linked"]),
  replayed: z.boolean(),
}).strict();

export type CandidateDocumentLinkInput = z.infer<typeof candidateDocumentLinkInput>;
export type CandidateDocumentLinkReceipt = z.infer<typeof candidateDocumentLinkReceipt>;

export function matchesCandidateDocumentLink(
  receipt: CandidateDocumentLinkReceipt, candidateId: number, documentId: number, operationId: string,
) {
  return receipt.candidate_id === candidateId && receipt.dms_document_id === documentId && receipt.operation_id === operationId;
}
