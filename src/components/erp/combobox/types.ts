/**
 * ERPCombobox Types
 * Phase 002F.3E.3B.2A
 * 
 * Shared type definitions for the ERPCombobox base component
 */

import type * as React from 'react';

export interface ERPComboboxOption {
  value: string | number;
  label: string;
  labelAr?: string | null;
  code?: string | null;
  description?: string | null;
  badge?: string | null;
  colorHex?: string | null;
  icon?: React.ReactNode;
  disabled?: boolean;
  raw?: unknown;
}

export interface ERPComboboxProps {
  // Core
  value: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: ERPComboboxOption[];

  // Display
  placeholder?: string;
  searchPlaceholder?: string;
  showCode?: boolean;
  language?: 'en' | 'ar';

  // States
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  loading?: boolean;

  // Validation
  error?: string;

  // Behavior
  allowClear?: boolean;
  emptyText?: string;
  noResultsText?: string;

  // Styling
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;

  // Form
  name?: string;

  // Advanced
  renderOption?: (option: ERPComboboxOption, selected: boolean) => React.ReactNode;
  filterFn?: (option: ERPComboboxOption, searchQuery: string) => boolean;

  /**
   * Called when the user changes the combobox value (select or clear).
   * Phase 002F.3E.3B.6C — dirty integration callback.
   * Forms can pass the markDirty() function from useFormDirty here for
   * direct notification instead of relying solely on the synthetic DOM event.
   */
  onDirtyMark?: () => void;

  /**
   * If set, limits visible options to this count when the search field is empty.
   * When the list is truncated, a "Showing N of M — type to search" hint is shown.
   * Phase 002F.3E.3B.6C — large-list preparation.
   */
  maxVisibleOptions?: number;

  /**
   * Called when the user types in the combobox search field.
   * Use for server-side search (pass filterFn={() => true} to disable client filtering).
   */
  onSearchQueryChange?: (query: string) => void;
}
