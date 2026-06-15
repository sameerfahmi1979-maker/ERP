/**
 * ERP Table Column Visibility Menu
 * Phase 002E.2A - Global Table Rules
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Columns3, RotateCcw } from "lucide-react";
import type { Table } from "@tanstack/react-table";

interface ERPColumnMenuProps<TData> {
  /** Table instance */
  table: Table<TData>;
  /** Required column IDs that cannot be hidden */
  requiredColumns?: string[];
}

export function ERPColumnMenu<TData>({
  table,
  requiredColumns = ["select", "actions"],
}: ERPColumnMenuProps<TData>) {
  const columns = table.getAllColumns().filter((column) => 
    typeof column.accessorFn !== "undefined" && column.getCanHide()
  );

  const handleResetColumns = () => {
    table.resetColumnVisibility();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-xs"
      >
        <Columns3 className="h-3.5 w-3.5" />
        <span>Columns</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
            <span>Show Columns</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleResetColumns}
              title="Reset to default"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-[300px] overflow-y-auto">
            {columns.map((column) => {
              const isRequired = requiredColumns.includes(column.id);
              const columnName = typeof column.columnDef.header === "string" 
                ? column.columnDef.header 
                : column.id;

              return (
                <DropdownMenuItem
                  key={column.id}
                  className="cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    if (!isRequired) {
                      column.toggleVisibility(!column.getIsVisible());
                    }
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Checkbox
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => {
                        if (!isRequired) {
                          column.toggleVisibility(!!value);
                        }
                      }}
                      disabled={isRequired}
                      className="translate-y-[2px]"
                    />
                    <span className={`text-sm flex-1 ${isRequired ? "opacity-50" : ""}`}>
                      {columnName}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
