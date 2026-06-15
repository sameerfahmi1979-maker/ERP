"use client";

import { UnitOfMeasureSelect } from "./unit-of-measure-select";

interface UnitByCategorySelectProps {
  value: number | null;
  onValueChange?: (value: number | null) => void;
  categoryId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: "en" | "ar";
  showCode?: boolean;
  showSymbol?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  excludeId?: number;
}

export function UnitByCategorySelect(props: UnitByCategorySelectProps) {
  if (!props.categoryId) {
    return (
      <div className="text-sm text-muted-foreground p-2 border rounded">
        Please select a category first
      </div>
    );
  }

  return <UnitOfMeasureSelect {...props} />;
}
