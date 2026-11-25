import { describe, expect, it } from "vitest";
import { resolveSuggestedDocumentType } from "./classification-resolver";
import { mohreEmploymentOwnershipWarning, readMohreEmploymentEmployer } from "./mohre-employment-contract";

const catalog = [
  { id: 13, type_code: "CONTRACT", name_en: "Contract" },
  { id: 67, type_code: "EMPLOYMENT_CONTRACT", name_en: "Employment Contract" },
  { id: 16, type_code: "LABOUR_CARD", name_en: "Labour Card" },
];

const employmentForm = [
  "MINISTRY OF HUMAN RESOURCES",
  "& EMIRATISATION",
  "EMPLOYMENT CONTRACT FULL WORK",
  "Work permit (Recruiting a worker from outside the country)",
  "Work Style",
  "Full Work",
  "Transaction Number",
  "MB100000000AE",
  "1. Establishment Name    TEST ORYX TRANSPORT L L C",
  "Establishment No",
  "Article (2) (Contract Details)",
].join("\n");

describe("MOHRE employment contract classification", () => {
  it("uses the specific document type even when the generic suggestion is high confidence", () => {
    expect(resolveSuggestedDocumentType("CONTRACT", catalog, employmentForm, 0.99)).toMatchObject({
      source: "heuristic",
      typeCode: "EMPLOYMENT_CONTRACT",
      typeId: 67,
    });
  });

  it("preserves a Labour Card with the separate card labels", () => {
    const labourCard = "Electronic Work Permit Information\nMinistry of Human Resources\nCard Number\nCard Issuance Date\nCard Expiry Date";
    expect(resolveSuggestedDocumentType("VISA", catalog, labourCard, 0.99).typeCode).toBe("LABOUR_CARD");
  });

  it("does not treat a reference to an employment contract in an ordinary agreement as the MOHRE form", () => {
    const commercial = "Service contract between First Party and Second Party. Employees supply their employment contracts.";
    expect(resolveSuggestedDocumentType("CONTRACT", catalog, commercial, 0.99).typeCode).toBe("CONTRACT");
  });

  it("flags a different company even when the employer is a known legal entity", () => {
    expect(mohreEmploymentOwnershipWarning(employmentForm, "Alliance Transport L.L.C.")).toMatch(/^Employer mismatch:/);
  });

  it("treats punctuation and spacing in the legal suffix as equivalent", () => {
    expect(mohreEmploymentOwnershipWarning(employmentForm, "Test Oryx Transport L.L.C.")).toBeNull();
  });

  it("holds ownership for review when the owner or labelled employer is missing", () => {
    expect(mohreEmploymentOwnershipWarning(employmentForm, null)).toMatch(/^Employer ownership could not be verified/);
    const unreadable = employmentForm.replace("TEST ORYX TRANSPORT L L C", "");
    expect(mohreEmploymentOwnershipWarning(unreadable, "Test Oryx Transport L.L.C.")).toMatch(/^Employer ownership could not be verified/);
  });

  it("reads the establishment name immediately below the label in OCR reading order", () => {
    const wrapped = employmentForm.replace("Name    TEST ORYX", "Name\nTEST ORYX");
    expect(mohreEmploymentOwnershipWarning(wrapped, "Alliance Transport L.L.C.")).toMatch(/^Employer mismatch:/);
    expect(mohreEmploymentOwnershipWarning(wrapped, "Test Oryx Transport L.L.C.")).toBeNull();
  });
});

describe("MOHRE employer routing evidence", () => {
  it("uses the printed employer below its label instead of the employee's details", () => {
    const contract = employmentForm.replace("Name    TEST ORYX", "Name\n7 ORYX").replace("TEST ORYX", "7 ORYX");
    expect(readMohreEmploymentEmployer(contract)).toEqual({ kind: "employer", name: "7 ORYX TRANSPORT L L C" });
  });

  it("holds conflicting employer labels and only accepts repeated copies of the same name", () => {
    const repeated = employmentForm + "\n1. Establishment Name: Test Oryx Transport L.L.C.";
    expect(readMohreEmploymentEmployer(repeated)).toMatchObject({ kind: "employer" });
    expect(readMohreEmploymentEmployer(repeated + "\n1. Establishment Name: Different Company LLC"))
      .toEqual({ kind: "unresolved" });
  });

  it("holds a missing employer and ignores unrelated documents", () => {
    expect(readMohreEmploymentEmployer(employmentForm.replace("TEST ORYX TRANSPORT L L C", "")))
      .toEqual({ kind: "unresolved" });
    expect(readMohreEmploymentEmployer("Labour Card\nEstablishment Name: Test Oryx"))
      .toEqual({ kind: "not_applicable" });
  });
});
