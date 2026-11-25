"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { OperationsCommandResult, OperationsRefreshTarget } from "@/lib/operations/command-result";
import { refreshOperationsCommand } from "@/server/actions/operations/command-refresh";

type Attempt<Request> = { request: Request; form: HTMLFormElement };

export function useOperationsCommand<Request, Receipt>(
  save: (request: Request) => Promise<OperationsCommandResult<Receipt>>,
  onConfirmed?: (form: HTMLFormElement) => void,
) {
  const router = useRouter();
  const retained = useRef<Attempt<Request> | null>(null);
  const inFlight = useRef(false);
  const refreshTarget = useRef<OperationsRefreshTarget | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();

  function refresh() {
    try {
      router.refresh();
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  }

  async function run(attempt: Attempt<Request>, recovering: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      let result: OperationsCommandResult<Receipt>;
      try {
        result = await save(attempt.request);
      } catch {
        retained.current = attempt;
        setUncertain(true);
        setError("The save could not be confirmed. Retry the original save to check its result.");
        return;
      }
      if (!result.ok) {
        const unresolved = recovering || result.uncertain;
        retained.current = unresolved ? attempt : null;
        setUncertain(unresolved);
        setError(result.error);
        return;
      }
      retained.current = null;
      setUncertain(false);
      setReceipt(result.receipt);
      refreshTarget.current = result.refreshFailed ? result.refreshTarget : undefined;
      onConfirmed?.(attempt.form);
      if (result.refreshFailed) setRefreshFailed(true);
      else refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const blocked = busy || uncertain || refreshFailed;
  return {
    busy, blocked, error, receipt, uncertain, refreshFailed,
    submit(request: Request, form: HTMLFormElement) {
      if (blocked || retained.current || inFlight.current) return;
      setReceipt(undefined);
      return run({ request, form }, false);
    },
    retryOriginal() {
      if (retained.current) return run(retained.current, true);
    },
    async retryRefresh() {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        if (refreshTarget.current) {
          if (!await refreshOperationsCommand(refreshTarget.current)) return;
          refreshTarget.current = undefined;
        }
        refresh();
      } catch {
        setRefreshFailed(true);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
  };
}

export function OperationsCommandStatus({ command, saved }: {
  command: {
    busy: boolean;
    error?: string;
    uncertain: boolean;
    refreshFailed: boolean;
    retryOriginal: () => void;
    retryRefresh: () => void;
  };
  saved?: string;
}) {
  return <>
    {saved && <p role="status" className="text-sm">{saved}</p>}
    {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
    {command.uncertain && <Button type="button" variant="outline" disabled={command.busy}
      onClick={command.retryOriginal}>Retry original save</Button>}
    {command.refreshFailed && <>
      <p role="alert" className="text-sm text-destructive">The current view could not be refreshed.</p>
      <Button type="button" variant="outline" disabled={command.busy} onClick={command.retryRefresh}>Retry refresh</Button>
    </>}
  </>;
}

