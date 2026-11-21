import { buildInputsSchema, getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { HR_LETTER_SELECTIONS } from "@/lib/official-documents/hr-source-contract";
import { needsLetterReview } from "@/lib/official-documents/hr-source-review";
import type { z } from "zod";
import type { proposalSchema } from "./hr-services-contracts";
import { HrError } from "./hr-shapes";

type Letter = Extract<z.infer<typeof proposalSchema>, {kind:"letter"}>;
type Source = {sourceReviewId:number|null;sourceId:number|null};

export function approvedLetterInputs(p:Letter, source?:Source):Record<string,string> {
  const definition = getOfficialDocumentDefinition(p.outputCode);
  // Unregistered fixed wording is left to the original governed catalogue gate.
  if (!definition) {
    if (p.language !== "en" || p.recipientAr || p.purposeAr || p.validUntil) throw new HrError(422,"Unsupported catalogue particulars.");
    return {};
  }
  const keys = new Set(definition.optionalInputs.map(f => f.key));
  const inputs:Record<string,string> = {};
  const recipient = keys.has("recipient_mode") ? "recipient_organization_en" : keys.has("addressee") ? "addressee" : null;
  const recipientAr = recipient === "recipient_organization_en" ? "recipient_organization_ar" : "addressee_ar";
  if (recipient) {
    if (keys.has("recipient_mode")) inputs.recipient_mode = "specific";
    if (p.language !== "ar") inputs[recipient] = p.recipient;
    if (p.language !== "en") {
      if (!p.recipientAr) throw new HrError(422,"Enter the approved Arabic recipient.");
      inputs[recipientAr] = p.recipientAr;
    }
  }
  if (keys.has("purpose")) {
    inputs.purpose = p.purpose;
    if (p.language !== "en") {
      if (!p.purposeAr) throw new HrError(422,"Enter the approved Arabic purpose.");
      inputs.purpose_ar = p.purposeAr;
    }
  }
  if (p.validUntil) inputs.valid_until = p.validUntil;
  if ((p.recipientAr && (!recipient || p.language==="en")) || (p.purposeAr && (!keys.has("purpose") || p.language==="en")))
    throw new HrError(422,"These translated particulars do not apply to the selected letter.");
  const sourceKey = needsLetterReview(p.outputCode) ? "source_review_id" : HR_LETTER_SELECTIONS[p.outputCode]?.key;
  if (source && sourceKey) {
    const id = sourceKey === "source_review_id" ? source.sourceReviewId : source.sourceId;
    if (id) inputs[sourceKey] = String(id);
  }
  const fields = source ? definition.optionalInputs : definition.optionalInputs.filter(f=>f.key!==sourceKey);
  const parsed = buildInputsSchema({...definition,optionalInputs:fields}).safeParse(inputs);
  if (!parsed.success || !definition.supportedLanguages.includes(p.language)) throw new HrError(422,"The approved particulars do not satisfy the official letter definition.");
  const values = parsed.data as Record<string,string>;
  const error = definition.validateInputs?.(values,p.language);
  if (error) throw new HrError(422,error);
  return inputs;
}
