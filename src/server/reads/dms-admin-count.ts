import "server-only";

export function verifiedDmsCount(result: { count: number | null; error: unknown }): number | null {
  const { count, error } = result;
  return !error && count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function remainingDmsCount(total: number | null, part: number | null): number | null {
  return total !== null && part !== null && part <= total ? total - part : null;
}
