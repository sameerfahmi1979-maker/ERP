import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterConfig {
  id: string;
  label: string;
  options: FilterOption[];
  value?: string;
  onChange?: (value: string) => void;
}

interface ERPFilterBarProps {
  filters: FilterConfig[];
  onClearAll?: () => void;
  activeCount?: number;
}

export function ERPFilterBar({ filters, onClearAll, activeCount = 0 }: ERPFilterBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((filter) => (
        <Select key={filter.id} value={filter.value} onValueChange={filter.onChange}>
          <SelectTrigger className="h-9 text-xs w-auto min-w-[120px] bg-background border-border/60">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={onClearAll}
        >
          <X className="h-3.5 w-3.5" />
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}