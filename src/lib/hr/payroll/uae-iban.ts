export function normalizeUaeIban(value: string): string {
  return value.toUpperCase().replace(/[\t\n\v\f\r ]/g, "");
}

export function isValidUaeIban(value: string | null | undefined): boolean {
  if (!value) return false;
  const iban = normalizeUaeIban(value);
  if (!/^AE\d{21}$/.test(iban)) return false;
  let remainder = 0;
  // Move AE and the check digits to the end. A=10 and E=14.
  for (const digit of `${iban.slice(4)}1014${iban.slice(2, 4)}`) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
