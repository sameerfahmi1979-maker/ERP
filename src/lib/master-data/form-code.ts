/** Disabled immutable code inputs are omitted from FormData during edits. */
export function masterRecordCode(form: FormData, field: string, savedCode?: string | null): string | null {
  return savedCode ?? (typeof form.get(field) === "string" ? form.get(field) as string : null);
}
