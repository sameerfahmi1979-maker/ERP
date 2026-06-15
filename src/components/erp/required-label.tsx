"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RequiredLabelProps extends React.ComponentProps<typeof Label> {
  required?: boolean;
  children: React.ReactNode;
}

export function RequiredLabel({ required = false, children, className, ...props }: RequiredLabelProps) {
  return (
    <Label className={cn("flex items-center gap-1", className)} {...props}>
      {children}
      {required && <span className="text-destructive ml-0.5 font-bold">*</span>}
    </Label>
  );
}
