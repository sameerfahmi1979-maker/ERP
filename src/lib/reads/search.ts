/** Quote PostgREST OR values AND escape SQL wildcard characters for literal search. */
export function literalLike(value: string): string {
  return `%${value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}
export function literalContains(value: string): string {
  const pattern = literalLike(value);
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
