"use client";

/**
 * MultiSelectCombobox
 * Selected badges are rendered outside the trigger to avoid nested <button> issue.
 * The trigger shows the count of selected items or a placeholder.
 */

import * as React from "react";
import { Check, ChevronsUpDown, X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface MultiSelectOption {
  value: string | number;
  label: string;
}

export interface MultiSelectComboboxProps {
  values: (string | number)[];
  onValuesChange: (values: (string | number)[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  disabled?: boolean;
  maxVisibleOptions?: number;
  className?: string;
}

export function MultiSelectCombobox({
  values,
  onValuesChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  loading = false,
  disabled = false,
  className,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);

  function getLabel(v: string | number): string {
    return options.find((o) => o.value === v)?.label ?? String(v);
  }

  function toggle(v: string | number) {
    if (values.includes(v)) {
      onValuesChange(values.filter((x) => x !== v));
    } else {
      onValuesChange([...values, v]);
    }
  }

  function remove(v: string | number) {
    onValuesChange(values.filter((x) => x !== v));
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected badges — outside the trigger to avoid nested <button> */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="gap-1 pl-2 pr-1 py-0.5 text-xs font-normal"
            >
              {getLabel(v)}
              {/* span with role=button avoids nested <button> issue */}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${getLabel(v)}`}
                onClick={() => remove(v)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && remove(v)}
                className="ml-0.5 cursor-pointer rounded p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </span>
            </Badge>
          ))}
        </div>
      )}

      {/* Trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || loading}
            className={cn(
              "inline-flex h-9 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm",
              "hover:bg-muted/50 transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </span>
            ) : values.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <span className="text-foreground">
                {values.length} selected
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          sideOffset={4}
        >
          <Command>
            <div className="flex items-center border-b px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <CommandInput
                placeholder={searchPlaceholder}
                className="h-9 flex-1 border-0 bg-transparent text-sm shadow-none focus:outline-none focus:ring-0"
              />
            </div>
            <CommandList>
              <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                No results found.
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const selected = values.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={String(option.label)}
                      onSelect={() => toggle(option.value)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input bg-background"
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </div>
                      <span className="text-sm">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
