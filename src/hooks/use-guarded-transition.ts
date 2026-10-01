"use client";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

/** Synchronous admission plus rejection handling for legacy action panels. No automatic retries. */
export function useGuardedTransition(): [boolean, (action: () => void | Promise<void>) => void] {
  const [pending, startTransition] = useTransition();
  const flight = useRef(false), uncertain = useRef(false);
  return [pending, action => {
    if (flight.current) return;
    if (uncertain.current) { toast.error("The previous operation is unconfirmed. Reload and check its result before another change."); return; }
    flight.current = true;
    startTransition(async () => {
      try { await action(); }
      catch { uncertain.current = true; toast.error("The operation could not be confirmed. Your input is retained. Reload and check the record before retrying."); }
      finally { flight.current = false; }
    });
  }];
}
