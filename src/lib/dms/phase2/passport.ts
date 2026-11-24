const weights = [7, 3, 1] as const;
const issuerCodes: Readonly<Record<string, string>> = {
  IND: "IN", PAK: "PK", JOR: "JO", PSE: "PS", SYR: "SY", GHA: "GH",
  NGA: "NG", NPL: "NP", KEN: "KE", "D<<": "DE", UGA: "UG",
};

export function normalizePassportIssuer(code: string): string | null {
  return issuerCodes[code] ?? null;
}

function checksum(text: string, digit: string) {
  if (!/^\d$/u.test(digit)) return false;
  let total = 0;
  for (const [index, letter] of Array.from(text).entries()) {
    const score = letter === "<" ? 0 : /^[A-Z]$/u.test(letter) ? letter.charCodeAt(0) - 55 : Number(letter);
    total += score * weights[index % weights.length];
  }
  return total % 10 === Number(digit);
}

/** Checks a complete two-line passport MRZ. Keep the printed year unresolved until corroborated. */
export function verifyPassportMrz(text: string, options: { allowUnreadableNationality?: boolean } = {}) {
  const lines = text.split(/\r?\n/u).map((line, index) => ({ text: line.replace(/\s+/gu, "").toUpperCase(), line: index + 1 }))
    .filter(row => row.text);
  const candidates = [];
  for (let index = 0; index < lines.length - 1; index++) {
    const first = lines[index].text, second = lines[index + 1].text;
    if (!/^P[A-Z<][A-Z][A-Z<]{41}$/u.test(first) || !/^[A-Z0-9<]{44}$/u.test(second)) continue;
    const birthDate = second.slice(13, 19), expiryDate = second.slice(21, 27);
    const encodedNationality = second.slice(10, 13);
    const nationality = /^[A-Z<]{3}$/u.test(encodedNationality) ? encodedNationality.replace(/<+$/u, "") : null;
    // Nationality is outside the TD3 check-digit fields. Never repair or infer its characters.
    if (!/^\d{6}$/u.test(birthDate) || !/^\d{6}$/u.test(expiryDate)
      || (nationality === null && !options.allowUnreadableNationality)) continue;
    const reference = second.slice(0, 9);
    if (!checksum(reference, second[9]) || !checksum(birthDate, second[19]) || !checksum(expiryDate, second[27])) continue;
    const combined = second.slice(0, 10) + second.slice(13, 20) + second.slice(21, 43);
    if (!checksum(combined, second[43])) continue;
    const passportNumber = reference.replace(/<+$/u, "");
    if (!/^[A-Z0-9]+$/u.test(passportNumber)) continue;
    const names = /^([A-Z]+(?:<[A-Z]+)*)?<<([A-Z]+(?:<[A-Z]+)*)?(?:<{3,}[A-Z<]*|<{0,2})$/u.exec(first.slice(5));
    const surname = names?.[1]?.replaceAll("<", " ") ?? null;
    const givenNames = names?.[2]?.replaceAll("<", " ") ?? null;
    candidates.push({ issuingCountry: first.slice(2, 5), nationality,
      passportNumber, birthDate, expiryDate, firstLine: lines[index].line, secondLine: lines[index + 1].line,
      rawNumber: reference, surname, givenNames });
  }
  return candidates.length === 1 ? candidates[0] : null;
}
