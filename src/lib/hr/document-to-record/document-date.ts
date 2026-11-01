/** Calendar dates from UAE documents: numeric dates are day/month/year.
 * Never use Date.parse for numeric input (it silently treats it as US format).
 * Preserve calendar days without time-zone conversion. */
export function normalizeDocumentDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let parts = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/);
  let year: number, month: number, day: number;
  if (parts) [, year, month, day] = parts.map(Number);
  else {
    parts = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (parts) [, day, month, year] = parts.map(Number);
    else {
      const named = text.match(/^(\d{1,2})[\s/-]+([a-z]+)[\s,/-]+(\d{4})$/i);
      if (!named) return null;
      day = Number(named[1]); year = Number(named[3]);
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      month = months.findIndex(name => name === named[2].toLowerCase() || name.slice(0, 3) === named[2].toLowerCase()) + 1;
    }
  }
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export function documentDateLabel(value: string): string {
  const date = normalizeDocumentDate(value);
  return date ? `${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}` : '';
}
