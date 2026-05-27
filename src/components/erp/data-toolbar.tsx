import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Download } from "lucide-react";

interface ERPDataToolbarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
  showExport?: boolean;
  onExport?: () => void;
}

export function ERPDataToolbar({
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  filters,
  actions,
  showExport = false,
  onExport,
}: ERPDataToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-3">
      <div className="relative flex-1 w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="pl-9 h-9 text-sm bg-background border-border/60"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {filters}
        <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
        {showExport && (
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
