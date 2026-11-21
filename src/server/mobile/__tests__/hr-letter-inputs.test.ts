import { describe, expect, it } from "vitest";
import { approvedLetterInputs } from "../hr-letter-inputs";
import { proposalSchema } from "../hr-services-contracts";
const letter = {kind:"letter" as const, employeeRevision:"1", outputCode:"HR_EMPLOYMENT_CONFIRMATION",language:"bilingual" as const,recipient:"Example office",purpose:"Employment",neededBy:null,evidence:null};
describe("approved issuer particulars", () => {
  it("validates both named recipients using the employment confirmation definition", () => {
    expect(() => approvedLetterInputs(letter)).toThrow();
    const approved = {...letter,recipientAr:"Arabic office"};
    expect(proposalSchema.parse(approved)).toEqual(approved);
    expect(approvedLetterInputs(approved)).toMatchObject({recipient_mode:"specific",recipient_organization_en:"Example office",recipient_organization_ar:"Arabic office"});
  });
  it("requires the reviewed NOC expiry and both printed purposes", () => {
    const approved = {...letter,outputCode:"HR_NOC",recipientAr:"Arabic office",purposeAr:"Arabic purpose"};
    expect(() => approvedLetterInputs(approved)).toThrow();
    expect(approvedLetterInputs({...approved,validUntil:"2027-06-01"})).toMatchObject({valid_until:"2027-06-01",purpose:"Employment",purpose_ar:"Arabic purpose"});
  });
});
