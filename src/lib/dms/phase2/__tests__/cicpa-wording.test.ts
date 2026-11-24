import { describe, expect, it } from "vitest";
import { resolveCicpaWording, type CicpaEvidenceRegion } from "../cicpa";

const sourceSha256 = "a".repeat(64);
const bounds = [20, 35, 180, 71] as const;
const exact = [
  "جميع مواقع الاختبار /م المنطقة الصناعية /م المحطة او",
  "اند ام /المحطة /م المياه والكهرباء /مجمع تجريبي",
  "/محطة التناضح /م الغاز /الساحة",
].join("\n");
const misread = [
  "جميع مواقع الاختبار /م المنطقة الصناعية /م المحطة /و",
  "اند /م المحطة /م المياه والكهرباء /مجمع تجريبي",
  "محطة التناضح /م الغاز /الساحة",
].join("\n");
const region: CicpaEvidenceRegion = {
  page: 1,
  bounds,
  region: "locations",
  method: "verified-transcription",
  text: exact,
};
const witness = { sha256: sourceSha256, pages: [region] };
const input = { sourceSha256, page: 1, bounds, observed: misread, witness };

describe("verified CICPA wording repair", () => {
  it("returns exactly the source reading when OCR keeps the expected counts with wrong separators", () => {
    expect(misread.split("/")).toHaveLength(exact.split("/").length);
    expect(resolveCicpaWording(input)).toEqual({
      status: "verified",
      disposition: "corrected",
      observed: misread,
      value: exact,
      evidence: { page: 1, bounds, region: "locations", side: "front", method: "verified-transcription" },
    });
  });

  it("keeps both offshore group qualifiers and the raw separator", () => {
    const text = "جميع م.الأولى /جميع م.الثانية";
    expect(resolveCicpaWording({ ...input, observed: text, witness: { ...witness, pages: [{ ...region, text }] } }))
      .toMatchObject({ status: "verified", disposition: "exact", value: text });
  });

  it("uses a bound original when OCR omitted the field and preserves that distinction", () => {
    expect(resolveCicpaWording({ ...input, observed: null }))
      .toMatchObject({ status: "verified", disposition: "source-only", value: exact, observed: null });
  });

  it("holds an identical-looking crop from different bytes", () => {
    expect(resolveCicpaWording({ ...input, sourceSha256: "b".repeat(64) }))
      .toEqual({ status: "held", reason: "source-mismatch", value: null, observed: misread });
  });

  it("holds a match when the page or coordinates differ", () => {
    expect(resolveCicpaWording({ ...input, page: 2 })).toMatchObject({ status: "held", reason: "unverified-region" });
    expect(resolveCicpaWording({ ...input, bounds: [20, 35, 181, 71] }))
      .toMatchObject({ status: "held", reason: "unverified-region" });
  });

  it("holds when OCR is the only witness or the selected region is unreadable", () => {
    expect(resolveCicpaWording({ ...input, witness: { ...witness, pages: [{ ...region, method: "local-arabic-ocr" }] } }))
      .toMatchObject({ status: "held", reason: "unverified-region" });
    expect(resolveCicpaWording({ ...input, witness: { ...witness, pages: [{ ...region, text: "جميع … / م الموقع" }] } }))
      .toMatchObject({ status: "held", reason: "unreadable" });
  });

  it("holds two incompatible reviewed readings of the same printed region", () => {
    expect(resolveCicpaWording({ ...input, witness: { ...witness, pages: [region, { ...region, text: misread }] } }))
      .toMatchObject({ status: "held", reason: "ambiguous-region" });
  });
});
