"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Never expose raw database errors or turn a failed read into an empty list. */
export function DmsLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
      <h2 className="font-semibold">Documents could not be loaded</h2>
      <p className="text-sm text-muted-foreground">
        The document list is temporarily unavailable. This does not mean your documents have been deleted.
        Please try again. If the problem continues, contact your administrator.
      </p>
      <Button type="button" variant="outline" disabled={pending}
        onClick={() => startTransition(() => router.refresh())}>
        {pending ? "Retrying…" : "Try again"}
      </Button>
    </section>
  );
}
