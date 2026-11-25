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
  resultsPending = false,
  error,
  validationError,
  allowClear = false,
  emptyText = 'No options available',
  noResultsText = 'No results found',
  className,
  triggerClassName,
  popoverClassName,
  name,
  ariaLabel,
  renderOption,
  filterFn,
  onDirtyMark,
  maxVisibleOptions,
  onOpenChange,
  onSearchQueryChange,
}: ERPComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const feedback = error ?? validationError;
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

  const { visibleOptions, matchCount } = React.useMemo(() => {
    if (!open) return { visibleOptions: [], matchCount: 0 };
    const limit = maxVisibleOptions || Infinity;
    const selectedValue = value == null ? null : String(value);
    const matches: ERPComboboxOption[] = [];
    let count = 0;
    let selected: ERPComboboxOption | undefined;
    for (const option of options) {
      if (searchQuery && !actualFilterFn(option, searchQuery)) continue;
      count++;
      if (matches.length < limit) matches.push(option);
      if (!selected && selectedValue !== null && String(option.value) === selectedValue) selected = option;
    }
    const visibleOptions = selected && count > limit
      ? [selected, ...matches.filter(option => option !== selected).slice(0, limit - 1)]
      : matches;
    return { visibleOptions, matchCount: count };
  }, [open, options, searchQuery, actualFilterFn, maxVisibleOptions, value]);

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

  const changeOpen = React.useCallback((next: boolean) => {
    if (next && (disabled || readOnly)) return;
    setOpen(next);
    onOpenChange?.(next);
  }, [disabled, readOnly, onOpenChange]);

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
      changeOpen(false);
      setSearchQuery('');
    },
    [value, required, onValueChange, dispatchDirtySignal, changeOpen]
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
        {feedback && <p className="text-sm text-destructive mt-1">{feedback}</p>}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            data-workspace-field={name}
            data-workspace-required={name && required && !readOnly ? "true" : undefined}
            data-workspace-empty={value === null || value === undefined || value === "" ? "true" : "false"}
            aria-required={required || undefined}
            aria-label={ariaLabel ?? name?.replaceAll('_', ' ')}
            aria-expanded={open}
            aria-invalid={!!feedback}
            aria-disabled={disabled || readOnly}
            disabled={disabled || readOnly}
            className={cn(
              'w-full h-10 justify-between font-normal',
              !selectedOption && 'text-muted-foreground',
              feedback && 'border-destructive focus-visible:ring-destructive/20',
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
              onValueChange={(v) => {
                setSearchQuery(v);
                onSearchQueryChange?.(v);
              }}
            />
            <CommandList aria-busy={resultsPending}>
              {resultsPending && <div role="status" className="px-3 py-2 text-sm text-muted-foreground">Loading results…</div>}
              {!resultsPending && !error && options.length === 0 && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              {!resultsPending && !error && options.length > 0 && matchCount === 0 && (
                <CommandEmpty>{noResultsText}</CommandEmpty>
              )}
              {!resultsPending && !error && visibleOptions.length > 0 && (
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
              {!resultsPending && !error && visibleOptions.length < matchCount && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border text-center">
                  Showing {visibleOptions.length} of {matchCount} — {searchQuery ? 'narrow your search' : 'type to search'}
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
          aria-label={`Clear ${ariaLabel ?? name?.replaceAll('_', ' ') ?? 'selection'}`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {feedback && <p className="text-sm text-destructive mt-1">{feedback}</p>}

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
