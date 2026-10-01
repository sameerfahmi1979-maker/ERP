"use client";
import { useEffect, useRef, useState } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Textarea } from "@/components/ui/textarea";

/** Non-blocking, labelled replacement for native prompts. Cancel never runs an action. */
export function useReasonDialog() {
  const [request, setRequest] = useState<{ title: string; required: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<((value: string | null) => void) | null>(null);
  const finish = (value: string | null) => { const resolve = resolver.current; resolver.current = null; setRequest(null); resolve?.(value); };
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, []);
  const askReason = (title: string, required = true): Promise<string | null> => {
    if (resolver.current) return Promise.resolve(null);
    setReason(""); setRequest({ title, required });
    return new Promise(resolve => { resolver.current = resolve; });
  };
  const reasonDialog = request && <ERPChildDialogForm open onOpenChange={open => { if (!open) finish(null); }} title={request.title}
    subtitle="Review the selected record before continuing." mode="add" size="md" submitLabel="Continue"
    onSubmit={() => { if (!request.required || reason.trim()) finish(reason.trim()); }}>
    <label className="grid gap-2 text-sm">Reason{request.required ? " *" : " (optional)"}
      <Textarea aria-label="Reason" required={request.required} value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} />
    </label>
  </ERPChildDialogForm>;
  return { askReason, reasonDialog };
}
