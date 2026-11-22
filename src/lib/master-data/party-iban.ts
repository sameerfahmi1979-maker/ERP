/** Canonical candidate for the duplicate advisory. Party accounts may be international. */
export function partyIbanCandidate(value: string): string | null {
  const iban = value.toUpperCase().replace(/[\t\n\v\f\r ]/g, "");
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  if (iban.startsWith("AE") && !/^AE\d{21}$/.test(iban)) return null;

  let remainder = 0;
  for (const character of iban.slice(4) + iban.slice(0, 4)) {
    const digit = Number(character);
    remainder = Number.isNaN(digit)
      ? (remainder * 100 + character.charCodeAt(0) - 55) % 97
      : (remainder * 10 + digit) % 97;
  }
  return remainder === 1 ? iban : null;
}
