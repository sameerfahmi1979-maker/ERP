import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DmsLoadingStatus({ label, className }: { label: string; className?: string }) {
  return <p role="status" className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
    <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
    {label}
  </p>;
}
