import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ERPSectionCardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function ERPSectionCard({
  title,
  description,
  actions,
  children,
  className,
  noPadding = false,
}: ERPSectionCardProps) {
  return (
    <Card className={cn("border border-border/50 shadow-sm", className)}>
      {title && (
        <CardHeader className="pb-3 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(noPadding ? "p-0" : "px-5 pb-5", !title && !noPadding && "pt-5")}>
        {children}
      </CardContent>
    </Card>
  );
}