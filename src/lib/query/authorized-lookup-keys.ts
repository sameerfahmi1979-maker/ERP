/** Opt-in namespace: never share legacy transport entries. Use inside ReadCacheBoundary. */
export const queryKeys = {
  lookup: {
    values: (code: string, parent: string | null = null, inactive = false) =>
      ["authorized-lookup", "values", code.trim().toUpperCase(), parent?.trim().toUpperCase() || null, inactive] as const,
    batch: (codes: string[], inactive = false) =>
      ["authorized-lookup", "batch", [...new Set(codes.map(code => code.trim().toUpperCase()))].sort(), inactive] as const,
  },
};
