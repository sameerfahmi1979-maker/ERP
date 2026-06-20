/**
 * HR.5 Payroll Redaction & Masking Utilities
 *
 * Sensitive payroll data must be redacted server-side before reaching the client.
 * - IBAN is always masked in normal UI (even for authorized users).
 * - Account number is always masked in normal UI.
 * - Salary amounts are hidden entirely for unauthorized users.
 * - Raw IBAN/account number MUST NOT be logged in audit.
 */

/** Mask an IBAN: show first 2 country chars + last 4 digits, mask the rest. */
export function maskIban(iban: string | null | undefined): string {
  if (!iban) return "";
  const clean = iban.replace(/\s/g, "");
  if (clean.length <= 6) return "*".repeat(clean.length);
  return clean.slice(0, 2) + "*".repeat(clean.length - 6) + clean.slice(-4);
}

/** Mask an account number: show last 4 digits, mask the rest. */
export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return "";
  const clean = accountNumber.replace(/\s/g, "");
  if (clean.length <= 4) return "*".repeat(clean.length);
  return "*".repeat(clean.length - 4) + clean.slice(-4);
}

/**
 * Mask a monetary amount.
 * Returns the amount if the user is authorized, otherwise returns null (fully hidden).
 */
export function maskMoney(
  amount: number | null | undefined,
  canViewPayroll: boolean
): number | null {
  if (!canViewPayroll) return null;
  return amount ?? null;
}

/**
 * Redact a payroll profile row for the client.
 * Unauthorized users receive null amounts/notes.
 */
export function redactPayrollProfile<T extends {
  notes?: string | null;
}>(row: T, canViewPayroll: boolean): T {
  if (canViewPayroll) return row;
  return { ...row, notes: null };
}

/**
 * Redact a WPS profile row for the client.
 * - IBAN always masked.
 * - Account number always masked.
 * - Sensitive fields nulled if user lacks payroll view permission.
 */
export type WpsProfileRedactable = {
  iban?: string | null;
  account_number?: string | null;
  account_holder_name?: string | null;
  labour_card_number?: string | null;
  mohre_person_code?: string | null;
  exchange_house?: string | null;
};

export function redactWpsProfile<T extends WpsProfileRedactable>(
  row: T,
  canViewPayroll: boolean
): T & { iban_masked: string; account_number_masked: string } {
  const maskedIban = maskIban(row.iban);
  const maskedAccount = maskAccountNumber(row.account_number);

  if (canViewPayroll) {
    return {
      ...row,
      iban: null,             // raw IBAN never exposed to client — use iban_masked
      account_number: null,   // raw account number never exposed — use account_number_masked
      iban_masked: maskedIban,
      account_number_masked: maskedAccount,
    };
  }

  // Unauthorized: hide all sensitive fields
  return {
    ...row,
    iban: null,
    account_number: null,
    account_holder_name: null,
    labour_card_number: null,
    mohre_person_code: null,
    exchange_house: null,
    iban_masked: "",
    account_number_masked: "",
  };
}

/**
 * Redact a salary component row for the client.
 * Amount is hidden if user lacks payroll view permission.
 */
export type SalaryComponentRedactable = {
  amount?: number | null;
  notes?: string | null;
};

export function redactSalaryComponent<T extends SalaryComponentRedactable>(
  row: T,
  canViewPayroll: boolean
): T {
  if (canViewPayroll) return row;
  return { ...row, amount: null, notes: null };
}

/**
 * Redact a salary revision row for the client.
 * Gross values hidden if user lacks payroll view permission.
 */
export type SalaryRevisionRedactable = {
  old_gross?: number | null;
  new_gross?: number | null;
};

export function redactSalaryRevision<T extends SalaryRevisionRedactable>(
  row: T,
  canViewPayroll: boolean
): T {
  if (canViewPayroll) return row;
  return { ...row, old_gross: null, new_gross: null };
}
