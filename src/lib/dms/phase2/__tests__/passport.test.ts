import { expect, it } from "vitest";
import { verifyPassportMrz } from "../passport";

const first = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const second = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

it("keeps issuer, nationality and checksum-backed dates in separate roles", () => {
  expect(verifyPassportMrz(`${first}\n${second}`)).toMatchObject({
    issuingCountry: "UTO", nationality: "UTO", passportNumber: "L898902C3",
    birthDate: "740812", expiryDate: "120415", firstLine: 1, secondLine: 2,
  });
});

it("holds changed digits and mismatched or incomplete machine-readable pages", () => {
  expect(verifyPassportMrz(`${first}\n${second.replace("902C3", "902D3")}`)).toBeNull();
  expect(verifyPassportMrz(first)).toBeNull();
  expect(verifyPassportMrz(`${first}\nAnother record\n${second}`)).toBeNull();
});

it("checks rows separated only by blank OCR lines and preserves their original positions", () => {
  expect(verifyPassportMrz(first + "\n \n" + second)).toMatchObject({
    firstLine: 1, secondLine: 3, surname: "ERIKSSON", givenNames: "ANNA MARIA",
  });
});

it("lets independent source review retain checked roles when only the optional nationality text is unreadable", () => {
  const weakNationality = second.slice(0, 10) + "0TO" + second.slice(13);
  expect(verifyPassportMrz(first + "\n" + weakNationality)).toBeNull();
  expect(verifyPassportMrz(first + "\n" + weakNationality, { allowUnreadableNationality: true }))
    .toMatchObject({ nationality: null, issuingCountry: "UTO", passportNumber: "L898902C3", birthDate: "740812" });
  const badCheck = weakNationality.slice(0, -1) + "1";
  expect(verifyPassportMrz(first + "\n" + badCheck, { allowUnreadableNationality: true })).toBeNull();
});

it("isolates the name prefix before an unambiguous padding run without repairing noisy padding", () => {
  const noisy = first.slice(0, -4) + "C<<<";
  expect(verifyPassportMrz(noisy + "\n" + second)).toMatchObject({ surname: "ERIKSSON", givenNames: "ANNA MARIA" });
});
