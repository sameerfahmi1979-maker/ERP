"use client";

import { Clock } from "lucide-react";

type Props = {
  title: string;
  description: string;
  availableIn: string;
};

export function EmployeePlaceholderTab({ title, description, availableIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center text-muted-foreground">
      <div className="rounded-full bg-muted p-4">
        <Clock className="h-8 w-8 opacity-50" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="text-sm max-w-md">{description}</p>
      </div>
      <span className="text-xs bg-muted px-3 py-1 rounded-full font-medium">
        Available in {availableIn}
      </span>
    </div>
  );
}
