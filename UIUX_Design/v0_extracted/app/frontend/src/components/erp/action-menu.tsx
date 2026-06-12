import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, LucideIcon } from "lucide-react";

interface ActionItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: "default" | "destructive";
  separator?: boolean;
}

interface ERPActionMenuProps {
  items: ActionItem[];
  triggerClassName?: string;
}

export function ERPActionMenu({ items, triggerClassName }: ERPActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={triggerClassName || "h-8 w-8 p-0"}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item, index) => (
          <span key={index}>
            {item.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={item.onClick}
              className={item.variant === "destructive" ? "text-red-600 focus:text-red-600" : ""}
            >
              {item.icon && <item.icon className="h-4 w-4 mr-2" />}
              {item.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}