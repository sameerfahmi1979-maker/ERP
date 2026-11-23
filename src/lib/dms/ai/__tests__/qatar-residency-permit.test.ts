import { expect, it } from "vitest";
import { readQatarWorkResidencyPermit } from "../qatar-residency-permit";
import { resolveStandardFileName, resolveStandardFileNameInput } from "@/lib/dms/resolve-standard-file-name";
import { canAssignQatarPermitNumberOnApproval, validateStandardFileName } from "@/lib/dms/standard-file-name";

const original = `[Front]
State of Qatar
Residency Permit
ID.No: 20000000001
Expiry: 12/02/2027
Name: Example Holder

[Back]
Passport Number: AB012345
Passport Expiry: 12/05/2036
Serial No: 31320000000001
Residency Type: عمل
Employer: شركة مثال`;

it("verifies the Qatar work permit and keeps its references and dates distinct", () => {
  const evidence = readQatarWorkResidencyPermit(original);
  expect(evidence?.map(field => [field.fieldCode, field.value])).toEqual(expect.arrayContaining([
    ["issuer_country", "QA"], ["credential_kind", "residence_permit"], ["residency_type", "work"],
    ["holder_name_printed_en", "Example Holder"], ["qatar_personal_id", "20000000001"],
    ["permit_card_serial", "31320000000001"], ["permit_expiry_date", "2027-02-12"],
    ["supporting_passport_expiry_date", "2036-05-12"], ["printed_employer_ar", "شركة مثال"],
  ]));
  const keys = evidence?.map(field => field.fieldCode);
  expect(keys).not.toContain("visa_number");
  expect(keys).not.toContain("issue_date");
  expect(keys).not.toContain("sponsor_name");
});

it.each([
  original.replace("State of Qatar", "Kingdom of Saudi Arabia"),
  original.replace("Residency Permit", "Visit Visa"),
  original.replace("Expiry: 12/02/2027", "Expiry: 30/02/2027"),
  original.replace("Expiry: 12/02/2027", "Expiry: 12/02/2027\nExpiry: 13/02/2027"),
  original.replace("ID.No: 20000000001", "ID.No: 20000000001\nID.No: 20000000002"),
  original.split("[Back]")[0],
])("holds incompatible or incomplete source layouts", (source) => {
  expect(readQatarWorkResidencyPermit(source)).toBeNull();
});

it("uses the verified name with a filename reference that excludes identity numbers", () => {
  const fields = Object.fromEntries((readQatarWorkResidencyPermit(original) ?? []).map(f => [f.fieldCode, f.value]));
  const filename = resolveStandardFileName({ typeCode: "FOREIGN_IMMIGRATION_CREDENTIAL", originalFilename: "Scan.pdf",
    expiryDate: "2027-02-12", requiresExpiryTracking: true, extractedFields: { ...fields, passport_number: "AB012345" },
    aiOwnerHints: { suggestedDescription: "ID: 20000000001" }, documentNo: "DMS-2026-000999",
  });
  expect(filename).toMatch(/^Qatar_Residency_Permit_Example_holder_DMS-000999_2027-02-12\.pdf$/);
});

it("allows numbered approval to supply the reference for a complete permit name", () => {
  const name = "Qatar_Residency_Permit_Example_holder_DMS-Unknown_2027-02-12.pdf";
  const isDeferred = (typeCode: string, fileName: string) => canAssignQatarPermitNumberOnApproval(
    typeCode, fileName, validateStandardFileName(fileName, { requiresExpiryTracking: true }),
  );
  expect(isDeferred("FOREIGN_IMMIGRATION_CREDENTIAL", name)).toBe(true);
  expect(isDeferred("RESIDENCE_VISA", name)).toBe(false);
  expect(isDeferred("FOREIGN_IMMIGRATION_CREDENTIAL", name.replace("Example_holder", "Unknown_Owner"))).toBe(false);
  expect(isDeferred("FOREIGN_IMMIGRATION_CREDENTIAL", name.replace("2027-02-12", "Unknown"))).toBe(false);
});

it("retains the registered reference for other foreign immigration credentials", () => {
  const input = resolveStandardFileNameInput({
    typeCode: "FOREIGN_IMMIGRATION_CREDENTIAL", originalFilename: "Scan.pdf",
    expiryDate: "2027-02-12", requiresExpiryTracking: true,
    extractedFields: { issuer_country: "SA", credential_kind: "visit_visa", document_number: "VIS12345" },
  });
  expect(input.typeCode).toBe("FOREIGN_IMMIGRATION_CREDENTIAL");
  expect(input.docNo).toBe("VIS12345");
});
