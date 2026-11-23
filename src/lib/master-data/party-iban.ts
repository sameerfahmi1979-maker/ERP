/** Canonical candidate for the duplicate advisory. Party accounts may be international. */
export function partyIbanCandidate(value: string): string | null {
  const compact = value.replace(/[\t\n\v\f\r ]/g, "");
  if (!/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}$/.test(compact)) return null;
  const iban = compact.toUpperCase();
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
