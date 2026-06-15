import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ERPModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  status?: "active" | "inactive" | "coming-soon";
  itemCount?: number;
  onClick?: () => void;
}

export function ERPModuleCard({
  title,
  description,
  icon: Icon,
  iconColor = "text-primary",
  bgColor = "bg-primary/5",
  status = "active",
  itemCount,
  onClick,
}: ERPModuleCardProps) {
  return (
    <Card
      className={cn(
        "border border-border/50 shadow-sm cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5",
        status === "inactive" && "opacity-60"
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-lg shrink-0", bgColor)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
              {status === "coming-soon" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Soon
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
            {itemCount !== undefined && (
              <p className="text-xs text-muted-foreground mt-2 font-medium">
                {itemCount} items
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}