"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HrIconButtonProps = ComponentProps<typeof Button> & { "aria-label": string };

/** Secondary HR actions retain their handlers and permission guards at the caller. */
export function HrIconButton({ children, className, title, size = "icon", ...props }: HrIconButtonProps) {
  return (
    <TooltipProvider delay={250}>
      <Tooltip>
        <TooltipTrigger render={
          <Button type="button" variant="outline" {...props} focusableWhenDisabled size={size}
            className={cn(className, "size-11 shrink-0 p-0 sm:size-9")}>
            <span aria-hidden="true" className="inline-flex items-center justify-center">{children}</span>
          </Button>
        } />
        <TooltipContent>{title || props["aria-label"]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
