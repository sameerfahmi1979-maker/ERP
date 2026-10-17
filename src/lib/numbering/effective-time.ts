/** datetime-local is deliberately labelled UTC; never interpret it in device time. */
export function effectiveTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, -1);
}

export function effectiveTimeValue(input: string, original?: string | null): string | null {
  if (!input) return null;
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input);
  // Invalid text is passed to schema validation, not repaired or defaulted.
  const value = local ? `${input.length === 16 ? `${input}:00` : input}Z` : input;
  // Browser controls have millisecond precision. An unchanged visible instant
  // must preserve any existing database sub-millisecond precision and offset.
  if (original && Number.isFinite(Date.parse(value)) && Date.parse(value) === Date.parse(original)) return original;
  return value;
}
