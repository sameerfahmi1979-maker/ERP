"use client";

/**
 * ERPCombobox Base Component
 * Phase 002F.3E.3B.2A — Initial implementation
 * Phase 002F.3E.3B.6C — Dirty integration, maxVisibleOptions, memoization improvements
 *
 * Shared base component for all ERP combobox/searchable select needs.
 *
 * ## Dirty Tracking (3B.6C)
 * On every user-initiated value change (select or clear), ERPCombobox:
 * 1. Calls onDirtyMark() if provided — direct hook callback for advanced forms.
 * 2. Dispatches a bubbling "change" Event from the container div — caught by
 *    useFormDirty's document-level capture listener so ALL forms that use
 *    ERPCombobox (through LookupSelect, CountrySelect, etc.) automatically
 *    mark dirty without any per-form changes.
 *
 * Guards: no event is dispatched when disabled, readOnly, or when the value
 * does not actually change (e.g. clicking the already-selected required item).
 */

import * as React from 'react';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ERPComboboxOption, ERPComboboxProps } from './types';

export function ERPCombobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  showCode = false,
  language = 'en',
  disabled = false,
  readOnly = false,
  required = false,
  loading = false,
  error,
  allowClear = false,
  emptyText = 'No options available',
  noResultsText = 'No results found',
  className,
  triggerClassName,
  popoverClassName,
  name,
  renderOption,
  filterFn,
  onDirtyMark,
  maxVisibleOptions,
}: ERPComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Ref on the root container — used to dispatch a bubbling change event so
  // useFormDirty's document-level listener can detect combobox-only edits.
  const containerRef = React.useRef<HTMLDivElement>(null);

  // ── Dirty signal ────────────────────────────────────────────────────────────
  // Dispatches from the container div so the event bubbles through the DOM tree
  // to the parent <form> element where useFormDirty intercepts it.
  const dispatchDirtySignal = React.useCallback(() => {
    if (disabled || readOnly) return;
    onDirtyMark?.();
    const container = containerRef.current;
    if (container) {
      container.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [disabled, readOnly, onDirtyMark]);

  // ── Filter function ─────────────────────────────────────────────────────────
  const defaultFilterFn = React.useCallback(
    (option: ERPComboboxOption, query: string): boolean => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (option.code != null && option.code.toLowerCase().includes(q)) ||
        option.label.toLowerCase().includes(q) ||
        (option.labelAr != null && option.labelAr.includes(query)) ||
        (option.description != null && option.description.toLowerCase().includes(q)) ||
        false
      );
    },
    []
  );

  const actualFilterFn = filterFn ?? defaultFilterFn;

  // ── Filtered options (memoised) ─────────────────────────────────────────────
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((opt) => actualFilterFn(opt, searchQuery));
  }, [options, searchQuery, actualFilterFn]);

  // ── Visible options with optional truncation ────────────────────────────────
  // When maxVisibleOptions is set and the list is larger than the threshold
  // (only applies when the search field is empty), truncate the list and always
  // keep the currently selected option in view.
  const { visibleOptions, showTypeHint } = React.useMemo(() => {
    if (!maxVisibleOptions || searchQuery || filteredOptions.length <= maxVisibleOptions) {
      return { visibleOptions: filteredOptions, showTypeHint: false };
    }

    // Separate selected from the rest so it always appears
    const selected = filteredOptions.filter(
      (opt) => opt.value === value || String(opt.value) === String(value)
    );
    const rest = filteredOptions
      .filter((opt) => opt.value !== value && String(opt.value) !== String(value))
      .slice(0, Math.max(0, maxVisibleOptions - selected.length));

    return {
      visibleOptions: [...selected, ...rest],
      showTypeHint: true,
    };
  }, [filteredOptions, maxVisibleOptions, searchQuery, value]);

  // ── Selected option ─────────────────────────────────────────────────────────
  const selectedOption = React.useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return options.find(
      (opt) => opt.value === value || String(opt.value) === String(value)
    ) ?? null;
  }, [value, options]);

  // ── Display label ───────────────────────────────────────────────────────────
  const displayLabel = React.useCallback(
    (option: ERPComboboxOption | null): string => {
      if (!option) return '';
      const label = language === 'ar' && option.labelAr ? option.labelAr : option.label;
      return showCode && option.code ? `${option.code} - ${label}` : label;
    },
    [language, showCode]
  );

  // ── Interaction handlers ────────────────────────────────────────────────────

  const handleSelect = React.useCallback(
    (optionValue: string | number) => {
      const isAlreadySelected =
        optionValue === value || String(optionValue) === String(value);

      if (isAlreadySelected) {
        if (!required) {
          // Deselect — value changes to null
          onValueChange(null);
          dispatchDirtySignal();
        }
        // required=true + same item: value is unchanged, no dirty signal
      } else {
        // New selection
        onValueChange(optionValue);
        dispatchDirtySignal();
      }
      setOpen(false);
      setSearchQuery('');
    },
    [value, required, onValueChange, dispatchDirtySignal]
  );

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onValueChange(null);
      dispatchDirtySignal();
    },
    [onValueChange, dispatchDirtySignal]
  );

  // ── Derived display state ───────────────────────────────────────────────────
  const showClearButton =
    allowClear &&
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !disabled &&
    !readOnly &&
    !required;

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn('relative', className)}>
        <div className="flex items-center justify-center h-10 px-3 border rounded-md bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
        </div>
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            aria-disabled={disabled || readOnly}
            disabled={disabled || readOnly}
            className={cn(
              'w-full h-10 justify-between font-normal',
              !selectedOption && 'text-muted-foreground',
              error && 'border-destructive focus-visible:ring-destructive/20',
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedOption ? displayLabel(selectedOption) : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {/*
         * z-[120]: ERPCombobox dropdown must render above ERPChildDialogForm content (z-[110]).
         * UI.4G z-index stack: tab bar z-[30], overlay z-[100], dialog content z-[110],
         * combobox dropdown z-[120], alert/confirm dialog z-[130].
         */}
        <PopoverContent
          className={cn('w-[--radix-popover-trigger-width] p-0 z-[120]', popoverClassName)}
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {options.length === 0 && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              {options.length > 0 && filteredOptions.length === 0 && (
                <CommandEmpty>{noResultsText}</CommandEmpty>
              )}
              {visibleOptions.length > 0 && (
                <CommandGroup>
                  {visibleOptions.map((option) => {
                    const isSelected =
                      value === option.value ||
                      String(value) === String(option.value);
                    return (
                      <CommandItem
                        key={String(option.value)}
                        value={String(option.value)}
                        disabled={option.disabled}
                        onSelect={() => handleSelect(option.value)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            isSelected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {renderOption ? (
                          renderOption(option, isSelected)
                        ) : (
                          <span>{displayLabel(option)}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {showTypeHint && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border text-center">
                  Showing {visibleOptions.length} of {filteredOptions.length} — type to search
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showClearButton && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
          onClick={handleClear}
          tabIndex={-1}
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {error && <p className="text-sm text-destructive mt-1">{error}</p>}

      {name && (
        <input
          type="hidden"
          name={name}
          value={value !== null && value !== undefined ? String(value) : ''}
        />
      )}
    </div>
  );
}
