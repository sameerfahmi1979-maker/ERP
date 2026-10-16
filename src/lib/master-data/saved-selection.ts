import type { ERPComboboxOption } from '@/components/erp/combobox';

/** Label already obtained with the authorized record, never a new read or grant. */
export type SavedSelection = Pick<ERPComboboxOption, 'value' | 'label'>;

export function savedSelection(value: number | null | undefined, label: string | null | undefined): SavedSelection | undefined {
  return value != null && label?.trim() ? { value, label } : undefined;
}

/** Keep only this record's current selection visible; active choices win. */
export function withSavedSelection(
  options: ERPComboboxOption[],
  value: string | number | null | undefined,
  saved?: SavedSelection,
): ERPComboboxOption[] {
  if (value == null || !saved?.label.trim() || String(saved.value) !== String(value)
    || options.some(option => String(option.value) === String(value))) return options;
  return [{ value: saved.value, label: `${saved.label} (saved selection)`, disabled: true }, ...options];
}
